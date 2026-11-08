const NS = 'http://www.w3.org/2000/svg';

// 24x24 stroke paths; colour and size come from CSS (`.glyph`) so they follow the theme.
const PATHS = {
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  copy: ['M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  play: ['M6 4l14 8-14 8z'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14', 'M10 11v6', 'M14 11v6'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z'],
};

export type GlyphName = keyof typeof PATHS;

/** A small decorative inline icon; the button or label next to it carries the accessible name. */
export function glyph(name: GlyphName): SVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'glyph');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of PATHS[name]) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}