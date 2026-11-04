import type { Team } from './model';

export type Route =
  | { kind: 'builder'; code: string }
  | { kind: 'room'; roomId: string; presetRef: string; seat: Team | null }
  | { kind: 'invalid'; reason: string };

/** Hash routes: `#room/<roomId>/<presetRef>/<A|B|spec>` opens a room; anything else is a builder share code. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [kind, roomId, presetRef, seat] = raw.split('/');
  if (kind !== 'room') return { kind: 'builder', code: raw };
  if (!roomId || !presetRef) return { kind: 'invalid', reason: 'This room link is incomplete.' };
  if (seat !== 'A' && seat !== 'B' && seat !== 'spec') return { kind: 'invalid', reason: `Unknown seat "${seat ?? ''}" in this room link. Use A, B or spec.` };
  return { kind: 'room', roomId, presetRef, seat: seat === 'spec' ? null : seat };
}

export const roomHash = (roomId: string, presetRef: string, seat: Team | 'spec') => `#room/${roomId}/${presetRef}/${seat}`;

export interface Link {
  label: string;
  url: string;
}

/** One link per seat of a room, ready to hand out. */
export const roomLinks = (base: string, roomId: string, presetRef: string): Link[] => [
  { label: 'Captain A', url: base + roomHash(roomId, presetRef, 'A') },
  { label: 'Captain B', url: base + roomHash(roomId, presetRef, 'B') },
  { label: 'Spectator', url: base + roomHash(roomId, presetRef, 'spec') },
];
