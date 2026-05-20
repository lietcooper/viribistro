// Public menu routes. No auth. Anonymous users (the chat-default flow)
// browse the menu freely. Prisma's Decimal type is serialized as a string
// here so the wire format never loses precision.
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/AppError.js';
import { validate } from '../middleware/validate.js';
import { MenuQuerySchema, MenuParamsSchema } from '../schemas/menu.js';
import { normalizePrice } from '../services/cart.js';

interface SerializedMenuItem {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  tags: string[];
  imageUrl: string;
  available: boolean;
  customizationGroups: SerializedCustomizationGroup[];
}

interface SerializedCustomizationGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: SerializedCustomizationOption[];
}

interface SerializedCustomizationOption {
  id: string;
  name: string;
  priceDelta: string;
  available: boolean;
  sortOrder: number;
}

function serialize(item: {
  id: string;
  name: string;
  description: string;
  price: { toString: () => string };
  category: string;
  tags: string[];
  imageUrl: string;
  available: boolean;
  customizationGroups?: Array<{
    id: string;
    name: string;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    sortOrder: number;
    options: Array<{
      id: string;
      name: string;
      priceDelta: { toString: () => string };
      available: boolean;
      sortOrder: number;
    }>;
  }>;
}): SerializedMenuItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price.toString(),
    category: item.category,
    tags: item.tags,
    imageUrl: item.imageUrl,
    available: item.available,
    customizationGroups: (item.customizationGroups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      required: group.required,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      sortOrder: group.sortOrder,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: normalizePrice(option.priceDelta),
        available: option.available,
        sortOrder: option.sortOrder,
      })),
    })),
  };
}

export const menuRouter: Router = Router();

menuRouter.get('/', validate({ query: MenuQuerySchema }), async (req, res) => {
  const { category } = req.query as {
    category?: 'starters' | 'mains' | 'desserts' | 'drinks';
  };
  const items = await prisma.menuItem.findMany({
    where: {
      available: true,
      ...(category ? { category } : {}),
    },
    include: {
      customizationGroups: {
        orderBy: { sortOrder: 'asc' },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      },
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  res.json({ items: items.map(serialize) });
});

menuRouter.get('/:id', validate({ params: MenuParamsSchema }), async (req, res) => {
  const { id } = req.params as { id: string };
  const item = await prisma.menuItem.findUnique({
    where: { id },
    include: {
      customizationGroups: {
        orderBy: { sortOrder: 'asc' },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      },
    },
  });
  if (!item || !item.available) {
    throw new AppError(404, 'NOT_FOUND', 'Menu item not found');
  }
  res.json({ item: serialize(item) });
});
