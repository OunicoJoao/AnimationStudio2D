/**
 * Salvamento automático no aparelho: alguns instantes depois de cada alteração,
 * ao sair da aba e ao fechar o projeto.
 * @module app/Autosave
 */
import { Emitter } from '../core/Emitter.js';
import { debounce } from '../core/debounce.js';

const META_KINDS = new Set(['meta', 'palette', 'tags', 'frames', 'layers']);

export class Autosave extends Emitter {
  /**
   * @param {import('./Workspace.js').Workspace} ws
   * @param {import('../io/ProjectStore.js').ProjectStore} store
   * @param {import('./FloatService.js').FloatService} float
   */
  constructor(ws, store, float, delay = 1500) {
    super();
    Object.assign(this, { ws, store, float });
    this.status = 'saved';
    this.saving = null;
    this.queued = false;
    this.run = debounce(() => this.save(), delay);
    ws.on('history', (e) => { if (e.type !== 'clear') this.#dirty(); });
    ws.on('change', ({ kind }) => { if (META_KINDS.has(kind)) this.#dirty(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flush(); });
    window.addEventListener('pagehide', () => this.flush());
  }

  #set(s) { this.status = s; this.emit('status', s); }

  #dirty() {
    if (!this.ws.project) return;
    this.#set('dirty');
    this.run();
  }

  /** Salva já (aplica conteúdo flutuante antes, para não gravar um buraco). */
  async flush() {
    this.run.cancel();
    if (this.status === 'saved' && !this.saving) return;
    if (this.ws.floating) this.float.commit();
    await this.save();
  }

  async save() {
    const p = this.ws.project;
    if (!p) return;
    if (this.ws.floating) { this.run(); return; } // espera aplicar
    if (this.saving) { this.queued = true; return this.saving; }
    this.#set('saving');
    this.saving = (async () => {
      try {
        await this.store.save(p);
        this.#set(this.queued ? 'dirty' : 'saved');
      } catch (err) {
        console.error(err);
        this.#set('error');
        this.emit('error', err);
      } finally {
        this.saving = null;
        if (this.queued) { this.queued = false; this.save(); }
      }
    })();
    return this.saving;
  }
}
