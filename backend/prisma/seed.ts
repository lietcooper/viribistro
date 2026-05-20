import 'dotenv/config';
import { PrismaClient, type Category, type Prisma } from '@prisma/client';

type MenuItemSeed = Omit<Prisma.MenuItemCreateInput, 'id' | 'orderItems'> & {
  category: Category;
};

type OptionSeed = {
  name: string;
  priceDelta?: string;
  available?: boolean;
  sortOrder: number;
};

type GroupSeed = {
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: OptionSeed[];
};

/**
 * Curated bistro menu. Tag values are constrained to:
 * `vegan | vegetarian | spicy | gluten-free | signature`.
 *
 * Image URLs use stable Unsplash photo IDs. If any 404 in the future,
 * swap the ID for a live one — the seed only requires `https://...`.
 */
const MENU: MenuItemSeed[] = [
  // ─── Starters (6) ──────────────────────────────────────────────────────────
  {
    name: 'Burrata with Heirloom Tomatoes',
    description:
      'Creamy buffalo-milk burrata over a bed of summer heirloom tomatoes, finished with basil oil and Maldon salt.',
    price: '16.00',
    category: 'starters',
    tags: ['vegetarian', 'gluten-free', 'signature'],
    imageUrl: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=800&q=80',
  },
  {
    name: 'French Onion Soup',
    description:
      'Slow-caramelized sweet onions in a beef-and-thyme broth, topped with toasted baguette and a Gruyère crust.',
    price: '14.00',
    category: 'starters',
    tags: ['signature'],
    imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800&q=80',
  },
  {
    name: 'Charcuterie Board',
    description:
      'Chef-selected cured meats, aged cheeses, marcona almonds, fig jam, and crostini for two.',
    price: '24.00',
    category: 'starters',
    tags: ['signature'],
    imageUrl: 'https://images.unsplash.com/photo-1452195100486-9cc805987862?w=800&q=80',
  },
  {
    name: 'Tuna Tartare',
    description:
      'Sushi-grade ahi tuna, avocado, citrus-soy dressing, and crispy wonton chips, with a kick of chili oil.',
    price: '18.00',
    category: 'starters',
    tags: ['spicy', 'gluten-free'],
    imageUrl: 'https://images.unsplash.com/photo-1559847844-5315695dadae?w=800&q=80',
  },
  {
    name: 'Truffle Arancini',
    description:
      'Crispy saffron risotto balls stuffed with fontina, served with black-truffle aioli.',
    price: '15.00',
    category: 'starters',
    tags: ['vegetarian', 'signature'],
    imageUrl: 'https://images.unsplash.com/photo-1572441713132-c542fc4fe282?w=800&q=80',
  },
  {
    name: 'Shrimp Cocktail',
    description:
      'Chilled jumbo Gulf shrimp with horseradish-cocktail sauce and a wedge of Meyer lemon.',
    price: '17.00',
    category: 'starters',
    tags: ['gluten-free'],
    imageUrl: 'https://images.unsplash.com/photo-1625944525533-473d77d0f74e?w=800&q=80',
  },

  // ─── Mains (8) ─────────────────────────────────────────────────────────────
  {
    name: 'Spicy Chicken Sandwich',
    description:
      'Buttermilk-fried chicken thigh with Nashville hot honey, slaw, and bread-and-butter pickles on a brioche bun.',
    price: '19.00',
    category: 'mains',
    tags: ['spicy', 'signature'],
    imageUrl: 'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=800&q=80',
  },
  {
    name: 'Wagyu Beef Burger',
    description:
      'American Wagyu patty, aged cheddar, caramelized onions, garlic aioli, on a toasted potato bun. Hand-cut fries.',
    price: '26.00',
    category: 'mains',
    tags: ['signature'],
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80',
  },
  {
    name: 'Pan-Seared Salmon',
    description:
      'Crispy-skin Atlantic salmon over lemon-dill quinoa with roasted asparagus and a beurre blanc.',
    price: '28.00',
    category: 'mains',
    tags: ['gluten-free'],
    imageUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=800&q=80',
  },
  {
    name: 'Wild Mushroom Risotto',
    description:
      'Carnaroli rice slow-cooked with porcini, oyster, and shiitake mushrooms, finished with parmesan and chive oil.',
    price: '22.00',
    category: 'mains',
    tags: ['vegetarian', 'gluten-free'],
    imageUrl: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c7?w=800&q=80',
  },
  {
    name: 'Ribeye Steak (12oz)',
    description:
      'Dry-aged ribeye, finished with herb butter, served with truffle pommes purée and charred broccolini.',
    price: '48.00',
    category: 'mains',
    tags: ['gluten-free', 'signature'],
    imageUrl: 'https://images.unsplash.com/photo-1558030006-450675393462?w=800&q=80',
  },
  {
    name: 'Lobster Linguine',
    description:
      'Maine lobster tail tossed with linguine in a tomato-cognac cream sauce and a hint of Calabrian chili.',
    price: '38.00',
    category: 'mains',
    tags: ['spicy', 'signature'],
    imageUrl: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&q=80',
  },
  {
    name: 'Duck Confit',
    description:
      'Slow-cooked duck leg with crispy skin, served over lentils du Puy and roasted root vegetables.',
    price: '32.00',
    category: 'mains',
    tags: ['gluten-free', 'signature'],
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80',
  },
  {
    name: 'Charred Vegetable Mille-Feuille',
    description:
      'Layered grilled eggplant, zucchini, and roasted red pepper with sun-dried tomato pesto and balsamic glaze.',
    price: '21.00',
    category: 'mains',
    tags: ['vegan', 'gluten-free'],
    imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&q=80',
  },

  // ─── Desserts (4) ──────────────────────────────────────────────────────────
  {
    name: 'Crème Brûlée',
    description:
      'Classic vanilla bean custard under a torched sugar crust, served with fresh berries.',
    price: '12.00',
    category: 'desserts',
    tags: ['vegetarian', 'gluten-free', 'signature'],
    imageUrl: 'https://images.unsplash.com/photo-1470124182917-cc6e71b22ecc?w=800&q=80',
  },
  {
    name: 'Chocolate Lava Cake',
    description:
      'Warm flourless chocolate cake with a molten center, vanilla bean ice cream, and raspberry coulis.',
    price: '13.00',
    category: 'desserts',
    tags: ['vegetarian', 'gluten-free', 'signature'],
    imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=800&q=80',
  },
  {
    name: 'Tiramisu',
    description:
      'House-made ladyfingers soaked in espresso and Marsala, layered with mascarpone cream and cocoa dust.',
    price: '12.00',
    category: 'desserts',
    tags: ['vegetarian'],
    imageUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=800&q=80',
  },
  {
    name: 'Seasonal Sorbet Trio',
    description:
      'Three scoops of the day — typically mango, raspberry, and lemon — with candied citrus zest.',
    price: '10.00',
    category: 'desserts',
    tags: ['vegan', 'gluten-free'],
    imageUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=800&q=80',
  },

  // ─── Drinks (6) ────────────────────────────────────────────────────────────
  {
    name: 'Sparkling Mineral Water',
    description: 'Imported still or sparkling water served chilled with a lemon twist.',
    price: '6.00',
    category: 'drinks',
    tags: ['vegan', 'gluten-free'],
    imageUrl: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=800&q=80',
  },
  {
    name: 'Fresh-Pressed Lemonade',
    description:
      'House-made lemonade with mint and a hint of ginger, served over crushed ice.',
    price: '7.00',
    category: 'drinks',
    tags: ['vegan'],
    imageUrl: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800&q=80',
  },
  {
    name: 'House Red Wine',
    description:
      'Glass of our weekly-rotating house red — typically a medium-bodied Spanish Garnacha or Italian Sangiovese.',
    price: '12.00',
    category: 'drinks',
    tags: ['vegan', 'gluten-free'],
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80',
  },
  {
    name: 'House White Wine',
    description:
      'Glass of crisp Sauvignon Blanc or unoaked Chardonnay — ask your server about today’s pour.',
    price: '12.00',
    category: 'drinks',
    tags: ['vegan', 'gluten-free'],
    imageUrl: 'https://images.unsplash.com/photo-1566995541428-f288d2231b59?w=800&q=80',
  },
  {
    name: 'Local Craft Beer',
    description:
      'Rotating selection of West Coast IPAs, pilsners, and seasonal ales from local breweries.',
    price: '9.00',
    category: 'drinks',
    tags: ['vegetarian'],
    imageUrl: 'https://images.unsplash.com/photo-1568213816046-0ee1c42bd559?w=800&q=80',
  },
  {
    name: 'Espresso Martini',
    description:
      'Vodka, fresh espresso, coffee liqueur, and a touch of vanilla, shaken hard and served up with three beans.',
    price: '15.00',
    category: 'drinks',
    tags: ['vegan', 'gluten-free', 'signature'],
    imageUrl: 'https://images.unsplash.com/photo-1546171753-97d7676e4602?w=800&q=80',
  },
];

