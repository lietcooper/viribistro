// Schema-driven TRUNCATE. We enumerate the public schema's BASE TABLE rows
// from information_schema instead of hardcoding the table list — the
// previous hardcoded version had to be edited every time a new model was
// added, which is the kind of thing that bit-rots silently.
//
// CASCADE handles FK dependencies in any order, so we don't have to think
// about parent/child ordering. RESTART IDENTITY resets any sequence
// columns (we don't have many — cuids are random strings — but a future
// auto-increment column would benefit).
import { prisma } from '../../src/lib/prisma.js';

interface TableRow {
  table_name: string;
}

export async function resetDb(): Promise<void> {
  // _prisma_migrations is Prisma's bookkeeping table; truncating it would
  // make `prisma migrate deploy` think the DB is unmigrated. Filter it out.
  const rows = await prisma.$queryRaw<TableRow[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE '\\_%' ESCAPE '\\'
  `;
  if (rows.length === 0) return;
  // Table names come from `information_schema.tables` filtered to the
  // public schema's BASE TABLEs — never from user input — so the
  // interpolation here is not an injection risk. DDL (TRUNCATE) can't be
  // parameterised, which is why we use $executeRawUnsafe.
  const quoted = rows.map((r) => `"${r.table_name}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE;`,
  );
}
