/**
 * Unit tests for src/measure.ts
 *
 * Uses happy-dom (via vitest environment) which provides a lightweight DOM +
 * canvas stub.  We patch the canvas context where needed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { measureElement, parsePx } from '../measure.js';

// ─── parsePx ────────────────────────────────────────────────────────────────

describe('parsePx', () => {
  it('parses integer px strings', () => {
    expect(parsePx('16px')).toBe(16);
  });

  it('parses float px strings', () => {
    expect(parsePx('14.5px')).toBe(14.5);
  });

  it('parses bare numbers', () => {
    expect(parsePx('1.5')).toBe(1.5);
  });

  it('returns NaN for "normal"', () => {
    expect(parsePx('normal')).toBeNaN();
  });

  it('returns NaN for empty string', () => {
    expect(parsePx('')).toBeNaN();
  });
});

// ─── measureElement helpers ──────────────────────────────────────────────────

/** Build a real HTMLElement attached to happy-dom's document. */
function makeEl(
  tag: 'p' | 'span' | 'div',
  text: string,
  styles: Record<string, string> = {},
): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  // Apply inline styles so getComputedStyle picks them up in happy-dom
  Object.assign(el.style, {
    fontSize:   '16px',
    fontFamily: 'sans-serif',
    fontWeight: '400',
    lineHeight: '24px',
    letterSpacing: 'normal',
    whiteSpace: 'normal',
    overflow:   'visible',
    ...styles,
  });
  document.body.appendChild(el);
  return el;
}

/** Patch the canvas context measureText to return predictable widths. */
function patchCanvas(charWidth = 8): void {
  vi.spyOn(
    HTMLCanvasElement.prototype,
    'getContext',
  ).mockReturnValue({
    measureText: (text: string) => ({ width: text.length * charWidth }),
    font: '',
  } as unknown as CanvasRenderingContext2D);
}

// ─── measureElement ──────────────────────────────────────────────────────────

describe('measureElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('returns a PretextMeasurement object with all required fields', () => {
    patchCanvas();
    const el = makeEl('p', 'Hello world');
    const m = measureElement(el);

    // Required fields present
    expect(m).toHaveProperty('text');
    expect(m).toHaveProperty('predictedWidth');
    expect(m).toHaveProperty('predictedHeight');
    expect(m).toHaveProperty('actualWidth');
    expect(m).toHaveProperty('actualHeight');
    expect(m).toHaveProperty('widthMatchPct');
    expect(m).toHaveProperty('heightMatchPct');
    expect(m).toHaveProperty('isWidthOverflow');
    expect(m).toHaveProperty('isHeightOverflow');
    expect(m).toHaveProperty('isClipped');
    expect(m).toHaveProperty('fontFamily');
    expect(m).toHaveProperty('fontSize');
  });

  it('trims and collapses whitespace in text field', () => {
    patchCanvas();
    const el = makeEl('p', '  hello   world  ');
    const m = measureElement(el);
    expect(m.text).toBe('hello world');
  });

  it('uses canvas width × char count as predicted width', () => {
    const CHAR_W = 10;
    patchCanvas(CHAR_W);
    const text = 'Hello'; // 5 chars
    const el   = makeEl('span', text);
    const m    = measureElement(el);
    // predicted = 5 * 10 = 50
    expect(m.predictedWidth).toBe(50);
  });

  it('returns widthMatchPct between 0 and 100', () => {
    patchCanvas();
    const el = makeEl('p', 'Some text here');
    const m = measureElement(el);
    expect(m.widthMatchPct).toBeGreaterThanOrEqual(0);
    expect(m.widthMatchPct).toBeLessThanOrEqual(100);
  });

  it('returns heightMatchPct between 0 and 100', () => {
    patchCanvas();
    const el = makeEl('p', 'Some text here');
    const m = measureElement(el);
    expect(m.heightMatchPct).toBeGreaterThanOrEqual(0);
    expect(m.heightMatchPct).toBeLessThanOrEqual(100);
  });

  it('reports isClipped=true when overflow:hidden and content overflows', () => {
    patchCanvas();
    const el = makeEl('div', 'A very long text that overflows', {
      overflow:   'hidden',
      whiteSpace: 'nowrap',
    });
    // Simulate scrollWidth > clientWidth by patching the property
    Object.defineProperty(el, 'scrollWidth', { value: 9999, configurable: true });
    const m = measureElement(el);
    expect(m.isClipped).toBe(true);
    expect(m.isWidthOverflow).toBe(true);
  });

  it('reports isClipped=false when overflow:visible', () => {
    patchCanvas();
    const el = makeEl('p', 'Short text', { overflow: 'visible' });
    const m = measureElement(el);
    expect(m.isClipped).toBe(false);
  });

  it('handles empty text gracefully', () => {
    patchCanvas();
    const el = makeEl('div', '');
    const m = measureElement(el);
    expect(m.text).toBe('');
    // prediction = actual for empty elements
    expect(m.predictedWidth).toBe(m.actualWidth);
    expect(m.predictedHeight).toBe(m.actualHeight);
  });

  it('includes correct typography fields from computed style', () => {
    patchCanvas();
    const el = makeEl('p', 'Type test', {
      fontSize:   '20px',
      fontWeight: '700',
      lineHeight: '30px',
    });
    const m = measureElement(el);
    expect(m.fontSize).toBe('20px');
    expect(m.fontWeight).toBe('700');
    expect(m.lineHeight).toBe('30px');
  });

  it('widthDelta = actualWidth - predictedWidth', () => {
    const CHAR_W = 5;
    patchCanvas(CHAR_W);
    const text = 'Hi'; // 2 chars → predicted = 10
    const el   = makeEl('span', text);
    const m    = measureElement(el);
    expect(m.widthDelta).toBeCloseTo(m.actualWidth - m.predictedWidth, 1);
  });

  it('rounds output values to 2 decimal places at most', () => {
    patchCanvas(7.333333);
    const el = makeEl('p', 'Round me');
    const m  = measureElement(el);
    const str = String(m.predictedWidth);
    const decimals = str.includes('.') ? str.split('.')[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});
