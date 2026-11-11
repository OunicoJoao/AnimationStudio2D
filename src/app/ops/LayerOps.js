/**
 * Operações de camada com desfazer: criar, duplicar, excluir, reordenar, mesclar,
 * achatar e alterar propriedades.
 * @module app/ops/LayerOps
 */
import { Layer } from '../../model/Project.js';
import { FnCommand, MacroCommand } from '../../history/History.js';
import { CelSwap, CelEdit } from '../../history/CelPatch.js';
import { cloneCanvas, createCanvas } from '../../render/canvas.js';

export class LayerOps {
  /** @param {import('../Workspace.js').Workspace} ws @param {(m:string)=>void} toast */
  constructor(ws, toast) {
    this.ws = ws;
    this.toast = toast;
  }

  get p() { return this.ws.project; }

  #nextName() {
    const used = new Set(this.p.layers.map((l) => l.name));
    let n = this.p.layers.length + 1;
    while (used.has(`Camada ${n}`)) n++;
    return `Camada ${n}`;
  }

  /** Insere camada (com células opcionais) acima da ativa. */
  #insert(layer, cels, label) {
    const ws = this.ws, p = this.p;
    const at = ws.layerIndex + 1;
    const prev = ws.layerId;
    ws.history.execute(new FnCommand(label, () => {
      p.layers.splice(at, 0, layer);
      for (const [fid, c] of cels) p.setCel(layer.id, fid, c);
      ws.layerId = layer.id;
      p.touchAll();
    }, () => {
      p.layers.splice(p.layerIndex(layer.id), 1);
      for (const [fid] of cels) p.setCel(layer.id, fid, null);
      ws.layerId = prev;
      p.touchAll();
    }, cels.reduce((s, [, c]) => s + c.width * c.height * 4, 512)));
    ws.changed('layers');
  }

  add() { this.#insert(new Layer({ name: this.#nextName() }), [], 'Nova camada'); }

  duplicate() {
    const src = this.ws.layer;
    if (!src) return;
    const copy = new Layer({ ...src.toJSON(), id: undefined, name: `${src.name} (cópia)` });
    const cels = [];
    for (const f of this.p.frames) { const c = this.p.getCel(src.id, f.id); if (c) cels.push([f.id, cloneCanvas(c)]); }
    this.#insert(copy, cels, 'Duplicar camada');
  }

  remove() {
    const ws = this.ws, p = this.p;
    if (p.layers.length <= 1) { this.toast('O projeto precisa de pelo menos uma camada.'); return; }
    const layer = ws.layer, at = ws.layerIndex;
    const cels = p.frames.map((f) => [f.id, p.getCel(layer.id, f.id)]).filter(([, c]) => c);
    ws.history.execute(new FnCommand('Excluir camada', () => {
      p.layers.splice(at, 1);
      for (const [fid] of cels) p.setCel(layer.id, fid, null);
      ws.layerId = p.layers[Math.min(at, p.layers.length - 1)].id;
      p.touchAll();
    }, () => {
      p.layers.splice(at, 0, layer);
      for (const [fid, c] of cels) p.setCel(layer.id, fid, c);
      ws.layerId = layer.id;
      p.touchAll();
    }, cels.reduce((s, [, c]) => s + c.width * c.height * 4, 512)));
    ws.changed('layers');
  }

  /** Move a camada de `from` para `to` (índices). */
  moveTo(from, to) {
    const ws = this.ws, p = this.p;
    to = Math.max(0, Math.min(p.layers.length - 1, to));
    if (from === to || from < 0) return;
    const doMove = (a, b) => { const [l] = p.layers.splice(a, 1); p.layers.splice(b, 0, l); p.touchAll(); };
    ws.history.execute(new FnCommand('Mover camada', () => doMove(from, to), () => doMove(to, from)));
    ws.changed('layers');
  }

  moveUp() { this.moveTo(this.ws.layerIndex, this.ws.layerIndex + 1); }
  moveDown() { this.moveTo(this.ws.layerIndex, this.ws.layerIndex - 1); }

  /** Mescla a camada ativa na de baixo (em todos os quadros). */
  mergeDown() {
    const ws = this.ws, p = this.p;
    const i = ws.layerIndex;
    if (i <= 0) { this.toast('Não há camada abaixo para mesclar.'); return; }
    const top = p.layers[i], bottom = p.layers[i - 1];
    if (bottom.locked) { this.toast('A camada de baixo está bloqueada.'); return; }
    const changes = [];
    for (const f of p.frames) {
      const tc = p.getCel(top.id, f.id);
      if (!tc || !top.visible) continue;
      const bc = p.getCel(bottom.id, f.id);
      const merged = bc ? cloneCanvas(bc) : createCanvas(p.width, p.height);
      const g = merged.getContext('2d');
      g.globalAlpha = top.opacity;
      g.globalCompositeOperation = top.blend || 'source-over';
      g.drawImage(tc, 0, 0);
      changes.push({ layerId: bottom.id, frameId: f.id, before: bc, after: merged });
    }
    const removeTop = this.#removeCmd(top, i);
    ws.history.execute(new MacroCommand('Mesclar para baixo', [new CelSwap(p, changes, 'Mesclar'), removeTop]));
    ws.layerId = bottom.id;
    ws.changed('layers');
  }

  #removeCmd(layer, at) {
    const ws = this.ws, p = this.p;
    const cels = p.frames.map((f) => [f.id, p.getCel(layer.id, f.id)]).filter(([, c]) => c);
    return new FnCommand('Excluir camada', () => {
      p.layers.splice(p.layerIndex(layer.id), 1);
      for (const [fid] of cels) p.setCel(layer.id, fid, null);
      if (ws.layerId === layer.id) ws.layerId = p.layers[Math.max(0, at - 1)].id;
      p.touchAll();
    }, () => {
      p.layers.splice(at, 0, layer);
      for (const [fid, c] of cels) p.setCel(layer.id, fid, c);
      p.touchAll();
    });
  }

  /** Junta todas as camadas visíveis numa só. */
  flatten() {
    const ws = this.ws, p = this.p;
    if (p.layers.length < 2) return;
    const flat = new Layer({ name: 'Achatada' });
    const oldLayers = [...p.layers];
    const oldCels = new Map(p.cels);
    const newCels = [];
    for (let fi = 0; fi < p.frames.length; fi++) {
      const c = createCanvas(p.width, p.height);
      const g = c.getContext('2d');
      for (const l of oldLayers) {
        const cel = p.getCel(l.id, p.frames[fi].id);
        if (!cel || !l.visible) continue;
        g.globalAlpha = l.opacity;
        g.globalCompositeOperation = l.blend || 'source-over';
        g.drawImage(cel, 0, 0);
      }
      newCels.push([p.frames[fi].id, c]);
    }
    const prev = ws.layerId;
    ws.history.execute(new FnCommand('Achatar', () => {
      p.layers = [flat];
      p.cels = new Map(newCels.map(([fid, c]) => [p.key(flat.id, fid), c]));
      for (const [fid] of newCels) p.touch(flat.id, fid);
      ws.layerId = flat.id;
      p.touchAll();
    }, () => {
      p.layers = [...oldLayers];
      p.cels = new Map(oldCels);
      for (const k of oldCels.keys()) p.dirtyCels.add(k);
      ws.layerId = prev;
      p.touchAll();
    }, newCels.length * p.width * p.height * 4));
    ws.changed('layers');
  }

  /** Altera uma propriedade com desfazer (nome, visível, bloqueada, opacidade, mesclagem, trava de alfa). */
  setProp(layerId, key, value, before = undefined) {
    const ws = this.ws, p = this.p, layer = p.layerById(layerId);
    if (!layer) return;
    const old = before === undefined ? layer[key] : before;
    if (old === value) { layer[key] = value; return; }
    const labels = { name: 'Renomear camada', visible: 'Visibilidade', locked: 'Bloquear camada', opacity: 'Opacidade da camada', blend: 'Modo de mesclagem', alphaLock: 'Travar transparência' };
    ws.history.execute(new FnCommand(labels[key] || 'Camada', () => { layer[key] = value; p.touchAll(); }, () => { layer[key] = old; p.touchAll(); }));
    ws.changed('layers');
  }

  /** Mudança ao vivo, sem histórico (arrastando o controle de opacidade). */
  preview(layerId, key, value) {
    const layer = this.p.layerById(layerId);
    if (!layer) return;
    layer[key] = value;
    this.p.touchAll();
    this.ws.changed('layers');
  }

  /** Apaga o conteúdo da camada ativa no quadro ativo (ou só a seleção). */
  clear() {
    const ws = this.ws, p = this.p;
    const cel = p.getCel(ws.layerId, ws.frameId);
    if (!cel || ws.layer.locked) return;
    const sel = ws.selection;
    const edit = new CelEdit(p, ws.layerId, ws.frameId, sel ? sel.bounds : { x: 0, y: 0, w: p.width, h: p.height });
    if (sel) {
      edit.ctx.save();
      edit.ctx.globalCompositeOperation = 'destination-out';
      edit.ctx.drawImage(sel.mask, 0, 0);
      edit.ctx.restore();
    } else edit.ctx.clearRect(0, 0, p.width, p.height);
    const cmd = edit.commit('Limpar');
    if (cmd) ws.history.push(cmd);
  }
}
