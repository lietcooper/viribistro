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
  // Free-text kitchen note. null when the user didn't add one. Empty/
  // whitespace-only input is normalized to null at the cart boundary.
  note: string | null;
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
  note: string | null;
  menuItem: { name: string };
};

type CartLineMatch = {
  id: string;
  menuItemId: string;
  quantity: number;
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
    note: item.note,
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
          note: true,
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

export function normalizeNote(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function customizationHash(
  customizations: NormalizedCustomization[],
  note: string | null,
): string {
  if (customizations.length === 0 && note == null) return 'base';
  const groupShape = customizations.map((group) => ({
    groupId: group.groupId,
    optionIds: group.options.map((option) => option.optionId),
  }));
  // Backward-compat: when no note, hash the bare groups array so that
  // pre-note-feature lines still stack with newly-added identical
  // no-note lines. With a note, switch to a wrapper object so two
  // notes don't collide with the no-note hash. The kitchen needs each
  // distinct note as its own line.
  const stable = note == null ? groupShape : { g: groupShape, n: note };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

function normalizeCustomizations(
  item: Awaited<ReturnType<typeof lookupMenuItem>>,
  selected: SelectedCustomizations = {},
  note: string | null = null,
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
    customizationHash: customizationHash(normalized, note),
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
  noteInput?: string | null,
): Promise<Cart> {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a positive integer');
  }
  const item = await lookupMenuItem(menuItemId);
  const note = normalizeNote(noteInput);
  const { customizations, customizationHash, unitPrice } = normalizeCustomizations(
    item,
    selectedCustomizations,
    note,
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
      note,
    },
    create: {
      cartId: cart.id,
      menuItemId: item.id,
      quantity,
      unitPrice,
      customizationHash,
      customizations: customizationsJson(customizations),
      note,
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

  // No existing line and newQuantity > 0: refuse to silently spawn a new
  // bare line. For items with REQUIRED groups this would fail downstream
  // anyway, but for items with only OPTIONAL groups it would have created
  // an uncustomized line bypassing the agent's clarify flow. Force the
  // caller to use add_to_cart, which goes through the full customization
  // path (and lets the agent surface optional groups per persona rule 4).
  throw new AppError(
    400,
    'MODIFY_REQUIRES_EXISTING_LINE',
    'modify_item can only change an existing cart line; call add_to_cart to add a new one',
  );
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
  const line = await resolveSingleLine(cartId, itemIdOrCartItemId);
  return line ? { id: line.id } : null;
}

async function lineWhere(
  cartId: string,
  itemIdOrCartItemId: string,
): Promise<Prisma.CartItemWhereInput> {
  const line = await resolveSingleLine(cartId, itemIdOrCartItemId);
  return line ? { id: line.id } : { id: itemIdOrCartItemId };
}

async function resolveSingleLine(
  cartId: string,
  itemIdOrCartItemId: string,
): Promise<CartLineMatch | null> {
  const select = {
    id: true,
    menuItemId: true,
    quantity: true,
    customizations: true,
    menuItem: { select: { name: true } },
  } satisfies Prisma.CartItemSelect;

  const byId = await prisma.cartItem.findFirst({
    where: { cartId, id: itemIdOrCartItemId },
    select,
  });
  if (byId) return byId;

  const matches = await prisma.cartItem.findMany({
    where: { cartId, menuItemId: itemIdOrCartItemId },
    select,
    orderBy: { id: 'asc' },
  });
  if (matches.length > 1) {
    throw ambiguousCartItem(matches);
  }
  return matches[0] ?? null;
}

function ambiguousCartItem(matches: CartLineMatch[]): AppError {
  const itemName = matches[0]?.menuItem.name ?? 'this menu item';
  const choices = matches.map((line) => ({
    cartItemId: line.id,
    menuItemId: line.menuItemId,
    quantity: line.quantity,
    customizations: customizationSummary(deserializeCustomizations(line.customizations)),
  }));
  const message =
    `Multiple cart lines match ${itemName}; use cartItemId to choose one: ` +
    choices
      .map((choice) => `${choice.cartItemId} (${choice.quantity}x, ${choice.customizations})`)
      .join('; ');
  return new AppError(409, 'AMBIGUOUS_CART_ITEM', message, { itemName, choices });
}

function customizationSummary(customizations: NormalizedCustomization[]): string {
  if (customizations.length === 0) return 'no customizations';
  return customizations
    .map(
      (group) =>
        `${group.groupName}: ${group.options.map((option) => option.optionName).join(', ')}`,
    )
    .join('; ');
}
