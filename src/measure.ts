/**
 * measureElement()
 *
 * Core Pretext measurement logic.
 *
 * Strategy
 * --------
 * 1.  Read the element's computed style to get the exact font stack.
 * 2.  Use an off-screen <canvas> to measure the text string with that font
 *     (canvas measureText is synchronous and close to browser rendering).
 * 3.  Compare the canvas prediction against getBoundingClientRect() / scrollWidth.
 * 4.  Detect overflow and clipping.
 */

import type { PretextMeasurement } from './types.js';

// ─── Canvas singleton (reused across calls) ──────────────────────────────────

let _canvas: HTMLCanvasElement | null = null;
let _ctx: CanvasRenderingContext2D | null = null;

function getCanvas(): CanvasRenderingContext2D | null {
  if (_ctx) return _ctx;
  try {
    _canvas = document.createElement('canvas');
    _ctx = _canvas.getContext('2d');
    return _ctx;
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the CSS font shorthand string that canvas accepts.
 * e.g.  "700 16px/1.5 Inter, sans-serif"
 */
function buildFontString(style: CSSStyleDeclaration): string {
  const weight = style.fontWeight || 'normal';
  const size   = style.fontSize   || '16px';
  const family = style.fontFamily || 'sans-serif';
  return `${weight} ${size} ${family}`;
}

/**
 * Parse a CSS length value and return the pixel number.
 * Returns NaN if the value can't be parsed.
 */
export function parsePx(value: string): number {
  if (!value || value === 'normal') return NaN;
  const n = parseFloat(value);
  return isNaN(n) ? NaN : n;
}

/**
 * Estimate line count for a block of text given a container width and font.
 * Uses canvas to measure word-by-word — not perfect but close enough.
 */
function estimateLineCount(
  text: string,
  containerWidth: number,
  ctx: CanvasRenderingContext2D,
): number {
  if (containerWidth <= 0) return 1;
  const words = text.split(/\s+/);
  let lines = 1;
  let lineWidth = 0;
  const spaceWidth = ctx.measureText(' ').width;

  for (const word of words) {
    const wordWidth = ctx.measureText(word).width;
    if (lineWidth > 0 && lineWidth + spaceWidth + wordWidth > containerWidth) {
      lines++;
      lineWidth = wordWidth;
    } else {
      lineWidth = lineWidth > 0 ? lineWidth + spaceWidth + wordWidth : wordWidth;
    }
  }
  return lines;
}

/**
 * Resolve the effective line-height in pixels.
 *
 * The CSS `line-height` property can be:
 *   - a px value     "24px"
 *   - a number       "1.5"  (unitless multiplier × fontSize)
 *   - "normal"       (~1.2 × fontSize per spec)
 *   - other relative units — we fall back to 1.2 × fontSize
 */
function resolveLineHeight(style: CSSStyleDeclaration): number {
  const lh = style.lineHeight;
  const fs = parsePx(style.fontSize) || 16;

  if (lh === 'normal') return fs * 1.2;

  const px = parsePx(lh);
  if (!isNaN(px) && px > 0) return px;

  // unitless or percentage
  const raw = parseFloat(lh);
  if (!isNaN(raw) && raw > 0) return fs * raw;

  return fs * 1.2;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * measureElement(el)
 *
 * Returns a full PretextMeasurement for the given element.
 * Safe to call in any browser context; returns conservative fallback values
 * if canvas is unavailable or the element has no text.
 */
export function measureElement(el: Element): PretextMeasurement {
  const style = window.getComputedStyle(el);
  const text  = (el.textContent ?? '').replace(/\s+/g, ' ').trim();

  // Actual dimensions
  const rect        = el.getBoundingClientRect();
  const actualWidth  = rect.width;
  const actualHeight = rect.height;

  // Container width for overflow / line-wrap estimation
  const parentEl        = el.parentElement;
  const containerWidth  = parentEl ? parentEl.scrollWidth : actualWidth;

  // Typography props
  const fontFamily    = style.fontFamily    || 'sans-serif';
  const fontSize      = style.fontSize      || '16px';
  const fontWeight    = style.fontWeight    || '400';
  const lineHeight    = style.lineHeight    || 'normal';
  const letterSpacing = style.letterSpacing || 'normal';
  const whiteSpace    = style.whiteSpace    || 'normal';
  const overflow      = style.overflow      || 'visible';

  // Canvas measurement
  const ctx = getCanvas();
  let predictedWidth  = 0;
  let predictedHeight = 0;

  if (ctx && text.length > 0) {
    ctx.font = buildFontString(style);

    // Letter-spacing correction — canvas doesn't honour letter-spacing natively
    const lsPx        = parsePx(letterSpacing);
    const baseWidth   = ctx.measureText(text).width;
    const extraWidth  = isNaN(lsPx) ? 0 : lsPx * Math.max(0, text.length - 1);
    predictedWidth    = baseWidth + extraWidth;

    // Height = lineCount × lineHeight
    const resolvedLH  = resolveLineHeight(style);
    const wraps       = whiteSpace === 'nowrap' ? false : true;
    const lineCount   = wraps ? estimateLineCount(text, containerWidth, ctx) : 1;
    predictedHeight   = resolvedLH * lineCount;
  } else if (text.length === 0) {
    // No text — prediction matches actual (element is an empty container)
    predictedWidth  = actualWidth;
    predictedHeight = actualHeight;
  }

  // Deltas and match percentages
  const widthDelta  = actualWidth  - predictedWidth;
  const heightDelta = actualHeight - predictedHeight;

  const widthMatchPct  = predictedWidth  > 0
    ? Math.max(0, Math.min(100, 100 - (Math.abs(widthDelta)  / predictedWidth)  * 100))
    : 100;
  const heightMatchPct = predictedHeight > 0
    ? Math.max(0, Math.min(100, 100 - (Math.abs(heightDelta) / predictedHeight) * 100))
    : 100;

  // Overflow detection
  const scrollW = (el as HTMLElement).scrollWidth ?? actualWidth;
  const scrollH = (el as HTMLElement).scrollHeight ?? actualHeight;

  const isWidthOverflow  = scrollW > Math.ceil(actualWidth)  + 1;
  const isHeightOverflow = scrollH > Math.ceil(actualHeight) + 1;
  const isClipped        = (overflow === 'hidden' || overflow === 'clip') &&
                           (isWidthOverflow || isHeightOverflow);

  return {
    text,
    predictedWidth:  Math.round(predictedWidth  * 100) / 100,
    predictedHeight: Math.round(predictedHeight * 100) / 100,
    actualWidth:     Math.round(actualWidth     * 100) / 100,
    actualHeight:    Math.round(actualHeight    * 100) / 100,
    widthDelta:      Math.round(widthDelta      * 100) / 100,
    heightDelta:     Math.round(heightDelta     * 100) / 100,
    widthMatchPct:   Math.round(widthMatchPct   * 10)  / 10,
    heightMatchPct:  Math.round(heightMatchPct  * 10)  / 10,
    isWidthOverflow,
    isHeightOverflow,
    isClipped,
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,
    whiteSpace,
    overflow,
    containerWidth,
  };
}
