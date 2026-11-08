import { btn, h } from './dom';
import type { DraftState } from './draft';
import { itemIcon } from './icon';
import type { Team } from './model';
import { choiceOf } from './rules';
import { draftResults, formatDuration, teamTitle, type Choice, type DraftResults } from './results';

const TEAM_COLOUR: Record<Team, string> = { A: '#5b9cf5', B: '#f0a04b' };
const ACTION_COLOUR = { ban: '#e5645f', pick: '#4cc38a', choose: '#4cc38a' };

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
  h('div', { className: `result-row ${className}`.trim() }, h('h4', { textContent: label }), h('ul', {}, ...chips(state, action, list)));

/** What each team got: shared results (such as the map) once on top, then one column per team with picks first and bans last, small and muted. */
function summary(state: DraftState, r: DraftResults): HTMLElement {
  const shared = r.shared.map((s) => row(state, s.target, 'pick', s.picks, 'shared'));
  const column = (t: DraftResults['teams'][number]) => {
    const picks = t.groups.filter((g) => g.picks.length).map((g) => row(state, g.target, 'pick', g.picks));
    const bans = t.groups.filter((g) => g.bans.length).map((g) => row(state, `Banned ${g.target}`, 'ban', g.bans, 'bans'));
    return h('section', { className: `result-team team-${t.team}` }, h('h3', { textContent: teamTitle(t) }), ...picks, ...bans);
  };
  return h('div', { className: 'results' }, ...(shared.length ? [h('div', { className: 'result-shared' }, ...shared)] : []), h('div', { className: 'summary' }, ...r.teams.map(column)));
}

const wrap = (ctx: CanvasRenderingContext2D, text: string, width: number) => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return line ? [...lines, line] : lines;
};

/** Text-only PNG of the step order and the results. Remote item images would taint the canvas, so they are left out. */
export function resultsImage(r: DraftResults): Promise<Blob | null> {
  const W = 1200;
  const [cw, ch, gap, cols] = [138, 46, 8, 8];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  const stepRows = Math.ceil(r.steps.length / cols);
  const textLines = (t: DraftResults['teams'][number]) => t.groups.flatMap((g) => [g.picks.length ? `${g.target}: ${g.picks.map((c) => c.name).join(', ')}` : '', g.bans.length ? `Banned ${g.target}: ${g.bans.map((c) => c.name).join(', ')}` : ''].filter(Boolean));
  canvas.width = W;
  canvas.height = 2000;
  ctx.font = '16px system-ui, sans-serif';
  const colW = (W - 3 * 24) / 2;
  const sharedLines = r.shared.map((s) => `${s.target}: ${s.picks.map((c) => c.name).join(', ')}`);
  const wrapped = r.teams.map((t) => textLines(t).flatMap((l) => wrap(ctx, l, colW)));
  const height = 24 + 30 + stepRows * (ch + gap) + 16 + sharedLines.length * 26 + 36 + Math.max(...wrapped.map((w) => w.length)) * 24 + 24;
  canvas.height = height;
  ctx.fillStyle = '#0f1420';
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e6eaf2';
  ctx.font = 'bold 20px system-ui, sans-serif';
  const title = `${r.preset}${r.durationMs != null ? ` \u00b7 ${formatDuration(r.durationMs)}` : ''}`;
  ctx.fillText(title, 24, 36);
  ctx.font = '13px system-ui, sans-serif';
  r.steps.forEach((s, i) => {
    const [x, y] = [24 + (i % cols) * (cw + gap), 60 + Math.floor(i / cols) * (ch + gap)];
    ctx.fillStyle = '#182033';
    ctx.fillRect(x, y, cw, ch);
    ctx.strokeStyle = TEAM_COLOUR[s.team];
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cw, ch);
    ctx.fillStyle = ACTION_COLOUR[s.action];
    ctx.fillText(`${s.index + 1} ${s.team} ${s.action.toUpperCase()}`, x + 8, y + 15);
    ctx.fillStyle = '#e6eaf2';
    let label = s.label;
    while (label.length > 1 && ctx.measureText(label).width > cw - 16) label = `${label.slice(0, -2)}\u2026`;
    ctx.fillText(label, x + 8, y + 33);
  });
  let y = 60 + stepRows * (ch + gap) + 24;
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#e6eaf2';
  for (const l of sharedLines) {
    ctx.fillText(l, 24, y);
    y += 26;
  }
  y += 10;
  r.teams.forEach((t, i) => {
    const x = 24 + i * (colW + 24);
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillStyle = TEAM_COLOUR[t.team];
    ctx.fillText(teamTitle(t), x, y);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#e6eaf2';
    wrapped[i].forEach((l, n) => ctx.fillText(l, x, y + 28 + n * 24));
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
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
        const png = resultsImage(r);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': png.then((b) => b ?? Promise.reject(new Error('no image'))) })]);
      })]
    : [];
  return [finishedBar(state), summary(state, r), ...(actions.length ? [h('div', { className: 'actions result-actions' }, ...actions)] : [])];
}
