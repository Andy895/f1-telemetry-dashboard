/**
 * `npm run check-live`: checks the OpenF1 login in .env without waiting for a race weekend.
 * Prints plain-language results, one line per check.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../env.js';
import { TokenManager } from '../openf1/auth.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const envPath = join(repoRoot, '.env');

const ok = (m: string) => console.log(`  OK    ${m}`);
const fail = (m: string, fix: string) => {
  console.log(`  FAIL  ${m}`);
  console.log(`        ${fix}`);
  process.exit(0); // not 1: npm would bury the message under its own error text
};

console.log('Checking live setup…');
if (!existsSync(envPath)) {
  if (existsSync(`${envPath}.txt`)) fail('Found ".env.txt" instead of ".env".', 'Rename it to .env (see LIVE-SETUP.md, step 3).');
  fail(`No .env file in ${repoRoot}`, 'Create it as described in LIVE-SETUP.md, step 3.');
}
ok('.env file found');
loadEnvFile(envPath);

const username = process.env.OPENF1_USERNAME?.trim() ?? '';
const password = process.env.OPENF1_PASSWORD?.trim() ?? '';
if (!username) fail('OPENF1_USERNAME is empty in .env', 'Put your OpenF1 username after the = sign, with no spaces or quotes.');
if (!password) fail('OPENF1_PASSWORD is empty in .env', 'Put your OpenF1 password after the = sign, with no spaces or quotes.');
ok(`Username and password filled in (username: ${username})`);

try {
  const tokens = new TokenManager(username, password);
  await tokens.get();
  ok('OpenF1 accepted the login');
} catch (err) {
  fail(`OpenF1 did not accept the login: ${(err as Error).message}`, 'Check the username and password in .env against what OpenF1 sent you, and that your sponsorship is active.');
}

console.log('\nAll set. On race weekends, run "npm start" and click "Go live" (from 30 minutes before a session).');
