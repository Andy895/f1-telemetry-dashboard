import type { DriverInfo } from '../types.js';

/** Lowercase, strip accents and punctuation: "Nico Hülkenberg" -> "nico hulkenberg". */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the OpenF1 driver a market is about. Markets use display names ("Carlos Sainz Jr.",
 * "Kimi Antonelli"), OpenF1 uses "Carlos SAINZ" and "Andrea Kimi ANTONELLI", so match on surname.
 */
export function matchDriver(name: string, drivers: DriverInfo[]): number | null {
  const words = normalize(name)
    .split(' ')
    .filter((w) => !['jr', 'sr'].includes(w));
  const full = words.join(' ');
  const exact = drivers.find((d) => normalize(d.full_name) === full);
  if (exact) return exact.driver_number;
  const surname = words.at(-1);
  if (!surname) return null;
  const bySurname = drivers.filter((d) => normalize(d.full_name).split(' ').at(-1) === surname);
  if (bySurname.length === 1) return bySurname[0]!.driver_number;
  // Two drivers share a surname: also require the first name.
  const both = bySurname.find((d) => normalize(d.full_name).includes(words[0]!));
  return both?.driver_number ?? null;
}

/** Other names markets use for a Grand Prix. */
const ALIASES: Record<string, string[]> = {
  'sao paulo': ['brazil', 'brazilian'],
  'mexico city': ['mexico', 'mexican'],
  'emilia romagna': ['imola'],
  'united states': ['austin', 'cota', 'us grand prix'],
  british: ['great britain', 'silverstone'],
  italian: ['italy', 'monza'],
  spanish: ['spain'],
  dutch: ['netherlands'],
  belgian: ['belgium'],
  hungarian: ['hungary'],
  austrian: ['austria'],
  japanese: ['japan'],
  chinese: ['china'],
  australian: ['australia'],
  canadian: ['canada'],
  brazilian: ['brazil'],
  mexican: ['mexico'],
};

/** Names that identify a meeting in a market title: "Abu Dhabi Grand Prix" -> ["abu dhabi"]. */
export function meetingKeys(meetingName: string): string[] {
  const core = normalize(meetingName).replace(/ grand prix$/, '').trim();
  return [core, ...(ALIASES[core] ?? [])];
}

/** True when a market title is about this meeting. */
export function titleMatches(title: string, keys: string[]): boolean {
  const t = ` ${normalize(title)} `;
  return keys.some((k) => t.includes(` ${k} `));
}
