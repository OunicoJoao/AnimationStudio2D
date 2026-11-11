/**
 * Entrada na área de desenho: mouse, caneta e toque.
 *  - 1 dedo / caneta / mouse: ferramenta ativa (com pressão da caneta)
 *  - 2 dedos: zoom, mover e girar a vista; toque rápido com 2 dedos = desfazer, 3 = refazer
 *  - tocar e segurar: conta-gotas
 *  - modo caneta: o dedo só navega (evita riscos com a palma)
 *  - botão do meio: mover a vista; botão direito: conta-gotas
 *  - roda: zoom (mouse) ou mover (trackpad); Ctrl+roda/pinça do trackpad: zoom
 * @module input/PointerInput
 */

const LONG_PRESS_MS = 480;
const TAP_MS = 320;

export class PointerInput {
  constructor(canvas, deps) {
    Object.assign(this, deps);
    this.canvas = canvas;
    this.touches = new Map();
    this.primary = null;
    this.gesture = null;
    this.pan = null;
    this.tap = null;
    this.lp = null;
    this.tempFromButton = null;
    canvas.addEventListener('pointerdown', (e) => this.#down(e));
    canvas.addEventListener('pointermove', (e) => this.#move(e));
    canvas.addEventListener('pointerup', (e) => this.#up(e, false));
    canvas.addEventListener('pointercancel', (e) => this.#up(e, true));
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && this.primary === null) { this.tools.active.leave?.(); this.status.setPointer(null); } });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.parentElement.addEventListener('wheel', (e) => this.#wheel(e), { passive: false });
    // Safari: gestos de pinça nativos do trackpad
    canvas.addEventListener('gesturestart', (e) => e.preventDefault());
    this.tools.on('change', () => this.updateCursor());
  }

  /** Converte o evento do navegador num ToolEvent. */
  #ev(e) {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const d = this.viewport.toDoc(sx, sy);
    let p = 1;
    if (e.pointerType === 'pen') p = e.pressure > 0 ? e.pressure : 0.5;
    return { x: d.x, y: d.y, sx, sy, p, button: e.button, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey, pointerType: e.pointerType };
  }

  updateCursor() {
    const t = this.tools.active;
    this.canvas.style.cursor = this.pan ? 'grabbing' : t.cursorFor || t.cursor;
  }

  #down(e) {
    if (this.playback.playing) this.playback.stop();
    document.activeElement?.blur?.();
    if (e.pointerType === 'pen' && !this.settings.get('penOnlyChosen')) {
      this.settings.set('penOnlyChosen', true);
      this.settings.set('penOnly', true);
      this.toast('Caneta detectada: agora o dedo só move e dá zoom. Dá para mudar em Ver › Modo caneta.');
    }
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ponteiro já liberado */ }

    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      if (this.touches.size === 1) this.tap = { t: performance.now(), max: 1, moved: false };
      else if (this.tap) this.tap.max = Math.max(this.tap.max, this.touches.size);
      if (this.touches.size >= 2) {
        this.#cancelLongPress();
        if (this.primary !== null) { this.tools.active.cancel(); this.primary = null; this.#endTemp(); }
        this.pan = null;
        this.#startGesture();
        return;
      }
      if (this.settings.get('penOnly')) { this.pan = { x: e.clientX, y: e.clientY, id: e.pointerId }; return; }
    }

    if (e.pointerType === 'mouse' && e.button === 1) {
      e.preventDefault();
      this.pan = { x: e.clientX, y: e.clientY, id: e.pointerId };
      this.updateCursor();
      return;
    }
    if (e.pointerType === 'mouse' && e.button === 2) {
      this.tools.pushTemp('eyedropper');
      this.tempFromButton = 'eyedropper';
    } else if (e.button !== 0 && e.pointerType === 'mouse') return;

