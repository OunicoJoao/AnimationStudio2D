# Arquitetura

O AnimationStudio 2D é um app de página única sem framework e sem build obrigatório:
o navegador carrega `src/main.js` como módulo ES. A organização segue SOLID de forma prática.

## Camadas

```
ui/ ─────────► app/ (serviços, comandos) ─────► model/ + history/
 │                 │                               ▲
 ▼                 ▼                               │
input/ ──► tools/ ──► brush/, raster/, render/ ────┘
                         io/ (arquivos, exportação)
```

- **core, raster, brush (exceto pontas), io/zip, io/gif, render/Viewport** são puros: não tocam
  no DOM e têm testes em `tests/`.
- **model** guarda dados: `Project` (camadas × quadros; cada célula é um canvas), `Selection`
  (máscara alfa) e `Floating` (conteúdo sendo transformado). Não conhece interface nem histórico.
- **history** implementa o padrão Command. `CelPatch` guarda só o retângulo alterado
  (antes/depois), e o `History` descarta passos antigos por quantidade e por memória.
- **app** contém os casos de uso: `LayerOps`, `FrameOps`, `ImageOps`, `SelectionOps`,
  `PaintService`, `FloatService`, `Playback`, `AudioTrack`, `FileService`, `Autosave`.
- **ui** são componentes que só leem o estado e chamam comandos/serviços.

## Princípios aplicados

- **Responsabilidade única**: cada ferramenta é uma classe; cada operação de domínio fica num
  serviço; renderização (`StageView`), composição (`Compositor`) e transformação de vista
  (`Viewport`) são separadas.
- **Aberto/fechado**: menus, atalhos e botões leem o registro de `Commands`; uma ferramenta nova
  entra em `TOOL_LAYOUT` e descreve suas opções em `options()` — a barra de opções é gerada.
- **Substituição de Liskov**: todas as ferramentas cumprem o contrato de `tools/Tool.js`
  (`down/move/up/cancel/options/drawOverlay`); `EraserTool` estende `BrushTool` mudando só o modo.
- **Segregação de interfaces**: ferramentas recebem um `ToolContext` enxuto; componentes de UI
  recebem só as dependências que usam.
- **Inversão de dependência**: só `main.js` cria serviços; o modelo recebe uma fábrica de canvas
  (por isso os testes usam um canvas falso).

## Fluxo de um traço

1. `PointerInput` converte o evento (com pressão e eventos coalescidos) em `ToolEvent`.
2. `BrushTool` alimenta o `BrushEngine`: `Stabilizer` → `StrokeSampler` (curvas quadráticas e
   espaçamento constante) → carimbos da ponta tingida num canvas de traço, com simetria.
3. `StageView` pede ao `FrameCompositor` o quadro com a pré-visualização: camadas abaixo e acima
   ficam em cache, só a camada ativa é recomposta a cada movimento.
4. Ao soltar, `PaintService.commitStroke` aplica o traço na célula (borracha, trava de alfa e
   seleção usam a mesma regra da pré-visualização) e registra um `CelPatch`.
5. O `Autosave` percebe o novo passo no histórico e salva no IndexedDB só as células alteradas.

## Persistência

- IndexedDB: `meta` (lista da galeria com miniatura), `docs` (JSON do projeto + áudio) e `cels`
  (uma PNG por célula, chave `projeto|camada:quadro`).
- Arquivo `.as2d`: ZIP sem compressão com `project.json`, `cels/*.png` e `audio/*`.
- O service worker (`sw.js`) é gerado com a lista de arquivos e uma versão pelo conteúdo.
