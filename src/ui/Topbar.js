/**
 * Barra superior do editor: voltar à galeria, nome do projeto, menus e ações rápidas.
 * @module ui/Topbar
 */
import { h, icon, iconButton, clear } from './dom.js';

/** Estrutura dos menus (ids de comandos). */
export const MENUS = [
  ['Arquivo', ['newProject', 'saveNow', 'duplicateProject', '-', 'openFile', 'importImageLayer', 'importFrames', 'importAudio', '-', 'export', 'exportProject', '-', 'renameProject', 'closeProject']],
  ['Editar', ['undo', 'redo', '-', 'cut', 'copy', 'copyMerged', 'paste', 'clear', 'fillSelection', '-', 'transform', 'flipSelH', 'flipSelV', '-', 'preferences']],
  ['Seleção', ['selectAll', 'deselect', 'invertSelection', '-', 'toolSelect', 'toolWand']],
  ['Imagem', ['resizeImage', 'canvasSize', 'paperColor', '-', 'rotateCW', 'rotateCCW', 'rotate180', 'flipH', 'flipV', '-', 'cropToSelection', 'trim', '-', 'adjustBrightness', 'adjustHue', 'filterBlur', 'filterOutline', 'filterInvert', 'filterGray']],
  ['Camada', ['layerNew', 'layerDuplicate', 'layerDelete', '-', 'layerUp', 'layerDown', 'layerMerge', 'flatten', '-', 'layerVisible', 'layerLock', 'layerAlphaLock', 'layerProps']],
  ['Quadro', ['frameNew', 'frameNewBefore', 'frameDuplicate', 'frameDelete', '-', 'frameCopy', 'framePaste', '-', 'frameLeft', 'frameRight', 'frameReverse', '-', 'frameHold', 'holdMore', 'holdLess', 'fps', '-', 'tagNew', 'play', 'loop']],
  ['Ver', ['zoomIn', 'zoomOut', 'zoomFit', 'zoom100', '-', 'rotateViewLeft', 'rotateViewRight', 'rotateViewReset', 'flipView', '-', 'onion', 'onionSettings', 'grid', 'gridSettings', 'symmetryToggle', '-', 'previewWindow', 'toggleSidePanel', 'toggleTimeline', 'fullscreen', '-', 'theme', 'penOnly', 'leftHanded']],
  ['Ajuda', ['shortcuts', 'gestures', 'install', 'about']],
];

export class Topbar {
  /**
   * @param {HTMLElement} root
   * @param {object} deps
   */
  constructor(root, { commands, menu, ws, autosave, theme }) {
    Object.assign(this, { root, commands, menu, ws, autosave, theme });
    this.#build();
    ws.on('change', ({ kind }) => { if (kind === 'project' || kind === 'meta' || kind === 'all') this.renderName(); });
    ws.on('history', () => this.renderHistory());
    autosave.on('status', (s) => this.renderSave(s));
    theme.onChange(() => this.renderTheme());
  }

  #build() {
    const c = this.commands;
    this.nameBtn = h('button.proj-name', { type: 'button', title: 'Renomear projeto', onclick: () => c.run('renameProject') });
    this.saveEl = h('span.save-state', { 'aria-live': 'polite' });
    this.menuBtns = MENUS.map(([label, items], i) => h('button.menu-btn', {
      type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
      onclick: (e) => this.#toggleMenu(i, e.currentTarget),
      onpointerenter: (e) => { if (this.menu.isOpen && this.openIndex !== i && this.openIndex != null) this.#openMenu(i, e.currentTarget); },
      onkeydown: (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); this.#openMenu(i, e.currentTarget, true); } },
    }, label));
    this.menu.emitNav = (d) => {
      const i = ((this.openIndex ?? 0) + d + MENUS.length) % MENUS.length;
      this.#openMenu(i, this.menuBtns[i], true);
    };
    this.compactMenu = iconButton('menu', 'Menu', (e) => this.#compactMenu(e.currentTarget), 'only-compact');
    this.undoBtn = iconButton('undo', 'Desfazer (Ctrl+Z)', () => c.run('undo'));
    this.redoBtn = iconButton('redo', 'Refazer (Ctrl+Shift+Z)', () => c.run('redo'));
    this.themeBtn = iconButton('sun', 'Tema', () => c.run('theme'));
    this.root.append(
      h('div.tb-left',
        iconButton('home', 'Voltar para meus projetos', () => c.run('closeProject'), 'tb-home'),
        this.nameBtn, this.saveEl),
      h('nav.menubar', { 'aria-label': 'Menus' }, this.menuBtns),
      h('div.tb-right',
        this.compactMenu,
        h('div.pill-group', this.undoBtn, this.redoBtn),
        iconButton('layers', 'Painel de cores e camadas', () => c.run('toggleSidePanel'), 'tb-panel'),
        this.themeBtn,
        h('button.btn.pri.tb-export', { type: 'button', onclick: () => c.run('export') }, icon('download', 18), h('span', 'Exportar'))),
    );
    this.renderHistory();
    this.renderTheme();
  }

  #toggleMenu(i, btn) {
    if (this.menu.isOpen && this.openIndex === i) { this.menu.close(); return; }
    this.#openMenu(i, btn);
  }

  #openMenu(i, btn, focus = false) {
    this.openIndex = i;
    this.menu.open(btn, MENUS[i][1].map((id) => (id === '-' ? '-' : { cmd: id })), { focus, onClose: () => { this.openIndex = null; } });
  }

  /** Em telas estreitas, um único botão abre todos os menus agrupados. */
  #compactMenu(btn) {
    const items = [];
    MENUS.forEach(([label, ids], gi) => {
      if (gi) items.push('-');
      items.push({ header: label });
      for (const id of ids) if (id !== '-') items.push({ cmd: id });
    });
    this.menu.open(btn, items);
  }

  renderName() {
    const p = this.ws.project;
    this.nameBtn.textContent = p ? p.name : '';
    document.title = p ? `${p.name} · AnimationStudio` : 'AnimationStudio';
  }

  renderHistory() {
    const hst = this.ws.history;
    this.undoBtn.disabled = !hst.canUndo;
    this.redoBtn.disabled = !hst.canRedo;
    this.undoBtn.title = hst.canUndo ? `Desfazer: ${hst.nextUndoLabel} (Ctrl+Z)` : 'Nada para desfazer';
    this.redoBtn.title = hst.canRedo ? `Refazer: ${hst.nextRedoLabel} (Ctrl+Shift+Z)` : 'Nada para refazer';
  }

  renderSave(s) {
    const map = { saved: 'Salvo no aparelho', saving: 'Salvando…', dirty: 'Alterações não salvas', error: 'Não foi possível salvar' };
    this.saveEl.textContent = map[s] || '';
    this.saveEl.dataset.state = s;
  }

  renderTheme() {
    const mode = this.theme.mode;
    const ic = mode === 'dark' ? 'moon' : mode === 'light' ? 'sun' : 'monitor';
    const label = { dark: 'Tema escuro', light: 'Tema claro', system: 'Tema do sistema' }[mode];
    clear(this.themeBtn).append(icon(ic));
    this.themeBtn.title = `${label} (clique para trocar)`;
    this.themeBtn.setAttribute('aria-label', label);
  }
}
