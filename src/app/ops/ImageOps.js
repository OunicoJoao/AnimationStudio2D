/**
 * Operações sobre a imagem/projeto inteiro: redimensionar, tamanho da tela, girar,
 * espelhar, recortar, aparar, cor do papel e filtros.
 * @module app/ops/ImageOps
 */
import { FnCommand, MacroCommand } from '../../history/History.js';
import { CelSwap, CelEdit } from '../../history/CelPatch.js';
import { createCanvas } from '../../render/canvas.js';
import { alphaBounds } from '../../raster/flood.js';
import { FILTERS } from '../../raster/filters.js';
import { Rect } from '../../core/math.js';

export class ImageOps {
  /** @param {import('../Workspace.js').Workspace} ws @param {(m:string)=>void} toast */
  constructor(ws, toast) {
    this.ws = ws;
    this.toast = toast;
  }

  get p() { return this.ws.project; }

  /**
   * Substitui todas as células por versões transformadas e muda o tamanho do documento.
   * @param {number} nw @param {number} nh
   * @param {(g: CanvasRenderingContext2D, cel: HTMLCanvasElement) => void} draw
   */
  #remapAll(label, nw, nh, draw) {
    const ws = this.ws, p = this.p;
    const changes = [];
    for (const [k, cel] of p.cels) {
      const [layerId, frameId] = k.split(':');
      const c = createCanvas(nw, nh);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      draw(g, cel);
      changes.push({ layerId, frameId, before: cel, after: c });
    }
    const ow = p.width, oh = p.height;
    const size = new FnCommand('Tamanho', () => { p.width = nw; p.height = nh; p.touchAll(); }, () => { p.width = ow; p.height = oh; p.touchAll(); });
    // o tamanho muda antes das células no refazer e depois delas no desfazer
    ws.history.execute(new MacroCommand(label, [size, new CelSwap(p, changes, label)]));
    ws.selection = null;
    ws.changed('project');
  }

  resize(nw, nh) {
    const p = this.p;
    nw = Math.round(nw); nh = Math.round(nh);
    if (nw === p.width && nh === p.height) return;
    const ow = p.width, oh = p.height;
    this.#remapAll('Redimensionar', nw, nh, (g, cel) => g.drawImage(cel, 0, 0, ow, oh, 0, 0, nw, nh));
  }

  /** Muda o tamanho da tela sem escalar; ancoragem ax, ay ∈ {0, 0.5, 1}. */
  canvasSize(nw, nh, ax = 0.5, ay = 0.5) {
    const p = this.p;
    const dx = Math.round((nw - p.width) * ax), dy = Math.round((nh - p.height) * ay);
    this.#remapAll('Tamanho da tela', nw, nh, (g, cel) => g.drawImage(cel, dx, dy));
  }

  rotate(kind) {
    const p = this.p, w = p.width, h = p.height;
    const swap = kind !== '180';
    const nw = swap ? h : w, nh = swap ? w : h;
    const label = { cw: 'Girar 90° horário', ccw: 'Girar 90° anti-horário', '180': 'Girar 180°' }[kind];
    this.#remapAll(label, nw, nh, (g, cel) => {
      g.translate(nw / 2, nh / 2);
      g.rotate(kind === 'cw' ? Math.PI / 2 : kind === 'ccw' ? -Math.PI / 2 : Math.PI);
      g.drawImage(cel, -w / 2, -h / 2);
    });
  }

  flip(axis) {
    const p = this.p, w = p.width, h = p.height;
    this.#remapAll(axis === 'h' ? 'Espelhar horizontal' : 'Espelhar vertical', w, h, (g, cel) => {
      g.translate(axis === 'h' ? w : 0, axis === 'v' ? h : 0);
      g.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
      g.drawImage(cel, 0, 0);
    });
  }

  #cropTo(r, label) {
    const nw = Math.max(1, r.w), nh = Math.max(1, r.h);
    this.#remapAll(label, nw, nh, (g, cel) => g.drawImage(cel, -r.x, -r.y));
  }

  cropToSelection() {
    const sel = this.ws.selection;
    if (!sel) { this.toast('Faça uma seleção primeiro.'); return; }
    this.#cropTo(sel.bounds, 'Recortar para a seleção');
  }

  /** Corta as bordas vazias considerando todos os quadros. */
  trim() {
    const p = this.p;
    let b = null;
    for (const cel of p.cels.values()) {
      const r = alphaBounds(cel.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, p.width, p.height).data, p.width, p.height);
      if (r) b = b ? Rect.union(b, r) : r;
    }
    if (!b) { this.toast('O projeto está vazio.'); return; }
    if (b.x === 0 && b.y === 0 && b.w === p.width && b.h === p.height) { this.toast('Não há bordas vazias para cortar.'); return; }
    this.#cropTo(b, 'Aparar bordas');
  }

  /** Cor do papel (hex) ou null para transparente. */
  setBackground(color) {
    const ws = this.ws, p = this.p, old = p.background;
    if (old === color) return;
    ws.history.execute(new FnCommand('Cor do papel', () => { p.background = color; p.touchAll(); }, () => { p.background = old; p.touchAll(); }));
    ws.changed('meta');
  }

  /**
   * Aplica um filtro na camada ativa, nos quadros selecionados (ou todos), dentro da seleção.
   * @param {keyof FILTERS} id
   * @param {object} params
   * @param {'span'|'all'} scope
   */
  applyFilter(id, params = {}, scope = 'span') {
    const ws = this.ws, p = this.p;
    const layer = ws.layer;
    if (!layer || layer.locked) { this.toast('A camada ativa está bloqueada.'); return; }
    const [a, b] = scope === 'all' ? [0, p.frames.length - 1] : ws.frameSpan;
    const sel = ws.selection;
    const region = sel ? Rect.inflate(sel.bounds, id === 'blur' || id === 'outline' ? 0 : 0) : { x: 0, y: 0, w: p.width, h: p.height };
    const cmds = [];
    for (let i = a; i <= b; i++) {
      const f = p.frames[i];
      if (!p.getCel(layer.id, f.id)) continue;
      const edit = new CelEdit(p, layer.id, f.id, region);
      if (edit.isEmpty) continue;
      const r = edit.rect;
      const img = edit.ctx.getImageData(r.x, r.y, r.w, r.h);
      const out = new Uint8ClampedArray(img.data.length);
      let mask = null;
      if (sel) {
        mask = new Uint8Array(r.w * r.h);
        for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) mask[y * r.w + x] = sel.alpha[(r.y + y) * p.width + r.x + x];
      }
      FILTERS[id].fn(img.data, out, mask, { ...params, width: r.w, height: r.h });
      edit.ctx.putImageData(new ImageData(out, r.w, r.h), r.x, r.y);
      const cmd = edit.commit(FILTERS[id].label);
      if (cmd) cmds.push(cmd);
    }
    if (!cmds.length) { this.toast('Nada para filtrar nesta camada.'); return; }
    ws.history.push(cmds.length === 1 ? cmds[0] : new MacroCommand(FILTERS[id].label, cmds));
  }

  /** Pré-visualiza um filtro no quadro atual sem gravar: devolve uma função que desfaz. */
  previewFilter(id, params) {
    const ws = this.ws, p = this.p;
    const cel = p.getCel(ws.layerId, ws.frameId);
    if (!cel) return () => {};
    const g = cel.getContext('2d', { willReadFrequently: true });
    const sel = ws.selection;
    const r = sel ? sel.bounds : { x: 0, y: 0, w: p.width, h: p.height };
    const orig = g.getImageData(r.x, r.y, r.w, r.h);
    const out = new Uint8ClampedArray(orig.data.length);
    let mask = null;
    if (sel) {
      mask = new Uint8Array(r.w * r.h);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) mask[y * r.w + x] = sel.alpha[(r.y + y) * p.width + r.x + x];
    }
    FILTERS[id].fn(orig.data, out, mask, { ...params, width: r.w, height: r.h });
    g.putImageData(new ImageData(out, r.w, r.h), r.x, r.y);
    p.revision++;
    ws.changed('pixels');
    return () => { g.putImageData(orig, r.x, r.y); p.revision++; ws.changed('pixels'); };
  }
}
