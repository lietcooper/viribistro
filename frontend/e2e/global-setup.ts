import { execFileSync } from 'node:child_process';
import path from 'node:path';

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

export default async function globalSetup(): Promise<void> {
  run('docker', ['compose', 'up', '-d', 'postgres']);
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
