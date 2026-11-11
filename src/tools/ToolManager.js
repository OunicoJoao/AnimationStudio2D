/**
 * Registro das ferramentas, ferramenta ativa e trocas temporárias (Espaço = mão,
 * Alt = conta-gotas, toque longo = conta-gotas). Encaminha eventos e desenhos de sobreposição.
 * @module tools/ToolManager
 */
import { Emitter } from '../core/Emitter.js';
import { BrushTool, EraserTool } from './BrushTool.js';
import { FillTool, LassoFillTool, GradientTool } from './FillTools.js';
import { ShapeTool } from './ShapeTool.js';
import { SelectTool, WandTool, EyedropperTool } from './SelectTools.js';
import { TransformTool } from './TransformTool.js';
import { TextTool, HandTool, ZoomTool } from './MiscTools.js';

/** Ordem da barra de ferramentas; null = separador. */
export const TOOL_LAYOUT = [
  BrushTool, EraserTool, FillTool, LassoFillTool, null,
  ShapeTool, GradientTool, TextTool, EyedropperTool, null,
  SelectTool, WandTool, TransformTool, null,
  HandTool, ZoomTool,
];

export class ToolManager extends Emitter {
  /** @param {import('./Tool.js').ToolContext} ctx */
  constructor(ctx) {
    super();
    this.ctx = ctx;
    ctx.tools = this;
    /** @type {Map<string, import('./Tool.js').Tool>} */
    this.tools = new Map();
    for (const C of TOOL_LAYOUT) if (C) this.tools.set(C.id, new C(ctx));
    this.current = this.tools.get(ctx.settings.get('tool')) || this.tools.get('brush');
    this.temp = null;
  }

  get classes() { return TOOL_LAYOUT; }
  get active() { return this.temp || this.current; }
  get(id) { return this.tools.get(id); }

  select(id) {
    const next = this.tools.get(id);
    if (!next) return;
    if (next === this.current) { next.activate(); this.emit('change'); return; }
    this.current.cancel();
    if (this.ctx.ws.floating && !next.keepsFloating) this.ctx.float.commit();
    this.current.deactivate();
    this.current = next;
    this.temp = null;
    this.ctx.settings.set('tool', id);
    next.activate();
    this.emit('change');
    this.ctx.stage.requestRender();
  }

  /** Troca temporária enquanto uma tecla/gesto está ativo. */
  pushTemp(id) {
    const t = this.tools.get(id);
    if (!t || this.temp === t || this.current === t) return;
    this.active.cancel();
    this.temp = t;
    this.emit('change');
  }

  popTemp(id) {
    if (!this.temp || (id && this.temp.id !== id)) return;
    this.temp.cancel?.();
    this.temp = null;
    this.emit('change');
    this.ctx.stage.requestRender();
  }

  drawOverlay(g, stage) { this.active.drawOverlay(g, stage); }
}
