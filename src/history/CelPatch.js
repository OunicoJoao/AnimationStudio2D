/**
 * Comando que guarda só o retângulo de pixels alterado de uma célula (antes/depois).
 * Mantém o consumo de memória baixo mesmo em telas grandes.
 * @module history/CelPatch
 */
import { Rect } from '../core/math.js';

export class CelPatch {
  /**
   * @param {object} o
   * @param {import('../model/Project.js').Project} o.project
   * @param {string} o.layerId
   * @param {string} o.frameId
   * @param {{x:number,y:number,w:number,h:number}} o.rect
   * @param {ImageData} o.before
   * @param {ImageData} o.after
   * @param {boolean} [o.created]  a célula não existia antes desta edição
   * @param {string} [o.label]
   */
  constructor({ project, layerId, frameId, rect, before, after, created = false, label = 'Desenho' }) {
    Object.assign(this, { project, layerId, frameId, rect, before, after, created, label });
    this.bytes = (before.data.length + after.data.length) + 128;
  }

  #put(img) {
    const c = this.project.ensureCel(this.layerId, this.frameId);
    c.getContext('2d').putImageData(img, this.rect.x, this.rect.y);
    this.project.touch(this.layerId, this.frameId);
  }

  undo() {
    if (this.created) this.project.setCel(this.layerId, this.frameId, null);
    else this.#put(this.before);
  }

  redo() { this.#put(this.after); }
}

/**
 * Ajuda a montar um CelPatch: guarda o "antes" de uma região, deixa o chamador desenhar
 * e depois captura o "depois".
 */
export class CelEdit {
  /**
   * @param {import('../model/Project.js').Project} project
   * @param {string} layerId @param {string} frameId
   * @param {{x:number,y:number,w:number,h:number}} region  área que pode mudar
   */
  constructor(project, layerId, frameId, region) {
    this.project = project;
    this.layerId = layerId;
    this.frameId = frameId;
    this.created = !project.getCel(layerId, frameId);
    this.canvas = project.ensureCel(layerId, frameId);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.rect = Rect.clampTo(region, project.width, project.height);
    this.before = Rect.isEmpty(this.rect) ? null : this.ctx.getImageData(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
  }

  get isEmpty() { return !this.before; }

  /** Finaliza e devolve o comando (ou null se nada mudou). */
  commit(label) {
    if (!this.before) {
      if (this.created) this.project.setCel(this.layerId, this.frameId, null);
      return null;
    }
    const after = this.ctx.getImageData(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    if (sameData(this.before.data, after.data)) {
      if (this.created) this.project.setCel(this.layerId, this.frameId, null);
      return null;
    }
    this.project.touch(this.layerId, this.frameId);
    return new CelPatch({
      project: this.project, layerId: this.layerId, frameId: this.frameId,
      rect: this.rect, before: this.before, after, created: this.created, label,
    });
  }

  /** Desfaz o que foi desenhado sem registrar histórico. */
  rollback() {
    if (this.before) this.ctx.putImageData(this.before, this.rect.x, this.rect.y);
    if (this.created) this.project.setCel(this.layerId, this.frameId, null);
  }
}

/** Compara dois buffers de pixels rapidamente (32 bits por vez). */
export function sameData(a, b) {
  if (a.length !== b.length) return false;
  const n = a.length >> 2;
  const a32 = new Uint32Array(a.buffer, a.byteOffset, n), b32 = new Uint32Array(b.buffer, b.byteOffset, n);
  for (let i = 0; i < n; i++) if (a32[i] !== b32[i]) return false;
  return true;
}

/**
 * Comando que troca canvases inteiros de células (redimensionar, girar, mesclar…).
 * Guarda referências, não cópias: os canvases antigos ficam guardados para o desfazer.
 */
export class CelSwap {
  /**
   * @param {import('../model/Project.js').Project} project
   * @param {Array<{layerId:string, frameId:string, before: HTMLCanvasElement|null, after: HTMLCanvasElement|null}>} changes
   * @param {string} label
   */
  constructor(project, changes, label) {
    this.project = project;
    this.changes = changes;
    this.label = label;
    this.bytes = changes.reduce((s, c) => s + (c.before ? c.before.width * c.before.height * 4 : 0) + (c.after ? c.after.width * c.after.height * 4 : 0), 0);
  }
  undo() { for (const c of this.changes) this.project.setCel(c.layerId, c.frameId, c.before); }
  redo() { for (const c of this.changes) this.project.setCel(c.layerId, c.frameId, c.after); }
}
