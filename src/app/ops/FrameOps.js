/**
 * Operações de quadro e de trechos (tags) com desfazer.
 * @module app/ops/FrameOps
 */
import { Frame, Tag } from '../../model/Project.js';
import { FnCommand } from '../../history/History.js';
import { cloneCanvas } from '../../render/canvas.js';

export const TAG_COLORS = ['#f6cf6e', '#6fae86', '#c9bdf7', '#f08c8c', '#6ec6f0', '#f4a6c4'];

export class FrameOps {
  /** @param {import('../Workspace.js').Workspace} ws @param {(m:string)=>void} toast */
  constructor(ws, toast) {
    this.ws = ws;
    this.toast = toast;
    /** Quadros copiados: [{hold, cels: Map<layerId, canvas>}] */
    this.clipboard = null;
  }

  get p() { return this.ws.project; }

  /** Ajusta os trechos quando quadros entram (+n) ou saem (-n) a partir de `at`. */
  #shiftTags(at, n) {
    for (const t of this.p.tags) {
      if (n > 0) {
        if (t.from >= at) t.from += n;
        if (t.to >= at) t.to += n;
      } else {
        const end = at - n - 1;
        const fix = (v) => (v > end ? v + n : v >= at ? at : v);
        t.from = fix(t.from); t.to = fix(t.to);
      }
    }
    const max = this.p.frames.length - 1;
    this.p.tags = this.p.tags.filter((t) => t.from <= t.to && t.from <= max);
    for (const t of this.p.tags) t.to = Math.min(t.to, max);
  }

  /** Insere quadros (com suas células) na posição `at`. */
  #insertCmd(at, items, label, select = true) {
    const ws = this.ws, p = this.p;
    const prev = ws.frameId, prevRange = ws.range;
    const tagsBefore = p.tags.map((t) => t.toJSON());
    return new FnCommand(label, () => {
      p.frames.splice(at, 0, ...items.map((it) => it.frame));
      for (const it of items) for (const [lid, c] of it.cels) p.setCel(lid, it.frame.id, c);
      this.#shiftTags(at, items.length);
      if (select) { ws.frameId = items[0].frame.id; ws.range = items.length > 1 ? [at, at + items.length - 1] : null; }
      p.touchAll();
    }, () => {
      p.frames.splice(at, items.length);
      for (const it of items) for (const [lid] of it.cels) p.setCel(lid, it.frame.id, null);
      p.tags = tagsBefore.map((t) => new Tag(t));
      ws.frameId = prev; ws.range = prevRange;
      p.touchAll();
    }, items.reduce((s, it) => s + [...it.cels.values()].reduce((a, c) => a + c.width * c.height * 4, 0), 512));
  }

  /** Novo quadro vazio depois do atual. */
  addBlank() {
    const at = this.ws.frameIndex + 1;
    this.ws.history.execute(this.#insertCmd(at, [{ frame: new Frame(), cels: new Map() }], 'Novo quadro'));
    this.ws.changed('frames');
  }

  /** Novo quadro vazio antes do atual. */
  addBlankBefore() {
    const at = this.ws.frameIndex;
    this.ws.history.execute(this.#insertCmd(at, [{ frame: new Frame(), cels: new Map() }], 'Novo quadro'));
    this.ws.changed('frames');
  }

  #copyItems(a, b) {
    const p = this.p, items = [];
    for (let i = a; i <= b; i++) {
      const f = p.frames[i], cels = new Map();
      for (const l of p.layers) { const c = p.getCel(l.id, f.id); if (c) cels.set(l.id, cloneCanvas(c)); }
      items.push({ frame: new Frame({ hold: f.hold }), cels });
    }
    return items;
  }

  /** Duplica os quadros selecionados logo depois deles. */
  duplicate() {
    const [a, b] = this.ws.frameSpan;
    this.ws.history.execute(this.#insertCmd(b + 1, this.#copyItems(a, b), b > a ? 'Duplicar quadros' : 'Duplicar quadro'));
    this.ws.changed('frames');
  }

  remove() {
    const ws = this.ws, p = this.p;
    const [a, b] = ws.frameSpan;
    const n = b - a + 1;
    if (n >= p.frames.length) { this.toast('O projeto precisa de pelo menos um quadro.'); return; }
    const removed = p.frames.slice(a, b + 1).map((f) => ({ frame: f, cels: new Map(p.layers.map((l) => [l.id, p.getCel(l.id, f.id)]).filter(([, c]) => c)) }));
    const tagsBefore = p.tags.map((t) => t.toJSON());
    const prev = ws.frameId, prevRange = ws.range;
    ws.history.execute(new FnCommand(n > 1 ? 'Excluir quadros' : 'Excluir quadro', () => {
      p.frames.splice(a, n);
      for (const it of removed) for (const [lid] of it.cels) p.setCel(lid, it.frame.id, null);
      this.#shiftTags(a, -n);
      ws.frameId = p.frames[Math.min(a, p.frames.length - 1)].id;
      ws.range = null;
      p.touchAll();
    }, () => {
      p.frames.splice(a, 0, ...removed.map((it) => it.frame));
      for (const it of removed) for (const [lid, c] of it.cels) p.setCel(lid, it.frame.id, c);
      p.tags = tagsBefore.map((t) => new Tag(t));
      ws.frameId = prev; ws.range = prevRange;
      p.touchAll();
    }, 512));
    ws.changed('frames');
  }

  /** Move o bloco de quadros selecionado para começar em `to`. */
  moveTo(to) {
    const ws = this.ws, p = this.p;
    const [a, b] = ws.frameSpan;
    const n = b - a + 1;
    to = Math.max(0, Math.min(p.frames.length - n, to));
    if (to === a) return;
    const order = (from, dest) => { const block = p.frames.splice(from, n); p.frames.splice(dest, 0, ...block); };
    ws.history.execute(new FnCommand(n > 1 ? 'Mover quadros' : 'Mover quadro', () => {
      order(a, to); ws.range = n > 1 ? [to, to + n - 1] : null; p.touchAll();
    }, () => {
      order(to, a); ws.range = n > 1 ? [a, b] : null; p.touchAll();
    }));
    ws.changed('frames');
  }

  moveLeft() { this.moveTo(this.ws.frameSpan[0] - 1); }
  moveRight() { this.moveTo(this.ws.frameSpan[0] + 1); }

  reverse() {
    const ws = this.ws, p = this.p;
    let [a, b] = ws.frameSpan;
    if (a === b) { a = 0; b = p.frames.length - 1; }
    const rev = () => { const part = p.frames.slice(a, b + 1).reverse(); p.frames.splice(a, part.length, ...part); p.touchAll(); };
    ws.history.execute(new FnCommand('Inverter quadros', rev, rev));
    ws.changed('frames');
  }

  /** Define por quantos tempos os quadros selecionados ficam na tela. */
  setHold(hold) {
    const ws = this.ws, p = this.p;
    const [a, b] = ws.frameSpan;
    const frames = p.frames.slice(a, b + 1);
    const before = frames.map((f) => f.hold);
    const h = Math.max(1, Math.min(48, Math.round(hold)));
    if (before.every((v) => v === h)) return;
    ws.history.execute(new FnCommand('Duração do quadro', () => { frames.forEach((f) => (f.hold = h)); p.revision++; }, () => { frames.forEach((f, i) => (f.hold = before[i])); p.revision++; }));
    ws.changed('frames');
  }

  holdBy(d) { this.setHold((this.ws.frame?.hold || 1) + d); }

  setFps(fps) {
    const ws = this.ws, p = this.p, old = p.fps;
    const v = Math.max(1, Math.min(60, Math.round(fps)));
    if (v === old) return;
    ws.history.execute(new FnCommand('Velocidade', () => { p.fps = v; p.revision++; }, () => { p.fps = old; p.revision++; }));
    ws.changed('frames');
  }

  copy() {
    const [a, b] = this.ws.frameSpan;
    this.clipboard = this.#copyItems(a, b);
    this.toast(this.clipboard.length > 1 ? `${this.clipboard.length} quadros copiados` : 'Quadro copiado');
  }

  paste() {
    if (!this.clipboard) { this.toast('Copie um quadro primeiro.'); return; }
    const p = this.p;
    const ids = new Set(p.layers.map((l) => l.id));
    // cada colagem precisa de células novas
    const items = this.clipboard.map((it) => ({
      frame: new Frame({ hold: it.frame.hold }),
      cels: new Map([...it.cels].filter(([lid]) => ids.has(lid)).map(([lid, c]) => [lid, cloneCanvas(c)])),
    }));
    this.ws.history.execute(this.#insertCmd(this.ws.frameSpan[1] + 1, items, 'Colar quadros'));
    this.ws.changed('frames');
  }

  /* ---- trechos (tags) ---- */

  #tagsCmd(label, mutate) {
    const p = this.p;
    const before = p.tags.map((t) => t.toJSON());
    mutate();
    const after = p.tags.map((t) => t.toJSON());
    p.tags = before.map((t) => new Tag(t));
    this.ws.history.execute(new FnCommand(label, () => { p.tags = after.map((t) => new Tag(t)); p.revision++; }, () => { p.tags = before.map((t) => new Tag(t)); p.revision++; }));
    this.ws.changed('tags');
  }

  addTag({ name, from, to, dir = 'forward', color }) {
    const c = color || TAG_COLORS[this.p.tags.length % TAG_COLORS.length];
    this.#tagsCmd('Novo trecho', () => this.p.tags.push(new Tag({ name, from, to, dir, color: c })));
  }

  updateTag(id, values) {
    this.#tagsCmd('Editar trecho', () => { const t = this.p.tags.find((x) => x.id === id); if (t) Object.assign(t, values); });
  }

  removeTag(id) {
    this.#tagsCmd('Excluir trecho', () => { this.p.tags = this.p.tags.filter((t) => t.id !== id); });
  }
}
