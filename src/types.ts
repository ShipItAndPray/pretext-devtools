/**
 * Pretext DevTools — core type definitions
 *
 * "Pretext" is the mental model: given a font, size, and string, predict the
 * rendered dimensions before the browser lays the element out.  We compare
 * that prediction against what the DOM actually reports.
 */

// ─── Measurement ────────────────────────────────────────────────────────────

/** Result of a single Pretext measurement on one DOM element. */
export interface PretextMeasurement {
  /** Text content that was measured (trimmed, single-line). */
  text: string;

  // Predicted (canvas / font-metrics based)
  predictedWidth: number;   // px — canvas measureText().width
  predictedHeight: number;  // px — lineHeight × lineCount estimate

  // Actual (getBoundingClientRect)
  actualWidth: number;      // px
  actualHeight: number;     // px

  // Derived
  widthDelta: number;       // actualWidth  - predictedWidth  (+ = wider than predicted)
  heightDelta: number;      // actualHeight - predictedHeight
  widthMatchPct: number;    // 0–100; 100 = perfect prediction
  heightMatchPct: number;

  // Overflow
  isWidthOverflow: boolean; // text wider than container scrollWidth
  isHeightOverflow: boolean;
  isClipped: boolean;       // overflow: hidden AND content overflows

  // Typography context
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  whiteSpace: string;
  overflow: string;         // CSS overflow value
  containerWidth: number;   // scrollWidth of parent, px
}

// ─── Element info ────────────────────────────────────────────────────────────

/** Snapshot of a hovered DOM element used to drive the overlay. */
export interface ElementInfo {
  /** The live DOM element (not serialised — used at runtime only). */
  element: Element;

  /** CSS selector path up to 4 levels deep (e.g. "div.card > p"). */
  selectorPath: string;

  /** Tag name, lower-cased. */
  tagName: string;

  /** All class names joined with spaces. */
  className: string;

  /** Element id, or empty string. */
  id: string;

  /** Viewport-relative bounding rect. */
  rect: DOMRect;

  /** Full Pretext measurement for this element. */
  measurement: PretextMeasurement;
}

// ─── Overlay state ───────────────────────────────────────────────────────────

export type OverlayTheme = 'dark' | 'light';

export interface OverlayOptions {
  theme?: OverlayTheme;
  /** Show a highlight border around the hovered element. Default: true. */
  highlightElement?: boolean;
  /** Minimum text length to trigger measurement. Default: 1. */
  minTextLength?: number;
  /** Z-index for overlay panels. Default: 2147483647. */
  zIndex?: number;
}

/** Mutable state held by the overlay manager. */
export interface OverlayState {
  active: boolean;
  options: Required<OverlayOptions>;
  currentInfo: ElementInfo | null;
  panelEl: HTMLElement | null;
  highlightEl: HTMLElement | null;
}
