# Repertório Maker — app de montagem de setlist

App estático (HTML/CSS/JS puro, sem build) para montar o repertório arrastando
músicas de um banco de dados, com filtros e impressão em PDF no formato
"Jack's House" (Anton/Bebas Neue, caixa alta, tabela ocupando 92% da folha).

## Estrutura

```
index.html
css/style.css
js/app.js
data/musicas.csv   <- seu banco de dados
```

## Formato do CSV (`data/musicas.csv`)

Colunas esperadas (cabeçalho na primeira linha, acentos tanto faz):

```
Nome, banda, afinação, quem começa, categoria, nacional/internacional
```

- `Nome` e `banda` aparecem no card e na janelinha de detalhes.
- `afinação` e `quem começa` viram o comentário à direita no PDF impresso
  (ex.: `DROP D | GUITARRA`); deixe em branco quando não se aplicar.
- `categoria` e `nacional/internacional` alimentam os filtros do banco de
  músicas.

Delimitador `,` ou `;` funcionam (detecção automática), e arquivos salvos
pelo Excel brasileiro (com BOM/acentos) também funcionam sem ajuste.

## Como usar

- **Tela de início**: ao abrir o app, escolha um CSV (seletor de arquivo
  nativo) ou toque em "Usar exemplo" para carregar o banco de dados padrão.
- **Botões Repertório / Ambos / Banco** (barra no topo): alternam a tela
  entre só o repertório, as duas metades (padrão) ou só o banco de músicas.
- **Tela de cima — Repertório**: as músicas do seu setlist. Arraste
  (mouse ou dedo) para reordenar; o botão ✕ remove. Segurar ou passar o
  mouse por 1s mostra banda/afinação/quem começa/categoria/nacional.
- **Tela de baixo — Banco de Músicas**: toque/clique numa música para
  adicionar ao repertório. Os três filtros (afinação, categoria,
  nacional/internacional) restringem a lista. Segurar/hover também mostra
  os detalhes aqui.
- **Importar CSV**: abre o seletor de arquivo nativo do sistema; escolher um
  CSV troca o banco de músicas e reinicia o repertório. **CSV de exemplo**
  baixa um modelo pronto (mesmas colunas) pra editar no Excel/Sheets.
- **Imprimir Repertório**: gera as páginas no formato Jack's House (20
  músicas por página) e abre o diálogo de impressão do navegador — escolha
  "Salvar como PDF" para exportar o arquivo.
- O repertório montado fica salvo no navegador (localStorage), então
  recarregar a página não perde o que você já montou.

## Publicar no GitHub Pages

1. Crie um repositório novo (ou use um existente) e suba estas pastas/arquivos
   na raiz (ou em `/docs`, à sua escolha).
2. No GitHub: **Settings → Pages → Source**, aponte para a branch/pasta onde
   os arquivos estão.
3. Espere o link ficar disponível (aparece na mesma tela de Settings → Pages).

Não tem passo de build — é servir os arquivos estáticos como estão.

## Personalizar

- Trocar o banco de músicas: edite `data/musicas.csv` (mesmo cabeçalho).
- Trocar o título padrão do PDF: campo de texto ao lado do botão Imprimir.
- Ajustar quantas músicas por página no PDF: constante `PER_PAGE` no topo
  de `js/app.js` (padrão 20).
