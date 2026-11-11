/**
 * Seleção e área de transferência: selecionar tudo, inverter, copiar, recortar, colar
 * (inclusive imagens copiadas de outros apps) e preencher a seleção.
 * @module app/ops/SelectionOps
 */
import { Selection } from '../../model/Selection.js';
import { CelEdit } from '../../history/CelPatch.js';
import { createCanvas, canvasToBlob, blobToCanvas } from '../../render/canvas.js';
import { renderFrame } from '../../render/Compositor.js';
import { alphaBounds } from '../../raster/flood.js';
import { Rect } from '../../core/math.js';
import { rgbaToCss } from '../../core/color.js';

export class SelectionOps {
  /**
   * @param {import('../Workspace.js').Workspace} ws
   * @param {import('../FloatService.js').FloatService} float
   * @param {import('../Colors.js').Colors} colors
   * @param {(m:string)=>void} toast
   */
  constructor(ws, float, colors, toast) {
    Object.assign(this, { ws, float, colors, toast });
    /** @type {{canvas: HTMLCanvasElement, x: number, y: number}|null} */
    this.clip = null;
  }

  get p() { return this.ws.project; }

  selectAll() { this.float.commit(); this.ws.setSelection(Selection.all(this.p.width, this.p.height)); }
  deselect() { this.float.commit(); this.ws.setSelection(null); }
  invert() {
    const s = this.ws.selection;
    this.ws.setSelection(s ? s.invert() : Selection.all(this.p.width, this.p.height));
  }

  /** Copia a seleção (ou a camada inteira) da célula ativa. */
  copy(merged = false) {
    const ws = this.ws, p = this.p;
    if (ws.floating) {
      const fl = ws.floating;
      this.clip = { canvas: fl.canvas, x: Math.round(fl.bounds.x), y: Math.round(fl.bounds.y) };
      this.#toSystem(fl.canvas);
      return true;
    }
    const src = merged ? renderFrame(p, ws.frameIndex, { background: false }) : p.getCel(ws.layerId, ws.frameId);
    if (!src) { this.toast('Nada para copiar.'); return false; }
    const sel = ws.selection;
    const data = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, p.width, p.height).data;
    let b = alphaBounds(data, p.width, p.height);
    if (b && sel) b = Rect.intersect(b, sel.bounds);
    if (!b || Rect.isEmpty(b)) { this.toast('Nada para copiar.'); return false; }
    const c = createCanvas(b.w, b.h);
    const g = c.getContext('2d');
    g.drawImage(src, -b.x, -b.y);
    if (sel) { g.globalCompositeOperation = 'destination-in'; g.drawImage(sel.mask, -b.x, -b.y); }
    this.clip = { canvas: c, x: b.x, y: b.y };
    this.#toSystem(c);
    this.toast('Copiado');
    return true;
  }

  cut() {
    if (this.ws.floating) {
      this.copy();
      const fl = this.ws.floating;
      this.ws.floating = null;
      // aplica a remoção (célula já sem o conteúdo levantado)
      fl.canvas = createCanvas(1, 1);
      this.ws.floating = fl;
      this.float.commit();
      return;
    }
    if (!this.copy()) return;
    const ws = this.ws, p = this.p;
    if (ws.layer.locked) return;
    const sel = ws.selection;
    const edit = new CelEdit(p, ws.layerId, ws.frameId, sel ? sel.bounds : { x: 0, y: 0, w: p.width, h: p.height });
    if (sel) { edit.ctx.save(); edit.ctx.globalCompositeOperation = 'destination-out'; edit.ctx.drawImage(sel.mask, 0, 0); edit.ctx.restore(); } else edit.ctx.clearRect(0, 0, p.width, p.height);
    const cmd = edit.commit('Recortar');
    if (cmd) ws.history.push(cmd);
    this.toast('Recortado');
  }

  /** Cola: tenta a área de transferência do sistema (imagem) e cai para a interna. */
  async paste(fromSystemEvent = null) {
    let canvas = null;
    if (fromSystemEvent) canvas = await this.#imageFromEvent(fromSystemEvent);
    if (!canvas && !fromSystemEvent && navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const type = it.types.find((t) => t.startsWith('image/'));
          if (type) { canvas = await blobToCanvas(await it.getType(type)); break; }
        }
      } catch { /* sem permissão: usa a área interna */ }
    }
    // a imagem do sistema que nós mesmos copiamos vale o mesmo que a interna (mantém a posição)
    if (canvas && this.clip && canvas.width === this.clip.canvas.width && canvas.height === this.clip.canvas.height) canvas = null;
    if (canvas) {
      const p = this.p;
      if (canvas.width > p.width || canvas.height > p.height) {
        const s = Math.min(p.width / canvas.width, p.height / canvas.height);
        const c = createCanvas(canvas.width * s, canvas.height * s);
        c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
        canvas = c;
      }
      this.float.paste(canvas, null, null, 'Colar imagem');
      return true;
    }
    if (!this.clip) { this.toast('Nada para colar.'); return false; }
    const c = createCanvas(this.clip.canvas.width, this.clip.canvas.height);
    c.getContext('2d').drawImage(this.clip.canvas, 0, 0);
    this.float.paste(c, this.clip.x, this.clip.y);
    return true;
  }

  async #imageFromEvent(e) {
    const items = [...(e.clipboardData?.items || [])];
    const img = items.find((i) => i.type.startsWith('image/'));
    if (!img) return null;
    try { return await blobToCanvas(img.getAsFile()); } catch { return null; }
  }

  async #toSystem(canvas) {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return;
      const blob = await canvasToBlob(canvas);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch { /* sem permissão: só a área interna */ }
  }

  /** Preenche a seleção (ou a camada inteira) com a cor principal. */
  fill(useBg = false) {
    const ws = this.ws, p = this.p;
    if (!ws.layer || ws.layer.locked) { this.toast('Esta camada está bloqueada.'); return; }
    const sel = ws.selection;
    const edit = new CelEdit(p, ws.layerId, ws.frameId, sel ? sel.bounds : { x: 0, y: 0, w: p.width, h: p.height });
    const tmp = createCanvas(p.width, p.height);
    const tg = tmp.getContext('2d');
    tg.fillStyle = rgbaToCss(useBg ? this.colors.bg : this.colors.fg);
    tg.fillRect(0, 0, p.width, p.height);
    if (sel) { tg.globalCompositeOperation = 'destination-in'; tg.drawImage(sel.mask, 0, 0); }
    edit.ctx.save();
    edit.ctx.globalCompositeOperation = ws.layer.alphaLock ? 'source-atop' : 'source-over';
    edit.ctx.drawImage(tmp, 0, 0);
    edit.ctx.restore();
    const cmd = edit.commit('Preencher');
    if (cmd) ws.history.push(cmd);
  }
}
