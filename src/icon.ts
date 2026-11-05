import { h } from './dom';
import type { IconSize, Item } from './model';

/** Item icon, or nothing when no link is set. A link that fails to load becomes a letter placeholder. */
export function itemIcon(item: Pick<Item, 'name' | 'image'> | undefined, alt = '', size: IconSize = 'medium'): HTMLElement | '' {
  if (!item?.image) return '';
  const img = h('img', { className: `icon-img icon-${size}`, src: item.image, alt, loading: 'lazy' });
  img.addEventListener('error', () => {
    const fallback = h('span', { className: `icon-fallback icon-${size}`, title: item.name, ariaHidden: 'true' });
    fallback.setAttribute('data-initial', item.name.trim().charAt(0).toUpperCase());
    img.replaceWith(fallback);
  });
  return img;
}