    this.primary = e.pointerId;
    const ev = this.#ev(e);
    ev.button = 0;
    this.tools.active.down(ev);
    this.updateCursor();
    if (e.pointerType === 'touch' && this.tools.active.paints) this.#startLongPress(e);
  }

  #move(e) {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      const t = this.touches.get(e.pointerId);
      t.x = e.clientX; t.y = e.clientY;
      if (Math.hypot(t.x - t.x0, t.y - t.y0) > 10 && this.tap) this.tap.moved = true;
      if (this.gesture) { this.#updateGesture(); return; }
    }
    if (this.pan && this.pan.id === e.pointerId) {
      this.viewport.panBy(e.clientX - this.pan.x, e.clientY - this.pan.y);
      this.pan.x = e.clientX; this.pan.y = e.clientY;
      return;
    }
    if (this.lp && Math.hypot(e.clientX - this.lp.x, e.clientY - this.lp.y) > 10) this.#cancelLongPress();
    if (this.primary === e.pointerId) {
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ce of list.length ? list : [e]) this.tools.active.move(this.#ev(ce));
      this.status.setPointer(this.#ev(e));
      if (this.tools.active.cursorFor) this.updateCursor();
      return;
    }
    if (e.pointerType !== 'touch' && this.primary === null) {
      const ev = this.#ev(e);
      this.tools.active.hover(ev);
      this.status.setPointer(ev);
      if (this.tools.active.cursorFor) this.updateCursor();
    }
  }

  #up(e, cancelled) {
    this.#cancelLongPress();
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.gesture) {
        if (this.touches.size < 2) this.gesture = null;
        if (this.touches.size === 0) this.#finishTap();
        return;
      }
      if (this.touches.size === 0) this.#finishTap();
    }
    if (this.pan && this.pan.id === e.pointerId) { this.pan = null; this.updateCursor(); return; }
    if (this.primary === e.pointerId) {
      this.primary = null;
      if (cancelled) this.tools.active.cancel();
      else this.tools.active.up(this.#ev(e));
      this.#endTemp();
      this.updateCursor();
    }
  }

  #endTemp() {
    if (this.tempFromButton) { this.tools.popTemp(this.tempFromButton); this.tempFromButton = null; }
  }

  #finishTap() {
    const t = this.tap;
    this.tap = null;
    if (!t || t.moved || performance.now() - t.t > TAP_MS) return;
    if (t.max === 2) this.commands.run('undo');
    else if (t.max >= 3) this.commands.run('redo');
  }

  #startGesture() {
    const ids = [...this.touches.keys()].slice(0, 2);
    const [a, b] = ids.map((id) => this.#local(this.touches.get(id)));
    this.gesture = { ids, start: this.viewport.snapshot(), a0: a, b0: b };
  }

  #updateGesture() {
    const g = this.gesture;
    const ta = this.touches.get(g.ids[0]), tb = this.touches.get(g.ids[1]);
    if (!ta || !tb) return;
    this.viewport.pinch(g.start, g.a0, g.b0, this.#local(ta), this.#local(tb), true);
  }

  #local(t) {
    const r = this.canvas.getBoundingClientRect();
    return { x: t.x - r.left, y: t.y - r.top };
  }

  #startLongPress(e) {
    const ev0 = this.#ev(e);
    this.lp = {
      x: e.clientX, y: e.clientY,
      timer: setTimeout(() => {
        if (this.primary !== e.pointerId) return;
        this.tools.active.cancel();
        this.tools.pushTemp('eyedropper');
        this.tempFromButton = 'eyedropper';
        this.tools.active.down(ev0);
        navigator.vibrate?.(12);
        this.lp = null;
      }, LONG_PRESS_MS),
    };
  }

  #cancelLongPress() {
    if (this.lp) { clearTimeout(this.lp.timer); this.lp = null; }
  }

  #wheel(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    const dx = e.deltaX * scale, dy = e.deltaY * scale;
    const v = this.viewport;
    if (e.ctrlKey || e.metaKey) {
      // pinça do trackpad ou Ctrl+roda: zoom contínuo
      v.zoomAt(v.zoom * Math.exp(-dy * 0.01), sx, sy);
      return;
    }
    if (e.altKey) { v.rotateAt(v.rotation + (dy > 0 ? 5 : -5), sx, sy); return; }
    const mouseWheel = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 50 && Number.isInteger(dy));
    if (mouseWheel && !e.shiftKey) v.zoomAt(v.zoom * Math.exp(-dy * 0.0025), sx, sy);
    else if (e.shiftKey && dx === 0) v.panBy(-dy, 0);
    else v.panBy(-dx, -dy);
  }
}
