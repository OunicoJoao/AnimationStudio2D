/**
 * Pincéis prontos. Cada preset descreve a ponta e como a pressão age sobre ela.
 * @module brush/presets
 *
 * tip        forma da ponta: hard | soft | grain | chalk | flat
 * hardness   0–1, só para "soft"
 * spacing    distância entre carimbos, em fração do tamanho
 * flow       opacidade de cada carimbo (acumula dentro do traço)
 * opacity    opacidade do traço inteiro (não acumula: efeito marcador)
 * pSize      quanto a pressão afeta o tamanho (0–1)
 * pFlow      quanto a pressão afeta o fluxo (0–1)
 * minSize    tamanho mínimo em fração quando a pressão é zero
 * jitter     rotação aleatória por carimbo (texturas)
 * angle      ângulo fixo da ponta "flat" em graus; ratio = achatamento
 */
export const BRUSH_PRESETS = {
  pen: { name: 'Caneta', icon: 'pen', tip: 'hard', spacing: 0.05, flow: 1, opacity: 1, pSize: 1, pFlow: 0, minSize: 0.12 },
  pencil: { name: 'Lápis', icon: 'pencil', tip: 'grain', spacing: 0.1, flow: 0.7, opacity: 1, pSize: 0.35, pFlow: 0.85, minSize: 0.5, jitter: true },
  ink: { name: 'Nanquim', icon: 'ink', tip: 'flat', angle: 40, ratio: 0.32, spacing: 0.04, flow: 1, opacity: 1, pSize: 0.9, pFlow: 0, minSize: 0.2 },
  marker: { name: 'Marcador', icon: 'marker', tip: 'hard', spacing: 0.05, flow: 1, opacity: 0.55, pSize: 0, pFlow: 0, minSize: 1 },
  airbrush: { name: 'Aerógrafo', icon: 'airbrush', tip: 'soft', hardness: 0, spacing: 0.08, flow: 0.07, opacity: 1, pSize: 0.2, pFlow: 1, minSize: 0.6 },
  soft: { name: 'Pincel macio', icon: 'brushSoft', tip: 'soft', hardness: 0.55, spacing: 0.07, flow: 0.35, opacity: 1, pSize: 0.6, pFlow: 0.6, minSize: 0.4 },
  chalk: { name: 'Giz', icon: 'chalk', tip: 'chalk', spacing: 0.14, flow: 0.85, opacity: 1, pSize: 0.3, pFlow: 0.5, minSize: 0.6, jitter: true },
};

export const ERASER_PRESETS = {
  hard: { name: 'Borracha dura', icon: 'eraser', tip: 'hard', spacing: 0.05, flow: 1, opacity: 1, pSize: 0.6, pFlow: 0, minSize: 0.3 },
  soft: { name: 'Borracha macia', icon: 'eraserSoft', tip: 'soft', hardness: 0.2, spacing: 0.07, flow: 0.4, opacity: 1, pSize: 0.3, pFlow: 0.8, minSize: 0.5 },
};
