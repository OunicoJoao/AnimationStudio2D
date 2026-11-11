/**
 * Diálogos de edição: ajustes/filtros com prévia, camada, duração, velocidade,
 * trechos, texto, cor e áudio.
 * @module ui/dialogs/editDialogs
 */
import { h } from '../dom.js';
import { openDialog } from '../feedback.js';
import { textField, numberField, choiceField, checkField, selectField, rangeField } from '../form.js';
import { ColorPicker } from '../ColorPicker.js';
import { BLEND_MODES, TAG_DIRECTIONS } from '../../model/Project.js';
import { TAG_COLORS } from '../../app/ops/FrameOps.js';
import { TEXT_FONTS } from '../../tools/MiscTools.js';
import { debounce } from '../../core/debounce.js';

/** Definição dos controles de cada filtro ajustável. */
const ADJUST = {
  brightnessContrast: { title: 'Brilho e contraste', fields: [['brightness', 'Brilho', -100, 100, 0], ['contrast', 'Contraste', -100, 100, 0]] },
  hueSaturation: { title: 'Matiz e saturação', fields: [['hue', 'Matiz', -180, 180, 0, '°'], ['saturation', 'Saturação', -100, 100, 0], ['lightness', 'Luminosidade', -100, 100, 0]] },
  blur: { title: 'Desfocar', fields: [['radius', 'Raio', 1, 60, 6, ' px']] },
  outline: { title: 'Contorno', fields: [['size', 'Espessura', 1, 30, 4, ' px']], color: true },
};

/**
 * Ajuste com prévia ao vivo no quadro atual.
 * @param {keyof ADJUST} id
 * @param {import('../../app/ops/ImageOps.js').ImageOps} imageOps
 * @param {import('../../app/Colors.js').Colors} colors
 */
export async function adjustDialog(id, imageOps, colors) {
  const def = ADJUST[id];
  const params = {};
  let restore = () => {};
  const preview = debounce(() => { restore(); restore = imageOps.previewFilter(id, { ...params }); }, 60);
  const fields = def.fields.map(([key, label, min, max, val, unit = '']) => {
    params[key] = val;
    return rangeField(label, val, { min, max, unit, onInput: (v) => { params[key] = v; preview(); } }).el;
  });
  if (def.color) params.color = [...colors.fg];
  const scope = choiceField('Aplicar em', [{ value: 'span', label: 'Quadro atual / selecionados' }, { value: 'all', label: 'Todos os quadros da camada' }], 'span');
  preview();
  const ok = await openDialog({
    title: def.title, size: 'sm', dismissValue: false,
    body: [...fields, def.color ? h('p.hint', 'O contorno usa a cor principal.') : null, scope.el, h('p.hint', 'A prévia mostra o quadro atual. Funciona dentro da seleção, se houver.')],
    buttons: [{ label: 'Cancelar', value: false }, { label: 'Aplicar', primary: true, value: true }],
  });
  preview.cancel();
  restore();
  if (ok) imageOps.applyFilter(id, params, scope.value);
}

export function layerPropsDialog(layer) {
  const name = textField('Nome', layer.name, { maxLength: 60, autofocus: true });
  const op = rangeField('Opacidade', Math.round(layer.opacity * 100), { min: 0, max: 100, unit: '%' });
  const blend = selectField('Mesclagem', BLEND_MODES, layer.blend);
  const alpha = checkField('Travar transparência', layer.alphaLock, 'pinta só onde já existe desenho');
  const locked = checkField('Bloquear camada', layer.locked);
  return openDialog({
    title: 'Propriedades da camada', size: 'sm',
    body: [name.el, op.el, blend.el, alpha.el, locked.el],
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Salvar', primary: true, onClick: (c) => c({ name: name.value.trim() || layer.name, opacity: op.value / 100, blend: blend.value, alphaLock: alpha.value, locked: locked.value }) }],
  });
}

export function holdDialog(hold, fps) {
  const f = numberField('Fica na tela por', hold, { min: 1, max: 48, unit: 'tempos' });
  const ms = h('p.hint');
  const upd = () => { ms.textContent = `≈ ${Math.round((f.value * 1000) / fps)} ms a ${fps} fps. Use 2 para animar "em dois" (o mesmo desenho por dois tempos).`; };
  f.input.addEventListener('input', upd);
  upd();
  return openDialog({
    title: 'Duração do quadro', size: 'sm',
    body: [f.el, ms],
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Aplicar', primary: true, onClick: (c) => c(f.value) }],
  });
}

