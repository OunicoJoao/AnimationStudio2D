/**
 * Casos de uso de arquivos: criar/abrir/duplicar/excluir projetos, importar imagens,
 * quadros e áudio, abrir arquivos soltos e exportar.
 * @module app/FileService
 */
import { Project, Layer, Frame } from '../model/Project.js';
import { FnCommand } from '../history/History.js';
import { canvasFactory, createCanvas, blobToCanvas } from '../render/canvas.js';
import { projectToZip, projectFromZip, PROJECT_EXT } from '../io/ProjectFile.js';
import { exportPng, exportPngSequence, exportGif, exportSheet, exportVideo, safeName } from '../io/Exporter.js';
import { saveBlob } from '../io/files.js';
import { uid } from '../core/ids.js';

const IMAGE_RE = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i;
const AUDIO_RE = /^audio\//i;

export class FileService {
  constructor({ ws, store, autosave, audio, toast, progress, onOpen }) {
    Object.assign(this, { ws, store, autosave, audio, toast, progress, onOpen });
  }

  list() { return this.store.list(); }

  async create(opts) {
    const p = Project.create(opts, canvasFactory);
    p.dirtyCels.clear();
    await this.store.save(p);
    await this.#open(p);
    return p;
  }

  async open(id) {
    const p = await this.store.load(id, canvasFactory);
    await this.#open(p);
  }

