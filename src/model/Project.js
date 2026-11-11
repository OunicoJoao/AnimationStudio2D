/**
 * Modelo do documento de animação: camadas × quadros, cada célula é um canvas RGBA.
 * Não conhece interface nem histórico; só guarda dados e incrementa versões para os caches.
 * @module model/Project
 */
import { uid } from '../core/ids.js';
import { presetColors } from '../core/color.js';

/** Modos de mesclagem suportados (valores de globalCompositeOperation). */
export const BLEND_MODES = {
  'source-over': 'Normal',
  multiply: 'Multiplicar',
  screen: 'Tela',
  overlay: 'Sobrepor',
  darken: 'Escurecer',
  lighten: 'Clarear',
  'color-dodge': 'Subexposição de cor',
  'color-burn': 'Superexposição de cor',
  'hard-light': 'Luz direta',
  'soft-light': 'Luz suave',
  difference: 'Diferença',
  exclusion: 'Exclusão',
  hue: 'Matiz',
  saturation: 'Saturação',
  color: 'Cor',
  luminosity: 'Luminosidade',
};

export const TAG_DIRECTIONS = { forward: 'Para frente', reverse: 'Ao contrário', pingpong: 'Pingue-pongue' };

export class Layer {
  constructor({ id = uid('L'), name = 'Camada', visible = true, locked = false, opacity = 1, blend = 'source-over', alphaLock = false } = {}) {
    Object.assign(this, { id, name, visible, locked, opacity, blend, alphaLock });
  }
  toJSON() {
    const { id, name, visible, locked, opacity, blend, alphaLock } = this;
    return { id, name, visible, locked, opacity, blend, alphaLock };
  }
}

export class Frame {
  /** @param {{id?: string, hold?: number}} o  hold = por quantos quadros de tempo este desenho fica na tela */
  constructor({ id = uid('F'), hold = 1 } = {}) {
    this.id = id;
    this.hold = Math.max(1, Math.round(hold));
  }
  toJSON() { return { id: this.id, hold: this.hold }; }
}

export class Tag {
  constructor({ id = uid('T'), name = 'Trecho', color = '#f6cf6e', from = 0, to = 0, dir = 'forward' } = {}) {
    Object.assign(this, { id, name, color, from, to, dir });
  }
  toJSON() { const { id, name, color, from, to, dir } = this; return { id, name, color, from, to, dir }; }
}

/**
 * @typedef {{create(w: number, h: number): HTMLCanvasElement}} CanvasFactory
 */

export class Project {
  /**
   * @param {object} data
   * @param {CanvasFactory} canvasFactory
   */
  constructor(data, canvasFactory) {
    this.factory = canvasFactory;
    this.id = data.id || uid('P');
    this.name = data.name || 'Sem título';
    this.width = data.width;
    this.height = data.height;
    /** Cor do papel em hex, ou null para transparente. */
    this.background = data.background === undefined ? '#ffffff' : data.background;
    this.fps = data.fps || 12;
    this.loop = data.loop !== false;
    this.layers = (data.layers || []).map((l) => (l instanceof Layer ? l : new Layer(l)));
    this.frames = (data.frames || []).map((f) => (f instanceof Frame ? f : new Frame(f)));
    this.tags = (data.tags || []).map((t) => (t instanceof Tag ? t : new Tag(t)));
    this.palette = data.palette || presetColors('Estúdio');
    /** @type {null | {blob: Blob, name: string, offset: number, volume: number}} */
    this.audio = data.audio || null;
    this.created = data.created || Date.now();
    this.modified = data.modified || Date.now();
    /** @type {Map<string, HTMLCanvasElement>} */
    this.cels = new Map();
    /** Versão por quadro: muda sempre que um pixel do quadro muda (para caches de miniatura e onion). */
    this.frameVersion = new Map();
    /** Conjunto de células alteradas desde o último salvamento. */
    this.dirtyCels = new Set();
    this.revision = 0;
  }

  /** Cria um projeto novo com uma camada e um quadro. */
  static create({ name, width, height, background = '#ffffff', fps = 12 }, canvasFactory) {
    return new Project({
      name, width, height, background, fps,
      layers: [new Layer({ name: 'Camada 1' })],
      frames: [new Frame()],
    }, canvasFactory);
  }

  key(layerId, frameId) { return layerId + ':' + frameId; }
  layerById(id) { return this.layers.find((l) => l.id === id) || null; }
  frameById(id) { return this.frames.find((f) => f.id === id) || null; }
  layerIndex(id) { return this.layers.findIndex((l) => l.id === id); }
  frameIndex(id) { return this.frames.findIndex((f) => f.id === id); }

  getCel(layerId, frameId) { return this.cels.get(this.key(layerId, frameId)) || null; }

  /** Devolve a célula, criando um canvas transparente se ainda não existir. */
  ensureCel(layerId, frameId) {
    const k = this.key(layerId, frameId);
    let c = this.cels.get(k);
    if (!c) {
      c = this.factory.create(this.width, this.height);
      this.cels.set(k, c);
    }
    return c;
  }

  /** Troca (ou remove, com null) o canvas de uma célula. */
  setCel(layerId, frameId, canvas) {
    const k = this.key(layerId, frameId);
    if (canvas) this.cels.set(k, canvas);
    else this.cels.delete(k);
    this.touch(layerId, frameId);
  }

  /** Marca uma célula como alterada (invalida caches e agenda salvamento). */
  touch(layerId, frameId) {
    this.dirtyCels.add(this.key(layerId, frameId));
    this.frameVersion.set(frameId, (this.frameVersion.get(frameId) || 0) + 1);
    this.revision++;
    this.modified = Date.now();
  }

  /** Marca todos os quadros como alterados (mudanças de camada, opacidade, mesclagem…). */
  touchAll() {
    for (const f of this.frames) this.frameVersion.set(f.id, (this.frameVersion.get(f.id) || 0) + 1);
    this.revision++;
    this.modified = Date.now();
  }

  versionOf(frameId) { return this.frameVersion.get(frameId) || 0; }

  /** Duração de um quadro em milissegundos, considerando quantos tempos ele segura. */
  frameDurationMs(index) {
    const f = this.frames[index];
    return ((f ? f.hold : 1) * 1000) / this.fps;
  }

  totalDurationMs() {
    return this.frames.reduce((s, f) => s + (f.hold * 1000) / this.fps, 0);
  }

  /** Tempo (ms) em que um quadro começa. */
  frameStartMs(index) {
    let t = 0;
    for (let i = 0; i < index && i < this.frames.length; i++) t += (this.frames[i].hold * 1000) / this.fps;
    return t;
  }

  /** Metadados serializáveis (sem pixels). */
  toJSON() {
    return {
      format: 'animationstudio2d', version: 1,
      id: this.id, name: this.name, width: this.width, height: this.height,
      background: this.background, fps: this.fps, loop: this.loop,
      layers: this.layers.map((l) => l.toJSON()),
      frames: this.frames.map((f) => f.toJSON()),
      tags: this.tags.map((t) => t.toJSON()),
      palette: this.palette,
      audio: this.audio ? { name: this.audio.name, offset: this.audio.offset, volume: this.audio.volume } : null,
      created: this.created, modified: this.modified,
    };
  }
}
