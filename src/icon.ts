import { h } from './dom';
import type { Item } from './model';

/** Item icon, or nothing when no link is set. A link that fails to load becomes a letter placeholder. */
export function itemIcon(item: Pick<Item, 'name' | 'image'> | undefined, alt = ''): HTMLElement | '' {
  if (!item?.image) return '';
  const img = h('img', { className: 'icon-img', src: item.image, alt, loading: 'lazy' });
  img.addEventListener('error', () => {
    const fallback = h('span', { className: 'icon-fallback', title: item.name, ariaHidden: 'true' });
    fallback.setAttribute('data-initial', item.name.trim().charAt(0).toUpperCase());
    img.replaceWith(fallback);
  });
  return img;
}