export function fpsDialog(fps) {
  const f = numberField('Quadros por segundo', fps, { min: 1, max: 60, unit: 'fps' });
  return openDialog({
    title: 'Velocidade', size: 'sm',
    body: [f.el, h('p.hint', '12 fps é o padrão de muitos desenhos animados; 24 fps é o do cinema.')],
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Aplicar', primary: true, onClick: (c) => c(f.value) }],
  });
}

/** Criar ou editar um trecho. Devolve {action:'save', values} ou {action:'delete'}. */
export function tagDialog(tag, total) {
  const name = textField('Nome', tag.name, { maxLength: 40, autofocus: true });
  const from = numberField('Do quadro', tag.from + 1, { min: 1, max: total });
  const to = numberField('Até o quadro', tag.to + 1, { min: 1, max: total });
  const dir = choiceField('Direção', Object.entries(TAG_DIRECTIONS).map(([value, label]) => ({ value, label })), tag.dir);
  const color = choiceField('Cor', TAG_COLORS.map((c) => ({ value: c, label: '', title: c })), tag.color || TAG_COLORS[0]);
  color.el.querySelectorAll('button').forEach((b, i) => { b.style.setProperty('--swatch', TAG_COLORS[i]); b.classList.add('color-dot'); });
  const buttons = [{ label: 'Cancelar', value: null }];
  if (tag.id) buttons.push({ label: 'Excluir trecho', danger: true, value: { action: 'delete' } });
  buttons.push({ label: 'Salvar', primary: true, onClick: (c) => {
    const a = from.value - 1, b = to.value - 1;
    c({ action: 'save', values: { name: name.value.trim() || 'Trecho', from: Math.min(a, b), to: Math.max(a, b), dir: dir.value, color: color.value } });
  } });
  return openDialog({
    title: tag.id ? 'Editar trecho' : 'Novo trecho', size: 'sm',
    body: [h('p.hint', 'Trechos marcam partes da animação (ex.: "andar", "pular"). A reprodução repete o trecho em que você está.'), name.el, h('div.row2', from.el, to.el), dir.el, color.el],
    buttons,
  });
}

export function textDialog(opts) {
  const ta = h('textarea.field', { rows: 3, autofocus: true, placeholder: 'Digite o texto', 'aria-label': 'Texto' });
  const font = selectField('Fonte', Object.fromEntries(Object.keys(TEXT_FONTS).map((f) => [f, f])), opts.font);
  const size = numberField('Tamanho', opts.size, { min: 6, max: 600, unit: 'px' });
  const bold = checkField('Negrito', opts.bold);
  const italic = checkField('Itálico', opts.italic);
  const align = choiceField('Alinhar', [{ value: 'left', label: 'Esquerda' }, { value: 'center', label: 'Centro' }, { value: 'right', label: 'Direita' }], opts.align || 'left');
  return openDialog({
    title: 'Texto', size: 'sm',
    body: [ta, h('div.row2', font.el, size.el), h('div.row2', bold.el, italic.el), align.el, h('p.hint', 'O texto entra como imagem flutuante: mova, gire e escale antes de aplicar.')],
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Inserir', primary: true, onClick: (c) => c({ text: ta.value, font: font.value, size: size.value, bold: bold.value, italic: italic.value, align: align.value }) }],
  });
}

export function colorDialog(title, color) {
  let value = color;
  const picker = new ColorPicker({ color, onChange: (c) => { value = c; } });
  return openDialog({
    title, size: 'sm', body: picker.el,
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Usar cor', primary: true, onClick: (c) => c(value) }],
  });
}

/** Ajustes do áudio: deslocamento, volume e remoção. */
export function audioDialog(project, duration) {
  const a = project.audio;
  const off = numberField('Começa no quadro', Math.round((a.offset || 0) * project.fps) + 1, { min: 1, max: 100000 });
  const vol = rangeField('Volume', Math.round((a.volume ?? 1) * 100), { min: 0, max: 100, unit: '%' });
  const total = project.totalDurationMs() / 1000;
  return openDialog({
    title: 'Áudio', size: 'sm',
    body: [h('p.dlg-text', `${a.name} · ${duration.toFixed(1)} s (animação: ${total.toFixed(1)} s)`), off.el, vol.el,
      h('p.hint', 'O áudio toca junto com a reprodução e entra na exportação de vídeo.')],
    buttons: [{ label: 'Fechar', value: null }, { label: 'Remover áudio', danger: true, value: { remove: true } },
      { label: 'Salvar', primary: true, onClick: (c) => c({ offset: (off.value - 1) / project.fps, volume: vol.value / 100 }) }],
  });
}
