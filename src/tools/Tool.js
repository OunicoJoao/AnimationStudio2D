/**
 * Contrato das ferramentas. Cada ferramenta recebe eventos já convertidos para
 * coordenadas do documento e descreve suas opções para a barra de contexto.
 * @module tools/Tool
 */

/**
 * @typedef {object} ToolEvent
 * @property {number} x  coordenada no documento
 * @property {number} y
 * @property {number} sx coordenada na tela (px CSS, relativa ao canvas)
 * @property {number} sy
 * @property {number} p  pressão 0–1 (mouse = 1)
 * @property {number} button
 * @property {boolean} shift @property {boolean} alt @property {boolean} ctrl
 * @property {string} pointerType
 */

/**
 * @typedef {object} ToolOption
 * @property {'slider'|'select'|'toggle'|'segmented'|'button'|'color'} type
 * @property {string} [key]    caminho nas preferências (ex.: 'brush.size')
 * @property {string} label
 * @property {number} [min] @property {number} [max] @property {number} [step]
 * @property {string} [unit]
 * @property {boolean} [log]  escala logarítmica no controle deslizante
 * @property {Array<{value:any,label:string,icon?:string}>} [options]
 * @property {string} [icon]
 * @property {() => void} [action]
 * @property {() => boolean} [active]
 */

/**
 * @typedef {object} ToolContext
 * @property {import('../app/Workspace.js').Workspace} ws
 * @property {import('../app/Settings.js').Settings} settings
 * @property {import('../app/Colors.js').Colors} colors
 * @property {import('../app/PaintService.js').PaintService} paint
 * @property {import('../app/FloatService.js').FloatService} float
 * @property {import('../render/StageView.js').StageView} stage
 * @property {import('../render/Viewport.js').Viewport} viewport
 * @property {(msg: string) => void} toast
 * @property {object} ui   ações de interface (diálogos), injetadas pela composição
 */

export class Tool {
  /** @param {ToolContext} ctx */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /** @type {string} */ static id = 'tool';
  /** @type {string} */ static label = 'Ferramenta';
  /** @type {string} */ static icon = 'pen';
  /** @type {string} */ static key = '';
  /** @type {string} */ static hint = '';

  get id() { return this.constructor.id; }
  get label() { return this.constructor.label; }

  /** Cursor CSS sobre a área de desenho. */
  get cursor() { return 'crosshair'; }
  /** Esta ferramenta pinta pixels (habilita o conta-gotas com toque longo). */
  get paints() { return false; }
  /** A ferramenta mantém o conteúdo flutuante (não o aplica ao ser escolhida). */
  get keepsFloating() { return false; }

  activate() {}
  deactivate() {}
  /** @param {ToolEvent} e */ down(e) {}
  /** @param {ToolEvent} e */ move(e) {}
  /** @param {ToolEvent} e */ up(e) {}
  /** @param {ToolEvent} e */ hover(e) {}
  /** Interrompe a ação em andamento sem gravar (ex.: começou um gesto de pinça). */
  cancel() {}
  /** Tecla pressionada enquanto a ferramenta está ativa; true se tratou. */
  key(e) { return false; }
  /** @returns {ToolOption[]} */
  options() { return []; }
  /** Desenho sobre a tela em px CSS (cursor do pincel, alças…). */
  drawOverlay(g, stage) {}

  /** Atalho para pedir redesenho. */
  render() { this.ctx.stage.requestRender(); }
}
