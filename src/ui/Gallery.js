/**
 * Tela inicial: meus projetos (miniaturas), criar, importar e gerenciar.
 * @module ui/Gallery
 */
import { h, icon, iconButton, clear } from './dom.js';
import { confirmDialog, promptDialog } from './feedback.js';
import { pickFiles } from '../io/files.js';

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }) : null;
function when(t) {
  const d = (t - Date.now()) / 1000;
  const abs = Math.abs(d);
  if (!rtf) return new Date(t).toLocaleDateString('pt-BR');
  if (abs < 60) return 'agora mesmo';
  if (abs < 3600) return rtf.format(Math.round(d / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(d / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(d / 86400), 'day');
  return new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export class Gallery {
  constructor(root, { files, menu, toast, commands, theme, install }) {
    Object.assign(this, { root, files, menu, toast, commands, theme, install });
    this.urls = [];
    this.#build();
    theme.onChange(() => this.#renderTheme());
    install.on('change', () => this.#renderInstall());
  }

  #build() {
    this.themeBtn = iconButton('sun', 'Tema', () => this.theme.cycle());
    this.installBtn = h('button.btn', { type: 'button', hidden: true, onclick: () => this.install.prompt() }, icon('install', 18), h('span', 'Instalar app'));
    this.grid = h('div.gal-grid', { role: 'list' });
    this.countEl = h('span.gal-count');
    this.usageEl = h('p.gal-usage');
    this.root.append(
      h('header.gal-head',
        h('div.brand',
          h('img.mascot', { src: 'icons/mascot.png', alt: '', width: 64, height: 64 }),
          h('div', h('h1.wordmark', 'AnimationStudio'), h('p.tagline', 'Desenhe, anime quadro a quadro e exporte em vídeo ou GIF.'))),
        h('div.gal-actions',
          this.installBtn,
          h('button.btn', { type: 'button', onclick: () => this.#import() }, icon('upload', 18), h('span', 'Abrir arquivo')),
          iconButton('help', 'Gestos e atalhos', () => this.commands.run('gestures')),
          this.themeBtn)),
      h('main.gal-main',
        h('div.gal-title', h('h2', 'Meus projetos'), this.countEl),
        this.grid,
        this.usageEl));
    this.#renderTheme();
    this.#renderInstall();
  }

  #renderTheme() {
    const m = this.theme.mode;
    clear(this.themeBtn).append(icon(m === 'dark' ? 'moon' : m === 'light' ? 'sun' : 'monitor'));
    this.themeBtn.title = { dark: 'Tema escuro', light: 'Tema claro', system: 'Tema do sistema' }[m] + ' (clique para trocar)';
  }

  #renderInstall() { this.installBtn.hidden = !this.install.available; }

  async render() {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    let list = [];
    try { list = await this.files.list(); } catch (e) { this.toast(e.message); }
    clear(this.grid);
    this.countEl.textContent = list.length ? `${list.length} ${list.length === 1 ? 'projeto' : 'projetos'}` : '';
    this.grid.append(h('button.card.card-new', { type: 'button', onclick: () => this.commands.run('newProject') },
      h('span.card-new-ic', icon('plus', 34)), h('span.card-new-label', 'Novo projeto')));
    if (!list.length) {
      this.grid.append(h('div.gal-empty', h('p', h('b', 'Nenhum projeto ainda.'), ' Crie o primeiro ou solte aqui um arquivo .as2d, imagens ou um GIF.')));
    }
    for (const m of list) this.grid.append(this.#card(m));
    const est = await this.files.store.usage();
    this.usageEl.textContent = est?.usage ? `Usando ${(est.usage / 1048576).toFixed(1)} MB do aparelho` : '';
  }

  #card(m) {
    const url = m.thumb ? URL.createObjectURL(m.thumb) : null;
    if (url) this.urls.push(url);
    const open = () => this.commands.run('openProject', m.id);
    const card = h('article.card', { role: 'listitem' },
      h('button.card-thumb', { type: 'button', onclick: open, 'aria-label': `Abrir ${m.name}` },
        h('span.thumb-box', { style: { '--ar': String(m.width / m.height) } }, url ? h('img', { src: url, alt: '', loading: 'lazy' }) : null)),
      h('div.card-body',
        h('div.card-text',
          h('h3.card-name', m.name),
          h('p.card-meta', `${m.width}×${m.height} · ${m.frames} ${m.frames === 1 ? 'quadro' : 'quadros'} · ${m.fps} fps`),
          h('p.card-when', `Editado ${when(m.modified)}`)),
        iconButton('more', `Opções de ${m.name}`, (e) => this.#cardMenu(e.currentTarget, m))));
    return card;
  }

  #cardMenu(btn, m) {
    this.menu.open(btn, [
      { label: 'Abrir', icon: 'folder', run: () => this.commands.run('openProject', m.id) },
      { label: 'Renomear', icon: 'text', run: async () => { const n = await promptDialog('Renomear projeto', 'Nome', m.name); if (n) { await this.files.rename(m.id, n); this.render(); } } },
      { label: 'Duplicar', icon: 'duplicate', run: async () => { await this.files.duplicate(m.id); this.render(); this.toast('Projeto duplicado'); } },
      { label: 'Baixar arquivo .as2d', icon: 'download', run: () => this.files.exportProjectFile(m.id) },
      '-',
      { label: 'Excluir', icon: 'trash', danger: true, run: async () => {
        if (await confirmDialog('Excluir projeto', `"${m.name}" será apagado deste aparelho. Isso não pode ser desfeito.`, { ok: 'Excluir', danger: true })) {
          await this.files.remove(m.id);
          this.render();
          this.toast('Projeto excluído');
        }
      } },
    ]);
  }

  async #import() {
    const files = await pickFiles('.as2d,image/*', true);
    if (files.length) this.commands.run('openFiles', files);
  }
}
