/**
 * Raiz de composição: cria os serviços, injeta as dependências e monta a interface.
 * Nenhum outro módulo cria serviços por conta própria (inversão de dependência).
 * @module main
 */
import { $ } from './ui/dom.js';
import { Settings } from './app/Settings.js';
import { Workspace } from './app/Workspace.js';
import { Colors } from './app/Colors.js';
import { Commands } from './app/Commands.js';
import { PaintService } from './app/PaintService.js';
import { FloatService } from './app/FloatService.js';
import { LayerOps } from './app/ops/LayerOps.js';
import { FrameOps } from './app/ops/FrameOps.js';
import { ImageOps } from './app/ops/ImageOps.js';
import { SelectionOps } from './app/ops/SelectionOps.js';
import { Playback } from './app/Playback.js';
import { AudioTrack } from './app/AudioTrack.js';
import { Autosave } from './app/Autosave.js';
import { FileService } from './app/FileService.js';
import { Install } from './app/Install.js';
import { registerCommands } from './app/registerCommands.js';
import { ProjectStore } from './io/ProjectStore.js';
import { Viewport } from './render/Viewport.js';
import { StageView } from './render/StageView.js';
import { ThumbnailCache } from './render/Compositor.js';
import { ToolManager } from './tools/ToolManager.js';
import { PointerInput } from './input/PointerInput.js';
import { Keyboard } from './input/Keyboard.js';
import { Theme, Toaster, progressDialog } from './ui/feedback.js';
import { Menu } from './ui/Menu.js';
import { Topbar } from './ui/Topbar.js';
import { ToolRail } from './ui/ToolRail.js';
import { ToolOptions } from './ui/ToolOptions.js';
import { ColorPanel } from './ui/ColorPanel.js';
import { LayersPanel } from './ui/LayersPanel.js';
import { Timeline } from './ui/Timeline.js';
import { StatusBar } from './ui/StatusBar.js';
import { PreviewWindow } from './ui/PreviewWindow.js';
import { Gallery } from './ui/Gallery.js';
import { Shell } from './ui/Shell.js';
import { textDialog } from './ui/dialogs/editDialogs.js';

function boot() {
  /* ---- estado e serviços ---- */
  const settings = new Settings();
  const theme = new Theme(settings);
  const toaster = new Toaster($('#toasts'));
  const toast = (msg, opts) => toaster.show(msg, opts);
  const ws = new Workspace();
  const viewport = new Viewport();
  const colors = new Colors(settings);
  const store = new ProjectStore();
  const audio = new AudioTrack();
  const playback = new Playback(ws, audio);
  const float = new FloatService(ws, toast);
  const paint = new PaintService(ws, toast);
  const layers = new LayerOps(ws, toast);
  const frames = new FrameOps(ws, toast);
  const image = new ImageOps(ws, toast);
  const selection = new SelectionOps(ws, float, colors, toast);
  const autosave = new Autosave(ws, store, float);
  const install = new Install();
  const commands = new Commands();
  const menu = new Menu(commands);
  const thumbs = new ThumbnailCache();

  /* ---- área de desenho e ferramentas ---- */
  const stage = new StageView($('#stageCanvas'), { ws, viewport, settings });
  theme.onChange(() => stage.refreshTheme());
  stage.refreshTheme();
  const tools = new ToolManager({
    ws, settings, colors, paint, float, stage, viewport, toast,
    ui: { run: (id, ...a) => commands.run(id, ...a), textDialog },
  });
  stage.overlays.push(tools);
  playback.on('change', (on) => { stage.playing = on; stage.requestRender(); });

  /* ---- telas ---- */
  let shell = null;
  const files = new FileService({
    ws, store, autosave, audio, toast, progress: progressDialog,
    onOpen: () => { thumbs.clear(); stage.onion.clear(); stage.compositor.invalidate(); shell.showEditor(); },
  });
  const gallery = new Gallery($('#gallery'), { files, menu, toast, commands, theme, install });
  shell = new Shell({ settings, commands, ws, playback, gallery, stage, viewport, toast, selection, tools });
  shell.onBeforeUnload = () => autosave.status === 'saving' || autosave.status === 'dirty';

  registerCommands(commands, { ws, settings, colors, tools, viewport, stage, layers, frames, image, selection, float, files, playback, audio, theme, install, toast, shell });

  /* ---- componentes do editor ---- */
  new Topbar($('#topbar'), { commands, menu, ws, autosave, theme });
  new ToolRail($('#toolRail'), { tools, colors, commands });
  const toolOptions = new ToolOptions($('#toolOptions'), { tools, settings, commands });
  ws.on('change', ({ kind }) => { if (kind === 'floating' || kind === 'selection' || kind === 'project' || kind === 'all') toolOptions.sync(); });
  new ColorPanel($('#colorPanel'), { colors, ws, toast, menu, settings });
  new LayersPanel($('#layersPanel'), { ws, layers, thumbs, commands, menu });
  new Timeline($('#timeline'), { ws, frames, thumbs, commands, menu, playback, settings, audio });
  const status = new StatusBar($('#statusBar'), { ws, viewport, tools, commands });
  new PreviewWindow($('#stage'), { ws, settings });

  /* ---- entrada ---- */
  const input = new PointerInput($('#stageCanvas'), { ws, viewport, tools, settings, stage, commands, toast, status, playback });
  new Keyboard({ commands, tools, input, isEditor: () => shell.screen === 'editor' });
  $('#stage').addEventListener('pointerdown', () => shell.closeOverlayPanel());

  autosave.on('error', () => toast('Não foi possível salvar no aparelho. Baixe o arquivo do projeto (Arquivo › Baixar) para não perder o trabalho.', { ms: 6000 }));
  install.registerServiceWorker((apply) => shell.updateReady(() => { install.wantsReload = true; apply(); }));
  store.persist();
  shell.showGallery();

  // acesso para depuração no console
  window.__as2d = { ws, settings, commands, tools, viewport, stage, files, store, layers, frames, image, audio, colors };
}

boot();
