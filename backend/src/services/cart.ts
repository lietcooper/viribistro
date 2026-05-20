// Persistent cart store. Authenticated carts are keyed by userId; guest carts
// fall back to sessionId. REST and chat tools share this service.
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/AppError.js';

export interface CartOwner {
  sessionId: string;
  userId?: string | null;
}

type CartLookup = { userId: string } | { sessionId: string };
type CartOwnerInput = string | CartOwner;

export interface CartItem {
  id: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  customizationHash: string;
  customizations: NormalizedCustomization[];
}

export interface Cart {
  items: CartItem[];
  total: string;
}

type DbCartItem = {
  id: string;
  menuItemId: string;
  quantity: number;
  unitPrice: { toString: () => string };
  customizationHash: string;
  customizations: Prisma.JsonValue;
  menuItem: { name: string };
};

export interface NormalizedCustomizationOption {
  optionId: string;
  optionName: string;
  priceDelta: string;
}

export interface NormalizedCustomization {
  groupId: string;
  groupName: string;
  options: NormalizedCustomizationOption[];
}

export type SelectedCustomizations = Record<string, string[]>;

function owner(input: CartOwnerInput): CartOwner {
  return typeof input === 'string' ? { sessionId: input, userId: null } : input;
}

function lookup(input: CartOwnerInput): CartLookup {
  const o = owner(input);
  return o.userId ? { userId: o.userId } : { sessionId: o.sessionId };
}

export function cartOwnerKey(input: CartOwnerInput): string {
  const o = owner(input);
  return o.userId ? `user:${o.userId}` : `session:${o.sessionId}`;
}

export function normalizePrice(price: { toString: () => string }): string {
  return Number(price.toString()).toFixed(2);
}

function recomputeTotal(items: CartItem[]): string {
  let totalCents = 0n;
  for (const item of items) {
    const [intPart, fracPart = ''] = item.unitPrice.split('.');
    const cents = BigInt(intPart!) * 100n + BigInt((fracPart + '00').slice(0, 2));
    totalCents += cents * BigInt(item.quantity);
  }
  const whole = totalCents / 100n;
  const frac = totalCents % 100n;
  return `${whole.toString()}.${frac.toString().padStart(2, '0')}`;
}

function serialize(items: DbCartItem[]): Cart {
  const serialized = items.map((item) => ({
    id: item.id,
    menuItemId: item.menuItemId,
    name: item.menuItem.name,
    quantity: item.quantity,
    unitPrice: normalizePrice(item.unitPrice),
    customizationHash: item.customizationHash,
    customizations: deserializeCustomizations(item.customizations),
  }));
  return { items: serialized, total: recomputeTotal(serialized) };
}

async function readItems(ownerInput: CartOwnerInput): Promise<DbCartItem[]> {
  const row = await prisma.cart.findUnique({
    where: lookup(ownerInput),
    select: {
      items: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          menuItemId: true,
          quantity: true,
          unitPrice: true,
          customizationHash: true,
          customizations: true,
          menuItem: { select: { name: true } },
        },
      },
    },
  });
  return row?.items ?? [];
}

async function ensureCart(ownerInput: CartOwnerInput): Promise<{ id: string }> {
  const o = owner(ownerInput);
  const where = lookup(o);
  return prisma.cart.upsert({
    where,
    update: {},
    create: o.userId ? { userId: o.userId } : { sessionId: o.sessionId },
    select: { id: true },
  });
}

async function lookupMenuItem(menuItemId: string): Promise<{
  id: string;
  name: string;
  price: Prisma.Decimal;
  available: boolean;
  customizationGroups: Array<{
    id: string;
    name: string;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    sortOrder: number;
    options: Array<{
      id: string;
      name: string;
      priceDelta: Prisma.Decimal;
      available: boolean;
      sortOrder: number;
    }>;
  }>;
}> {
  const item = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    select: {
      id: true,
      name: true,
      price: true,
      available: true,
      customizationGroups: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          required: true,
          minSelect: true,
          maxSelect: true,
          sortOrder: true,
          options: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              priceDelta: true,
              available: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });
  if (!item) {
    throw new AppError(400, 'UNKNOWN_MENU_ITEM', `Menu item not found: ${menuItemId}`);
  }
  if (!item.available) {
    throw new AppError(
      400,
      'UNAVAILABLE_MENU_ITEM',
      `Menu item is not currently available: ${item.name}`,
    );
  }
  return item;
}

