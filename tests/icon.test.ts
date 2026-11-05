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

describe('item icon size', () => {
  const item = { name: 'Red 1', image: 'https://x.test/a.png' };

  it('defaults to medium', () => {
    expect((itemIcon(item) as HTMLElement).classList.contains('icon-medium')).toBe(true);
  });

  it('applies the requested size class', () => {
    expect((itemIcon(item, '', 'large') as HTMLElement).classList.contains('icon-large')).toBe(true);
  });

  it('keeps the size on the placeholder when the image fails', () => {
    const host = document.createElement('div');
    const el = itemIcon(item, '', 'large') as HTMLElement;
    host.append(el);

    el.dispatchEvent(new Event('error'));

    expect(host.querySelector('.icon-fallback')!.classList.contains('icon-large')).toBe(true);
  });
});

describe('pool iconSize schema', () => {
  const withSize = (iconSize: unknown) => {
    const p = makePreset([step('A', 'ban', 'maps')]);
    (p.pools.maps as { iconSize?: unknown }).iconSize = iconSize;
    return validatePreset(p).ok;
  };

  it('stays valid without the field', () => {
    expect(validatePreset(makePreset([step('A', 'ban', 'maps')])).ok).toBe(true);
  });

  it.each(['small', 'medium', 'large'])('accepts %s', (size) => {
    expect(withSize(size)).toBe(true);
  });

  it('rejects an unknown size', () => {
    expect(withSize('huge')).not.toBe(true);
  });
});

describe('tag value images schema', () => {
  const withImages = (images: Record<string, string>) => {
    const p = makePreset([step('A', 'ban', 'maps')], { tagging: { assignment: 'chosen', tag: 'side', values: ['nato', 'pact'], images } });
    return validatePreset(p).ok;
  };

  it('accepts https links for known values', () => {
    expect(withImages({ nato: 'https://x.test/n.png' })).toBe(true);
  });

  it('rejects an image for a value that is not in tagging.values', () => {
    expect(withImages({ navy: 'https://x.test/n.png' })).not.toBe(true);
  });

  it('rejects a non-https link', () => {
    expect(withImages({ nato: 'http://x.test/n.png' })).not.toBe(true);
  });
});
