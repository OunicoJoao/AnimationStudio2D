/**
 * Diálogos de projeto: novo projeto, redimensionar, tamanho da tela, cor do papel e exportar.
 * @module ui/dialogs/projectDialogs
 */
import { h, icon } from '../dom.js';
import { openDialog } from '../feedback.js';
import { textField, numberField, choiceField, checkField, selectField, rangeField } from '../form.js';
import { videoFormats } from '../../io/Exporter.js';
import { ColorPicker } from '../ColorPicker.js';
import { hexToRgba, rgbaToHex } from '../../core/color.js';

export const SIZE_PRESETS = [
  { id: 'hd', label: 'Vídeo HD', w: 1920, h: 1080 },
  { id: 'sd', label: 'Vídeo leve', w: 1280, h: 720 },
  { id: 'square', label: 'Quadrado', w: 1080, h: 1080 },
  { id: 'story', label: 'Vertical', w: 1080, h: 1920 },
  { id: 'portrait', label: 'Retrato 4:5', w: 1080, h: 1350 },
  { id: 'small', label: 'Pequeno', w: 800, h: 600 },
];

export const PAPER_COLORS = [
  { value: '#ffffff', label: 'Branco' },
  { value: '#fbf6ea', label: 'Papel' },
  { value: '#e9eef3', label: 'Azulado' },
  { value: '#202226', label: 'Escuro' },
  { value: null, label: 'Transparente' },
];

function presetCard(p, selected, onPick) {
  const ratio = p.w / p.h;
  const bw = ratio >= 1 ? 44 : Math.round(44 * ratio), bh = ratio >= 1 ? Math.round(44 / ratio) : 44;
  return h(`button.preset${selected ? '.on' : ''}`, { type: 'button', 'aria-pressed': String(selected), onclick: onPick },
    h('span.preset-shape', h('i', { style: { width: `${bw}px`, height: `${bh}px` } })),
    h('span.preset-label', p.label),
    h('span.preset-size', `${p.w}×${p.h}`));
}

/** @returns {Promise<null|{name:string,width:number,height:number,background:string|null,fps:number}>} */
export function newProjectDialog(defaultName = 'Minha animação') {
  let sel = SIZE_PRESETS[1];
  const name = textField('Nome', defaultName, { maxLength: 80, autofocus: true });
  const wf = numberField('Largura', sel.w, { min: 16, max: 4096, unit: 'px' });
  const hf = numberField('Altura', sel.h, { min: 16, max: 4096, unit: 'px' });
  const grid = h('div.preset-grid');
  const paint = () => {
    grid.replaceChildren(...SIZE_PRESETS.map((p) => presetCard(p, p === sel, () => { sel = p; wf.input.value = p.w; hf.input.value = p.h; paint(); })));
  };
  const custom = () => { sel = null; paint(); };
  wf.input.addEventListener('input', custom);
  hf.input.addEventListener('input', custom);
  paint();
  const paper = choiceField('Papel', PAPER_COLORS.map((c) => ({ value: c.value, label: c.label })), '#ffffff');
  const fps = choiceField('Velocidade', [8, 12, 24, 30].map((v) => ({ value: v, label: `${v} fps` })), 12);
  return openDialog({
    title: 'Novo projeto',
    size: 'lg',
    body: [name.el, h('div.fld', h('span.fld-label', 'Tamanho'), grid), h('div.row2', wf.el, hf.el), paper.el, fps.el,
      h('p.hint', 'Para animação, 12 fps é o padrão clássico; 24 fps deixa o movimento mais suave e dá mais trabalho.')],
    buttons: [{ label: 'Cancelar', value: null }, {
      label: 'Criar projeto', primary: true,
      onClick: (close) => close({ name: name.value.trim() || defaultName, width: wf.value, height: hf.value, background: paper.value, fps: fps.value }),
    }],
  });
}

export function resizeDialog(project) {
  const wf = numberField('Largura', project.width, { min: 1, max: 4096, unit: 'px' });
  const hf = numberField('Altura', project.height, { min: 1, max: 4096, unit: 'px' });
  const pct = numberField('Escala', 100, { min: 1, max: 1000, unit: '%' });
  const lock = checkField('Manter proporção', true);
  const ratio = project.width / project.height;
  wf.input.addEventListener('input', () => { if (lock.value) hf.input.value = Math.max(1, Math.round(wf.value / ratio)); pct.input.value = Math.round((wf.value / project.width) * 100); });
  hf.input.addEventListener('input', () => { if (lock.value) wf.input.value = Math.max(1, Math.round(hf.value * ratio)); pct.input.value = Math.round((hf.value / project.height) * 100); });
  pct.input.addEventListener('input', () => { wf.input.value = Math.max(1, Math.round((project.width * pct.value) / 100)); hf.input.value = Math.max(1, Math.round((project.height * pct.value) / 100)); });
  return openDialog({
    title: 'Redimensionar imagem', size: 'sm',
    body: [h('p.dlg-text', 'Escala todos os desenhos de todos os quadros.'), h('div.row2', wf.el, hf.el), pct.el, lock.el],
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Redimensionar', primary: true, onClick: (c) => c({ w: wf.value, h: hf.value }) }],
  });
}

