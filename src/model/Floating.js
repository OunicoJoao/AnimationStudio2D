/**
 * Conteúdo flutuante: pixels levantados de uma célula (ou colados) que podem ser
 * movidos, escalados, girados e espelhados antes de serem aplicados.
 * @module model/Floating
 */
import { Mat, transformedBounds } from '../core/math.js';

export class Floating {
  /**
   * @param {object} o
   * @param {HTMLCanvasElement} o.canvas  conteúdo (tamanho da caixa)
   * @param {number} o.x  posição original no documento
   * @param {number} o.y
   * @param {string} o.layerId @param {string} o.frameId
   * @param {HTMLCanvasElement|null} o.snapshot  cópia da célula antes de levantar (null se colado)
   * @param {boolean} o.cellCreated  a célula não existia antes
   * @param {import('./Selection.js').Selection|null} o.selection  seleção que originou
   * @param {string} o.label
   */
  constructor({ canvas, x, y, layerId, frameId, snapshot = null, cellCreated = false, selection = null, label = 'Transformar' }) {
    Object.assign(this, { canvas, x, y, layerId, frameId, snapshot, cellCreated, selection, label });
    this.w = canvas.width;
    this.h = canvas.height;
    this.tx = 0; this.ty = 0;
    this.sx = 1; this.sy = 1;
    this.rot = 0;
  }

  /** Matriz que leva coordenadas locais (0..w, 0..h) para o documento. */
  get matrix() {
    const cx = this.x + this.w / 2 + this.tx, cy = this.y + this.h / 2 + this.ty;
    return Mat.chain(Mat.translate(cx, cy), Mat.rotate(this.rot), Mat.scale(this.sx, this.sy), Mat.translate(-this.w / 2, -this.h / 2));
  }

  /** Matriz que leva a posição original para a transformada (para mover a máscara de seleção). */
  get deltaMatrix() {
    return Mat.multiply(this.matrix, Mat.translate(-this.x, -this.y));
  }

  get bounds() { return transformedBounds(this.matrix, { x: 0, y: 0, w: this.w, h: this.h }); }

  /** Cantos no documento, na ordem: sup-esq, sup-dir, inf-dir, inf-esq. */
  get corners() {
    const m = this.matrix;
    return [Mat.apply(m, 0, 0), Mat.apply(m, this.w, 0), Mat.apply(m, this.w, this.h), Mat.apply(m, 0, this.h)];
  }

  get isIdentity() { return !this.tx && !this.ty && this.sx === 1 && this.sy === 1 && !this.rot; }

  /** Desenha o conteúdo transformado num contexto em coordenadas do documento. */
  drawTo(g) {
    g.save();
    g.setTransform(...Mat.multiply(g.getTransform ? domToArr(g.getTransform()) : Mat.identity(), this.matrix));
    g.drawImage(this.canvas, 0, 0);
    g.restore();
  }
}

const domToArr = (m) => [m.a, m.b, m.c, m.d, m.e, m.f];
