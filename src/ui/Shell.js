/**
 * Moldura do app: alterna galeria/editor, painéis recolhíveis, modo canhoto,
 * arrastar-e-soltar arquivos, colar da área de transferência e aviso de versão nova.
 * @module ui/Shell
 */
import { h } from './dom.js';

export class Shell {
  constructor({ settings, commands, ws, playback, gallery, stage, viewport, toast, selection, tools }) {
    Object.assign(this, { settings, commands, ws, playback, gallery, stage, viewport, toast, selection, tools });
    this.app = document.getElementById('app');
    this.editor = document.getElementById('editor');
    this.galleryEl = document.getElementById('gallery');
    this.screen = 'gallery';
    this.narrow = window.matchMedia('(max-width: 900px)');
    this.sidePanelOpen = !this.narrow.matches && settings.get('sidePanel');
    this.narrow.addEventListener?.('change', () => { this.sidePanelOpen = !this.narrow.matches && settings.get('sidePanel'); this.#layout(); });
    settings.on('change', ({ path }) => { if (path === 'leftHanded' || path === 'timeline') this.#layout(); });
    this.#layout();
    this.#dragDrop();
    document.addEventListener('paste', (e) => {
      if (this.screen !== 'editor' || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      e.preventDefault();
      this.selection.paste(e).then((ok) => { if (ok) this.tools.select('transform'); });
    });
    // proteção contra fechar a aba no meio do salvamento
    window.addEventListener('beforeunload', (e) => {
      if (this.onBeforeUnload?.()) { e.preventDefault(); e.returnValue = ''; }
    });
    // impede o zoom do navegador por gesto no Safari (o app trata a pinça)
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  #layout() {
    this.editor.classList.toggle('side-open', this.sidePanelOpen);
    this.editor.classList.toggle('side-overlay', this.narrow.matches);
    this.editor.classList.toggle('left-handed', !!this.settings.get('leftHanded'));
    this.editor.classList.toggle('no-timeline', !this.settings.get('timeline'));
  }

  toggleSidePanel() {
    this.sidePanelOpen = !this.sidePanelOpen;
    if (!this.narrow.matches) this.settings.set('sidePanel', this.sidePanelOpen);
    this.#layout();
  }

  closeOverlayPanel() {
    if (this.narrow.matches && this.sidePanelOpen) { this.sidePanelOpen = false; this.#layout(); }
  }

  showEditor() {
    this.screen = 'editor';
    this.galleryEl.hidden = true;
    this.editor.hidden = false;
    this.app.dataset.screen = 'editor';
    requestAnimationFrame(() => { this.viewport.fit(); this.stage.requestRender(); });
  }

  showGallery() {
    this.playback.stop();
    this.screen = 'gallery';
    this.editor.hidden = true;
    this.galleryEl.hidden = false;
    this.app.dataset.screen = 'gallery';
    this.ws.project = null;
    this.ws.floating = null;
    this.ws.selection = null;
    this.ws.history.clear();
    document.title = 'AnimationStudio';
    this.gallery.render();
  }

  #dragDrop() {
    const veil = h('div.drop-veil', { hidden: true }, h('div', 'Solte para abrir ou importar'));
    document.body.append(veil);
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; veil.hidden = false; });
    window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) veil.hidden = true; });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      veil.hidden = true;
      const files = [...e.dataTransfer.files];
      if (files.length) this.commands.run('openFiles', files);
    });
  }

  /** Mostra um aviso fixo quando há uma versão nova do app. */
  updateReady(apply) {
    const bar = h('div.update-bar', { role: 'status' },
      h('span', 'Há uma versão nova do AnimationStudio.'),
      h('button.btn.sm.pri', { type: 'button', onclick: () => { apply(); bar.remove(); } }, 'Atualizar'),
      h('button.btn.sm', { type: 'button', onclick: () => bar.remove() }, 'Depois'));
    document.body.append(bar);
  }
}
