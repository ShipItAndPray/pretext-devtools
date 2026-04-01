/**
 * bookmarklet.ts
 *
 * Self-contained IIFE — compiles to a single minified JS blob that can be
 * drag-installed as a browser bookmarklet.
 *
 * Paste the compiled output into:
 *   javascript:<minified code here>
 *
 * The bookmarklet toggles the Pretext DevTools overlay on any open page.
 * If already injected, it toggles the active state.  On first inject it
 * bootstraps the full overlay, creates the toggle button, and activates.
 */

(function () {
  'use strict';

  // ── Guard: already injected? ────────────────────────────────────────────
  const SENTINEL = '__pretextDevtoolsLoaded__';
  const win = window as Window & typeof globalThis & Record<string, unknown>;

  if (win[SENTINEL]) {
    // Already loaded — just toggle
    const state = win[SENTINEL] as { active: boolean; panelEl: HTMLElement | null; highlightEl: HTMLElement | null };
    state.active = !state.active;
    if (!state.active) {
      if (state.panelEl)    state.panelEl.style.display    = 'none';
      if (state.highlightEl) state.highlightEl.style.display = 'none';
    }
    updateBtn(state);
    return;
  }

  // ── Colour palette (dark theme) ─────────────────────────────────────────
  const C = {
    bg:          '#1a1a2e',
    border:      '#4a4a7a',
    text:        '#e2e2f0',
    label:       '#888aaa',
    val:         '#c9d1f0',
    good:        '#4ade80',
    warn:        '#facc15',
    bad:         '#f87171',
    hl:          'rgba(99,102,241,0.25)',
    accent:      '#6366f1',
    off:         '#333355',
  };

  // ── Canvas singleton ────────────────────────────────────────────────────
  const cvs = document.createElement('canvas');
  const ctx = cvs.getContext('2d')!;

  function parsePx(v: string): number {
    const n = parseFloat(v);
    return isNaN(n) ? NaN : n;
  }

  function resolveLineHeight(s: CSSStyleDeclaration): number {
    const lh = s.lineHeight;
    const fs = parsePx(s.fontSize) || 16;
    if (lh === 'normal') return fs * 1.2;
    const px = parsePx(lh);
    if (!isNaN(px) && px > 0) return px;
    const raw = parseFloat(lh);
    return (!isNaN(raw) && raw > 0) ? fs * raw : fs * 1.2;
  }

  function estimateLines(text: string, cw: number): number {
    if (cw <= 0) return 1;
    const words = text.split(/\s+/);
    let lines = 1, lw = 0;
    const sw = ctx.measureText(' ').width;
    for (const w of words) {
      const ww = ctx.measureText(w).width;
      if (lw > 0 && lw + sw + ww > cw) { lines++; lw = ww; }
      else { lw = lw > 0 ? lw + sw + ww : ww; }
    }
    return lines;
  }

  function measure(el: Element) {
    const s   = window.getComputedStyle(el);
    const txt = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    const r   = el.getBoundingClientRect();
    const aw  = r.width, ah = r.height;
    const cw  = el.parentElement ? el.parentElement.scrollWidth : aw;

    ctx.font = `${s.fontWeight || 'normal'} ${s.fontSize || '16px'} ${s.fontFamily || 'sans-serif'}`;
    const lsPx    = parsePx(s.letterSpacing);
    const baseW   = txt.length ? ctx.measureText(txt).width : 0;
    const extraW  = isNaN(lsPx) ? 0 : lsPx * Math.max(0, txt.length - 1);
    const pw      = txt.length ? baseW + extraW : aw;
    const lh      = resolveLineHeight(s);
    const lines   = (s.whiteSpace === 'nowrap' || !txt.length)
      ? 1
      : estimateLines(txt, cw);
    const ph      = txt.length ? lh * lines : ah;

    const wDelta  = aw - pw, hDelta = ah - ph;
    const wPct    = pw > 0 ? Math.max(0, Math.min(100, 100 - (Math.abs(wDelta) / pw) * 100)) : 100;
    const hPct    = ph > 0 ? Math.max(0, Math.min(100, 100 - (Math.abs(hDelta) / ph) * 100)) : 100;

    const sw2 = (el as HTMLElement).scrollWidth  ?? aw;
    const sh2 = (el as HTMLElement).scrollHeight ?? ah;
    const wOvf = sw2 > Math.ceil(aw) + 1;
    const hOvf = sh2 > Math.ceil(ah) + 1;
    const ov   = s.overflow;
    const clipped = (ov === 'hidden' || ov === 'clip') && (wOvf || hOvf);

    return {
      txt,
      pw: round(pw), ph: round(ph), aw: round(aw), ah: round(ah),
      wDelta: round(wDelta), hDelta: round(hDelta),
      wPct: round1(wPct), hPct: round1(hPct),
      wOvf, hOvf, clipped,
      fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
      lineHeight: s.lineHeight, letterSpacing: s.letterSpacing,
      whiteSpace: s.whiteSpace, overflow: ov, cw,
    };
  }

  function round(n: number)  { return Math.round(n * 100) / 100; }
  function round1(n: number) { return Math.round(n * 10)  / 10;  }

  // ── Selector path ───────────────────────────────────────────────────────
  function sel(el: Element, depth = 4): string {
    const p: string[] = [];
    let c: Element | null = el;
    for (let i = 0; i < depth && c && c !== document.body; i++) {
      let s = c.tagName.toLowerCase();
      if (c.id) s += `#${c.id}`;
      else if (c.className && typeof c.className === 'string') {
        const cls = c.className.trim().split(/\s+/).slice(0, 2).join('.');
        if (cls) s += `.${cls}`;
      }
      p.unshift(s);
      c = c.parentElement;
    }
    return p.join(' > ') || el.tagName.toLowerCase();
  }

  // ── HTML panel ──────────────────────────────────────────────────────────
  function esc(s: string) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function trunc(s: string, n: number) { return s.length > n ? s.slice(0,n-1)+'…' : s; }
  function mColor(pct: number) { return pct >= 90 ? C.good : pct >= 70 ? C.warn : C.bad; }

  function tr(label: string, value: string, color: string) {
    return `<tr><td style="color:${C.label};padding:2px 8px 2px 0;white-space:nowrap;font-size:11px;">${label}</td>`
         + `<td style="color:${color};padding:2px 0;font-size:11px;font-family:monospace;">${value}</td></tr>`;
  }

  function renderPanel(el: Element): string {
    const m  = measure(el);
    const tag = el.tagName.toLowerCase();
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0,2).join('.') : '';
    const txt = m.txt.length > 40 ? m.txt.slice(0,37)+'…' : m.txt || '(empty)';
    const badge = m.clipped
      ? `<span style="background:${C.bad};color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;">CLIPPED</span>`
      : (m.wOvf||m.hOvf)
      ? `<span style="background:${C.warn};color:#000;padding:1px 6px;border-radius:3px;font-size:10px;">OVERFLOW</span>`
      : `<span style="background:${C.good};color:#000;padding:1px 6px;border-radius:3px;font-size:10px;">OK</span>`;

    return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.4;">
<div style="font-size:12px;font-weight:600;color:${C.text};margin-bottom:6px;display:flex;align-items:center;gap:6px;">
  <span>&lt;${tag}&gt;</span>${cls?`<span style="font-size:10px;color:${C.label}">.${esc(cls)}</span>`:''}${badge}
</div>
<div style="font-size:10px;color:${C.label};margin-bottom:8px;font-family:monospace;word-break:break-all;">"${esc(txt)}"</div>
<div style="font-size:10px;font-weight:700;color:${C.label};text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Dimensions</div>
<table style="border-collapse:collapse;width:100%;margin-bottom:8px;">
${tr('Predicted W',`${m.pw}px`,C.val)}${tr('Actual W',`${m.aw}px`,C.val)}${tr('W match',`${m.wPct}%`,mColor(m.wPct))}
${tr('Predicted H',`${m.ph}px`,C.val)}${tr('Actual H',`${m.ah}px`,C.val)}${tr('H match',`${m.hPct}%`,mColor(m.hPct))}
</table>
<div style="font-size:10px;font-weight:700;color:${C.label};text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;">Typography</div>
<table style="border-collapse:collapse;width:100%;">
${tr('Font',trunc(m.fontFamily,22),C.val)}${tr('Size',m.fontSize,C.val)}${tr('Weight',m.fontWeight,C.val)}
${tr('Line-H',m.lineHeight,C.val)}${tr('Spacing',m.letterSpacing,C.val)}${tr('WS',m.whiteSpace,C.val)}${tr('Overflow',m.overflow,C.val)}
</table>
<div style="margin-top:8px;font-size:10px;color:${C.label};border-top:1px solid ${C.border};padding-top:6px;font-family:monospace;word-break:break-all;">${esc(sel(el))}</div>
</div>`;
  }

  // ── DOM elements ────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position:'fixed',zIndex:'2147483647',background:C.bg,border:`1px solid ${C.border}`,
    borderRadius:'8px',padding:'12px 14px',minWidth:'240px',maxWidth:'300px',
    boxShadow:'0 8px 32px rgba(0,0,0,.45)',pointerEvents:'none',display:'none',color:C.text,
  });
  document.body.appendChild(panel);

  const hl = document.createElement('div');
  Object.assign(hl.style, {
    position:'fixed',zIndex:'2147483646',border:`2px solid ${C.accent}`,
    background:C.hl,borderRadius:'2px',pointerEvents:'none',display:'none',
  });
  document.body.appendChild(hl);

  const btn = document.createElement('button');
  Object.assign(btn.style, {
    position:'fixed',bottom:'20px',right:'20px',zIndex:'2147483647',
    padding:'8px 16px',borderRadius:'6px',border:'none',cursor:'pointer',
    fontFamily:'-apple-system,sans-serif',fontSize:'13px',fontWeight:'600',
    boxShadow:'0 4px 16px rgba(0,0,0,.3)',transition:'background .2s',
  });
  document.body.appendChild(btn);

  // ── State ───────────────────────────────────────────────────────────────
  const state = { active: true, panelEl: panel, highlightEl: hl };
  win[SENTINEL] = state;
  updateBtn(state);

  function updateBtn(s: typeof state) {
    btn.textContent = `Pretext: ${s.active ? 'ON ✓' : 'OFF'}`;
    btn.style.background = s.active ? C.accent : C.off;
    btn.style.color      = '#fff';
  }

  btn.addEventListener('click', () => {
    state.active = !state.active;
    if (!state.active) { panel.style.display='none'; hl.style.display='none'; }
    updateBtn(state);
  });

  // ── Mouse tracking ──────────────────────────────────────────────────────
  let last: Element | null = null;

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!state.active) return;
    const t = e.target as Element;
    if (!t || t === panel || panel.contains(t)) return;
    if (t === last) return;
    last = t;

    const r = t.getBoundingClientRect();
    Object.assign(hl.style, { top:`${r.top}px`, left:`${r.left}px`, width:`${r.width}px`, height:`${r.height}px`, display:'block' });

    panel.innerHTML = renderPanel(t);

    const OFFSET = 16, PW = 300, PH = 340;
    let left = e.clientX + OFFSET, top = e.clientY + OFFSET;
    if (left + PW > window.innerWidth  - 8) left = e.clientX - PW - OFFSET;
    if (top  + PH > window.innerHeight - 8) top  = e.clientY - PH - OFFSET;
    if (left < 8) left = 8;
    if (top  < 8) top  = 8;
    Object.assign(panel.style, { left:`${left}px`, top:`${top}px`, display:'block' });
  }, { passive: true });

  document.addEventListener('mouseleave', () => {
    panel.style.display='none'; hl.style.display='none'; last=null;
  }, { passive: true });
})();
