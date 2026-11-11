/**
 * Linha do tempo: controles de reprodução, faixa de miniaturas dos quadros (arrastar
 * para reordenar, Shift para selecionar vários), trechos coloridos e forma de onda do áudio.
 * @module ui/Timeline
 */
import { h, icon, iconButton, clear, drag } from './dom.js';
import { debounce } from '../core/debounce.js';

export class Timeline {
  constructor(root, { ws, frames, thumbs, commands, menu, playback, settings, audio }) {
    Object.assign(this, { root, ws, frames, thumbs, commands, menu, playback, settings, audio });
    this.cards = [];
    this.#build();
    this.refreshCurrent = debounce(() => this.#refreshThumb(this.ws.frameIndex), 90);
    ws.on('change', ({ kind }) => {
      if (kind === 'pixels') return this.refreshCurrent();
      if (kind === 'playhead' || kind === 'active') return this.#markActive();
      if (kind === 'selection' || kind === 'floating' || kind === 'palette') return;
      this.render();
    });
    playback.on('change', () => this.#renderControls());
    settings.on('change', ({ path }) => { if (path.startsWith('onion')) this.#renderControls(); });
    this.render();
  }

  #build() {
    const c = this.commands;
    this.playBtn = h('button.play', { type: 'button', title: 'Reproduzir (Enter)', 'aria-label': 'Reproduzir', onclick: () => c.run('play') }, icon('play', 22));
    this.fpsInput = h('input.num', { type: 'number', min: 1, max: 60, 'aria-label': 'Quadros por segundo', onchange: () => this.frames.setFps(+this.fpsInput.value || 12) });
    this.onionBtn = h('button.chip', { type: 'button', title: 'Onion skin: ver os quadros vizinhos (O)', onclick: () => c.run('onion'), oncontextmenu: (e) => { e.preventDefault(); c.run('onionSettings'); } }, icon('onion', 18), h('span', 'Onion'));
    this.loopBtn = h('button.chip', { type: 'button', title: 'Repetir em laço', onclick: () => c.run('loop') }, icon('loop', 18), h('span.only-wide', 'Laço'));
    this.infoEl = h('span.tl-info', { 'aria-live': 'polite' });
    this.controls = h('div.tl-controls',
      h('div.pill-group',
        iconButton('first', 'Primeiro quadro (Home)', () => c.run('frameFirst')),
        iconButton('prev', 'Quadro anterior (,)', () => c.run('framePrev')),
        this.playBtn,
        iconButton('next', 'Próximo quadro (.)', () => c.run('frameNext')),
        iconButton('last', 'Último quadro (End)', () => c.run('frameLast'))),
      h('label.fps', h('span', 'FPS'), this.fpsInput),
      this.onionBtn, this.loopBtn,
      h('div.tl-spacer'),
      this.infoEl,
      h('div.pill-group',
        iconButton('frameAdd', 'Novo quadro (N)', () => c.run('frameNew')),
        iconButton('frameDup', 'Duplicar quadro (Shift+D)', () => c.run('frameDuplicate')),
        iconButton('trash', 'Excluir quadro', () => c.run('frameDelete')),
        iconButton('more', 'Mais ações de quadro', (e) => this.#frameMenu(e.currentTarget))));
    this.tagsEl = h('div.tl-tags');
    this.strip = h('div.tl-strip', { role: 'listbox', 'aria-label': 'Quadros', 'aria-orientation': 'horizontal' });
    this.audioCanvas = h('canvas.tl-audio', { hidden: true, 'aria-label': 'Forma de onda do áudio', onclick: () => c.run('audioSettings') });
    this.track = h('div.tl-track', this.tagsEl, this.strip, this.audioCanvas);
    this.scroller = h('div.tl-scroll', this.track);
    this.root.append(this.controls, this.scroller);
  }

  #renderControls() {
    const p = this.ws.project;
    if (!p) return;
    const playing = this.playback.playing;
    clear(this.playBtn).append(icon(playing ? 'pause' : 'play', 22));
    this.playBtn.title = playing ? 'Pausar (Enter)' : 'Reproduzir (Enter)';
    this.playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproduzir');
    this.playBtn.classList.toggle('on', playing);
    if (document.activeElement !== this.fpsInput) this.fpsInput.value = p.fps;
    this.onionBtn.classList.toggle('on', !!this.settings.get('onion.on'));
    this.onionBtn.setAttribute('aria-pressed', String(!!this.settings.get('onion.on')));
    this.loopBtn.classList.toggle('on', p.loop);
    this.loopBtn.setAttribute('aria-pressed', String(p.loop));
  }

  /** Largura dos cartões segundo a proporção do projeto. */
  #cardSize() {
    const p = this.ws.project;
    const hgt = this.root.clientWidth < 700 ? 48 : 60;
    return { w: Math.round(Math.max(36, Math.min(120, (hgt * p.width) / p.height))), h: hgt };
  }

  render() {
    const p = this.ws.project;
    if (!p) return;
    this.#renderControls();
    clear(this.strip);
    this.cards = [];
    const { w, h: hh } = this.#cardSize();
    this.cardW = w;
    this.root.style.setProperty('--card-w', `${w}px`);
    this.root.style.setProperty('--card-h', `${hh}px`);
    p.frames.forEach((f, i) => {
      const card = h('div.frame', {
        role: 'option', tabindex: -1, dataset: { i },
        title: `Quadro ${i + 1}${f.hold > 1 ? ` · fica ${f.hold} tempos` : ''}`,
        oncontextmenu: (e) => { e.preventDefault(); if (!this.#inRange(i)) this.ws.setFrameIndex(i); this.#frameMenu({ x: e.clientX, y: e.clientY }); },
        ondblclick: () => this.commands.run('frameHold'),
      },
      h('span.frame-img', this.thumbs.frame(p, i, hh * 2)),
      h('span.frame-n', String(i + 1)),
      f.hold > 1 ? h('span.frame-hold', `×${f.hold}`) : null);
      this.#makeDraggable(card, i);
      this.cards.push(card);
      this.strip.append(card);
    });
    this.strip.append(h('button.frame-add', { type: 'button', title: 'Novo quadro vazio no fim', 'aria-label': 'Novo quadro no fim', onclick: () => { this.ws.setFrameIndex(p.frames.length - 1); this.commands.run('frameNew'); } }, icon('plus', 22)));
    this.#renderTags();
    this.#renderAudio();
    this.#markActive();
  }

  #inRange(i) {
    const r = this.ws.range;
    return r && i >= Math.min(...r) && i <= Math.max(...r);
  }

  #refreshThumb(i) {
    const p = this.ws.project;
    if (!p || !this.cards[i]) return;
    const c = this.thumbs.frame(p, i, (this.root.clientWidth < 700 ? 48 : 60) * 2);
    const box = this.cards[i].querySelector('.frame-img');
    if (box.firstChild !== c) clear(box).append(c);
  }

  #markActive() {
    const p = this.ws.project;
    if (!p) return;
    const cur = this.ws.frameIndex;
    const [a, b] = this.ws.range ? this.ws.frameSpan : [-1, -1];
    this.cards.forEach((c, i) => {
      c.classList.toggle('on', i === cur);
      c.classList.toggle('in-range', i >= a && i <= b);
      c.setAttribute('aria-selected', String(i === cur));
    });
    const card = this.cards[cur];
    if (card) {
      const sr = this.scroller.getBoundingClientRect(), cr = card.getBoundingClientRect();
      if (cr.left < sr.left + 8 || cr.right > sr.right - 8) this.scroller.scrollLeft += cr.left - sr.left - sr.width / 2 + cr.width / 2;
    }
    const t = (p.frameStartMs(cur) / 1000).toFixed(2);
    this.infoEl.textContent = `${cur + 1} / ${p.frames.length} · ${t}s`;
    if (this.ws.range) this.infoEl.textContent += ` · ${b - a + 1} selecionados`;
  }

  #makeDraggable(card, i) {
    let target = i, step = 0;
    drag(card, {
      threshold: 8,
      start: () => {
        step = card.getBoundingClientRect().width + 8;
        target = i;
      },
      move: (e, dx) => {
        if (!this.#inRange(i) && this.ws.frameIndex !== i) this.ws.setFrameIndex(i);
        card.classList.add('dragging');
        card.style.transform = `translateX(${dx}px)`;
        target = i + Math.round(dx / step);
      },
      end: (e, moved) => {
        card.classList.remove('dragging');
        card.style.transform = '';
        if (!moved) {
          if (this.playback.playing) this.playback.stop();
          this.ws.setFrameIndex(i, e.shiftKey);
          return;
        }
        const [a] = this.ws.frameSpan;
        if (target !== i) this.frames.moveTo(a + (target - i));
      },
    });
  }

  #renderTags() {
    const p = this.ws.project;
    clear(this.tagsEl);
    this.tagsEl.hidden = !p.tags.length;
    const unit = this.cardW + 8;
    for (const t of p.tags) {
      this.tagsEl.append(h('button.tag', {
        type: 'button', title: `Trecho "${t.name}" (quadros ${t.from + 1}–${t.to + 1}) — clique para editar`,
        style: { left: `${t.from * unit}px`, width: `${(t.to - t.from + 1) * unit - 8}px`, '--tag': t.color },
        onclick: () => this.commands.run('tagEdit', t.id),
      }, t.name));
    }
  }

  #renderAudio() {
    const p = this.ws.project, cv = this.audioCanvas;
    const peaks = this.audio.peaks;
    cv.hidden = !p.audio || !peaks;
    if (cv.hidden) return;
    const unit = this.cardW + 8;
    const w = p.frames.length * unit, hgt = 28;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr);
    cv.style.width = `${w}px`; cv.style.height = `${hgt}px`;
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    const dur = this.audio.duration, off = p.audio.offset || 0;
    const color = getComputedStyle(this.root).getPropertyValue('--sage').trim() || '#6fae86';
    g.fillStyle = color;
    p.frames.forEach((f, i) => {
      const t0 = p.frameStartMs(i) / 1000 - off, t1 = t0 + p.frameDurationMs(i) / 1000;
      for (let x = 0; x < unit - 2; x++) {
        const t = t0 + ((t1 - t0) * x) / unit;
        if (t < 0 || t > dur) continue;
        const v = peaks[Math.min(peaks.length - 1, Math.floor((t / dur) * peaks.length))] || 0;
        const bh = Math.max(1, v * (hgt - 4));
        g.fillRect(i * unit + x, (hgt - bh) / 2, 1, bh);
      }
    });
  }

  #frameMenu(anchor) {
    this.menu.open(anchor, ['frameNew', 'frameNewBefore', 'frameDuplicate', 'frameDelete', '-', 'frameCopy', 'framePaste', '-', 'frameLeft', 'frameRight', 'frameReverse', '-', 'frameHold', 'holdMore', 'holdLess', '-', 'tagNew', 'selectAllFrames', 'importAudio'].map((id) => (id === '-' ? '-' : { cmd: id })));
  }
}
