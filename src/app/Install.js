/**
 * Instalação como app (PWA): guarda o evento do navegador e registra o service worker.
 * @module app/Install
 */
import { Emitter } from '../core/Emitter.js';

export class Install extends Emitter {
  constructor() {
    super();
    this.event = null;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.event = e; this.emit('change'); });
    window.addEventListener('appinstalled', () => { this.event = null; this.emit('change'); });
  }

  get available() { return !!this.event; }
  get installed() { return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true; }

  async prompt() {
    if (!this.event) return false;
    this.event.prompt();
    const r = await this.event.userChoice.catch(() => null);
    this.event = null;
    this.emit('change');
    return r?.outcome === 'accepted';
  }

  /** Registra o service worker (só em http/https). Avisa quando há versão nova. */
  registerServiceWorker(onUpdate) {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) onUpdate?.(() => { w.postMessage('skipWaiting'); });
          });
        });
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && this.wantsReload) { reloaded = true; location.reload(); } });
      } catch { /* offline indisponível */ }
    });
  }
}
