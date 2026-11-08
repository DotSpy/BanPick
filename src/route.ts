import type { Team } from './model';

export type Route =
  | { kind: 'builder'; code: string }
  | { kind: 'room'; roomId: string; presetRef: string }
  | { kind: 'invalid'; reason: string };

/** Hash routes: `#room/<roomId>/<presetRef>` opens a room (one link for everyone); anything else is a builder share code. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [kind, roomId, presetRef] = raw.split('/');
  if (kind !== 'room') return { kind: 'builder', code: raw };
  if (!roomId || !presetRef) return { kind: 'invalid', reason: 'This room link is incomplete.' };
  return { kind: 'room', roomId, presetRef };
}

export const roomHash = (roomId: string, presetRef: string) => `#room/${roomId}/${presetRef}`;

export interface Link {
  label: string;
  url: string;
}

/** The single link to share; each browser picks its seat after opening it. */
export const roomLink = (base: string, roomId: string, presetRef: string): Link => ({ label: 'Room link', url: base + roomHash(roomId, presetRef) });
