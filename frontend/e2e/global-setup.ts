import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const repoRoot = path.resolve(__dirname, '..', '..');
const backendDir = `${repoRoot}/backend`;
const databaseUrl = 'postgresql://bistro:bistro@localhost:5433/bistro_e2e?schema=public';

function run(command: string, args: string[], cwd = repoRoot): void {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

async function waitForPostgres(): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      execFileSync(
        'docker',
        ['exec', 'bistro-postgres', 'pg_isready', '-U', 'bistro', '-d', 'bistro_dev'],
        { cwd: repoRoot, stdio: 'ignore' },
      );
      return;
    } catch {
      await sleep(1000);
    }
  }

  run('docker', ['logs', 'bistro-postgres']);
  throw new Error('Postgres did not become ready for E2E setup.');
}

export default async function globalSetup(): Promise<void> {
  run('docker', ['compose', 'up', '-d', 'postgres']);
  await waitForPostgres();
  run('docker', [
    'exec',
    'bistro-postgres',
    'sh',
    '-lc',
    'createdb -U bistro bistro_e2e 2>/dev/null || true',
  ]);
  run('npx', ['prisma', 'migrate', 'deploy'], backendDir);
  run('npm', ['run', 'db:seed'], backendDir);
}