export function canvasSizeDialog(project) {
  const wf = numberField('Largura', project.width, { min: 1, max: 4096, unit: 'px' });
  const hf = numberField('Altura', project.height, { min: 1, max: 4096, unit: 'px' });
  let anchor = [0.5, 0.5];
  const cells = [];
  const grid = h('div.anchor-grid', { role: 'group', 'aria-label': 'Âncora' });
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    const b = h('button', { type: 'button', 'aria-label': `Âncora ${['superior', 'central', 'inferior'][y]} ${['esquerda', 'centro', 'direita'][x]}`, onclick: () => { anchor = [x / 2, y / 2]; cells.forEach((c) => c.classList.remove('on')); b.classList.add('on'); } });
    if (x === 1 && y === 1) b.classList.add('on');
    cells.push(b); grid.append(b);
  }
  return openDialog({
    title: 'Tamanho da tela', size: 'sm',
    body: [h('p.dlg-text', 'Aumenta ou corta a área de desenho sem esticar os desenhos.'), h('div.row2', wf.el, hf.el), h('div.fld', h('span.fld-label', 'Ancorar em'), grid)],
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Aplicar', primary: true, onClick: (c) => c({ w: wf.value, h: hf.value, ax: anchor[0], ay: anchor[1] }) }],
  });
}

export function paperDialog(project) {
  let value = project.background;
  const picker = new ColorPicker({ color: hexToRgba(value || '#ffffff'), alpha: false, onChange: (c) => { value = rgbaToHex(c); choice.el.querySelectorAll('button').forEach((b) => b.classList.remove('on')); } });
  const choice = choiceField('Cores prontas', PAPER_COLORS.map((c) => ({ value: c.value, label: c.label })), value, (v) => { value = v; if (v) picker.set(hexToRgba(v)); });
  return openDialog({
    title: 'Cor do papel', size: 'sm', dismissValue: undefined,
    body: [choice.el, picker.el, h('p.hint', 'O papel aparece no vídeo e no GIF. Transparente exporta PNG com fundo vazio.')],
    buttons: [{ label: 'Cancelar', value: undefined }, { label: 'Aplicar', primary: true, onClick: (c) => c(value) }],
  });
}

/**
 * @returns {Promise<null|object>} opções escolhidas
 */
export function exportDialog(project, ws) {
  const vf = videoFormats();
  const formats = [
    { value: 'video', label: 'Vídeo', icon: 'film', disabled: !vf.length },
    { value: 'gif', label: 'GIF', icon: 'image' },
    { value: 'png', label: 'PNG', icon: 'image' },
    { value: 'sequence', label: 'Sequência', icon: 'layers' },
    { value: 'sheet', label: 'Sprite sheet', icon: 'grid' },
    { value: 'project', label: 'Projeto', icon: 'save' },
  ].filter((f) => !f.disabled);
  let fmt = formats[0].value;
  const rangeOpts = { all: `Todos os quadros (${project.frames.length})` };
  if (ws.range) { const [a, b] = ws.frameSpan; rangeOpts.sel = `Selecionados (${a + 1}–${b + 1})`; }
  for (const t of project.tags) rangeOpts['tag:' + t.id] = `Trecho "${t.name}" (${t.from + 1}–${t.to + 1})`;
  rangeOpts.current = `Só o quadro atual (${ws.frameIndex + 1})`;
  const range = selectField('Quadros', rangeOpts, ws.range ? 'sel' : 'all');
  const sizeOut = h('span.hint');
  const scale = rangeField('Tamanho', 100, { min: 10, max: 400, step: 5, unit: '%', onInput: () => updateSize() });
  const bg = checkField('Incluir a cor do papel', !!project.background, project.background ? '' : 'o projeto está com papel transparente');
  const dither = checkField('Pontilhado suave', true, 'disfarça faixas em degradês; desligue para arquivos menores');
  const loops = numberField('Repetições', 1, { min: 1, max: 50 });
  const vformat = selectField('Formato', Object.fromEntries(vf.map((f) => [f.id, f.label])), vf[0]?.id);
  const columns = numberField('Colunas', 0, { min: 0, max: 64 });
  const sections = {
    video: [vformat.el, loops.el, project.audio ? h('p.hint', 'O áudio do projeto entra no vídeo. A gravação acontece em tempo real.') : h('p.hint', 'A gravação acontece em tempo real, como uma reprodução.')],
    gif: [bg.el, dither.el],
    png: [bg.el],
    sequence: [bg.el],
    sheet: [bg.el, columns.el, h('p.hint', 'Colunas = 0 escolhe automaticamente. Gera um .zip com a imagem e um .json com as posições dos quadros.')],
    project: [h('p.dlg-text', 'Salva um arquivo .as2d com todas as camadas, quadros, trechos, paleta e áudio. Use para fazer cópia de segurança ou abrir em outro aparelho.')],
  };
  const opts = h('div.export-opts');
  const common = h('div.export-opts', range.el, scale.el, sizeOut);
  const updateSize = () => {
    const s = scale.value / 100;
    sizeOut.textContent = `Saída: ${Math.round(project.width * s)}×${Math.round(project.height * s)} px`;
  };
  const show = () => {
    common.hidden = fmt === 'project';
    if (fmt === 'png') range.input.value = 'current';
    opts.replaceChildren(...sections[fmt]);
  };
  const choice = choiceField('Formato', formats, fmt, (v) => { fmt = v; show(); });
  updateSize();
  show();
  return openDialog({
    title: 'Exportar', size: 'md',
    body: [choice.el, common, opts],
    buttons: [{ label: 'Cancelar', value: null }, {
      label: 'Exportar', primary: true,
      onClick: (close) => close({
        format: fmt, range: range.value, scale: scale.value / 100, background: bg.value, dither: dither.value,
        loops: loops.value, video: vf.find((f) => f.id === vformat.value), columns: columns.value,
      }),
    }],
  });
}

export const formatIcon = (f) => icon(f === 'video' ? 'film' : 'image');