function deserializeCustomizations(value: Prisma.JsonValue): NormalizedCustomization[] {
  return Array.isArray(value) ? (value as unknown as NormalizedCustomization[]) : [];
}

function customizationsJson(customizations: NormalizedCustomization[]): Prisma.InputJsonValue {
  return customizations as unknown as Prisma.InputJsonValue;
}

function customizationHash(customizations: NormalizedCustomization[]): string {
  if (customizations.length === 0) return 'base';
  const stable = customizations.map((group) => ({
    groupId: group.groupId,
    optionIds: group.options.map((option) => option.optionId),
  }));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function normalizeCustomizations(
  item: Awaited<ReturnType<typeof lookupMenuItem>>,
  selected: SelectedCustomizations = {},
): {
  customizations: NormalizedCustomization[];
  customizationHash: string;
  unitPrice: Prisma.Decimal;
} {
  const knownGroups = new Set(item.customizationGroups.map((group) => group.id));
  for (const groupId of Object.keys(selected)) {
    if (!knownGroups.has(groupId)) {
      throw new AppError(
        400,
        'INVALID_CUSTOMIZATION_GROUP',
        `Customization group does not belong to item: ${groupId}`,
      );
    }
  }

  let unitPrice = item.price;
  const normalized: NormalizedCustomization[] = [];
  for (const group of item.customizationGroups) {
    const uniqueOptionIds = [...new Set(selected[group.id] ?? [])].sort();
    const minSelect = group.required ? Math.max(1, group.minSelect) : group.minSelect;
    if (uniqueOptionIds.length < minSelect) {
      throw new AppError(
        400,
        'MISSING_REQUIRED_CUSTOMIZATION',
        `${item.name} requires a choice for ${group.name}`,
      );
    }
    if (uniqueOptionIds.length > group.maxSelect) {
      throw new AppError(
        400,
        'TOO_MANY_CUSTOMIZATION_OPTIONS',
        `${group.name} allows at most ${group.maxSelect} option(s)`,
      );
    }
    if (uniqueOptionIds.length === 0) continue;

    const options = uniqueOptionIds.map((optionId) => {
      const option = group.options.find((candidate) => candidate.id === optionId);
      if (!option) {
        throw new AppError(
          400,
          'INVALID_CUSTOMIZATION_OPTION',
          `Customization option does not belong to ${group.name}: ${optionId}`,
        );
      }
      if (!option.available) {
        throw new AppError(
          400,
          'UNAVAILABLE_CUSTOMIZATION_OPTION',
          `Customization option is not currently available: ${option.name}`,
        );
      }
      unitPrice = unitPrice.add(option.priceDelta);
      return {
        optionId: option.id,
        optionName: option.name,
        priceDelta: normalizePrice(option.priceDelta),
      };
    });

    normalized.push({
      groupId: group.id,
      groupName: group.name,
      options,
    });
  }

  return {
    customizations: normalized,
    customizationHash: customizationHash(normalized),
    unitPrice,
  };
}

export async function getCart(ownerInput: CartOwnerInput): Promise<Cart> {
  return serialize(await readItems(ownerInput));
}

export async function clearCart(ownerInput: CartOwnerInput): Promise<Cart> {
  await prisma.cart.deleteMany({ where: lookup(ownerInput) });
  return { items: [], total: '0.00' };
}

export async function addItem(
  ownerInput: CartOwnerInput,
  menuItemId: string,
  quantity: number,
  selectedCustomizations?: SelectedCustomizations,
): Promise<Cart> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a positive integer');
  }
  const item = await lookupMenuItem(menuItemId);
  const { customizations, customizationHash, unitPrice } = normalizeCustomizations(
    item,
    selectedCustomizations,
  );
  const cart = await ensureCart(ownerInput);

  await prisma.cartItem.upsert({
    where: {
      cartId_menuItemId_customizationHash: { cartId: cart.id, menuItemId, customizationHash },
    },
    update: {
      quantity: { increment: quantity },
      unitPrice,
      customizations: customizationsJson(customizations),
    },
    create: {
      cartId: cart.id,
      menuItemId: item.id,
      quantity,
      unitPrice,
      customizationHash,
      customizations: customizationsJson(customizations),
    },
  });

  return getCart(ownerInput);
}

