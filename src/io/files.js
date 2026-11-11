/**
 * Baixar e escolher arquivos no navegador.
 * @module io/files
 */

/** Salva um Blob com nome de arquivo (pasta Downloads; no iOS instalado usa Compartilhar). */
export async function saveBlob(blob, filename) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  if (ios && standalone && navigator.canShare) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch { /* cancelado: cai para o download */ }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Abre o seletor de arquivos.
 * @param {string} accept
 * @param {boolean} [multiple=false]
 * @returns {Promise<File[]>}
 */
export function pickFiles(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); }, { once: true });
    // se o usuário cancelar, alguns navegadores disparam "cancel"
    input.addEventListener('cancel', () => { resolve([]); input.remove(); }, { once: true });
    input.click();
  });
}

export const readText = (f) => f.text();
