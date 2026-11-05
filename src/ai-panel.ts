import { buildAiBrief, fullExample } from './ai-brief';
import { btn, h } from './dom';
import type { Preset } from './model';
import { parsePresetJson } from './schema';

/** "Build with AI": copy a brief, download an example, and validate the JSON an AI returns. No network calls. */
export function aiPanel(onOpen: (p: Preset) => void): HTMLElement {
  const copyStatus = h('span', { role: 'status' });
  const copy = btn('Copy AI brief', async () => {
    try {
      await navigator.clipboard.writeText(buildAiBrief());
      copyStatus.textContent = 'Copied';
    } catch {
      copyStatus.textContent = 'Could not copy. Allow clipboard access and try again.';
    }
  });
  const download = h('a', {
    className: 'button secondary',
    textContent: 'Download JSON example',
    download: 'preset-example.json',
    href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(fullExample(), null, 2))}`,
  });
  const box = h('textarea', { className: 'json', ariaLabel: 'Paste preset JSON to validate', rows: 8, spellcheck: false }) as HTMLTextAreaElement;
  const result = h('div', { role: 'status' });
  const validate = btn('Validate', () => {
    const r = parsePresetJson(box.value);
    if (r.ok) {
      result.replaceChildren(h('p', { className: 'ok', textContent: 'valid' }), btn('Open in builder', () => onOpen(r.preset)));
    } else {
      result.replaceChildren(h('ul', { className: 'errors' }, ...r.errors.map((e) => h('li', { textContent: e.path ? `${e.path}: ${e.message}` : e.message }))));
    }
  });
  return h(
    'div', { className: 'ai-panel' },
    h('p', { className: 'hint', textContent: 'Advanced: give your documents and rules to an AI and have it write a custom preset JSON for you. Copy the brief into any AI chat, add your material, then paste the JSON it returns below.' }),
    h('p', {}, copy, download, copyStatus),
    h('label', {}, 'Paste preset JSON to validate', box),
    h('p', {}, validate),
    result,
  );
}
