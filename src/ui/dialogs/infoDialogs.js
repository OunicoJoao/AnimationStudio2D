/**
 * Diálogos de ajuda e preferências: atalhos, gestos, sobre, preferências,
 * onion skin e guias (grade e simetria).
 * @module ui/dialogs/infoDialogs
 */
import { h, icon, kbd } from '../dom.js';
import { openDialog } from '../feedback.js';
import { checkField, choiceField, numberField, rangeField } from '../form.js';
import { SYMMETRY_MODES } from '../../brush/Symmetry.js';

export function shortcutsDialog(commands, toolClasses) {
  const rows = [];
  const add = (label, key) => rows.push(h('tr', h('td', label), h('td', key.split(' / ').map((k) => h('kbd', kbd(k))))));
  for (const C of toolClasses) if (C) add(C.label, C.key);
  add('Mão temporária', 'Space');
  add('Conta-gotas temporário', 'Alt');
  add('Tamanho do pincel', '[ / ]');
  for (const c of commands.map.values()) if (c.key) add(c.label, c.key);
  return openDialog({
    title: 'Atalhos de teclado', size: 'md',
    body: h('div.table-wrap', h('table.keys', h('tbody', rows))),
  });
}

export function gesturesDialog() {
  const rows = [
    ['touch', '1 dedo', 'Desenha com a ferramenta atual (no modo caneta, só move a vista)'],
    ['stylus', 'Caneta', 'Desenha com pressão. Ao detectar a caneta, o dedo passa a só navegar'],
    ['zoom', 'Pinça com 2 dedos', 'Aproxima, afasta, move e gira a vista (ímã em 0° e 90°)'],
    ['undo', 'Toque rápido com 2 dedos', 'Desfazer'],
    ['redo', 'Toque rápido com 3 dedos', 'Refazer'],
    ['eyedropper', 'Tocar e segurar', 'Conta-gotas: pega a cor sob o dedo'],
    ['palette', 'Segurar uma cor da paleta', 'Define a cor secundária'],
    ['frameAdd', 'Arrastar um quadro', 'Muda a ordem dos quadros (Shift+toque seleciona vários)'],
    ['layers', 'Arrastar uma camada', 'Muda a ordem das camadas'],
  ];
  return openDialog({
    title: 'Gestos de toque e caneta', size: 'md',
    body: h('ul.gestures', rows.map(([ic, g, d]) => h('li', h('span.g-ic', icon(ic, 22)), h('div', h('b', g), h('span', d))))),
  });
}

export function aboutDialog(version) {
  return openDialog({
    title: 'Sobre o AnimationStudio', size: 'sm',
    body: [
      h('div.about', h('img', { src: 'icons/mascot.png', alt: '', width: 96, height: 96 }),
        h('div', h('p.about-name', 'AnimationStudio 2D'), h('p.hint', `Versão ${version}`))),
      h('p.dlg-text', 'Desenho e animação quadro a quadro com traço suave, camadas, onion skin e exportação para vídeo, GIF e imagens. Funciona sem internet depois da primeira visita e guarda tudo no seu aparelho.'),
    ],
  });
}

export function preferencesDialog(settings) {
  const theme = choiceField('Tema', [
    { value: 'light', label: 'Claro', icon: 'sun' }, { value: 'dark', label: 'Escuro', icon: 'moon' }, { value: 'system', label: 'Sistema', icon: 'monitor' },
  ], settings.get('theme'), (v) => settings.set('theme', v));
  const pen = checkField('Modo caneta', settings.get('penOnly'), 'o dedo só move e dá zoom; a caneta desenha');
  const left = checkField('Canhoto', settings.get('leftHanded'), 'ferramentas à direita e painéis à esquerda');
  pen.input.addEventListener('change', () => { settings.set('penOnly', pen.value); settings.set('penOnlyChosen', true); });
  left.input.addEventListener('change', () => settings.set('leftHanded', left.value));
  return openDialog({ title: 'Preferências', size: 'sm', body: [theme.el, pen.el, left.el] });
}

export function onionDialog(settings) {
  const o = settings.get('onion');
  const on = checkField('Mostrar onion skin', o.on);
  const before = numberField('Quadros antes', o.before, { min: 0, max: 5 });
  const after = numberField('Quadros depois', o.after, { min: 0, max: 5 });
  const op = rangeField('Opacidade', Math.round(o.opacity * 100), { min: 5, max: 90, unit: '%' });
  const tint = checkField('Colorir (vermelho antes, verde depois)', o.tint);
  return openDialog({
    title: 'Onion skin', size: 'sm',
    body: [h('p.hint', 'Mostra os quadros vizinhos em transparência para guiar o movimento.'), on.el, h('div.row2', before.el, after.el), op.el, tint.el],
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Aplicar', primary: true, onClick: (c) => {
      settings.patch('onion', { on: on.value, before: before.value, after: after.value, opacity: op.value / 100, tint: tint.value });
      c(true);
    } }],
  });
}

export function guidesDialog(settings) {
  const g = settings.get('grid'), s = settings.get('symmetry');
  const gon = checkField('Mostrar grade', g.on);
  const gsize = numberField('Tamanho da grade', g.size, { min: 4, max: 1024, unit: 'px' });
  let mode = s.mode;
  const sym = choiceField('Simetria', Object.entries(SYMMETRY_MODES).map(([value, label]) => ({ value, label: label.split(' (')[0] })), s.mode, (v) => { mode = v; });
  const count = numberField('Cópias na radial', s.count, { min: 2, max: 16 });
  return openDialog({
    title: 'Grade e simetria', size: 'sm',
    body: [gon.el, gsize.el, sym.el, count.el, h('p.hint', 'A simetria vale para pincel, borracha, formas e laço de preenchimento.')],
    buttons: [{ label: 'Cancelar', value: null }, { label: 'Aplicar', primary: true, onClick: (c) => {
      settings.patch('grid', { on: gon.value, size: gsize.value });
      settings.patch('symmetry', { mode, count: count.value });
      c(true);
    } }],
  });
}
