// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { itemIcon } from '../src/icon';
import { validatePreset } from '../src/schema';
import { makePreset, step } from './fixtures';

describe('itemIcon', () => {
  it('renders nothing when the item has no image link', () => {
    expect(itemIcon({ name: 'Red 1' })).toBe('');
  });

  it('renders an img with the link and the given alt text', () => {
    const el = itemIcon({ name: 'Red 1', image: 'https://x.test/a.png' }, 'Red 1') as HTMLImageElement;

    expect([el.tagName, el.getAttribute('src'), el.alt]).toEqual(['IMG', 'https://x.test/a.png', 'Red 1']);
  });

  it('swaps a failed image for a placeholder showing the initial', () => {
    const host = document.createElement('div');
    const el = itemIcon({ name: 'red 1', image: 'https://x.test/a.png' }) as HTMLElement;
    host.append(el);

    el.dispatchEvent(new Event('error'));

    const fb = host.querySelector('.icon-fallback')!;
    expect([host.querySelector('img'), fb.getAttribute('data-initial'), fb.getAttribute('title')]).toEqual([null, 'R', 'red 1']);
  });
});

describe('item image schema', () => {
  const withImage = (image: string) => {
    const p = makePreset([step('A', 'ban', 'maps')]);
    p.pools.maps.items[0].image = image;
    return validatePreset(p).ok;
  };

  it('accepts an https link', () => {
    expect(withImage('https://x.test/a.png')).toBe(true);
  });

  it('rejects a non-https link', () => {
    expect(withImage('http://x.test/a.png')).not.toBe(true);
  });
});
