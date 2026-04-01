/**
 * @shipitandpray/pretext-devtools
 *
 * Public API surface.  Import from here; internals are in sub-modules.
 */

// Types
export type {
  PretextMeasurement,
  ElementInfo,
  OverlayTheme,
  OverlayOptions,
  OverlayState,
} from './types.js';

// Core measurement
export { measureElement, parsePx } from './measure.js';

// Overlay management
export {
  createOverlay,
  activateOverlay,
  deactivateOverlay,
  toggleOverlay,
  destroyOverlay,
  createToggleButton,
} from './overlay.js';
