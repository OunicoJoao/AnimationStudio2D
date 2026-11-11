/**
 * Repositório de projetos no aparelho (IndexedDB). Salva de forma incremental:
 * só as células alteradas são recodificadas em PNG.
 * @module io/ProjectStore
 */
import { Project } from '../model/Project.js';
import { canvasToBlob, blobToCanvas, isCanvasEmpty } from '../render/canvas.js';
import { renderFrame } from '../render/Compositor.js';

const DB_NAME = 'animationstudio2d';
const DB_VERSION = 1;

function req(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function done(tx) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Transação cancelada')); });
}

/**
 * @typedef {object} ProjectMeta
 * @property {string} id @property {string} name
 * @property {number} width @property {number} height
 * @property {number} frames @property {number} fps
 * @property {number} created @property {number} modified
 * @property {Blob|null} thumb
 */

export class ProjectStore {
  #db = null;

  async #open() {
    if (this.#db) return this.#db;
    if (!('indexedDB' in globalThis)) throw new Error('Este navegador não permite guardar projetos no aparelho.');
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cels')) db.createObjectStore('cels', { keyPath: 'k' }).createIndex('pid', 'pid');
    };
    this.#db = await req(r);
    return this.#db;
  }

  /** Pede ao navegador para não apagar os dados quando faltar espaço. */
  async persist() {
    try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch { /* ignorado */ }
    return false;
  }

  /** @returns {Promise<ProjectMeta[]>} mais recentes primeiro */
  async list() {
    const db = await this.#open();
    const all = await req(db.transaction('meta').objectStore('meta').getAll());
    return all.sort((a, b) => b.modified - a.modified);
  }

  /**
   * Salva o projeto. Só recodifica as células marcadas como alteradas.
   * @param {Project} project
   */
  async save(project) {
    const db = await this.#open();
    const dirty = [...project.dirtyCels];
    project.dirtyCels.clear();
    const puts = [], dels = [];
    try {
      for (const key of dirty) {
        const canvas = project.cels.get(key);
        if (!canvas || isCanvasEmpty(canvas)) { dels.push(key); continue; }
        puts.push({ k: `${project.id}|${key}`, pid: project.id, key, blob: await canvasToBlob(canvas) });
      }
      const thumbCanvas = renderFrame(project, 0, { scale: Math.min(1, 320 / Math.max(project.width, project.height)) });
      const thumb = await canvasToBlob(thumbCanvas, 'image/png');
      const tx = db.transaction(['meta', 'docs', 'cels'], 'readwrite');
      const cels = tx.objectStore('cels');
      for (const p of puts) cels.put(p);
      for (const key of dels) cels.delete(`${project.id}|${key}`);
      // remove células de camadas/quadros que não existem mais
      const existing = await req(cels.index('pid').getAllKeys(project.id));
      for (const k of existing) {
        const key = k.slice(project.id.length + 1);
        if (!project.cels.has(key)) cels.delete(k);
      }
      tx.objectStore('docs').put({ id: project.id, json: project.toJSON(), audio: project.audio?.blob || null });
      tx.objectStore('meta').put({
        id: project.id, name: project.name, width: project.width, height: project.height,
        frames: project.frames.length, fps: project.fps, layers: project.layers.length,
        created: project.created, modified: project.modified, thumb,
      });
      await done(tx);
    } catch (err) {
      // devolve as pendências para a próxima tentativa
      for (const k of dirty) project.dirtyCels.add(k);
      throw err;
    }
  }

  /**
   * @param {string} id
   * @param {import('../model/Project.js').CanvasFactory} factory
   */
  async load(id, factory) {
    const db = await this.#open();
    const tx = db.transaction(['docs', 'cels']);
    const doc = await req(tx.objectStore('docs').get(id));
    if (!doc) throw new Error('Projeto não encontrado no aparelho.');
    const cels = await req(tx.objectStore('cels').index('pid').getAll(id));
    const j = doc.json;
    const audio = doc.audio && j.audio ? { blob: doc.audio, name: j.audio.name, offset: j.audio.offset || 0, volume: j.audio.volume ?? 1 } : null;
    const project = new Project({ ...j, audio }, factory);
    for (const c of cels) {
      const [layerId, frameId] = c.key.split(':');
      if (!project.layerById(layerId) || !project.frameById(frameId)) continue;
      const img = await blobToCanvas(c.blob);
      project.ensureCel(layerId, frameId).getContext('2d').drawImage(img, 0, 0);
    }
    project.dirtyCels.clear();
    return project;
  }

  async remove(id) {
    const db = await this.#open();
    const tx = db.transaction(['meta', 'docs', 'cels'], 'readwrite');
    tx.objectStore('meta').delete(id);
    tx.objectStore('docs').delete(id);
    const cels = tx.objectStore('cels');
    const keys = await req(cels.index('pid').getAllKeys(id));
    for (const k of keys) cels.delete(k);
    await done(tx);
  }

  async rename(id, name) {
    const db = await this.#open();
    const tx = db.transaction(['meta', 'docs'], 'readwrite');
    const meta = await req(tx.objectStore('meta').get(id));
    const doc = await req(tx.objectStore('docs').get(id));
    if (meta) { meta.name = name; tx.objectStore('meta').put(meta); }
    if (doc) { doc.json.name = name; tx.objectStore('docs').put(doc); }
    await done(tx);
  }

  /** Espaço usado/disponível (quando o navegador informa). */
  async usage() {
    try { return await navigator.storage?.estimate?.(); } catch { return null; }
  }
}
