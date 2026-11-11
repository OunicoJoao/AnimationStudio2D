/**
 * Levanta, cola, aplica e cancela conteúdo flutuante (mover/transformar).
 * @module app/FloatService
 */
import { Floating } from '../model/Floating.js';
import { CelPatch } from '../history/CelPatch.js';
import { createCanvas, cloneCanvas } from '../render/canvas.js';
import { alphaBounds } from '../raster/flood.js';
import { Rect } from '../core/math.js';

export class FloatService {
  /** @param {import('./Workspace.js').Workspace} ws @param {(m:string)=>void} toast */
  constructor(ws, toast) {
    this.ws = ws;
    this.toast = toast;
  }

  get active() { return this.ws.floating; }

  /**
   * Levanta a seleção (ou a camada inteira) da célula ativa.
   * @returns {Floating|null}
   */
  lift(label = 'Transformar') {
    const ws = this.ws, p = ws.project;
    if (ws.floating) return ws.floating;
    const layer = ws.layer;
    if (!layer || layer.locked) { this.toast(layer ? 'Esta camada está bloqueada.' : 'Nenhuma camada ativa.'); return null; }
    const cel = p.getCel(ws.layerId, ws.frameId);
    if (!cel) { this.toast('Nada para mover nesta camada e quadro.'); return null; }
    const sel = ws.selection;
    const g = cel.getContext('2d', { willReadFrequently: true });
    const data = g.getImageData(0, 0, p.width, p.height).data;
    let b = alphaBounds(data, p.width, p.height);
    if (sel && b) b = Rect.intersect(b, sel.bounds);
    if (!b || Rect.isEmpty(b)) { this.toast(sel ? 'A seleção está vazia nesta camada.' : 'Nada para mover nesta camada e quadro.'); return null; }

    const snapshot = cloneCanvas(cel);
    const content = createCanvas(b.w, b.h);
    const cg = content.getContext('2d');
    cg.drawImage(cel, -b.x, -b.y);
    if (sel) {
      cg.globalCompositeOperation = 'destination-in';
      cg.drawImage(sel.mask, -b.x, -b.y);
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(sel.mask, 0, 0);
      g.restore();
    } else {
      g.clearRect(b.x, b.y, b.w, b.h);
    }
    p.touch(ws.layerId, ws.frameId);
    ws.floating = new Floating({ canvas: content, x: b.x, y: b.y, layerId: ws.layerId, frameId: ws.frameId, snapshot, selection: sel, label });
    ws.selection = null;
    ws.changed('floating');
    return ws.floating;
  }

  /** Cola uma imagem como flutuante na camada ativa, na posição dada (ou centralizada). */
  paste(canvas, x = null, y = null, label = 'Colar') {
    const ws = this.ws, p = ws.project;
    if (!ws.layer || ws.layer.locked) { this.toast('Esta camada está bloqueada.'); return null; }
    this.commit();
    const fx = x ?? Math.round((p.width - canvas.width) / 2), fy = y ?? Math.round((p.height - canvas.height) / 2);
    ws.floating = new Floating({ canvas, x: fx, y: fy, layerId: ws.layerId, frameId: ws.frameId, snapshot: null, label });
    ws.selection = null;
    ws.changed('floating');
    return ws.floating;
  }

  /** Aplica o flutuante na célula e registra no histórico. */
  commit() {
    const ws = this.ws, p = ws.project, fl = ws.floating;
    if (!fl) return;
    ws.floating = null;
    if (!p.layerById(fl.layerId) || !p.frameById(fl.frameId)) { ws.changed('floating'); return; }
    const created = !p.getCel(fl.layerId, fl.frameId);
    const cel = p.ensureCel(fl.layerId, fl.frameId);
    const g = cel.getContext('2d', { willReadFrequently: true });
    const original = { x: fl.x, y: fl.y, w: fl.w, h: fl.h };
    const rect = Rect.clampTo(Rect.inflate(Rect.union(original, fl.bounds), 1), p.width, p.height);
    if (Rect.isEmpty(rect)) { this.cancel(fl); return; }
    const before = fl.snapshot
      ? fl.snapshot.getContext('2d', { willReadFrequently: true }).getImageData(rect.x, rect.y, rect.w, rect.h)
      : g.getImageData(rect.x, rect.y, rect.w, rect.h);
    g.save();
    g.setTransform(...fl.matrix);
    g.drawImage(fl.canvas, 0, 0);
    g.restore();
    const after = g.getImageData(rect.x, rect.y, rect.w, rect.h);
    p.touch(fl.layerId, fl.frameId);
    ws.history.push(new CelPatch({
      project: p, layerId: fl.layerId, frameId: fl.frameId, rect, before, after,
      created: created && !fl.snapshot, label: fl.label,
    }));
    if (fl.selection) ws.selection = fl.selection.transformed(fl.deltaMatrix);
    ws.changed('floating');
  }

  /** Descarta o flutuante e devolve a célula ao estado anterior. */
  cancel(fl = this.ws.floating) {
    const ws = this.ws, p = ws.project;
    if (!fl) return;
    ws.floating = null;
    if (fl.snapshot && p.layerById(fl.layerId) && p.frameById(fl.frameId)) {
      const cel = p.ensureCel(fl.layerId, fl.frameId);
      const g = cel.getContext('2d');
      g.clearRect(0, 0, p.width, p.height);
      g.drawImage(fl.snapshot, 0, 0);
      p.touch(fl.layerId, fl.frameId);
    }
    ws.selection = fl.selection;
    ws.changed('floating');
  }
}
