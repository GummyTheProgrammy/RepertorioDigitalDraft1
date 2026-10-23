# Repertório Digital

App estático (HTML + CSS + JS puro, sem build) para montar setlists de banda.
Roda **100% offline** no navegador, com um "banco de dados" local que **simula
chamadas de API** — para validar o modelo antes de ir pro online.

## Funcionalidades

- **Login / criar conta** (local, por navegador)
- **Bandas** → **Repertórios** → **Editor**
- **Criar repertório**, **criar música** (botão ➕ Nova), **importar CSV**, baixar **CSV modelo**
- Tela dividida em duas metades (formato 16:9 de celular; no desktop simula a tela do celular):
  - em cima: o repertório, com músicas **arrastáveis na vertical** (só Nome + botão ✕)
  - embaixo: o banco de músicas da banda; **tocar numa música adiciona ao repertório**
- **Segurar o dedo / deixar o mouse 1 s** sobre uma música mostra os detalhes (banda, afinação, quem começa, categoria, nacional/internacional)
- Filtros: afinação, categoria, nacional/internacional
- Botões de visão: só Repertório / Ambos / só Banco
- **Imprimir**: gera as folhas no formato "Jack's House" (A4, 20 músicas por página,
  tabela em 92% da largura, TUDO EM CAIXA ALTA, fontes Anton/Bebas Neue, sem estourar a linha)
  — na janela de impressão escolha **Salvar como PDF**.

## Estrutura

```
index.html        telas e modais
css/style.css     visual + folhas de impressão
js/api.js         API FALSA (localStorage) — única camada que conversa com "o banco"
js/app.js         interface; só fala com window.RepertorioAPI
js/csv-schema.js  leitura tolerante do CSV (dicionário de cabeçalhos/typos + normalização)
data/musicas.csv  exemplo (setlist real), carregado pelo botão "Carregar exemplo"
```

## Rodar localmente

Precisa de um servidor HTTP simples (para o botão "Carregar exemplo" ler o CSV):

```
python -m http.server 8000
# abra http://localhost:8000
```

Para homologação, entre com **login `adm`** e **senha `adm`**. A conta é criada
automaticamente no armazenamento local do navegador na primeira entrada.

Sem internet: o app depende de PapaParse e das fontes Google (CDN). Para uso 100% sem rede,
baixe `papaparse.min.js` e as fontes Anton/Bebas Neue para o projeto e ajuste as tags
no `index.html` (a impressão usa essas fontes).

## GitHub Pages

1. Crie um repositório e envie todos estes arquivos na raiz.
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
3. Acesse `https://SEU_USUARIO.github.io/NOME_DO_REPO/`.

## Formato do CSV

```
Nome,banda,afinação,quem começa,categoria,nacional/internacional,Anotação Maurício,Anotação Flávio
```

- Só **Nome** é obrigatório; as colunas podem vir em qualquer ordem e as de anotação são opcionais.
- **Cabeçalho tolerante:** maiúsculas/minúsculas, acentos, espaços e pontuação são ignorados
  (`AFINAÇÃO`, `afinacao`, `Quem Começa`…). Além disso há um **dicionário de typos/apelidos por coluna**
  em `js/csv-schema.js` (`HEADER_DICTIONARY`) — ex.: `afinacoa`, `quem comessa`, `categoira`, `nac/int`,
  `anotacoes mauricio`… — mais uma aproximação automática para erros de 1–2 letras.
  Para ensinar um typo novo, basta acrescentar o texto na lista da coluna.
- Colunas desconhecidas são ignoradas e listadas na mensagem de importação.
- **Valores normalizados:** afinação em MAIÚSCULAS, categoria como "Rock", nacional/internacional como
  "Nacional" ou "Internacional" (assim os filtros não duplicam `ROCK`/`rock`); aspas soltas são removidas.
- A importação **atualiza** músicas que já existem (mesmo nome + banda) e cria as novas.

## Modalidades de impressão

O seletor ao lado do botão 🖨️ escolhe o que vai na coluna da direita:

| Modalidade | Coluna da direita |
|---|---|
| Padrão | AFINAÇÃO \| QUEM COMEÇA |
| Anot. Maurício | AFINAÇÃO \| QUEM COMEÇA \| anotação do Maurício |
| Anot. Flávio | AFINAÇÃO \| QUEM COMEÇA \| anotação do Flávio |

Partes vazias são omitidas. Em cada linha o título usa todo o espaço que sobra depois do comentário
daquela linha; texto nunca estoura nem se sobrepõe (fontes encolhem se for preciso).

## A "API" local e como trocar por um backend real

`js/api.js` expõe `window.RepertorioAPI`. Toda função devolve uma **Promise** e erra com
`ApiError(code, message)`:

| Grupo | Funções |
|---|---|
| `auth` | `register`, `login`, `logout`, `me` |
| `bands` | `list`, `create`, `get`, `remove` (apaga músicas e repertórios junto) |
| `songs` | `list(bandId)`, `create(bandId, dados)`, `update`, `remove`, `importCsv(bandId, rows)` |
| `repertoires` | `list(bandId)`, `get`, `create(bandId, titulo)`, `rename`, `remove`, `setSongIds(id, ids)` |

Dados ficam no `localStorage` com prefixo `repertorio-digital:v1:`
(tabelas `users`, `bands`, `songs`, `repertoires`, `session`).
Para ir pro online (ex.: Supabase), reescreva **somente** o `api.js` mantendo estas funções e formatos.
`app.js` não toca em `localStorage` para dados (só guarda a preferência de visão).

> ⚠ **Segurança:** a senha aqui é só embaralhada (`fakeHash`) e qualquer pessoa com acesso
> ao navegador lê tudo. É um *placeholder* para validar fluxo. Autenticação de verdade
> (hash, sessão, permissões) precisa ser feita no backend.

## Limitações atuais

- Dados presos ao navegador/computador (limpar dados do site apaga tudo).
- Sem editar/excluir música pela interface (a API já tem `update`/`remove`).
- Sem PWA/service worker (offline total exige baixar as dependências, ver acima).
