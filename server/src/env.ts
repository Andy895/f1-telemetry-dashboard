import { existsSync } from 'node:fs';

/** Load KEY=value pairs from a .env file into process.env, if the file exists. */
export function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  try {
    process.loadEnvFile(path);
  } catch (err) {
    console.warn(`Could not read ${path}:`, err instanceof Error ? err.message : err);
  }
}
