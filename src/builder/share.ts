import type { Preset } from '../model';
import { parsePresetJson, type ValidationError } from '../schema';

/** Share-link codec: preset JSON <-> compressed base64url string for use in a URL hash. */

const toB64Url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64Url = (s: string) => {
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const writer = stream.writable.getWriter();
  void writer.write(data as unknown as BufferSource);
  void writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export async function encodePreset(preset: Preset): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(preset));
  return toB64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
}

export type DecodeResult = { ok: true; preset: Preset } | { ok: false; errors: ValidationError[] };

/** Never throws on bad input: corrupt links come back as a validation error. */
export async function decodePreset(code: string): Promise<DecodeResult> {
  let text: string;
  try {
    text = new TextDecoder().decode(await pipe(fromB64Url(code), new DecompressionStream('deflate-raw')));
  } catch {
    return { ok: false, errors: [{ path: '', message: 'Link is corrupted' }] };
  }
  return parsePresetJson(text);
}
