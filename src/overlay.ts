/**
 * overlay.ts
 *
 * Creates and manages the floating measurement panel + element-highlight rect
 * that appears when the user hovers over a DOM element.
 *
 * Design goals
 * - Zero dependencies (no React, no CSS files — everything is inline)
 * - Works injected into any page (bookmarklet safe)
 * - Dark theme by default; light theme available via options
 * - Panel stays inside the viewport; flips side when near edges
 */

import { measureElement } from './measure.js';
import type {
  ElementInfo,
  OverlayOptions,
  OverlayState,
  PretextMeasurement,
} from './types.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const PANEL_ID    = '__pretext-devtools-panel__';
const HIGHLIGHT_ID = '__pretext-devtools-highlight__';
const TOGGLE_ID   = '__pretext-devtools-toggle__';

// ─── CSS helpers ─────────────────────────────────────────────────────────────

interface Theme {
  bg: string;
  border: string;
  text: string;
  label: string;
  value: string;
  good: string;
  warn: string;
  bad: string;
  highlight: string;
  toggleActive: string;
  toggleInactive: string;
}

const DARK: Theme = {
  bg:             '#1a1a2e',
  border:         '#4a4a7a',
  text:           '#e2e2f0',
  label:          '#888aaa',
  value:          '#c9d1f0',
  good:           '#4ade80',
  warn:           '#facc15',
  bad:            '#f87171',
  highlight:      'rgba(99,102,241,0.25)',
  toggleActive:   '#6366f1',
  toggleInactive: '#333355',
};

const LIGHT: Theme = {
  bg:             '#ffffff',
  border:         '#d1d5f0',
  text:           '#1a1a2e',
  label:          '#6666aa',
  value:          '#2a2a4e',
  good:           '#16a34a',
  warn:           '#ca8a04',
  bad:            '#dc2626',
  highlight:      'rgba(99,102,241,0.15)',
  toggleActive:   '#6366f1',
  toggleInactive: '#e2e2f0',
};

// ─── Selector path helper ────────────────────────────────────────────────────

function buildSelectorPath(el: Element, depth = 4): string {
  const parts: string[] = [];
  let current: Element | null = el;
  for (let i = 0; i < depth && current && current !== document.body; i++) {
    let part = current.tagName.toLowerCase();
    if (current.id)        part += `#${current.id}`;
    else if (current.className && typeof current.className === 'string') {
      const cls = current.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) part += `.${cls}`;
    }
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(' > ') || el.tagName.toLowerCase();
}

// ─── Panel rendering ─────────────────────────────────────────────────────────

function matchColor(pct: number, theme: Theme): string {
  if (pct >= 90) return theme.good;
  if (pct >= 70) return theme.warn;
  return theme.bad;
}

function row(label: string, value: string, color: string, theme: Theme): string {
  return `
    <tr>
      <td style="color:${theme.label};padding:2px 8px 2px 0;white-space:nowrap;font-size:11px;">${label}</td>
      <td style="color:${color};padding:2px 0;font-size:11px;font-family:monospace;">${value}</td>
    </tr>`;
}

