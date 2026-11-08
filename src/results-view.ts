import { btn, h } from './dom';
import type { DraftState } from './draft';
import { itemIcon } from './icon';
import type { Team } from './model';
import { choiceOf } from './rules';
import { draftResults, formatDuration, teamTitle, type Choice, type DraftResults } from './results';

const TEAM_COLOUR: Record<Team, string> = { A: '#5b9cf5', B: '#f0a04b' };
const ACTION_COLOUR = { ban: '#e5645f', pick: '#4cc38a', choose: '#4cc38a' };

/** Singular label for a one-item row ("maps" becomes "map"). */
const rowLabel = (target: string, count: number) => (count === 1 ? target.replace(/s$/, '') : target);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Draft finished" bar with a check, the draft length and the finish time. */
export function finishedBar(state: DraftState): HTMLElement {
  const parts = ['\u2713 Draft finished'];
  if (state.startedAt != null && state.finishedAt != null) parts.push(formatDuration(state.finishedAt - state.startedAt));
  if (state.finishedAt != null) parts.push(new Date(state.finishedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  return h('p', { className: 'turn finished', textContent: parts.join(' \u00b7 ') });
}

const chips = (state: DraftState, action: 'pick' | 'ban', list: Choice[]) =>
  list.map((c) => {
    const { item, size } = choiceOf(state.preset, action, c.id);
    const icon = itemIcon(item, '', size);
    return h('li', { className: action }, icon, h('span', { textContent: c.name }));
  });

const row = (state: DraftState, label: string, action: 'pick' | 'ban', list: Choice[], className = '') =>
  h('div', { className: `result-row ${className}`.trim() }, h('h4', { textContent: cap(rowLabel(label, list.length)) }), h('ul', {}, ...chips(state, action, list)));

/** What each team got: shared results (such as the map) once on top, then one column per team with picks first and bans last, small and muted. */
function summary(state: DraftState, r: DraftResults): HTMLElement {
  const shared = r.shared.map((s) =>
    h('section', { className: 'result-map' }, h('h3', { textContent: cap(rowLabel(s.target, s.picks.length)) }),
      ...s.picks.map((c) => h('div', { className: 'result-map-pick' }, itemIcon(choiceOf(state.preset, 'pick', c.id).item, '', 'large'), h('div', {}, h('strong', { textContent: c.name }), h('span', { className: 'by', textContent: `picked by ${c.by}` }))))));
  const column = (t: DraftResults['teams'][number]) => {
    const picks = t.groups.filter((g) => g.picks.length).map((g) => row(state, g.target, 'pick', g.picks));
    const bans = t.groups.filter((g) => g.bans.length).map((g) => row(state, `Banned ${g.target}`, 'ban', g.bans, 'bans'));
    return h('section', { className: `result-team team-${t.team}` }, h('h3', { textContent: teamTitle(t) }), ...picks, ...bans);
  };
  return h('div', { className: 'results' }, ...(shared.length ? [h('div', { className: 'result-shared' }, ...shared)] : []), h('div', { className: 'summary' }, ...r.teams.map(column)));
}

const W = 1200;
const PAD = 24;
const FONT = 'system-ui, sans-serif';
const TEXT = '#e6eaf2';

/** Loads with CORS so the canvas stays clean; null when the source is unreachable or not CORS-enabled. */
const loadImage = (url: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

const imageFor = (state: DraftState, action: 'pick' | 'ban', c: Choice) => {
  const url = choiceOf(state.preset, action, c.id).item?.image;
  return url ? loadImage(url) : Promise.resolve(null);
};

/** Letter tile used for items without an image or whose image could not be loaded safely. */
function placeholder(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number) {
  ctx.fillStyle = '#2a3550';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = TEXT;
  ctx.font = `bold ${Math.round(size * 0.5)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(name.trim().charAt(0).toUpperCase(), x + size / 2, y + size / 2 + 1);
  ctx.textAlign = 'left';
}

const clip = (ctx: CanvasRenderingContext2D, text: string, width: number) => {
  let out = text;
  while (out.length > 1 && ctx.measureText(out).width > width) out = `${out.slice(0, -2)}\u2026`;
  return out;
};

type Loaded = { name: string; img: HTMLImageElement | null; by?: string };

/** PNG of the step order and the results laid out like the result page: shared rows, then picks, then muted bans per team. Item images are loaded CORS-safe first; failures draw a letter tile. */
export async function resultsImage(state: DraftState, r: DraftResults): Promise<Blob | null> {
  const load = (action: 'pick' | 'ban', list: Choice[]): Promise<Loaded[]> => Promise.all(list.map(async (c) => ({ name: c.name, by: c.by, img: await imageFor(state, action, c) })));
  const shared = await Promise.all(r.shared.map(async (s) => ({ target: cap(rowLabel(s.target, s.picks.length)), list: await load('pick', s.picks) })));
  const teams = await Promise.all(
    r.teams.map(async (t) => ({
      team: t,
      picks: await Promise.all(t.groups.filter((g) => g.picks.length).map(async (g) => ({ target: rowLabel(g.target, g.picks.length), list: await load('pick', g.picks) }))),
      bans: await Promise.all(t.groups.filter((g) => g.bans.length).map(async (g) => ({ target: `Banned ${rowLabel(g.target, g.bans.length)}`, list: await load('ban', g.bans) }))),
    })),
  );

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const [cw, ch, gap, cols] = [138, 46, 8, 8];
  canvas.width = W;
  canvas.height = 4000;
  ctx.fillStyle = '#0f1420';
  ctx.fillRect(0, 0, W, canvas.height);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT;
  ctx.font = `bold 20px ${FONT}`;
  ctx.fillText(`${r.preset}${r.durationMs != null ? ` \u00b7 ${formatDuration(r.durationMs)}` : ''}`, PAD, 36);
  ctx.font = `13px ${FONT}`;
  r.steps.forEach((s, i) => {
    const [x, y] = [PAD + (i % cols) * (cw + gap), 60 + Math.floor(i / cols) * (ch + gap)];
    ctx.fillStyle = '#182033';
    ctx.fillRect(x, y, cw, ch);
    ctx.strokeStyle = TEAM_COLOUR[s.team];
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cw, ch);
    ctx.fillStyle = ACTION_COLOUR[s.action];
    ctx.fillText(`${s.index + 1} ${s.team} ${s.action.toUpperCase()}`, x + 8, y + 15);
    ctx.fillStyle = TEXT;
    ctx.fillText(clip(ctx, s.label, cw - 16), x + 8, y + 33);
  });

  /** Draws a labelled vertical list of items and returns the y below it. */
  const list = (target: string, items: Loaded[], x: number, y: number, width: number, small: boolean) => {
    const [icon, rowH] = small ? [24, 30] : [40, 48];
    ctx.font = `600 ${small ? 12 : 13}px ${FONT}`;
    ctx.fillStyle = '#8b97b0';
    ctx.fillText(target.toUpperCase(), x, y + 8);
    let cy = y + 22;
    for (const it of items) {
      if (it.img) ctx.drawImage(it.img, x, cy, icon, icon);
      else placeholder(ctx, it.name, x, cy, icon);
      ctx.font = `${small ? 13 : 16}px ${FONT}`;
      ctx.fillStyle = small ? '#c98a88' : TEXT;
      ctx.fillText(clip(ctx, it.name, width - icon - 12), x + icon + 10, cy + icon / 2);
      cy += rowH;
    }
    return cy + 8;
  };

  /** Full-width card for a shared result: large thumbnail, name and who picked it. */
  const mapCard = (target: string, items: Loaded[], top: number) => {
    const [icon, pad] = [72, 16];
    const height = pad * 2 + 22 + items.length * (icon + 8);
    ctx.fillStyle = '#182033';
    ctx.fillRect(PAD, top, W - 2 * PAD, height);
    ctx.strokeStyle = '#2a3550';
    ctx.lineWidth = 1;
    ctx.strokeRect(PAD, top, W - 2 * PAD, height);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = '#8b97b0';
    ctx.fillText(target.toUpperCase(), PAD + pad, top + pad + 6);
    items.forEach((it, i) => {
      const cy = top + pad + 22 + i * (icon + 8);
      if (it.img) ctx.drawImage(it.img, PAD + pad, cy, icon, icon);
      else placeholder(ctx, it.name, PAD + pad, cy, icon);
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillStyle = TEXT;
      ctx.fillText(it.name, PAD + pad + icon + 16, cy + icon / 2 - 12);
      ctx.font = `14px ${FONT}`;
      ctx.fillStyle = '#8b97b0';
      ctx.fillText(`picked by ${it.by ?? ''}`, PAD + pad + icon + 16, cy + icon / 2 + 14);
    });
    return top + height + 16;
  };

  let y = 60 + Math.ceil(r.steps.length / cols) * (ch + gap) + 16;
  for (const s of shared) y = mapCard(s.target, s.list, y);
  const colW = (W - 3 * PAD) / 2;
  const top = y + 8;
  const ends = teams.map((t, i) => {
    const x = PAD + i * (colW + PAD);
    ctx.font = `bold 18px ${FONT}`;
    ctx.fillStyle = TEAM_COLOUR[t.team.team];
    ctx.fillText(teamTitle(t.team), x, top + 10);
    let cy = top + 32;
    for (const g of t.picks) cy = list(g.target, g.list, x, cy, colW, false);
    for (const g of t.bans) cy = list(g.target, g.list, x, cy, colW, true);
    return cy;
  });
  const height = Math.max(...ends) + PAD;
  const out = document.createElement('canvas');
  out.width = W;
  out.height = height;
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

const canCopyImage = () => typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;

/** Copies with a short "Copied" confirmation; failures leave the label unchanged except for "Failed". */
const copyButton = (label: string, copy: () => Promise<void>) => {
  const b = btn(label, async () => {
    try {
      await copy();
      b.textContent = 'Copied \u2713';
    } catch {
      b.textContent = 'Copy failed';
    }
    setTimeout(() => (b.textContent = label), 2000);
  }, { className: 'secondary' });
  return b;
};

/** Everything shown under the timeline once the draft is over. */
export function finishedView(state: DraftState, viewer: Team | null): Node[] {
  const r = draftResults(state, viewer);
  const actions = canCopyImage()
    ? [copyButton('Copy result image', async () => {
        const png = resultsImage(state, r);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png.then((b) => b ?? Promise.reject(new Error('no image'))) })]);
      })]
    : [];
  return [finishedBar(state), summary(state, r), ...(actions.length ? [h('div', { className: 'actions result-actions' }, ...actions)] : [])];
}
