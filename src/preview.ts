import { h } from './dom';

export const HOLD_MS = 400;

/**
 * Press and hold on any item icon shows it enlarged until release, Escape or a tap elsewhere.
 * The click that ends a long press is swallowed so it never triggers the pick, ban or random action.
 * One delegated listener set, so every view that renders itemIcon() gets it.
 */
export function installIconPreview(doc: Document = document): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let overlay: HTMLElement | undefined;
  let swallowClick = false;

  const close = () => {
    clearTimeout(timer);
    overlay?.remove();
    overlay = undefined;
  };
  const open = (img: HTMLImageElement) => {
    close();
    const big = h('img', { className: 'preview-img', src: img.src, alt: img.alt });
    overlay = h('div', { className: 'preview-overlay', role: 'dialog', ariaLabel: 'Image preview' }, big);
    doc.body.append(overlay);
    swallowClick = true;
  };
  const iconOf = (e: Event) => (e.target instanceof Element ? (e.target.closest('img.icon-img') as HTMLImageElement | null) : null);

  const on = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K]) => void, capture = false) => {
    doc.addEventListener(type, fn, capture);
    return () => doc.removeEventListener(type, fn, capture);
  };
  const offs = [
    on('pointerdown', (e) => {
      swallowClick = false;
      const img = iconOf(e);
      if (!img || (e as PointerEvent).button > 0) return;
      clearTimeout(timer);
      timer = setTimeout(() => open(img), HOLD_MS);
    }),
    on('pointerup', close),
    on('pointercancel', close),
    on('keydown', (e) => e.key === 'Escape' && close()),
    on('contextmenu', (e) => iconOf(e) && e.preventDefault()),
    on('click', (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true),
  ];
  return () => {
    close();
    offs.forEach((off) => off());
  };
}
