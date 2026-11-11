/**
 * Faixa de áudio do projeto: decodifica, toca em sincronia com a reprodução,
 * desenha a forma de onda e fornece o fluxo para a exportação de vídeo.
 * @module app/AudioTrack
 */
export class AudioTrack {
  constructor() {
    this.ctx = null;
    this.buffer = null;
    this.source = null;
    this.gain = null;
    this.blobRef = null;
    this.peaks = null;
  }

  #context() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    return this.ctx;
  }

  /** Decodifica o áudio do projeto (se mudou). */
  async load(project) {
    const a = project?.audio;
    if (!a) { this.buffer = null; this.blobRef = null; this.peaks = null; return; }
    if (this.blobRef === a.blob && this.buffer) return;
    const ctx = this.#context();
    if (!ctx) return;
    const buf = await a.blob.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(buf);
    this.blobRef = a.blob;
    this.peaks = computePeaks(this.buffer, 2000);
  }

  get duration() { return this.buffer ? this.buffer.duration : 0; }

  /**
   * Toca a partir do tempo da animação `t` (segundos), aplicando o deslocamento do projeto.
   * @param {number} t
   * @param {import('../model/Project.js').Project} project
   * @param {AudioNode} [dest]  destino alternativo (exportação de vídeo)
   */
  play(t, project, dest = null) {
    this.stop();
    if (!this.buffer || !project.audio) return;
    const ctx = this.#context();
    if (ctx.state === 'suspended') ctx.resume();
    const offset = project.audio.offset || 0;
    const startAt = t - offset;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    const gain = ctx.createGain();
    gain.gain.value = project.audio.volume ?? 1;
    src.connect(gain).connect(dest || ctx.destination);
    if (startAt >= 0) {
      if (startAt >= this.buffer.duration) return;
      src.start(0, startAt);
    } else {
      src.start(ctx.currentTime - startAt, 0);
    }
    this.source = src;
    this.gain = gain;
  }

  stop() {
    try { this.source?.stop(); } catch { /* já parou */ }
    this.source?.disconnect();
    this.source = null;
  }

  /** Destino de gravação (MediaStream) para exportar vídeo com som. */
  createStreamDestination() {
    const ctx = this.#context();
    if (!ctx || !ctx.createMediaStreamDestination) return null;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx.createMediaStreamDestination();
  }
}

/** Picos absolutos por bloco, para desenhar a forma de onda. */
export function computePeaks(buffer, n) {
  const data = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / n));
  const peaks = new Float32Array(Math.ceil(data.length / block));
  for (let i = 0; i < peaks.length; i++) {
    let m = 0;
    const end = Math.min(data.length, (i + 1) * block);
    for (let j = i * block; j < end; j += 4) { const v = Math.abs(data[j]); if (v > m) m = v; }
    peaks[i] = m;
  }
  return peaks;
}
