# @shipitandpray/pretext-devtools

**Overlay Pretext text measurements on any webpage. See predicted vs actual dimensions.**

**[Live Demo](https://shipitandpray.github.io/pretext-devtools/)**

Hover any DOM element to instantly compare the **Pretext-predicted** width and height
(canvas `measureText` + font metrics) against what the browser **actually rendered** —
plus overflow detection, match %, and full typography breakdown.

---

## What is Pretext?

Given a font stack, size, weight, letter-spacing, and a string of characters,
you can *predict* the rendered pixel dimensions before layout happens — using nothing
but the browser's Canvas 2D `measureText()` API.

Pretext DevTools runs that prediction live on hover, so you can spot mismatches,
overflow, and clipping at a glance.

---

## The overlay panel

```
<p class="tagline">                    OK
"Typography is the art and…"

Dimensions
  Predicted W   423.5px
  Actual W      418px
  W match       98.7%        ← green
  Predicted H    96px
  Actual H       96px
  H match       100%         ← green

Typography
  Font          -apple-system, …
  Size          17px
  Weight        400
  Line-H        27.2px
  Spacing       normal
  WS            normal
  Overflow      visible

div.container > p.tagline
```

Badges:

| Badge    | Meaning                                        |
|----------|------------------------------------------------|
| **OK**   | No overflow; prediction within ~90%            |
| **OVERFLOW** | `scrollWidth > clientWidth` (content leaks) |
| **CLIPPED**  | `overflow:hidden` is hiding content         |

---

## Bookmarklet — use on any page

Drag the button from the **[demo page](https://shipitandpray.github.io/pretext-devtools/)**
to your bookmarks bar, then click it on any page.

Or build it yourself:

```bash
npm run build
# dist/bookmarklet.min.js  ← wrap in javascript:...
```

---

## npm install

```bash
npm install @shipitandpray/pretext-devtools
```

---

## Usage — programmatic

```ts
import { createOverlay, createToggleButton } from '@shipitandpray/pretext-devtools';

// Boot the overlay (inactive by default)
const state = createOverlay({ theme: 'dark' });

// Add a toggle button to the page
createToggleButton(state);
```

Or measure a single element without the overlay:

```ts
import { measureElement } from '@shipitandpray/pretext-devtools';

const m = measureElement(document.querySelector('h1'));

console.log(m.predictedWidth);  // canvas prediction, px
console.log(m.actualWidth);     // getBoundingClientRect, px
console.log(m.widthMatchPct);   // 0–100; 100 = perfect
console.log(m.isClipped);       // overflow:hidden hiding content?
```

---

## API

### `measureElement(el: Element): PretextMeasurement`

Core measurement function. Reads computed style, measures text via canvas,
compares to `getBoundingClientRect()`. Returns:

| Field             | Type    | Description                              |
|-------------------|---------|------------------------------------------|
| `text`            | string  | Trimmed text content                     |
| `predictedWidth`  | number  | Canvas width prediction, px              |
| `predictedHeight` | number  | lineHeight × lineCount estimate, px      |
| `actualWidth`     | number  | getBoundingClientRect width, px          |
| `actualHeight`    | number  | getBoundingClientRect height, px         |
| `widthMatchPct`   | number  | 0–100 match percentage                   |
| `heightMatchPct`  | number  | 0–100 match percentage                   |
| `isWidthOverflow` | boolean | scrollWidth > clientWidth                |
| `isHeightOverflow`| boolean | scrollHeight > clientHeight              |
| `isClipped`       | boolean | overflow:hidden AND content overflows    |
| `fontFamily`      | string  | Computed font family                     |
| `fontSize`        | string  | Computed font size                       |
| `fontWeight`      | string  | Computed font weight                     |
| `lineHeight`      | string  | Computed line height                     |
| `letterSpacing`   | string  | Computed letter spacing                  |
| `whiteSpace`      | string  | Computed white-space                     |
| `overflow`        | string  | Computed overflow                        |
| `containerWidth`  | number  | Parent scrollWidth, px                   |

### `createOverlay(options?): OverlayState`

Creates (but does not activate) the floating measurement panel and element
highlight rect. Attaches mouse listeners.

**Options:**

| Option             | Default      | Description                              |
|--------------------|--------------|------------------------------------------|
| `theme`            | `'dark'`     | `'dark'` or `'light'`                   |
| `highlightElement` | `true`       | Show border around hovered element       |
| `minTextLength`    | `1`          | Min chars to trigger measurement         |
| `zIndex`           | `2147483647` | Z-index for overlay panels               |

### `activateOverlay(state)` / `deactivateOverlay(state)` / `toggleOverlay(state)`

Show / hide the overlay.

### `createToggleButton(state, container?): HTMLButtonElement`

Creates a fixed-position toggle button (bottom-right) and appends it to
`container` (default: `document.body`).

### `destroyOverlay(state)`

Removes all injected elements and cleans up.

---

## Development

```bash
npm run build       # tsup — ESM + CJS + IIFE bookmarklet
npm test            # vitest
npm run typecheck   # tsc --noEmit
```

---

## How it works

1. **`mousemove`** — grab the hovered element
2. **`getComputedStyle()`** — exact font stack, weight, size, line-height, letter-spacing
3. **Canvas `measureText()`** — predict width; `resolveLineHeight() × estimateLineCount()` predicts height
4. **`getBoundingClientRect()`** — actual rendered dimensions
5. **Panel** — renders delta, match %, and overflow badge

### Canvas limitations

Canvas `measureText()` does not account for:
- Sub-pixel font hinting (usually ±2 px)
- OpenType kerning pairs
- CSS `font-variant-*` features
- `text-rendering: optimizeLegibility`

Expect 95–99% accuracy on standard system fonts; exotic fonts may diverge more.

---

## License

MIT — [ShipItAndPray](https://github.com/ShipItAndPray)
