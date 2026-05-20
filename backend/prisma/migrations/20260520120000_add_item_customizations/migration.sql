-- Add menu item customization metadata and snapshot selected choices on cart/order lines.
CREATE TABLE "CustomizationGroup" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CustomizationGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomizationOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CustomizationOption_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CartItem"
  ADD COLUMN "customizations" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "customizationHash" TEXT NOT NULL DEFAULT 'base';

ALTER TABLE "OrderItem"
  ADD COLUMN "customizations" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "customizationHash" TEXT NOT NULL DEFAULT 'base';

DROP INDEX IF EXISTS "CartItem_cartId_menuItemId_key";
CREATE UNIQUE INDEX "CartItem_cartId_menuItemId_customizationHash_key"
  ON "CartItem"("cartId", "menuItemId", "customizationHash");
CREATE INDEX "CartItem_customizationHash_idx" ON "CartItem"("customizationHash");
CREATE INDEX "CustomizationGroup_menuItemId_idx" ON "CustomizationGroup"("menuItemId");
CREATE INDEX "CustomizationOption_groupId_idx" ON "CustomizationOption"("groupId");

ALTER TABLE "CustomizationGroup"
  ADD CONSTRAINT "CustomizationGroup_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomizationOption"
  ADD CONSTRAINT "CustomizationOption_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "CustomizationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