const CUSTOMIZATIONS: Record<string, GroupSeed[]> = {
  'Spicy Chicken Sandwich': [
    {
      name: 'Heat level',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        { name: 'Classic hot honey', sortOrder: 1 },
        { name: 'Extra Nashville hot', sortOrder: 2 },
        { name: 'Mild honey glaze', sortOrder: 3 },
      ],
    },
    {
      name: 'Add-ons',
      required: false,
      minSelect: 0,
      maxSelect: 2,
      sortOrder: 2,
      options: [
        { name: 'Avocado', priceDelta: '3.00', sortOrder: 1 },
        { name: 'Aged cheddar', priceDelta: '2.00', sortOrder: 2 },
      ],
    },
  ],
  'Wagyu Beef Burger': [
    {
      name: 'Temperature',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        { name: 'Medium rare', sortOrder: 1 },
        { name: 'Medium', sortOrder: 2 },
        { name: 'Well done', sortOrder: 3 },
      ],
    },
    {
      name: 'Cheese',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 2,
      options: [
        { name: 'Aged cheddar', priceDelta: '2.00', sortOrder: 1 },
        { name: 'Blue cheese', priceDelta: '3.00', sortOrder: 2 },
        { name: 'No cheese', sortOrder: 3 },
      ],
    },
  ],
  'Pan-Seared Salmon': [
    {
      name: 'Sauce',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        { name: 'Beurre blanc', sortOrder: 1 },
        { name: 'Lemon herb vinaigrette', sortOrder: 2 },
        { name: 'Extra beurre blanc', priceDelta: '2.00', sortOrder: 3 },
      ],
    },
  ],
  'Sparkling Mineral Water': [
    {
      name: 'Style',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        { name: 'Sparkling', sortOrder: 1 },
        { name: 'Still', sortOrder: 2 },
      ],
    },
  ],
  'Fresh-Pressed Lemonade': [
    {
      name: 'Sweetness',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        { name: 'House recipe', sortOrder: 1 },
        { name: 'Less sweet', sortOrder: 2 },
        { name: 'Extra ginger', priceDelta: '1.00', sortOrder: 3 },
      ],
    },
  ],
  'House Red Wine': [
    {
      name: 'Pour',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        { name: 'Glass', sortOrder: 1 },
        { name: 'Carafe', priceDelta: '18.00', sortOrder: 2 },
      ],
    },
  ],
  'House White Wine': [
    {
      name: 'Pour',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        { name: 'Glass', sortOrder: 1 },
        { name: 'Carafe', priceDelta: '18.00', sortOrder: 2 },
      ],
    },
  ],
  'Local Craft Beer': [
    {
      name: 'Style',
      required: true,
      minSelect: 1,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        { name: 'IPA', sortOrder: 1 },
        { name: 'Pilsner', sortOrder: 2 },
        { name: 'Seasonal ale', sortOrder: 3 },
      ],
    },
  ],
  'Espresso Martini': [
    {
      name: 'Coffee profile',
      required: false,
      minSelect: 0,
      maxSelect: 1,
      sortOrder: 1,
      options: [
        { name: 'Classic', sortOrder: 1 },
        { name: 'Extra espresso', priceDelta: '2.00', sortOrder: 2 },
        { name: 'Decaf espresso', sortOrder: 3 },
      ],
    },
  ],
};

