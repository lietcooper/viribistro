-- Allow guest (anonymous) checkout by making Order.userId nullable.
-- The chat-driven demo flow lets a recruiter build a cart and place an
-- order without signing in; signed-in orders still populate userId so
-- GET /api/orders can list them per user.

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_userId_fkey";

-- AlterColumn
ALTER TABLE "Order" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey (re-add now that the column is nullable; ON DELETE SET NULL
-- so deleting a user doesn't take their order history with them — orders
-- are financial records).
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
