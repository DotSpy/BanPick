import { buildAiBrief, fullExample } from './ai-brief';
import { btn, h } from './dom';
import type { Preset } from './model';
import { summary, timerSummary } from './preset-info';
import { parsePresetJson } from './schema';

const STUB = '{ "name": "My draft", "pools": { ... }, "steps": [ ... ] }';
const COPIED_MS = 2000;

/** Line of a JSON syntax error, when the engine's message names a position or a line. */
export function errorLine(text: string, message: string): number | null {
  const line = /line (\d+)/.exec(message);
  if (line) return Number(line[1]);
  const pos = /position (\d+)/.exec(message);
  return pos ? text.slice(0, Number(pos[1])).split('\n').length : null;
}

const step = (n: number, title: string, ...body: (Node | string)[]) =>
  h('li', { className: 'ai-step' }, h('span', { className: 'ai-step-n', textContent: String(n) }), h('strong', { textContent: title }), ...body);

/** "Build with AI": copy a brief, paste it into any AI chat, then validate the JSON it returns. Runs in the browser only. */
export function aiPanel(onOpen: (p: Preset) => void): HTMLElement {
  const copy = btn('Copy AI brief', async () => {
    try {
      await navigator.clipboard.writeText(buildAiBrief());
      copy.textContent = 'Copied \u2713';
      setTimeout(() => (copy.textContent = 'Copy AI brief'), COPIED_MS);
    } catch {
      copyStatus.textContent = 'Could not copy. Allow clipboard access and try again.';
    }
  });
  const copyStatus = h('span', { className: 'hint', role: 'status' });
  const briefText = h('pre', { className: 'brief-text', textContent: buildAiBrief() });
  const brief = h('details', { className: 'brief' }, h('summary', { textContent: 'View brief' }), briefText);
  const download = h('a', {
    className: 'text-link',
    textContent: 'Download JSON example',
    download: 'preset-example.json',
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(fullExample(), null, 2))}`,
  });

  const box = h('textarea', { className: 'json', ariaLabel: 'Paste preset JSON to validate', placeholder: STUB, spellcheck: false }) as HTMLTextAreaElement;
  const result = h('div', { className: 'ai-result', role: 'status' });
  const validate = btn('Validate & preview', () => {
    const r = parsePresetJson(box.value);
    if (r.ok) {
      result.replaceChildren(
        h('p', { className: 'ok', textContent: `\u2713 Valid: ${r.preset.name} \u00b7 ${r.preset.steps.length} steps \u00b7 ${summary(r.preset)} \u00b7 ${timerSummary(r.preset)}` }),
        btn('Open in builder', () => onOpen(r.preset)),
      );
    } else {
      result.replaceChildren(
        h('ul', { className: 'errors' }, ...r.errors.map((e) => {
          const line = errorLine(box.value, e.message);
          const where = [e.path, line ? `line ${line}` : ''].filter(Boolean).join(', ');
          return h('li', { textContent: where ? `${where}: ${e.message}` : e.message });
        })),
      );
    }
  }) as HTMLButtonElement;
  const sync = () => (validate.disabled = box.value.trim() === '');
  box.addEventListener('input', sync);
  sync();

  const load = async (file: File | undefined) => {
    if (!file) return;
    box.value = await file.text();
    sync();
  };
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, ariaLabel: 'Upload .json' }) as HTMLInputElement;
  fileInput.addEventListener('change', () => load(fileInput.files?.[0]));
  box.addEventListener('dragover', (e) => e.preventDefault());
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    load(e.dataTransfer?.files[0]);
  });
  const upload = btn('Upload .json', () => fileInput.click(), { className: 'secondary' });

  return h(
    'div', { className: 'ai-panel' },
    h('p', { className: 'hint ai-lead', textContent: 'Give your documents and rules to an AI and have it write a custom preset JSON for you.' }),
    h('ol', { className: 'ai-steps' },
      step(1, 'Copy brief', h('p', { textContent: 'The brief explains the preset format to the AI.' }), h('div', { className: 'ai-actions' }, copy, download), copyStatus, brief),
      step(2, 'Paste into any AI chat', h('p', { textContent: 'Add your rules and documents, then ask for one JSON object.' })),
      step(3, 'Paste JSON here', h('p', { textContent: 'Type, paste, drop or upload the JSON it returns.' }), h('div', { className: 'ai-actions' }, upload, fileInput))),
    h('label', {}, 'Preset JSON', box),
    h('div', { className: 'ai-actions' }, validate),
    result,
    h('p', { className: 'hint', textContent: 'JSON is validated in your browser; nothing is uploaded.' }),
  );
}