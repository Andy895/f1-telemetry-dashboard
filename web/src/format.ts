import type { OpenF1Record } from '../../server/src/types';

export function formatGap(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v; // e.g. "+1 LAP"
  if (typeof v === 'number') return v === 0 ? '' : `+${v.toFixed(3)}`;
  return '';
}

export function formatLapTime(sec: unknown): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : s;
}

export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export type TrackStatus = 'GREEN' | 'YELLOW' | 'SC' | 'VSC' | 'RED' | 'CHEQUERED';

/** Work out the current track state from the race control feed. */
export function trackStatus(feed: OpenF1Record[]): TrackStatus {
  let status: TrackStatus = 'GREEN';
  for (const m of feed) {
    const msg = String(m.message ?? '').toUpperCase();
    if (m.category === 'SafetyCar') {
      if (msg.includes('VIRTUAL') && msg.includes('DEPLOYED')) status = 'VSC';
      else if (msg.includes('DEPLOYED')) status = 'SC';
    } else if (m.category === 'Flag' && (m.scope === 'Track' || !m.scope)) {
      if (m.flag === 'RED') status = 'RED';
      else if (m.flag === 'CHEQUERED') status = 'CHEQUERED';
      else if (m.flag === 'GREEN' || m.flag === 'CLEAR') status = 'GREEN';
    }
  }
  return status;
}

export const COMPOUND_COLOUR: Record<string, string> = {
  SOFT: '#ff3b3b',
  MEDIUM: '#ffd400',
  HARD: '#f2f2f2',
  INTERMEDIATE: '#3ac34a',
  WET: '#2f7dff',
};
