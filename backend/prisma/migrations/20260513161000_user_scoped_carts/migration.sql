ALTER TABLE "Cart" ADD COLUMN "userId" TEXT;
ALTER TABLE "Cart" ALTER COLUMN "sessionId" DROP NOT NULL;

CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");
CREATE INDEX "Cart_userId_idx" ON "Cart"("userId");

ALTER TABLE "Cart"
  ADD CONSTRAINT "Cart_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