function renderPanel(info: ElementInfo, theme: Theme): string {
  const m = info.measurement;

  const wMatch = matchColor(m.widthMatchPct,  theme);
  const hMatch = matchColor(m.heightMatchPct, theme);

  const overflowBadge = m.isClipped
    ? `<span style="background:${theme.bad};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;margin-left:6px;">CLIPPED</span>`
    : m.isWidthOverflow || m.isHeightOverflow
    ? `<span style="background:${theme.warn};color:#000;padding:1px 6px;border-radius:3px;font-size:10px;margin-left:6px;">OVERFLOW</span>`
    : `<span style="background:${theme.good};color:#000;padding:1px 6px;border-radius:3px;font-size:10px;margin-left:6px;">OK</span>`;

  const textPreview = m.text.length > 40
    ? m.text.slice(0, 37) + '…'
    : m.text || '(empty)';

  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.4;">
  <div style="font-size:12px;font-weight:600;color:${theme.text};margin-bottom:6px;display:flex;align-items:center;gap:4px;">
    <span style="opacity:0.6">⟨</span>
    <span>${info.tagName}</span>
    <span style="opacity:0.4;font-size:10px;margin-left:2px;">${info.className ? '.' + info.className.split(' ').slice(0,2).join('.') : ''}</span>
    ${overflowBadge}
  </div>
  <div style="font-size:10px;color:${theme.label};margin-bottom:8px;font-family:monospace;word-break:break-all;">"${escapeHtml(textPreview)}"</div>

  <div style="font-size:10px;font-weight:700;color:${theme.label};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Dimensions</div>
  <table style="border-collapse:collapse;width:100%;margin-bottom:8px;">
    ${row('Predicted W', `${m.predictedWidth}px`, theme.value, theme)}
    ${row('Actual W',    `${m.actualWidth}px`,    theme.value, theme)}
    ${row('W match',     `${m.widthMatchPct}%`,   wMatch, theme)}
    ${row('Predicted H', `${m.predictedHeight}px`, theme.value, theme)}
    ${row('Actual H',    `${m.actualHeight}px`,    theme.value, theme)}
    ${row('H match',     `${m.heightMatchPct}%`,   hMatch, theme)}
  </table>

  <div style="font-size:10px;font-weight:700;color:${theme.label};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Typography</div>
  <table style="border-collapse:collapse;width:100%;">
    ${row('Font',    truncate(m.fontFamily, 22), theme.value, theme)}
    ${row('Size',    m.fontSize,             theme.value, theme)}
    ${row('Weight',  m.fontWeight,           theme.value, theme)}
    ${row('Line-H',  m.lineHeight,           theme.value, theme)}
    ${row('Spacing', m.letterSpacing,        theme.value, theme)}
    ${row('WS',      m.whiteSpace,           theme.value, theme)}
    ${row('Overflow',m.overflow,             theme.value, theme)}
  </table>

  <div style="margin-top:8px;font-size:10px;color:${theme.label};border-top:1px solid ${theme.border};padding-top:6px;font-family:monospace;word-break:break-all;">${escapeHtml(info.selectorPath)}</div>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ─── Overlay manager ─────────────────────────────────────────────────────────

export function createOverlay(options: OverlayOptions = {}): OverlayState {
  const theme = options.theme === 'light' ? LIGHT : DARK;

  const state: OverlayState = {
    active: false,
    options: {
      theme: options.theme ?? 'dark',
      highlightElement: options.highlightElement ?? true,
      minTextLength: options.minTextLength ?? 1,
      zIndex: options.zIndex ?? 2147483647,
    },
    currentInfo: null,
    panelEl: null,
    highlightEl: null,
  };

  // ── Create panel ──────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  Object.assign(panel.style, {
    position:      'fixed',
    zIndex:        String(state.options.zIndex),
    background:    theme.bg,
    border:        `1px solid ${theme.border}`,
    borderRadius:  '8px',
    padding:       '12px 14px',
    minWidth:      '240px',
    maxWidth:      '300px',
    boxShadow:     '0 8px 32px rgba(0,0,0,0.45)',
    pointerEvents: 'none',
    display:       'none',
    color:         theme.text,
    backdropFilter:'blur(8px)',
  });
  document.body.appendChild(panel);
  state.panelEl = panel;

  // ── Create highlight rect ─────────────────────────────────────────────────
  const highlight = document.createElement('div');
  highlight.id = HIGHLIGHT_ID;
  Object.assign(highlight.style, {
    position:      'fixed',
    zIndex:        String(state.options.zIndex - 1),
    border:        `2px solid ${theme.toggleActive}`,
    background:    theme.highlight,
    borderRadius:  '2px',
    pointerEvents: 'none',
    display:       'none',
    transition:    'all 0.05s ease',
  });
  document.body.appendChild(highlight);
  state.highlightEl = highlight;

  // ── Mouse events ──────────────────────────────────────────────────────────
  let lastTarget: Element | null = null;

  function onMouseMove(e: MouseEvent) {
    if (!state.active) return;
    const target = e.target as Element;
    if (!target || target === panel || panel.contains(target)) return;
    if (target === lastTarget) return;
    lastTarget = target;

    const m = measureElement(target);
    if (m.text.length < state.options.minTextLength && m.text.length > 0) {
      // Show but don't update for very short text
    }

    const info: ElementInfo = {
      element:      target,
      selectorPath: buildSelectorPath(target),
      tagName:      target.tagName.toLowerCase(),
      className:    typeof target.className === 'string' ? target.className.trim() : '',
      id:           target.id ?? '',
      rect:         target.getBoundingClientRect(),
      measurement:  m,
    };
    state.currentInfo = info;

    // Update highlight
    if (state.options.highlightElement) {
      const r = info.rect;
      Object.assign(highlight.style, {
        top:     `${r.top}px`,
        left:    `${r.left}px`,
        width:   `${r.width}px`,
        height:  `${r.height}px`,
        display: 'block',
      });
    }

    // Update panel content
    panel.innerHTML = renderPanel(info, theme);

    // Position panel: prefer right-of-cursor; flip if near right edge
    const OFFSET = 16;
    const panelW = 300;
    const panelH = 340; // approximate
    let left = e.clientX + OFFSET;
    let top  = e.clientY + OFFSET;

    if (left + panelW > window.innerWidth  - 8) left = e.clientX - panelW - OFFSET;
    if (top  + panelH > window.innerHeight - 8) top  = e.clientY - panelH - OFFSET;
    if (left < 8) left = 8;
    if (top  < 8) top  = 8;

    Object.assign(panel.style, {
      left:    `${left}px`,
      top:     `${top}px`,
      display: 'block',
    });
  }

  function onMouseLeave() {
    if (!state.active) return;
    panel.style.display    = 'none';
    highlight.style.display = 'none';
    lastTarget = null;
  }

  document.addEventListener('mousemove',  onMouseMove,  { passive: true });
  document.addEventListener('mouseleave', onMouseLeave, { passive: true });

  return state;
}