/**
 * Idempotent seed — if the menu table already contains items, this is a no-op.
 * To force a re-seed: `npx prisma migrate reset --force` (which also re-runs seed).
 */
export async function seedMenu(prisma: PrismaClient): Promise<{ inserted: number }> {
  const existing = await prisma.menuItem.count();
  let inserted = 0;

  if (existing === 0) {
    const result = await prisma.menuItem.createMany({ data: MENU });
    inserted = result.count;
  }

  await seedCustomizations(prisma);
  return { inserted };
}

async function seedCustomizations(prisma: PrismaClient): Promise<void> {
  for (const [itemName, groups] of Object.entries(CUSTOMIZATIONS)) {
    const item = await prisma.menuItem.findFirst({
      where: { name: itemName },
      select: { id: true },
    });
    if (!item) continue;

    for (const groupSeed of groups) {
      const existingGroup = await prisma.customizationGroup.findFirst({
        where: { menuItemId: item.id, name: groupSeed.name },
        select: { id: true },
      });
      const group =
        existingGroup ??
        (await prisma.customizationGroup.create({
          data: {
            menuItemId: item.id,
            name: groupSeed.name,
            required: groupSeed.required,
            minSelect: groupSeed.minSelect,
            maxSelect: groupSeed.maxSelect,
            sortOrder: groupSeed.sortOrder,
          },
          select: { id: true },
        }));

      for (const option of groupSeed.options) {
        await prisma.customizationOption.upsert({
          where: { id: `${group.id}:${option.name}` },
          update: {},
          create: {
            id: `${group.id}:${option.name}`,
            groupId: group.id,
            name: option.name,
            priceDelta: option.priceDelta ?? '0.00',
            available: option.available ?? true,
            sortOrder: option.sortOrder,
          },
        });
      }
    }
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const { inserted } = await seedMenu(prisma);
    if (inserted === 0) {
      console.log('Menu already seeded — no changes.');
    } else {
      console.log(`Seeded ${inserted} menu items.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run as a script. Detect "is this the entry file?" via a filename
// suffix check instead of comparing URLs — `import.meta.url` is
// `file:///C:/...` on Windows while `process.argv[1]` is `C:\\...`,
// so URL equality silently fails there and the seed becomes a no-op.
const isDirectRun =
  typeof process !== 'undefined' &&
  typeof process.argv[1] === 'string' &&
  /[\\/]seed\.(ts|js|mjs)$/.test(process.argv[1]);

if (isDirectRun) {
  main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
