/* Service worker do AnimationStudio (gerado por scripts/build.mjs — não edite sw.js à mão).
   O app inteiro fica em cache para funcionar offline. A página vem da rede quando há
   conexão (para pegar atualizações) e do cache quando não há. */
const VERSION = 'ca49d319ff';
const CACHE = 'as2d-' + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles/base.css",
  "./styles/dialogs.css",
  "./styles/editor.css",
  "./styles/gallery.css",
  "./styles/panels.css",
  "./styles/tokens.css",
  "./src/app/AudioTrack.js",
  "./src/app/Autosave.js",
  "./src/app/Colors.js",
  "./src/app/Commands.js",
  "./src/app/FileService.js",
  "./src/app/FloatService.js",
  "./src/app/Install.js",
  "./src/app/PaintService.js",
  "./src/app/Playback.js",
  "./src/app/Settings.js",
  "./src/app/Workspace.js",
  "./src/app/ops/FrameOps.js",
  "./src/app/ops/ImageOps.js",
  "./src/app/ops/LayerOps.js",
  "./src/app/ops/SelectionOps.js",
  "./src/app/registerCommands.js",
  "./src/brush/BrushEngine.js",
  "./src/brush/BrushTips.js",
  "./src/brush/Stabilizer.js",
  "./src/brush/StrokeSampler.js",
  "./src/brush/Symmetry.js",
  "./src/brush/presets.js",
  "./src/core/Emitter.js",
  "./src/core/color.js",
  "./src/core/debounce.js",
  "./src/core/ids.js",
  "./src/core/math.js",
  "./src/history/CelPatch.js",
  "./src/history/History.js",
  "./src/input/Keyboard.js",
  "./src/input/PointerInput.js",
  "./src/io/Exporter.js",
  "./src/io/ProjectFile.js",
  "./src/io/ProjectStore.js",
  "./src/io/files.js",
  "./src/io/gif.js",
  "./src/io/zip.js",
  "./src/main.js",
  "./src/model/Floating.js",
  "./src/model/Project.js",
  "./src/model/Selection.js",
  "./src/raster/filters.js",
  "./src/raster/flood.js",
  "./src/render/Compositor.js",
  "./src/render/StageView.js",
  "./src/render/Viewport.js",
  "./src/render/canvas.js",
  "./src/tools/BrushTool.js",
  "./src/tools/FillTools.js",
  "./src/tools/MiscTools.js",
  "./src/tools/SelectTools.js",
  "./src/tools/ShapeTool.js",
  "./src/tools/Tool.js",
  "./src/tools/ToolManager.js",
  "./src/tools/TransformTool.js",
  "./src/tools/common.js",
  "./src/ui/ColorPanel.js",
  "./src/ui/ColorPicker.js",
  "./src/ui/Gallery.js",
  "./src/ui/LayersPanel.js",
  "./src/ui/Menu.js",
  "./src/ui/PreviewWindow.js",
  "./src/ui/Shell.js",
  "./src/ui/StatusBar.js",
  "./src/ui/Timeline.js",
  "./src/ui/ToolOptions.js",
  "./src/ui/ToolRail.js",
  "./src/ui/Topbar.js",
  "./src/ui/dialogs/editDialogs.js",
  "./src/ui/dialogs/infoDialogs.js",
  "./src/ui/dialogs/projectDialogs.js",
  "./src/ui/dom.js",
  "./src/ui/feedback.js",
  "./src/ui/form.js",
  "./src/ui/icons.js",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/mascot.png",
  "./icons/maskable-512.png"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('as2d-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: sameOrigin }).then((hit) => hit || fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