// ─── Toggle helpers ──────────────────────────────────────────────────────────

export function activateOverlay(state: OverlayState): void {
  state.active = true;
  updateToggleButton(state);
}

export function deactivateOverlay(state: OverlayState): void {
  state.active = false;
  if (state.panelEl)    state.panelEl.style.display    = 'none';
  if (state.highlightEl) state.highlightEl.style.display = 'none';
  updateToggleButton(state);
}

export function toggleOverlay(state: OverlayState): void {
  state.active ? deactivateOverlay(state) : activateOverlay(state);
}

export function destroyOverlay(state: OverlayState): void {
  deactivateOverlay(state);
  state.panelEl?.remove();
  state.highlightEl?.remove();
  document.getElementById(TOGGLE_ID)?.remove();
}

// ─── Toggle button ───────────────────────────────────────────────────────────

export function createToggleButton(
  state: OverlayState,
  container: HTMLElement = document.body,
): HTMLButtonElement {
  const existing = document.getElementById(TOGGLE_ID);
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.id = TOGGLE_ID;
  btn.textContent = 'Pretext DevTools: OFF';
  Object.assign(btn.style, {
    position:     'fixed',
    bottom:       '20px',
    right:        '20px',
    zIndex:       String((state.options.zIndex ?? 2147483647)),
    padding:      '8px 16px',
    borderRadius: '6px',
    border:       'none',
    cursor:       'pointer',
    fontFamily:   '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    fontSize:     '13px',
    fontWeight:   '600',
    boxShadow:    '0 4px 16px rgba(0,0,0,0.3)',
    transition:   'background 0.2s',
  });

  btn.addEventListener('click', () => toggleOverlay(state));
  container.appendChild(btn);
  updateToggleButton(state);
  return btn;
}

function updateToggleButton(state: OverlayState): void {
  const btn = document.getElementById(TOGGLE_ID) as HTMLButtonElement | null;
  if (!btn) return;
  const theme = state.options.theme === 'light' ? LIGHT : DARK;
  btn.textContent = `Pretext DevTools: ${state.active ? 'ON' : 'OFF'}`;
  btn.style.background = state.active ? theme.toggleActive : theme.toggleInactive;
  btn.style.color      = state.active ? '#fff' : theme.text;
}
