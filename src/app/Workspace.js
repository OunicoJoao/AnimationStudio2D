/**
 * Estado de edição: projeto aberto, camada e quadro ativos, intervalo de quadros,
 * seleção e conteúdo flutuante. Avisa os interessados por eventos 'change'.
 *
 * Tipos de mudança (campo `kind`):
 *  project  – outro projeto foi aberto
 *  pixels   – pixels de células mudaram
 *  layers   – lista ou propriedades de camadas
 *  frames   – lista ou duração de quadros, fps
 *  active   – camada/quadro ativo ou intervalo
 *  selection, floating, tags, meta
 *  all      – qualquer coisa (após desfazer/refazer)
 * @module app/Workspace
 */
import { Emitter } from '../core/Emitter.js';
import { History } from '../history/History.js';

export class Workspace extends Emitter {
  constructor() {
    super();
    /** @type {import('../model/Project.js').Project|null} */
    this.project = null;
    this.history = new History();
    this.layerId = null;
    this.frameId = null;
    /** Intervalo de quadros selecionados [início, fim] em índices, ou null. */
    this.range = null;
    /** @type {import('../model/Selection.js').Selection|null} */
    this.selection = null;
    /** @type {import('../model/Floating.js').Floating|null} */
    this.floating = null;
    this.history.on('change', (e) => {
      if (e.type === 'undo' || e.type === 'redo') this.#repairActive();
      this.emit('history', e);
      if (e.type !== 'clear') this.changed(e.type === 'push' ? 'pixels' : 'all');
    });
  }

  setProject(project) {
    this.project = project;
    this.history.clear();
    this.layerId = project.layers.at(-1)?.id ?? null;
    this.frameId = project.frames[0]?.id ?? null;
    this.range = null;
    this.selection = null;
    this.floating = null;
    this.changed('project');
  }

  get layer() { return this.project?.layerById(this.layerId) ?? null; }
  get frame() { return this.project?.frameById(this.frameId) ?? null; }
  get layerIndex() { return this.project ? this.project.layerIndex(this.layerId) : -1; }
  get frameIndex() { return this.project ? this.project.frameIndex(this.frameId) : -1; }

  /** Índices [a, b] dos quadros afetados por comandos de quadro. */
  get frameSpan() {
    if (this.range) return [Math.min(...this.range), Math.max(...this.range)];
    const i = this.frameIndex;
    return [i, i];
  }

  setLayer(id) {
    if (id === this.layerId || !this.project?.layerById(id)) return;
    this.layerId = id;
    this.changed('active');
  }

  /** Vai para o quadro de índice i (com extend = estende o intervalo selecionado). */
  setFrameIndex(i, extend = false) {
    const p = this.project;
    if (!p) return;
    i = Math.max(0, Math.min(p.frames.length - 1, i));
    if (extend) this.range = [this.range ? this.range[0] : this.frameIndex, i];
    else this.range = null;
    this.frameId = p.frames[i].id;
    this.changed('active');
  }

  setRange(range) {
    this.range = range;
    this.changed('active');
  }

  setSelection(sel) {
    this.selection = sel && !sel.isEmpty ? sel : null;
    this.changed('selection');
  }

  changed(kind) { this.emit('change', { kind }); }

  /** Depois de desfazer, garante que camada/quadro ativos ainda existem. */
  #repairActive() {
    const p = this.project;
    if (!p) return;
    if (!p.layerById(this.layerId)) this.layerId = p.layers[Math.min(p.layers.length - 1, Math.max(0, this.#lastLayerIdx))]?.id ?? null;
    if (!p.frameById(this.frameId)) this.frameId = p.frames[Math.min(p.frames.length - 1, Math.max(0, this.#lastFrameIdx))]?.id ?? null;
    if (this.range && Math.max(...this.range) >= p.frames.length) this.range = null;
    if (this.selection && (this.selection.width !== p.width || this.selection.height !== p.height)) this.selection = null;
  }

  get #lastLayerIdx() { return this.project.layers.length - 1; }
  get #lastFrameIdx() { return 0; }
}
