import type { Team } from './model';

export type Route =
  | { kind: 'builder'; code: string }
  | { kind: 'room'; roomId: string; presetRef: string; seat: Team | null };

/** Hash routes: `#room/<roomId>/<presetRef>/<A|B|spec>` opens a room; anything else is a builder share code. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [kind, roomId, presetRef, seat] = raw.split('/');
  if (kind === 'room' && roomId && presetRef) {
    return { kind: 'room', roomId, presetRef, seat: seat === 'A' || seat === 'B' ? seat : null };
  }
  return { kind: 'builder', code: raw };
}

export const roomHash = (roomId: string, presetRef: string, seat: Team | 'spec') => `#room/${roomId}/${presetRef}/${seat}`;