export async function modifyItem(
  ownerInput: CartOwnerInput,
  itemIdOrCartItemId: string,
  newQuantity: number,
): Promise<Cart> {
  if (!Number.isInteger(newQuantity) || newQuantity < 0) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a non-negative integer');
  }

  const existingCart = await prisma.cart.findUnique({
    where: lookup(ownerInput),
    select: { id: true },
  });

  if (newQuantity === 0) {
    if (existingCart) {
      await prisma.cartItem.deleteMany({
        where: await lineWhere(existingCart.id, itemIdOrCartItemId),
      });
    }
    return getCart(ownerInput);
  }

  const cart = existingCart ?? (await ensureCart(ownerInput));
  const existingLine = await findExistingLine(cart.id, itemIdOrCartItemId);
  if (existingLine) {
    await prisma.cartItem.update({
      where: { id: existingLine.id },
      data: { quantity: newQuantity },
    });
    return getCart(ownerInput);
  }

  const item = await lookupMenuItem(itemIdOrCartItemId);
  const { customizations, customizationHash, unitPrice } = normalizeCustomizations(item);
  await prisma.cartItem.upsert({
    where: {
      cartId_menuItemId_customizationHash: {
        cartId: cart.id,
        menuItemId: item.id,
        customizationHash,
      },
    },
    update: { quantity: newQuantity, unitPrice },
    create: {
      cartId: cart.id,
      menuItemId: item.id,
      quantity: newQuantity,
      unitPrice,
      customizationHash,
      customizations: customizationsJson(customizations),
    },
  });

  return getCart(ownerInput);
}

export async function removeItem(
  ownerInput: CartOwnerInput,
  itemIdOrCartItemId: string,
): Promise<Cart> {
  const existingCart = await prisma.cart.findUnique({
    where: lookup(ownerInput),
    select: { id: true },
  });
  if (!existingCart) return { items: [], total: '0.00' };

  await prisma.cartItem.deleteMany({
    where: await lineWhere(existingCart.id, itemIdOrCartItemId),
  });
  return getCart(ownerInput);
}

async function findExistingLine(
  cartId: string,
  itemIdOrCartItemId: string,
): Promise<{ id: string } | null> {
  const byId = await prisma.cartItem.findFirst({
    where: { cartId, id: itemIdOrCartItemId },
    select: { id: true },
  });
  if (byId) return byId;

  const byMenuItem = await prisma.cartItem.findMany({
    where: { cartId, menuItemId: itemIdOrCartItemId },
    select: { id: true },
    take: 2,
  });
  if (byMenuItem.length > 1) {
    throw new AppError(
      409,
      'AMBIGUOUS_CART_ITEM',
      'Multiple cart lines match this menu item; use cartItemId instead',
    );
  }
  return byMenuItem[0] ?? null;
}

async function lineWhere(
  cartId: string,
  itemIdOrCartItemId: string,
): Promise<Prisma.CartItemWhereInput> {
  const byId = await prisma.cartItem.findFirst({
    where: { cartId, id: itemIdOrCartItemId },
    select: { id: true },
  });
  if (byId) return { id: byId.id };
  return { cartId, menuItemId: itemIdOrCartItemId };
}
