/**
 * Aplica o resultado das ferramentas de pintura na célula ativa, respeitando
 * borracha, trava de alfa da camada e seleção — tanto na pré-visualização quanto
 * no commit, com a mesma regra (uma só fonte da verdade).
 * @module app/PaintService
 */
import { createCanvas, ensureSize } from '../render/canvas.js';
import { CelEdit } from '../history/CelPatch.js';
import { Rect } from '../core/math.js';

export class PaintService {
  /**
   * @param {import('./Workspace.js').Workspace} ws
   * @param {(msg: string) => void} toast
   */
  constructor(ws, toast) {
    this.ws = ws;
    this.toast = toast;
    this.clipTmp = createCanvas(1, 1);
    this.strokeCanvas = createCanvas(1, 1);
  }

  /** Canvas de traço reutilizável, limpo e do tamanho do documento. */
  freshStrokeCanvas() {
    const p = this.ws.project;
    return ensureSize(this.strokeCanvas, p.width, p.height);
  }

  /** Verifica se dá para pintar na camada ativa; avisa o motivo se não der. */
  canPaint() {
    const ws = this.ws, layer = ws.layer;
    if (!ws.project || !layer || !ws.frame) return false;
    if (layer.locked) { this.toast('Esta camada está bloqueada. Desbloqueie no painel de camadas.'); return false; }
    if (!layer.visible) { this.toast('Esta camada está oculta. Mostre a camada para desenhar nela.'); return false; }
    return true;
  }

  /**
   * Compõe um canvas de traço sobre `g` (cópia da célula ou a própria célula).
   * @param {CanvasRenderingContext2D} g
   * @param {HTMLCanvasElement} stroke
   * @param {{opacity?: number, mode?: 'paint'|'erase', region?: object}} o
   */
  compositeStroke(g, stroke, { opacity = 1, mode = 'paint', region = null } = {}) {
    const ws = this.ws, layer = ws.layer, sel = ws.selection;
    let src = stroke;
    const r = region ? Rect.clampTo(region, stroke.width, stroke.height) : { x: 0, y: 0, w: stroke.width, h: stroke.height };
    if (Rect.isEmpty(r)) return;
    if (sel) {
      // recorta o traço pela seleção num canvas temporário
      const t = ensureSize(this.clipTmp, stroke.width, stroke.height);
      const tg = t.getContext('2d');
      tg.drawImage(stroke, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
      tg.globalCompositeOperation = 'destination-in';
      tg.drawImage(sel.mask, 0, 0);
      tg.globalCompositeOperation = 'source-over';
      src = t;
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = opacity;
    g.globalCompositeOperation = mode === 'erase' ? 'destination-out' : layer?.alphaLock ? 'source-atop' : 'source-over';
    g.drawImage(src, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    g.restore();
  }

  /** Pré-visualização para o StageView. */
  previewFor(stroke, opts) {
    const ws = this.ws;
    return { layerId: ws.layerId, frameId: ws.frameId, apply: (g) => this.compositeStroke(g, stroke, opts) };
  }

  /**
   * Grava o traço na célula ativa e registra no histórico.
   * @param {HTMLCanvasElement} stroke
   * @param {object} bounds  área desenhada
   * @param {{opacity?: number, mode?: 'paint'|'erase', label?: string}} o
   */
  commitStroke(stroke, bounds, { opacity = 1, mode = 'paint', label = 'Pincel' } = {}) {
    const ws = this.ws, p = ws.project;
    if (Rect.isEmpty(bounds)) return null;
    if (mode === 'erase' && !p.getCel(ws.layerId, ws.frameId)) return null;
    const edit = new CelEdit(p, ws.layerId, ws.frameId, Rect.inflate(bounds, 2));
    if (edit.isEmpty) { edit.rollback(); return null; }
    this.compositeStroke(edit.ctx, stroke, { opacity, mode, region: edit.rect });
    const cmd = edit.commit(label);
    if (cmd) ws.history.push(cmd);
    return cmd;
  }

  /**
   * Edita pixels diretamente numa região da célula ativa (balde, filtros…).
   * @param {object} region
   * @param {(img: ImageData) => void} fn  altera os pixels da região no lugar
   */
  editPixels(region, fn, label) {
    const ws = this.ws, p = ws.project;
    const edit = new CelEdit(p, ws.layerId, ws.frameId, region);
    if (edit.isEmpty) { edit.rollback(); return null; }
    const img = edit.ctx.getImageData(edit.rect.x, edit.rect.y, edit.rect.w, edit.rect.h);
    fn(img, edit.rect);
    edit.ctx.putImageData(img, edit.rect.x, edit.rect.y);
    const cmd = edit.commit(label);
    if (cmd) ws.history.push(cmd);
    return cmd;
  }
}
