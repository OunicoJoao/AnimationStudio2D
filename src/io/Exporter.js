/**
 * Exportação: PNG, sequência PNG (.zip), GIF animado, folha de sprites e vídeo.
 * @module io/Exporter
 */
import { renderFrame } from '../render/Compositor.js';
import { canvasToBlob, createCanvas } from '../render/canvas.js';
import { zipStore } from './zip.js';
import { encodeGif } from './gif.js';

/**
 * @typedef {object} ExportOptions
 * @property {number} [scale=1]
 * @property {boolean} [background=true]  incluir a cor do papel
 * @property {number[]} frames  índices dos quadros
 */

const pad = (n, w) => String(n).padStart(w, '0');

export async function exportPng(project, frameIndex, { scale = 1, background = true } = {}) {
  return canvasToBlob(renderFrame(project, frameIndex, { scale, background }));
}

export async function exportPngSequence(project, { frames, scale = 1, background = true, onProgress = () => {} }) {
  const files = [];
  const digits = String(frames.length).length < 3 ? 3 : String(frames.length).length;
  for (let n = 0; n < frames.length; n++) {
    const blob = await canvasToBlob(renderFrame(project, frames[n], { scale, background }));
    files.push({ name: `${safeName(project.name)}_${pad(n + 1, digits)}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    onProgress((n + 1) / frames.length);
  }
  return new Blob([zipStore(files)], { type: 'application/zip' });
}

export async function exportGif(project, { frames, scale = 1, background = true, dither = true, onProgress = () => {} }) {
  const tmp = createCanvas(1, 1);
  const data = [];
  for (let n = 0; n < frames.length; n++) {
    const c = renderFrame(project, frames[n], { scale, background, target: tmp });
    data.push({ data: c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data, delay: project.frameDurationMs(frames[n]) });
    onProgress(0.3 * (n + 1) / frames.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  const w = tmp.width, h = tmp.height;
  const bytes = await encodeGif(data, w, h, { dither, loop: project.loop, onProgress: (t) => onProgress(0.3 + 0.7 * t) });
  return new Blob([bytes], { type: 'image/gif' });
}

/** Folha de sprites + JSON (formato compatível com leitores de spritesheet comuns). */
export async function exportSheet(project, { frames, scale = 1, background = false, columns = 0, padding = 0 }) {
  const fw = Math.round(project.width * scale), fh = Math.round(project.height * scale);
  const cols = columns > 0 ? columns : Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / cols);
  const sheet = createCanvas(cols * (fw + padding) - padding, rows * (fh + padding) - padding);
  const g = sheet.getContext('2d');
  const json = { frames: [], meta: { app: 'AnimationStudio 2D', image: `${safeName(project.name)}.png`, size: { w: sheet.width, h: sheet.height }, scale: '1', frameTags: [] } };
  frames.forEach((fi, n) => {
    const x = (n % cols) * (fw + padding), y = Math.floor(n / cols) * (fh + padding);
    g.drawImage(renderFrame(project, fi, { scale, background }), x, y);
    json.frames.push({ filename: `${pad(n, 3)}`, frame: { x, y, w: fw, h: fh }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: fw, h: fh }, sourceSize: { w: fw, h: fh }, duration: Math.round(project.frameDurationMs(fi)) });
  });
  json.meta.frameTags = project.tags.map((t) => ({ name: t.name, from: frames.indexOf(t.from), to: frames.indexOf(t.to), direction: t.dir })).filter((t) => t.from >= 0 && t.to >= 0);
  const png = await canvasToBlob(sheet);
  const files = [
    { name: `${safeName(project.name)}.png`, data: new Uint8Array(await png.arrayBuffer()) },
    { name: `${safeName(project.name)}.json`, data: new TextEncoder().encode(JSON.stringify(json, null, 2)) },
  ];
  return new Blob([zipStore(files)], { type: 'application/zip' });
}

/** Formatos de vídeo que este navegador consegue gravar. */
export function videoFormats() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return [];
  const list = [
    { id: 'mp4', label: 'MP4 (H.264)', mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: '.mp4' },
    { id: 'mp4b', label: 'MP4', mime: 'video/mp4', ext: '.mp4' },
    { id: 'webm9', label: 'WebM (VP9)', mime: 'video/webm;codecs=vp9,opus', ext: '.webm' },
    { id: 'webm', label: 'WebM', mime: 'video/webm', ext: '.webm' },
  ];
  const ok = list.filter((f) => MediaRecorder.isTypeSupported(f.mime));
  // não mostra duas opções do mesmo contêiner
  const seen = new Set();
  return ok.filter((f) => { const k = f.ext; if (seen.has(k)) return false; seen.add(k); return true; });
}

/**
 * Grava vídeo em tempo real tocando a animação num canvas (com áudio, se houver).
 * @param {import('../model/Project.js').Project} project
 * @param {object} o
 * @param {number[]} o.frames
 * @param {{mime:string}} o.format
 * @param {number} [o.loops=1]  quantas vezes repetir
 * @param {import('../app/AudioTrack.js').AudioTrack} [o.audio]
 */
export async function exportVideo(project, { frames, scale = 1, format, loops = 1, audio = null, onProgress = () => {}, signal = null }) {
  // vídeo exige dimensões pares
  const w = Math.max(2, Math.round(project.width * scale / 2) * 2), h = Math.max(2, Math.round(project.height * scale / 2) * 2);
  const out = createCanvas(w, h);
  const g = out.getContext('2d');
  const tmp = createCanvas(1, 1);
  const draw = (fi) => {
    const c = renderFrame(project, fi, { scale, background: true, target: tmp });
    g.fillStyle = project.background || '#ffffff';
    g.fillRect(0, 0, w, h);
    g.drawImage(c, 0, 0, w, h);
  };
  draw(frames[0]);
  const stream = out.captureStream(0);
  const track = stream.getVideoTracks()[0];
  let dest = null;
  const withAudio = audio && audio.buffer && project.audio;
  if (withAudio) {
    dest = audio.createStreamDestination();
    if (dest) for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
  }
  const rec = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: Math.min(16e6, w * h * project.fps * 0.25) });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start(250);
  const seq = [];
  for (let l = 0; l < loops; l++) seq.push(...frames);
  const total = seq.reduce((s, fi) => s + project.frameDurationMs(fi), 0);
  if (withAudio && dest) audio.play(project.frameStartMs(frames[0]) / 1000, project, dest);
  const t0 = performance.now();
  let elapsed = 0;
  for (let n = 0; n < seq.length; n++) {
    if (signal?.aborted) break;
    draw(seq[n]);
    track.requestFrame?.();
    elapsed += project.frameDurationMs(seq[n]);
    const wait = t0 + elapsed - performance.now();
    onProgress(elapsed / total);
    await new Promise((r) => setTimeout(r, Math.max(0, wait)));
  }
  track.requestFrame?.();
  audio?.stop();
  rec.stop();
  await stopped;
  track.stop();
  if (signal?.aborted) return null;
  return new Blob(chunks, { type: format.mime.split(';')[0] });
}

export function safeName(s) {
  return (String(s || 'animacao').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'animacao').slice(0, 60);
}
