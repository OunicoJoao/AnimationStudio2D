/**
 * Todos os comandos do app, ligados aos serviços. Menus, atalhos e botões usam estes ids.
 * @module app/registerCommands
 */
import { Tag } from '../model/Project.js';
import { newProjectDialog, resizeDialog, canvasSizeDialog, paperDialog, exportDialog } from '../ui/dialogs/projectDialogs.js';
import { adjustDialog, layerPropsDialog, holdDialog, fpsDialog, tagDialog, colorDialog, audioDialog } from '../ui/dialogs/editDialogs.js';
import { shortcutsDialog, gesturesDialog, aboutDialog, preferencesDialog, onionDialog, guidesDialog } from '../ui/dialogs/infoDialogs.js';
import { promptDialog } from '../ui/feedback.js';
import { pickFiles } from '../io/files.js';

export const APP_VERSION = '1.0.0';

/** @param {import('./Commands.js').Commands} commands @param {object} d dependências */
export function registerCommands(commands, d) {
  const { ws, settings, colors, tools, viewport, layers, frames, image, selection, float, files, playback, audio, theme, install, toast, shell } = d;
  const hasProject = () => !!ws.project;
  const hasSel = () => !!ws.selection;
  const toggleSetting = (path) => () => settings.set(path, !settings.get(path));
  const onFloating = (fn) => () => { if (ws.floating) return fn(); float.lift() && fn(); };

  commands.guard = hasProject;

  commands.register({
    /* ---------- Arquivo ---------- */
    newProject: { label: 'Novo projeto…', icon: 'plus', editorOnly: false, run: async () => {
      const o = await newProjectDialog();
      if (!o) return;
      if (ws.project) await files.close();
      await files.create(o);
    } },
    openProject: { label: 'Abrir projeto', editorOnly: false, run: async (id) => {
      try { await files.open(id); } catch (e) { toast(e.message); }
    } },
    openFiles: { label: 'Abrir arquivos', editorOnly: false, run: async (list) => {
      try { await files.openFiles(list, { inEditor: shell.screen === 'editor' }); } catch (e) { console.error(e); toast(e.message || 'Não foi possível abrir o arquivo.'); }
    } },
    openFile: { label: 'Abrir arquivo…', icon: 'folder', key: 'Ctrl+O', editorOnly: false, run: async () => {
      const list = await pickFiles('.as2d,image/*,audio/*', true);
      if (list.length) commands.run('openFiles', list);
    } },
    saveNow: { label: 'Salvar agora', icon: 'save', key: 'Ctrl+S', run: () => files.saveNow() },
    duplicateProject: { label: 'Duplicar projeto', icon: 'duplicate', run: async () => {
      await files.close();
      const id = await files.duplicate(ws.project.id);
      await files.open(id);
      toast('Você está editando a cópia');
    } },
    importImageLayer: { label: 'Importar imagem como camada…', icon: 'image', run: async () => {
      const [f] = await pickFiles('image/*');
      if (f) await files.importImageAsLayer(f).catch((e) => toast(e.message));
    } },
    importFrames: { label: 'Importar imagens como quadros…', icon: 'film', run: async () => {
      const list = await pickFiles('image/*', true);
      if (list.length) await files.importFrames(list).catch((e) => toast(e.message));
    } },
    importAudio: { label: 'Importar áudio…', icon: 'music', run: async () => {
      const [f] = await pickFiles('audio/*,.mp3,.wav,.ogg,.m4a');
      if (f) await files.importAudio(f);
    } },
    audioSettings: { label: 'Ajustar áudio…', icon: 'music', enabled: () => !!ws.project?.audio, run: async () => {
      const r = await audioDialog(ws.project, audio.duration);
      if (r) files.updateAudio(r);
    } },
    export: { label: 'Exportar…', icon: 'download', key: 'Ctrl+E', run: async () => {
      playback.stop();
      const o = await exportDialog(ws.project, ws);
      if (o) await files.export(o);
    } },
    exportProject: { label: 'Baixar arquivo do projeto (.as2d)', icon: 'save', key: 'Ctrl+Shift+S', run: () => files.exportProjectFile() },
    renameProject: { label: 'Renomear projeto…', icon: 'text', run: async () => {
      const n = await promptDialog('Renomear projeto', 'Nome', ws.project.name);
      if (n) { ws.project.name = n; ws.project.modified = Date.now(); ws.changed('meta'); }
    } },
    closeProject: { label: 'Voltar aos projetos', icon: 'home', run: async () => {
      playback.stop();
      float.commit();
      await files.close();
      shell.showGallery();
    } },

    /* ---------- Editar ---------- */
    undo: { label: 'Desfazer', icon: 'undo', key: 'Ctrl+Z', enabled: () => ws.history.canUndo || !!ws.floating, run: () => {
      if (ws.floating) { float.cancel(); return; }
      tools.active.cancel();
      const c = ws.history.undo();
      if (c) toast(`Desfeito: ${c.label}`);
    } },
    redo: { label: 'Refazer', icon: 'redo', key: 'Ctrl+Shift+Z / Ctrl+Y', enabled: () => ws.history.canRedo, run: () => {
      float.commit();
      const c = ws.history.redo();
      if (c) toast(`Refeito: ${c.label}`);
    } },
    cut: { label: 'Recortar', icon: 'cut', key: 'Ctrl+X', run: () => selection.cut() },
    copy: { label: 'Copiar', icon: 'copy', key: 'Ctrl+C', run: () => selection.copy() },
    copyMerged: { label: 'Copiar tudo o que aparece', icon: 'copy', key: 'Ctrl+Shift+C', run: () => selection.copy(true) },
    paste: { label: 'Colar', icon: 'paste', key: 'Ctrl+V', run: async () => { if (await selection.paste()) tools.select('transform'); } },
    clear: { label: 'Apagar seleção / camada', icon: 'trash', key: 'Delete / Backspace', run: () => {
      if (ws.floating) { const fl = ws.floating; fl.canvas = document.createElement('canvas'); fl.canvas.width = fl.canvas.height = 1; float.commit(); return; }
      layers.clear();
    } },
    fillSelection: { label: 'Preencher com a cor principal', icon: 'bucket', key: 'Alt+Backspace', run: () => selection.fill() },
    transform: { label: 'Transformar', icon: 'transform', key: 'Ctrl+T', run: () => tools.select('transform') },
    flipSelH: { label: 'Espelhar horizontal (seleção)', icon: 'flipH', run: onFloating(() => { tools.get('transform').flip('h'); tools.select('transform'); }) },
    flipSelV: { label: 'Espelhar vertical (seleção)', icon: 'flipV', run: onFloating(() => { tools.get('transform').flip('v'); tools.select('transform'); }) },
    escape: { label: 'Cancelar / desmarcar', key: 'Escape', run: () => {
      if (playback.playing) return playback.stop();
      if (ws.floating) return float.cancel();
      if (ws.selection) return ws.setSelection(null);
      if (ws.range) return ws.setRange(null);
    } },
    preferences: { label: 'Preferências…', icon: 'settings', editorOnly: false, run: () => preferencesDialog(settings) },

    /* ---------- Seleção ---------- */
    selectAll: { label: 'Selecionar tudo', icon: 'selectAll', key: 'Ctrl+A', run: () => selection.selectAll() },
    deselect: { label: 'Desmarcar', icon: 'deselect', key: 'Ctrl+D', enabled: hasSel, run: () => selection.deselect() },
    invertSelection: { label: 'Inverter seleção', icon: 'invertSel', key: 'Ctrl+Shift+I', run: () => selection.invert() },
    toolSelect: { label: 'Ferramenta de seleção', icon: 'selectRect', run: () => tools.select('select') },
    toolWand: { label: 'Varinha mágica', icon: 'wand', run: () => tools.select('wand') },

    /* ---------- Imagem ---------- */
    resizeImage: { label: 'Redimensionar imagem…', icon: 'resize', run: async () => { float.commit(); const r = await resizeDialog(ws.project); if (r) { image.resize(r.w, r.h); viewport.fit(); } } },
    canvasSize: { label: 'Tamanho da tela…', icon: 'crop', run: async () => { float.commit(); const r = await canvasSizeDialog(ws.project); if (r) { image.canvasSize(r.w, r.h, r.ax, r.ay); viewport.fit(); } } },
    paperColor: { label: 'Cor do papel…', icon: 'paper', run: async () => { const c = await paperDialog(ws.project); if (c !== undefined) image.setBackground(c); } },
    rotateCW: { label: 'Girar 90° horário', icon: 'rotateRight', run: () => { float.commit(); image.rotate('cw'); viewport.fit(); } },
    rotateCCW: { label: 'Girar 90° anti-horário', icon: 'rotateLeft', run: () => { float.commit(); image.rotate('ccw'); viewport.fit(); } },
    rotate180: { label: 'Girar 180°', icon: 'rotateRight', run: () => { float.commit(); image.rotate('180'); } },
    flipH: { label: 'Espelhar projeto na horizontal', icon: 'flipH', run: () => { float.commit(); image.flip('h'); } },
    flipV: { label: 'Espelhar projeto na vertical', icon: 'flipV', run: () => { float.commit(); image.flip('v'); } },
    cropToSelection: { label: 'Recortar para a seleção', icon: 'crop', enabled: hasSel, run: () => { image.cropToSelection(); viewport.fit(); } },
    trim: { label: 'Aparar bordas vazias', icon: 'crop', run: () => { float.commit(); image.trim(); viewport.fit(); } },
    adjustBrightness: { label: 'Brilho e contraste…', icon: 'adjust', run: () => { float.commit(); adjustDialog('brightnessContrast', image, colors); } },
    adjustHue: { label: 'Matiz e saturação…', icon: 'palette', run: () => { float.commit(); adjustDialog('hueSaturation', image, colors); } },
    filterBlur: { label: 'Desfocar…', icon: 'brushSoft', run: () => { float.commit(); adjustDialog('blur', image, colors); } },
    filterOutline: { label: 'Contorno…', icon: 'outline', run: () => { float.commit(); adjustDialog('outline', image, colors); } },
    filterInvert: { label: 'Inverter cores', icon: 'invertSel', run: () => { float.commit(); image.applyFilter('invert'); } },
    filterGray: { label: 'Escala de cinza', icon: 'adjust', run: () => { float.commit(); image.applyFilter('grayscale'); } },

    /* ---------- Camada ---------- */
    layerNew: { label: 'Nova camada', icon: 'plus', key: 'Shift+N', run: () => { float.commit(); layers.add(); } },
    layerDuplicate: { label: 'Duplicar camada', icon: 'duplicate', key: 'Ctrl+J', run: () => { float.commit(); layers.duplicate(); } },
    layerDelete: { label: 'Excluir camada', icon: 'trash', enabled: () => ws.project?.layers.length > 1, run: () => { float.commit(); layers.remove(); } },
    layerUp: { label: 'Subir camada', icon: 'arrowUp', key: 'Ctrl+]', enabled: () => ws.layerIndex < ws.project?.layers.length - 1, run: () => { float.commit(); layers.moveUp(); } },
    layerDown: { label: 'Descer camada', icon: 'arrowDown', key: 'Ctrl+[', enabled: () => ws.layerIndex > 0, run: () => { float.commit(); layers.moveDown(); } },
    layerMerge: { label: 'Mesclar para baixo', icon: 'merge', key: 'Ctrl+M', enabled: () => ws.layerIndex > 0, run: () => { float.commit(); layers.mergeDown(); } },
    flatten: { label: 'Achatar todas as camadas', icon: 'flatten', enabled: () => ws.project?.layers.length > 1, run: () => { float.commit(); layers.flatten(); } },
    layerVisible: { label: 'Camada visível', checked: () => !!ws.layer?.visible, run: () => layers.setProp(ws.layerId, 'visible', !ws.layer.visible) },
    layerLock: { label: 'Camada bloqueada', checked: () => !!ws.layer?.locked, run: () => layers.setProp(ws.layerId, 'locked', !ws.layer.locked) },
    layerAlphaLock: { label: 'Travar transparência', checked: () => !!ws.layer?.alphaLock, run: () => layers.setProp(ws.layerId, 'alphaLock', !ws.layer.alphaLock) },
    layerRename: { label: 'Renomear camada…', icon: 'text', run: async (id = ws.layerId) => {
      const l = ws.project.layerById(id);
      const n = await promptDialog('Renomear camada', 'Nome', l.name);
      if (n) layers.setProp(id, 'name', n);
    } },
    layerProps: { label: 'Propriedades da camada…', icon: 'settings', run: async () => {
      const l = ws.layer;
      const r = await layerPropsDialog(l);
      if (!r) return;
      for (const [k, v] of Object.entries(r)) if (l[k] !== v) layers.setProp(l.id, k, v);
    } },

    /* ---------- Quadro ---------- */
    frameNew: { label: 'Novo quadro', icon: 'frameAdd', key: 'N', run: () => { float.commit(); playback.stop(); frames.addBlank(); } },
    frameNewBefore: { label: 'Novo quadro antes', icon: 'frameAdd', run: () => { float.commit(); frames.addBlankBefore(); } },
    frameDuplicate: { label: 'Duplicar quadro', icon: 'frameDup', key: 'Shift+D', run: () => { float.commit(); playback.stop(); frames.duplicate(); } },
    frameDelete: { label: 'Excluir quadro', icon: 'trash', key: 'Shift+Delete', enabled: () => ws.project?.frames.length > 1, run: () => { float.commit(); playback.stop(); frames.remove(); } },
    frameCopy: { label: 'Copiar quadro', icon: 'copy', key: 'Ctrl+Alt+C', run: () => frames.copy() },
    framePaste: { label: 'Colar quadro', icon: 'paste', key: 'Ctrl+Alt+V', run: () => { float.commit(); frames.paste(); } },
    frameLeft: { label: 'Mover quadro para a esquerda', icon: 'prev', key: 'Alt+ArrowLeft', enabled: () => ws.frameSpan[0] > 0, run: () => frames.moveLeft() },
    frameRight: { label: 'Mover quadro para a direita', icon: 'next', key: 'Alt+ArrowRight', enabled: () => ws.frameSpan[1] < ws.project?.frames.length - 1, run: () => frames.moveRight() },
    frameReverse: { label: 'Inverter ordem dos quadros', icon: 'swap', run: () => frames.reverse() },
    frameHold: { label: 'Duração do quadro…', icon: 'clock', run: async () => { const v = await holdDialog(ws.frame.hold, ws.project.fps); if (v) frames.setHold(v); } },
    holdMore: { label: 'Segurar mais um tempo', icon: 'plus', key: 'Shift+.', run: () => frames.holdBy(1) },
    holdLess: { label: 'Segurar um tempo a menos', icon: 'minus', key: 'Shift+,', run: () => frames.holdBy(-1) },
    fps: { label: 'Velocidade (fps)…', icon: 'clock', run: async () => { const v = await fpsDialog(ws.project.fps); if (v) frames.setFps(v); } },
    tagNew: { label: 'Novo trecho com os quadros selecionados…', icon: 'tag', run: async () => {
      const [a, b] = ws.frameSpan;
      const r = await tagDialog(new Tag({ id: '', name: 'Trecho', from: a, to: b }), ws.project.frames.length);
      if (r?.action === 'save') frames.addTag(r.values);
    } },
    tagEdit: { label: 'Editar trecho', run: async (id) => {
      const t = ws.project.tags.find((x) => x.id === id);
      if (!t) return;
      const r = await tagDialog(t, ws.project.frames.length);
      if (r?.action === 'save') frames.updateTag(id, r.values);
      if (r?.action === 'delete') frames.removeTag(id);
    } },
    selectAllFrames: { label: 'Selecionar todos os quadros', icon: 'selectAll', key: 'Ctrl+Shift+A', run: () => ws.setRange([0, ws.project.frames.length - 1]) },
    play: { label: 'Reproduzir / pausar', icon: 'play', key: 'Enter', checked: () => playback.playing, run: () => { float.commit(); playback.toggle(); } },
    loop: { label: 'Repetir em laço', icon: 'loop', checked: () => !!ws.project?.loop, run: () => { ws.project.loop = !ws.project.loop; ws.changed('meta'); } },
    frameFirst: { label: 'Primeiro quadro', icon: 'first', key: 'Home', run: () => { float.commit(); playback.stop(); ws.setFrameIndex(0); } },
    framePrev: { label: 'Quadro anterior', icon: 'prev', key: ', / ArrowLeft', run: () => { float.commit(); playback.stop(); const p = ws.project; ws.setFrameIndex(ws.frameIndex > 0 ? ws.frameIndex - 1 : p.loop ? p.frames.length - 1 : 0); } },
    frameNext: { label: 'Próximo quadro', icon: 'next', key: '. / ArrowRight', run: () => { float.commit(); playback.stop(); const p = ws.project; ws.setFrameIndex(ws.frameIndex < p.frames.length - 1 ? ws.frameIndex + 1 : p.loop ? 0 : ws.frameIndex); } },
    frameLast: { label: 'Último quadro', icon: 'last', key: 'End', run: () => { float.commit(); playback.stop(); ws.setFrameIndex(ws.project.frames.length - 1); } },

    /* ---------- Ver ---------- */
    zoomIn: { label: 'Aproximar', icon: 'zoom', key: '+ / Ctrl++', run: () => viewport.zoomStep(1) },
    zoomOut: { label: 'Afastar', icon: 'minus', key: '- / Ctrl+-', run: () => viewport.zoomStep(-1) },
    zoomFit: { label: 'Ajustar à tela', icon: 'fit', key: 'Ctrl+0', run: () => viewport.fit() },
    zoom100: { label: 'Tamanho real (100%)', key: 'Ctrl+1', run: () => viewport.zoomAt(1) },
    rotateViewLeft: { label: 'Girar vista para a esquerda', icon: 'rotateLeft', key: 'Shift+R', run: () => viewport.rotateAt(viewport.rotation - 15) },
    rotateViewRight: { label: 'Girar vista para a direita', icon: 'rotateRight', key: 'R', run: () => viewport.rotateAt(viewport.rotation + 15) },
    rotateViewReset: { label: 'Endireitar vista', key: '0', run: () => { viewport.rotateAt(0); if (viewport.flipX) viewport.setFlip(false); } },
    flipView: { label: 'Espelhar vista (conferir o desenho)', icon: 'flipH', key: 'Shift+H', checked: () => viewport.flipX, run: () => viewport.setFlip(!viewport.flipX) },
    onion: { label: 'Onion skin', icon: 'onion', key: 'O', checked: () => !!settings.get('onion.on'), run: toggleSetting('onion.on') },
    onionSettings: { label: 'Ajustar onion skin…', icon: 'settings', run: () => onionDialog(settings) },
    grid: { label: 'Grade', icon: 'grid', key: 'Ctrl+G', checked: () => !!settings.get('grid.on'), run: toggleSetting('grid.on') },
    gridSettings: { label: 'Grade e simetria…', icon: 'settings', run: () => guidesDialog(settings) },
    symmetryToggle: { label: 'Simetria espelhada', icon: 'symmetry', key: 'S', checked: () => settings.get('symmetry.mode') !== 'none', run: () => settings.set('symmetry.mode', settings.get('symmetry.mode') === 'none' ? 'vertical' : 'none') },
    previewWindow: { label: 'Janela de prévia', icon: 'preview', key: 'P', checked: () => !!settings.get('preview'), run: toggleSetting('preview') },
    toggleSidePanel: { label: 'Painel de cores e camadas', icon: 'layers', key: 'L', checked: () => shell.sidePanelOpen, run: () => shell.toggleSidePanel() },
    toggleTimeline: { label: 'Linha do tempo', icon: 'film', checked: () => !!settings.get('timeline'), run: toggleSetting('timeline') },
    fullscreen: { label: 'Tela cheia', icon: 'fullscreen', key: 'F11', editorOnly: false, checked: () => !!document.fullscreenElement, run: () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => toast('Tela cheia indisponível neste navegador.'));
    } },
    theme: { label: 'Trocar tema (claro / escuro / sistema)', icon: 'moon', editorOnly: false, run: () => theme.cycle() },
    penOnly: { label: 'Modo caneta (dedo só navega)', icon: 'stylus', checked: () => !!settings.get('penOnly'), editorOnly: false, run: () => { settings.set('penOnlyChosen', true); settings.set('penOnly', !settings.get('penOnly')); } },
    leftHanded: { label: 'Modo canhoto', icon: 'hand', checked: () => !!settings.get('leftHanded'), editorOnly: false, run: toggleSetting('leftHanded') },

    /* ---------- Cores ---------- */
    swapColors: { label: 'Trocar cor principal e secundária', icon: 'swap', key: 'X', run: () => colors.swap() },
    pickColor: { label: 'Escolher cor', run: async (which = 'fg') => {
      const c = await colorDialog(which === 'fg' ? 'Cor principal' : 'Cor secundária', which === 'fg' ? colors.fg : colors.bg);
      if (c) which === 'fg' ? colors.setFg(c) : colors.setBg(c);
    } },

    /* ---------- Ajuda ---------- */
    shortcuts: { label: 'Atalhos de teclado', icon: 'keyboard', key: 'F1', editorOnly: false, run: () => shortcutsDialog(commands, tools.classes) },
    gestures: { label: 'Gestos de toque e caneta', icon: 'touch', editorOnly: false, run: () => gesturesDialog() },
    install: { label: 'Instalar como app', icon: 'install', editorOnly: false, enabled: () => install.available, run: () => install.prompt() },
    about: { label: 'Sobre', icon: 'info', editorOnly: false, run: () => aboutDialog(APP_VERSION) },
  });
}
