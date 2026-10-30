# Repertório Digital

App estático (HTML + CSS + JS puro, sem build) para montar setlists de banda.
Roda **100% offline** no navegador, com um "banco de dados" local que **simula
chamadas de API** — para validar o modelo antes de ir pro online.

## Funcionalidades

- **Login / criar conta** (local, por navegador). Demo: **adm / adm**.
- **Bandas** → **Repertórios** → **Editor**
- Editor com **duas abas** (formato 16:9 de celular; no desktop simula a tela do celular):
  - **Repertório**: músicas **arrastáveis na vertical** (Nome + ✎ editar + ✕ remover) e botão **▶ Play**.
  - **Músicas**: banco da banda com **filtros** (afinação, categoria, nacional/internacional); **tocar numa música a adiciona ao repertório**. O botão redondo **+** no canto inferior direito cria uma música nova.
- **Menu lateral (☰)**, que abre/fecha pelo mesmo botão (ou ✕, toque fora, Esc):
  - Importar banco de músicas (CSV) · Baixar modelo (CSV)
  - Importar repertório (CSV) · Baixar repertório (CSV) · **Imprimir**
- **Segurar o dedo / deixar o mouse 1 s** sobre uma música mostra os detalhes (banda, afinação, quem começa, categoria, nacional/internacional, anotação).
- **Anotações:** ✎ numa música abre o modal de edição (dados + anotação + Excluir); um ● marca as que têm nota.
- **▶ Play:** um slide por música (nome, banda, afinação, quem começa e a anotação em letra grande). **Role para a direita/esquerda** (dedo, trackpad, ‹ ›, teclas ← →) para passar de música; edite a anotação ali mesmo. Tocar numa música do repertório abre o Play nela. Esc fecha.
- **Repertório em CSV (com os dados das músicas):** o arquivo baixado tem `Ordem, Nome, banda, afinação, quem começa, categoria, nacional/internacional, Anotação`. Ao importar, as músicas que ainda não existem no banco são criadas, as existentes são atualizadas e o repertório atual é **substituído** (com confirmação) na ordem do arquivo (coluna `Ordem`, se houver).
- **Imprimir** (menu): folhas no formato "Jack's House" (A4, 20 músicas por página, tabela em 92% da largura, TUDO EM CAIXA ALTA, Anton/Bebas Neue, sem estourar a linha) — na janela de impressão escolha **Salvar como PDF**. O título é editável no menu.

## Estrutura

```
index.html        telas e modais
css/style.css     visual + folhas de impressão
js/api.js         API FALSA (localStorage) — única camada que conversa com "o banco"
js/app.js         interface; só fala com window.RepertorioAPI
js/csv-schema.js  leitura tolerante do CSV (dicionário de cabeçalhos/typos + normalização)
data/musicas.csv  exemplo (setlist real), carregado pelo botão "Carregar exemplo"
```

## Login demo

Usuário **adm** · senha **adm** (criado automaticamente pela API local; remover ao ir pro online). Qualquer pessoa também pode usar "Criar conta".

## Rodar localmente

Precisa de um servidor HTTP simples (para o botão "Carregar exemplo" ler o CSV):

```
python -m http.server 8000
# abra http://localhost:8000
```

Sem internet: o app depende de PapaParse e das fontes Google (CDN). Para uso 100% sem rede,
baixe `papaparse.min.js` e as fontes Anton/Bebas Neue para o projeto e ajuste as tags
no `index.html` (a impressão usa essas fontes).

## GitHub Pages

1. Crie um repositório e envie todos estes arquivos na raiz.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. Acesse `https://SEU_USUARIO.github.io/NOME_DO_REPO/`.

## Formato do CSV

```
Nome,banda,afinação,quem começa,categoria,nacional/internacional,Anotação
```

- Só **Nome** é obrigatório; as colunas podem vir em qualquer ordem e a de anotação é opcional (aceita também `Observações`, `Notas`...).
- **Cabeçalho tolerante:** maiúsculas/minúsculas, acentos, espaços e pontuação são ignorados
  (`AFINAÇÃO`, `afinacao`, `Quem Começa`…). Além disso há um **dicionário de typos/apelidos por coluna**
  em `js/csv-schema.js` (`HEADER_DICTIONARY`) — ex.: `afinacoa`, `quem comessa`, `categoira`, `nac/int`,
  `anotacoes`… — mais uma aproximação automática para erros de 1–2 letras.
  Para ensinar um typo novo, basta acrescentar o texto na lista da coluna.
- Colunas desconhecidas são ignoradas e listadas na mensagem de importação.
- **Valores normalizados:** afinação em MAIÚSCULAS, categoria como "Rock", nacional/internacional como
  "Nacional" ou "Internacional" (assim os filtros não duplicam `ROCK`/`rock`); aspas soltas são removidas.
- A importação **atualiza** músicas que já existem (mesmo nome + banda) e cria as novas. Célula de anotação vazia **não apaga** a anotação que o usuário já escreveu.

## A "API" local e como trocar por um backend real

`js/api.js` expõe `window.RepertorioAPI`. Toda função devolve uma **Promise** e erra com
`ApiError(code, message)`:

| Grupo | Funções |
|---|---|
| `auth` | `register`, `login`, `logout`, `me` |
| `bands` | `list`, `create`, `get`, `remove` (apaga músicas e repertórios junto) |
| `songs` | `list(bandId)`, `create(bandId, dados)`, `update`, `remove`, `importCsv(bandId, rows)` |
| `repertoires` | `list(bandId)`, `get`, `create(bandId, titulo)`, `rename`, `remove`, `setSongIds(id, ids)` |

Dados ficam no `localStorage` com prefixo `repertorio-digital:v2:`
(tabelas `users`, `bands`, `songs`, `repertoires`, `session`). O prefixo é **v2** para não misturar com versões antigas publicadas no mesmo domínio (localStorage é por domínio).
Para ir pro online (ex.: Supabase), reescreva **somente** o `api.js` mantendo estas funções e formatos.
`app.js` não toca em `localStorage` para dados (só guarda a preferência de visão).

> ⚠ **Segurança:** a senha aqui é só embaralhada (`fakeHash`) e qualquer pessoa com acesso
> ao navegador lê tudo. É um *placeholder* para validar fluxo. Autenticação de verdade
> (hash, sessão, permissões) precisa ser feita no backend.

## Limitações atuais

- Dados presos ao navegador/computador (limpar dados do site apaga tudo).
- Sem PWA/service worker (offline total exige baixar as dependências, ver acima).