  async #open(p) {
    this.ws.setProject(p);
    await this.audio.load(p).catch(() => this.toast('Não foi possível ler o áudio deste projeto.'));
    this.onOpen?.(p);
  }

  async close() {
    if (!this.ws.project) return;
    await this.autosave.flush();
  }

  async saveNow() {
    if (this.ws.floating) this.autosave.float.commit();
    await this.autosave.save();
    if (this.autosave.status === 'saved') this.toast('Salvo no aparelho');
  }

  async duplicate(id) {
    const p = await this.store.load(id, canvasFactory);
    p.id = uid('P');
    p.name = `${p.name} (cópia)`;
    p.created = p.modified = Date.now();
    p.dirtyCels = new Set(p.cels.keys());
    await this.store.save(p);
    return p.id;
  }

  rename(id, name) { return this.store.rename(id, name); }
  remove(id) { return this.store.remove(id); }

  /** Baixa o arquivo .as2d de um projeto salvo (ou do aberto). */
  async exportProjectFile(id = this.ws.project?.id) {
    let p = this.ws.project;
    if (!p || p.id !== id) p = await this.store.load(id, canvasFactory);
    else await this.autosave.flush();
    const blob = await projectToZip(p);
    await saveBlob(blob, safeName(p.name) + PROJECT_EXT);
  }

  /** Importa um .as2d para a galeria (com id novo se já existir). */
  async importProjectFile(file) {
    const p = await projectFromZip(file, canvasFactory);
    const existing = await this.store.list();
    if (existing.some((m) => m.id === p.id)) { p.id = uid('P'); p.name = `${p.name} (importado)`; }
    p.dirtyCels = new Set(p.cels.keys());
    await this.store.save(p);
    return p.id;
  }

  /**
   * Arquivos soltos na janela ou escolhidos em "Abrir":
   * .as2d abre; imagens viram camada (1) ou quadros (várias); áudio vira trilha.
   */
  async openFiles(files, { inEditor }) {
    if (!files.length) return;
    const proj = files.find((f) => f.name.toLowerCase().endsWith(PROJECT_EXT));
    if (proj) {
      const id = await this.importProjectFile(proj);
      await this.open(id);
      return;
    }
    const images = files.filter((f) => IMAGE_RE.test(f.type));
    const audio = files.find((f) => AUDIO_RE.test(f.type));
    if (!inEditor) {
      if (!images.length) { this.toast('Solte um projeto .as2d ou imagens.'); return; }
      const first = await blobToCanvas(images[0]);
      await this.create({ name: images[0].name.replace(/\.[^.]+$/, ''), width: first.width, height: first.height, background: '#ffffff', fps: 12 });
    }
    if (images.length === 1 && images[0].type !== 'image/gif') await this.importImageAsLayer(images[0]);
    else if (images.length) await this.importFrames(images);
    if (audio && inEditor) await this.importAudio(audio);
  }

  /** Coloca uma imagem numa camada nova do quadro atual, ajustada ao tamanho. */
  async importImageAsLayer(file) {
    const ws = this.ws, p = ws.project;
    const img = await blobToCanvas(file);
    const layer = new Layer({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imagem' });
    const cel = createCanvas(p.width, p.height);
    const s = Math.min(1, p.width / img.width, p.height / img.height);
    const w = img.width * s, h = img.height * s;
    const g = cel.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, (p.width - w) / 2, (p.height - h) / 2, w, h);
    const at = ws.layerIndex + 1, fid = ws.frameId, prev = ws.layerId;
    ws.history.execute(new FnCommand('Importar imagem', () => {
      p.layers.splice(at, 0, layer); p.setCel(layer.id, fid, cel); ws.layerId = layer.id; p.touchAll();
    }, () => {
      p.layers.splice(p.layerIndex(layer.id), 1); p.setCel(layer.id, fid, null); ws.layerId = prev; p.touchAll();
    }, p.width * p.height * 4));
    ws.changed('layers');
    this.toast('Imagem importada numa camada nova');
  }

  /** Lê os quadros de um GIF animado (quando o navegador tem ImageDecoder). */
  async #gifFrames(file) {
    if (!('ImageDecoder' in window)) return null;
    try {
      const dec = new window.ImageDecoder({ data: file.stream(), type: file.type });
      await dec.tracks.ready;
      const n = dec.tracks.selectedTrack.frameCount;
      const out = [];
      for (let i = 0; i < n; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        const c = createCanvas(image.displayWidth, image.displayHeight);
        c.getContext('2d').drawImage(image, 0, 0);
        out.push({ canvas: c, ms: (image.duration || 0) / 1000 });
        image.close();
      }
      return out;
    } catch { return null; }
  }

  /** Cada imagem vira um quadro novo (na camada ativa), em ordem de nome. GIFs viram todos os seus quadros. */
  async importFrames(files) {
    const ws = this.ws, p = ws.project;
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const canvases = [];
    for (const f of sorted) {
      if (f.type === 'image/gif') {
        const fr = await this.#gifFrames(f);
        if (fr) { canvases.push(...fr.map((x) => x.canvas)); continue; }
      }
      canvases.push(await blobToCanvas(f));
    }
    if (!canvases.length) return;
    const layerId = ws.layerId, at = ws.frameIndex + 1;
    const items = canvases.map((img) => {
      const cel = createCanvas(p.width, p.height);
      const s = Math.min(1, p.width / img.width, p.height / img.height);
      const w = img.width * s, h = img.height * s;
      cel.getContext('2d').drawImage(img, (p.width - w) / 2, (p.height - h) / 2, w, h);
      return { frame: new Frame(), cel };
    });
    const prev = ws.frameId;
    ws.history.execute(new FnCommand('Importar quadros', () => {
      p.frames.splice(at, 0, ...items.map((i) => i.frame));
      for (const it of items) p.setCel(layerId, it.frame.id, it.cel);
      ws.frameId = items[0].frame.id;
      p.touchAll();
    }, () => {
      p.frames.splice(at, items.length);
      for (const it of items) p.setCel(layerId, it.frame.id, null);
      ws.frameId = prev;
      p.touchAll();
    }, items.length * p.width * p.height * 4));
    ws.changed('frames');
    this.toast(`${items.length} quadros importados`);
  }

  async importAudio(file) {
    const ws = this.ws, p = ws.project;
    if (!AUDIO_RE.test(file.type) && !/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name)) { this.toast('Escolha um arquivo de áudio (MP3, WAV, OGG, M4A).'); return; }
    const old = p.audio;
    const next = { blob: file, name: file.name, offset: 0, volume: 1 };
    try {
      p.audio = next;
      await this.audio.load(p);
    } catch {
      p.audio = old;
      await this.audio.load(p).catch(() => {});
      this.toast('Não foi possível ler este áudio.');
      return;
    }
    ws.history.push(new FnCommand('Importar áudio', async () => { p.audio = next; await this.audio.load(p); ws.changed('meta'); }, async () => { p.audio = old; await this.audio.load(p); ws.changed('meta'); }));
    ws.changed('meta');
    const secs = this.audio.duration, anim = p.totalDurationMs() / 1000;
    this.toast(secs > anim + 0.5 ? `Áudio de ${secs.toFixed(1)} s; a animação tem ${anim.toFixed(1)} s` : 'Áudio importado');
  }

  async updateAudio(values) {
    const ws = this.ws, p = ws.project;
    if (!p.audio) return;
    if (values.remove) {
      const old = p.audio;
      ws.history.execute(new FnCommand('Remover áudio', () => { p.audio = null; this.audio.load(p); ws.changed('meta'); }, () => { p.audio = old; this.audio.load(p); ws.changed('meta'); }));
      return;
    }
    const before = { ...p.audio }, after = { ...p.audio, ...values };
    ws.history.execute(new FnCommand('Ajustar áudio', () => { p.audio = after; this.audio.load(p); ws.changed('meta'); }, () => { p.audio = before; this.audio.load(p); ws.changed('meta'); }));
  }

  /** Índices de quadros para uma escolha do diálogo de exportação. */
  framesFor(range) {
    const ws = this.ws, p = ws.project;
    const all = p.frames.map((_, i) => i);
    if (range === 'current') return [ws.frameIndex];
    if (range === 'sel' && ws.range) { const [a, b] = ws.frameSpan; return all.slice(a, b + 1); }
    if (range.startsWith('tag:')) {
      const t = p.tags.find((x) => x.id === range.slice(4));
      if (t) return all.slice(t.from, t.to + 1);
    }
    return all;
  }

  /** Executa uma exportação escolhida no diálogo. */
  async export(o) {
    const p = this.ws.project;
    if (this.ws.floating) this.autosave.float.commit();
    if (o.format === 'project') return this.exportProjectFile();
    const frames = this.framesFor(o.range);
    const name = safeName(p.name);
    const prog = this.progress('Exportando');
    const onProgress = (t) => prog.set(t, `${Math.round(t * 100)}%`);
    try {
      let blob, file;
      if (o.format === 'png') { blob = await exportPng(p, frames[0], o); file = `${name}_${frames[0] + 1}.png`; }
      else if (o.format === 'sequence') { blob = await exportPngSequence(p, { ...o, frames, onProgress }); file = `${name}_quadros.zip`; }
      else if (o.format === 'gif') { blob = await exportGif(p, { ...o, frames, onProgress }); file = `${name}.gif`; }
      else if (o.format === 'sheet') { blob = await exportSheet(p, { ...o, frames }); file = `${name}_sheet.zip`; }
      else if (o.format === 'video') {
        prog.set(0, 'Gravando em tempo real…');
        blob = await exportVideo(p, { ...o, frames, format: o.video, audio: this.audio, onProgress: (t) => prog.set(t, `Gravando… ${Math.round(t * 100)}%`), signal: prog.signal });
        file = `${name}${o.video.ext}`;
      }
      if (prog.signal.aborted || !blob) { this.toast('Exportação cancelada'); return; }
      prog.close();
      await saveBlob(blob, file);
      this.toast(`Exportado: ${file}`);
    } catch (err) {
      console.error(err);
      prog.close();
      this.toast(`Não foi possível exportar: ${err.message || err}`);
    }
  }
}
