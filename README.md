# AnimationStudio 2D

Estúdio web de desenho e animação 2D quadro a quadro, com traço suave (não pixel art).
Inspirado no FlipaClip e no Pixelado: o mesmo conjunto de funções do Pixelado, refeito para
desenho com pincéis antisserrilhados, pressão da caneta e exportação em vídeo.

Escrito em HTML, CSS e JavaScript puro (módulos ES), **sem dependências**. Funciona no computador
(mouse e teclado) e em tablets e celulares (toque e caneta), e pode ser instalado como app (PWA)
que abre em tela cheia e funciona sem internet. Os projetos ficam guardados no próprio aparelho.

---

## Rodar no computador

Módulos ES e service worker precisam de `http://` (abrir o `index.html` direto não funciona).

```bash
npm run serve        # http://localhost:5173  (Node 20+)
npm test             # testes unitários (node:test)
npm run build        # atualiza o sw.js depois de mudar arquivos
npm run icons        # regenera os ícones a partir de docs/icon/icon.jpg (precisa do Pillow)
```

Qualquer servidor estático também serve (`python3 -m http.server`, extensão Live Server etc.).

## Publicar e instalar no tablet (GitHub Pages)

1. Crie um repositório no GitHub e envie esta pasta:
   ```bash
   git remote add origin https://github.com/SEU-USUARIO/AnimationStudio2D.git
   git push -u origin main
   ```
2. No repositório: **Settings → Pages → Deploy from a branch → `main` / `(root)` → Save**.
3. Em um ou dois minutos o app estará em `https://SEU-USUARIO.github.io/AnimationStudio2D/`.
4. No tablet, abra o endereço no Chrome e toque em **Instalar app** (na tela inicial do app ou no
   menu ⋮ do Chrome). Depois da primeira abertura ele funciona offline.

Sempre que mudar algo, rode `npm run build` antes de enviar: o `sw.js` ganha uma versão nova e o
app instalado mostra o aviso **"Há uma versão nova"**.

---

## Funcionalidades

| Área | O que tem |
|---|---|
| Projetos | Galeria com miniaturas, novo projeto com tamanhos prontos (HD, 720p, quadrado, vertical, 4:5) ou personalizado, cor do papel (ou transparente), fps; renomear, duplicar, excluir; salvamento automático no aparelho (IndexedDB, incremental) |
| Pincéis | Caneta, lápis (grão), nanquim (ponta chanfrada), marcador (opacidade sem acúmulo), aerógrafo, pincel macio e giz; tamanho 1–500 px, opacidade, **suavização (estabilizador)**, pressão da caneta no tamanho e/ou fluxo; borracha dura e macia; Shift+clique traça reta a partir do último ponto; `[` e `]` mudam o tamanho |
| Ferramentas | Balde (tolerância, todas as camadas ou só a atual, "avançar sob o traço" para cobrir a borda suave das linhas), laço de preenchimento (pintar ou apagar), formas (linha, seta, retângulo, retângulo arredondado, elipse; contorno, preenchida ou contorno + 2ª cor), degradê linear/radial, texto, conta-gotas, seleção (retângulo, elipse, laço; somar/subtrair/interseção), varinha mágica, mover e transformar (mover, escalar, girar, espelhar), mão e zoom |
| Simetria e guias | Simetria vertical, horizontal, quatro quadrantes e radial (2–16 cópias) para pincel, borracha, formas e laço; grade configurável |
| Camadas | Nova, duplicar, excluir, reordenar arrastando, mesclar para baixo, achatar, visibilidade, bloqueio, opacidade, 16 modos de mesclagem, **travar transparência** (pintar só dentro do desenho) |
| Animação | Linha do tempo com miniaturas, novo quadro (vazio, antes/depois), duplicar, excluir, copiar/colar quadros, mover arrastando, seleção de vários (Shift), inverter, **duração por quadro** (animar "em dois"), fps, laço, **onion skin** colorido configurável (antes/depois), **trechos** (tags) com direção para frente/ao contrário/pingue-pongue, janela de prévia flutuante |
| Áudio | Importar uma trilha (MP3, WAV, OGG, M4A), forma de onda na linha do tempo, deslocamento e volume; toca junto e entra no vídeo |
| Imagem | Redimensionar, tamanho da tela com âncora, girar 90°/180°, espelhar, recortar para a seleção, aparar bordas; brilho/contraste, matiz/saturação, desfocar e contorno com prévia, inverter, escala de cinza |
| Cores | Seletor HSV com opacidade e hex, cores recentes, paleta por projeto, paletas prontas, importar `.gpl`, `.pal`, `.hex`, `.txt` e exportar `.gpl` |
| Arquivos | Projeto `.as2d` (ZIP com JSON + PNG por célula + áudio); abrir imagens, sequências e GIF animado (quadros); arrastar e soltar; colar imagens de outros apps |
| Exportar | **Vídeo** (MP4 ou WebM, com áudio), **GIF animado** (codificador próprio com pontilhado suave), PNG, sequência PNG (.zip), sprite sheet PNG + JSON; escala de 10% a 400% |
| Visual | Tema claro, **escuro** e do sistema; modo canhoto; vista com zoom, giro e espelho; tela cheia |
| Segurança | Desfazer/refazer para tudo (até 150 passos, com limite de memória), aviso antes de fechar com alterações pendentes |

### Toque e caneta

| Gesto | O que faz |
|---|---|
| 1 dedo / caneta | Desenha com a ferramenta atual (caneta com pressão) |
| Pinça com 2 dedos | Zoom, mover e girar a vista (ímã em 0° e 90°) |
| Toque rápido com 2 dedos | Desfazer |
| Toque rápido com 3 dedos | Refazer |
| Tocar e segurar | Conta-gotas |
| Caneta detectada | O dedo passa a só navegar, evitando riscos com a palma (Ver › Modo caneta) |

Atalhos de teclado: **F1** dentro do editor.

---

## Estrutura

```
index.html              página do app (carrega src/main.js como módulo)
manifest.webmanifest    manifesto do app instalável
sw.js                   service worker gerado por scripts/build.mjs (offline)
icons/                  ícones gerados a partir de docs/icon/icon.jpg
styles/                 tokens (tema claro/escuro), base, galeria, editor, painéis, diálogos
src/
  main.js               raiz de composição: cria serviços e injeta dependências
  core/                 matemática, cores, eventos, ids (puros)
  model/                Project (camadas × quadros), Selection, Floating
  history/              History (Command + orçamento de memória), CelPatch
  raster/               preenchimento, contorno e filtros sobre pixels (puros)
  brush/                motor de pincel, estabilizador, amostragem, pontas, simetria
  render/               Viewport, StageView, composição e caches (onion, miniaturas)
  tools/                uma classe por ferramenta + ToolManager
  input/                ponteiro/toque/caneta e teclado
  app/                  serviços de aplicação: Workspace, ops de camada/quadro/imagem/seleção,
                        reprodução, áudio, arquivos, salvamento automático, comandos
  io/                   ZIP, GIF, arquivo .as2d, IndexedDB, exportadores
  ui/                   componentes de interface e diálogos
tests/                  testes unitários (node --test)
scripts/                build do service worker, servidor de desenvolvimento, ícones
docs/                   referências de design, ícone e ARCHITECTURE.md
```

Veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para as decisões de arquitetura.
