/**
 * Reprodução da animação respeitando fps, duração de cada quadro, laço e trechos
 * (para frente, ao contrário, pingue-pongue). Sincroniza o áudio, se houver.
 * @module app/Playback
 */
import { Emitter } from '../core/Emitter.js';

/** Ordem dos quadros de um trecho de acordo com a direção. Puro, testável. */
export function playOrder(from, to, dir) {
  const fwd = [];
  for (let i = from; i <= to; i++) fwd.push(i);
  if (dir === 'reverse') return fwd.reverse();
  if (dir === 'pingpong') return fwd.length > 2 ? fwd.concat(fwd.slice(1, -1).reverse()) : fwd;
  return fwd;
}

export class Playback extends Emitter {
  /**
   * @param {import('./Workspace.js').Workspace} ws
   * @param {import('./AudioTrack.js').AudioTrack} audio
   */
  constructor(ws, audio) {
    super();
    this.ws = ws;
    this.audio = audio;
    this.playing = false;
    this.timer = null;
  }

  /** Trecho que contém o quadro atual, se houver. */
  activeTag() {
    const p = this.ws.project, i = this.ws.frameIndex;
    return p.tags.find((t) => i >= t.from && i <= t.to) || null;
  }

  toggle() { this.playing ? this.stop() : this.play(); }

  play() {
    const ws = this.ws, p = ws.project;
    if (!p || this.playing || p.frames.length < 1) return;
    const tag = this.activeTag();
    let from = 0, to = p.frames.length - 1, dir = 'forward';
    if (ws.range) [from, to] = ws.frameSpan;
    else if (tag) ({ from, to, dir } = tag);
    this.order = playOrder(from, to, dir);
    let pos = this.order.indexOf(ws.frameIndex);
    if (pos < 0) pos = 0;
    // se estiver no último quadro, recomeça do início
    if (!p.loop && pos === this.order.length - 1) pos = 0;
    this.pos = pos;
    this.startFrame = ws.frameIndex;
    this.playing = true;
    this.savedRange = ws.range;
    this.emit('change', true);
    this.#show();
    if (!tag && !ws.range && dir === 'forward') this.audio?.play(p.frameStartMs(this.order[pos]) / 1000, p);
    this.#schedule();
  }

  #show() {
    const ws = this.ws;
    const i = this.order[this.pos];
    ws.frameId = ws.project.frames[i].id;
    ws.range = this.savedRange;
    ws.changed('playhead');
  }

  #schedule() {
    const p = this.ws.project;
    const i = this.order[this.pos];
    this.timer = setTimeout(() => {
      if (!this.playing) return;
      this.pos++;
      if (this.pos >= this.order.length) {
        if (!p.loop) { this.stop(); return; }
        this.pos = 0;
        if (this.order[0] === 0 && !this.savedRange) this.audio?.play(0, p);
      }
      this.#show();
      this.#schedule();
    }, p.frameDurationMs(i));
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearTimeout(this.timer);
    this.audio?.stop();
    this.emit('change', false);
    this.ws.changed('active');
  }
}
