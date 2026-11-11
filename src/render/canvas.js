/**
 * Utilitários de canvas usados por modelo, ferramentas e exportadores.
 * @module render/canvas
 */

/** Cria um canvas w×h. */
export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Fábrica injetada no modelo (Project) para criar células. */
export const canvasFactory = { create: createCanvas };

/** Contexto 2D com suavização de imagem ligada em alta qualidade. */
export function ctx2d(canvas, opts) {
  const g = canvas.getContext('2d', opts);
  g.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
  return g;
}

export function cloneCanvas(src) {
  const c = createCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

export function clearCanvas(c) {
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, c.width, c.height);
}

/** Garante que um canvas reutilizável tenha o tamanho pedido (e o limpa). */
export function ensureSize(c, w, h) {
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else clearCanvas(c);
  return c;
}

/** Converte canvas em Blob PNG. */
export function canvasToBlob(c, type = 'image/png', quality) {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), type, quality));
}

/** Carrega um Blob/File de imagem num canvas. */
export async function blobToCanvas(blob) {
  if ('createImageBitmap' in window) {
    const bmp = await createImageBitmap(blob);
    const c = createCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close?.();
    return c;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagem inválida')); i.src = url; });
    const c = createCanvas(img.naturalWidth, img.naturalHeight);
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Verifica se o canvas está totalmente transparente. */
export function isCanvasEmpty(c) {
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  const u32 = new Uint32Array(d.buffer);
  for (let i = 0; i < u32.length; i++) if (u32[i] & 0xff000000) return false;
  return true;
}

/** Padrão xadrez para fundos transparentes. */
export function checkerPattern(g, size = 8, a = '#ffffff', b = '#e3e3e3') {
  const c = createCanvas(size * 2, size * 2);
  const x = c.getContext('2d');
  x.fillStyle = a; x.fillRect(0, 0, size * 2, size * 2);
  x.fillStyle = b; x.fillRect(0, 0, size, size); x.fillRect(size, size, size, size);
  return g.createPattern(c, 'repeat');
}
