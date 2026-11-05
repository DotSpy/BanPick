// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, installIconPreview } from '../src/preview';
import { itemIcon } from '../src/icon';

const press = (el: Element) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
const release = (el: Element) => {
  el.dispatchEvent(new Event('pointerup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
};
const overlay = () => document.querySelector('.preview-overlay');

describe('icon press-and-hold preview', () => {
  let uninstall: () => void;
  let onClick: ReturnType<typeof vi.fn>;
  let img: Element;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    onClick = vi.fn();
    const button = document.createElement('button');
    button.addEventListener('click', onClick);
    img = itemIcon({ name: 'Red', image: 'https://example.com/r.png' }, 'Red') as HTMLElement;
    button.append(img);
    document.body.append(button);
    uninstall = installIconPreview();
  });
  afterEach(() => {
    uninstall();
    vi.useRealTimers();
  });

  it('opens an enlarged preview after holding', () => {
    press(img);
    vi.advanceTimersByTime(HOLD_MS);

    expect(overlay()?.querySelector('img')?.getAttribute('src')).toBe('https://example.com/r.png');
  });

  it('does not open on a short press', () => {
    press(img);
    vi.advanceTimersByTime(HOLD_MS - 50);
    release(img);
    vi.advanceTimersByTime(HOLD_MS);

    expect(overlay()).toBeNull();
  });

  it('closes on release', () => {
    press(img);
    vi.advanceTimersByTime(HOLD_MS);
    release(img);

    expect(overlay()).toBeNull();
  });

  it('closes on Escape', () => {
    press(img);
    vi.advanceTimersByTime(HOLD_MS);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(overlay()).toBeNull();
  });

  it('does not trigger the action after a long press', () => {
    press(img);
    vi.advanceTimersByTime(HOLD_MS);
    release(img);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('still triggers the action on a short click', () => {
    press(img);
    release(img);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('triggers the action on a click after an earlier long press', () => {
    press(img);
    vi.advanceTimersByTime(HOLD_MS);
    release(img);
    press(img);
    release(img);

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
