/**
 * Composição de quadros: junta as camadas (opacidade + modo de mesclagem) e mantém
 * caches para a tela, o onion skin e as miniaturas.
 * @module render/Compositor
 */
import { createCanvas, ensureSize } from './canvas.js';

/**
 * @typedef {object} LayerPreview  pré-visualização sobre a camada ativa (traço em andamento, flutuante…)
 * @property {string} layerId
 * @property {string} frameId
 * @property {(g: CanvasRenderingContext2D) => void} apply  desenha sobre a cópia da célula
 */

/** Desenha as camadas de um quadro num contexto em coordenadas do documento. */
export function drawLayers(g, project, frameIndex, { from = 0, to = project.layers.length - 1, override = null, includeHidden = false } = {}) {
  const frame = project.frames[frameIndex];
  if (!frame) return;
  for (let i = from; i <= to; i++) {
    const layer = project.layers[i];
    if (!layer || (!layer.visible && !includeHidden)) continue;
    const src = override && override.layerId === layer.id ? override.canvas : project.getCel(layer.id, frame.id);
    if (!src) continue;
    g.globalAlpha = layer.opacity;
    g.globalCompositeOperation = layer.blend || 'source-over';
    g.drawImage(src, 0, 0);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/** Renderiza um quadro completo num canvas novo (para exportar). */
export function renderFrame(project, frameIndex, { scale = 1, background = true, target = null } = {}) {
  const w = Math.max(1, Math.round(project.width * scale)), h = Math.max(1, Math.round(project.height * scale));
  const c = target ? ensureSize(target, w, h) : createCanvas(w, h);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.setTransform(scale, 0, 0, scale, 0, 0);
  if (background && project.background) {
    g.fillStyle = project.background;
    g.fillRect(0, 0, project.width, project.height);
  }
  drawLayers(g, project, frameIndex);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

/**
 * Compõe o quadro ativo para a tela. Enquanto se desenha, as camadas abaixo e acima
 * da camada ativa ficam em cache: cada movimento do pincel recompõe só a camada ativa.
 */
export class FrameCompositor {
  constructor() {
    this.out = createCanvas(1, 1);
    this.below = createCanvas(1, 1);
    this.above = createCanvas(1, 1);
    this.layerTmp = createCanvas(1, 1);
    this.keys = { out: '', below: '', above: '' };
  }

  invalidate() { this.keys = { out: '', below: '', above: '' }; }

  /**
   * @param {import('../model/Project.js').Project} project
   * @param {number} frameIndex
   * @param {LayerPreview|null} preview
   * @returns {HTMLCanvasElement} canvas do tamanho do documento, sem o papel de fundo
   */
  compose(project, frameIndex, preview) {
    const w = project.width, h = project.height;
    const frame = project.frames[frameIndex];
    const base = `${project.id}|${w}x${h}|${frame?.id}|${project.revision}`;
    if (!preview || !frame || preview.frameId !== frame.id) {
      if (this.keys.out !== base) {
        ensureSize(this.out, w, h);
        drawLayers(this.out.getContext('2d'), project, frameIndex);
        this.keys.out = base;
      }
      return this.out;
    }
    const li = project.layerIndex(preview.layerId);
    const layer = project.layers[li];
    if (!layer) return this.compose(project, frameIndex, null);

    // camadas acima com mesclagem especial precisam ser desenhadas uma a uma
    const simpleAbove = project.layers.slice(li + 1).every((l) => !l.visible || (l.blend || 'source-over') === 'source-over');
    const k = `${base}|${preview.layerId}`;
    if (this.keys.below !== k) {
      ensureSize(this.below, w, h);
      drawLayers(this.below.getContext('2d'), project, frameIndex, { to: li - 1 });
      this.keys.below = k;
    }
    if (simpleAbove && this.keys.above !== k) {
      ensureSize(this.above, w, h);
      drawLayers(this.above.getContext('2d'), project, frameIndex, { from: li + 1 });
      this.keys.above = k;
    }

    // camada ativa = célula + pré-visualização
    const tmp = ensureSize(this.layerTmp, w, h);
    const tg = tmp.getContext('2d');
    const cel = project.getCel(layer.id, frame.id);
    if (cel) tg.drawImage(cel, 0, 0);
    preview.apply(tg);
    tg.globalAlpha = 1;
    tg.globalCompositeOperation = 'source-over';
    tg.setTransform(1, 0, 0, 1, 0, 0);

    const out = ensureSize(this.out, w, h);
    const g = out.getContext('2d');
    g.drawImage(this.below, 0, 0);
    if (layer.visible) {
      g.globalAlpha = layer.opacity;
      g.globalCompositeOperation = layer.blend || 'source-over';
      g.drawImage(tmp, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    if (simpleAbove) g.drawImage(this.above, 0, 0);
    else drawLayers(g, project, frameIndex, { from: li + 1 });
    this.keys.out = '';
    return out;
  }
}

/** Cache de quadros vizinhos tingidos para o onion skin. */
export class OnionCache {
  #cache = new Map();

  /**
   * @returns {HTMLCanvasElement} composição do quadro, tingida se `tint` for uma cor
   */
  get(project, frameIndex, tint, scale) {
    const f = project.frames[frameIndex];
    const key = `${f.id}|${project.versionOf(f.id)}|${tint || ''}|${scale}`;
    const hit = this.#cache.get(f.id);
    if (hit && hit.key === key) return hit.canvas;
    const c = hit?.canvas || createCanvas(1, 1);
    const w = Math.max(1, Math.round(project.width * scale)), h = Math.max(1, Math.round(project.height * scale));
    ensureSize(c, w, h);
    const g = c.getContext('2d');
    g.setTransform(scale, 0, 0, scale, 0, 0);
    drawLayers(g, project, frameIndex);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (tint) {
      // mantém a forma (alfa) e troca a cor, misturando com o original para ainda ler os traços
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = 0.78;
      g.fillStyle = tint;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    this.#cache.set(f.id, { key, canvas: c });
    return c;
  }

  clear() { this.#cache.clear(); }

  /** Remove entradas de quadros que não existem mais. */
  prune(project) {
    const ids = new Set(project.frames.map((f) => f.id));
    for (const k of this.#cache.keys()) if (!ids.has(k)) this.#cache.delete(k);
  }
}

/** Miniaturas de quadros (timeline) e de células (painel de camadas). */
export class ThumbnailCache {
  #frames = new Map();
  #cels = new Map();

  #size(project, h) {
    const s = h / project.height;
    return { w: Math.max(1, Math.round(project.width * s)), h, s };
  }

  frame(project, frameIndex, h = 64) {
    const f = project.frames[frameIndex];
    const key = `${project.versionOf(f.id)}|${h}|${project.background}`;
    const hit = this.#frames.get(f.id);
    if (hit && hit.key === key) return hit.canvas;
    const { w, s } = this.#size(project, h);
    const c = hit?.canvas || createCanvas(w, h);
    ensureSize(c, w, h);
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    if (project.background) { g.fillStyle = project.background; g.fillRect(0, 0, project.width, project.height); }
    drawLayers(g, project, frameIndex);
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.#frames.set(f.id, { key, canvas: c });
    return c;
  }

  cel(project, layerId, frameId, h = 40) {
    const k = layerId + ':' + frameId;
    const key = `${project.versionOf(frameId)}|${h}`;
    const hit = this.#cels.get(k);
    if (hit && hit.key === key) return hit.canvas;
    const { w, s } = this.#size(project, h);
    const c = hit?.canvas || createCanvas(w, h);
    ensureSize(c, w, h);
    const cel = project.getCel(layerId, frameId);
    if (cel) {
      const g = c.getContext('2d');
      g.setTransform(s, 0, 0, s, 0, 0);
      g.drawImage(cel, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.#cels.set(k, { key, canvas: c });
    return c;
  }

  clear() { this.#frames.clear(); this.#cels.clear(); }
}
