/*
 * csv-schema.js — leitura tolerante de CSV de músicas.
 *
 * 1) Cabeçalhos: ignora maiúsculas/minúsculas, acentos, espaços e pontuação,
 *    e consulta um DICIONÁRIO de apelidos/typos por coluna (HEADER_DICTIONARY).
 *    Se não achar no dicionário, tenta aproximação (distância de edição pequena).
 *    Para ensinar um typo novo, é só acrescentar na lista da coluna.
 * 2) Valores: normaliza caixa (afinação em MAIÚSCULAS, categoria "Rock",
 *    nacional/internacional canônico) para os filtros não duplicarem
 *    "ROCK" e "rock".
 */
(function () {
  "use strict";

  // Cada lista pode ter as variações que quiser; a comparação é feita APÓS
  // normalizar (minúsculo, sem acento, só letras/números), então "Afinação",
  // "AFINAÇÃO" e "afinacao" já são a mesma coisa — aqui entram só os typos/apelidos.
  var HEADER_DICTIONARY = {
    nome: [
      "nome", "nome da musica", "nome musica", "musica", "musicas", "titulo", "titulo da musica",
      "name", "song", "track", "nmoe", "nom", "nome da msica", "mmusica", "musca", "muzica"
    ],
    bandaOriginal: [
      "banda", "banda original", "bandaoriginal", "artista", "artist", "autor", "interprete",
      "bnada", "bada", "bnd", "banda orig", "banda/artista", "artista/banda", "cantor"
    ],
    afinacao: [
      "afinacao", "afinacoes", "afinacao da musica", "afinaçao", "afinaco", "afinasao", "afinacoa",
      "afinaçã", "afinacão", "afinacaoo", "afinnacao", "afinaçao ", "afinagem", "afinção", "afincao",
      "tuning", "tom", "afina"
    ],
    quemComeca: [
      "quem comeca", "quem comeca?", "quem começa", "quem comesa", "quem comessa", "quem comça",
      "quem coemça", "quemcomeca", "quem inicia", "quem entra", "quem abre", "comeca", "começa",
      "inicio", "inicia", "intro", "quem comeca a musica", "qm comeca", "qm começa", "quem comeca ", "quem comecar"
    ],
    categoria: [
      "categoria", "categorias", "categoira", "categora", "catergoria", "categroia", "categorai",
      "cat", "genero", "estilo", "tipo", "style", "genre"
    ],
    nacional: [
      "nacional/internacional", "nacional / internacional", "nacional internacional", "nacional-internacional",
      "nacionalinternacional", "nacional ou internacional", "nac/int", "nac./int.", "nac int", "nacint",
      "nacional e internacional", "nacional/internaciona", "nacioal/internacional", "nacional/internacioanl",
      "internacional/nacional", "nacionalidade", "origem", "nacional", "internacional", "pais"
    ],
    anotacaoMauricio: [
      "anotacao mauricio", "anotacoes mauricio", "anotacao maurício", "anotação maurício", "anotações maurício",
      "anotacao do mauricio", "anotacoes do mauricio", "anot mauricio", "anot. mauricio", "obs mauricio",
      "observacao mauricio", "anotacao maurisio", "anotacao mauricio ", "anotacao mauricío", "anotaçao mauricio",
      "anotacao mauricoi", "anotacao maurico", "anotacao mauricius", "mauricio", "maurício", "maurisio"
    ],
    anotacaoFlavio: [
      "anotacao flavio", "anotacoes flavio", "anotacao flávio", "anotação flávio", "anotações flávio",
      "anotacao do flavio", "anotacoes do flavio", "anot flavio", "anot. flavio", "obs flavio",
      "observacao flavio", "anotacao flavo", "anotacao flavio ", "anotaçao flavio", "anotacao falvio",
      "anotacao flavioo", "anotacao flavia", "flavio", "flávio", "falvio", "flavo"
    ]
  };

  var FIELD_LABELS = {
    nome: "Nome", bandaOriginal: "banda", afinacao: "afinação", quemComeca: "quem começa",
    categoria: "categoria", nacional: "nacional/internacional",
    anotacaoMauricio: "Anotação Maurício", anotacaoFlavio: "Anotação Flávio"
  };

  function norm(s) {
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Índice normalizado: alias -> campo
  var INDEX = {};
  Object.keys(HEADER_DICTIONARY).forEach(function (field) {
    HEADER_DICTIONARY[field].forEach(function (alias) { INDEX[norm(alias)] = field; });
  });
  var ALIASES = Object.keys(INDEX);

  function levenshtein(a, b) {
    var m = a.length, n = b.length, i, j, prev, cur, tmp;
    if (!m) return n; if (!n) return m;
    prev = []; for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) {
        tmp = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + tmp);
      }
      prev = cur;
    }
    return prev[n];
  }

  // devolve o campo canônico ou null
  function resolveHeader(raw) {
    var h = norm(raw);
    if (!h) return null;
    if (INDEX[h]) return INDEX[h];
    // aproximação: tolera 1 erro (até 9 letras) ou 2 (10+), só se o vencedor for único
    if (h.length < 4) return null;
    var tol = h.length >= 10 ? 2 : 1, best = 99, fields = {};
    ALIASES.forEach(function (al) {
      if (Math.abs(al.length - h.length) > tol) return;
      var d = levenshtein(h, al);
      if (d > tol) return;
      if (d < best) { best = d; fields = {}; }
      if (d === best) fields[INDEX[al]] = true;
    });
    var keys = Object.keys(fields);
    return keys.length === 1 ? keys[0] : null;
  }

  // headers: array de strings -> { map: {colIndex: campo}, unknown: [nomes], missing: [campos] }
  function mapHeaders(headers) {
    var map = {}, unknown = [], used = {};
    headers.forEach(function (h, i) {
      var f = resolveHeader(h);
      if (f && !used[f]) { map[i] = f; used[f] = true; }
      else if (String(h || "").trim()) unknown.push(String(h).trim());
    });
    var missing = Object.keys(HEADER_DICTIONARY).filter(function (f) { return !used[f]; });
    return { map: map, unknown: unknown, missing: missing };
  }

  // ---------------- valores ----------------
  function stripQuotes(v) {
    v = String(v == null ? "" : v).trim();
    while (v.length > 1 && /^["'“”].*["'“”]$/.test(v)) v = v.slice(1, -1).trim();
    return v.replace(/^["'“”]+$/, "").replace(/\s+/g, " ");
  }
  function capitalize(v) { return v ? v.charAt(0).toUpperCase() + v.slice(1).toLowerCase() : v; }

  function cleanValue(field, v) {
    v = stripQuotes(v);
    if (!v) return "";
    if (field === "afinacao") return v.toUpperCase();
    if (field === "categoria") return capitalize(v);
    if (field === "nacional") {
      var n = norm(v);
      if (n.indexOf("inter") === 0 || n === "int" || n === "i" || n === "gringa" || n === "estrangeira") return "Internacional";
      if (n.indexOf("nac") === 0 || n === "n" || n === "br" || n === "brasil") return "Nacional";
      return capitalize(v);
    }
    return v;
  }

  // rows: array de arrays (Papa header:false). Primeira linha = cabeçalho.
  function parseRows(rows) {
    if (!rows || !rows.length) return { songs: [], info: { map: {}, unknown: [], missing: [] } };
    var info = mapHeaders(rows[0]);
    var songs = [];
    for (var r = 1; r < rows.length; r++) {
      var o = {};
      Object.keys(info.map).forEach(function (ci) {
        o[info.map[ci]] = cleanValue(info.map[ci], rows[r][ci]);
      });
      if (o.nome) songs.push(o);
    }
    return { songs: songs, info: info };
  }

  window.CsvSchema = {
    HEADER_DICTIONARY: HEADER_DICTIONARY, FIELD_LABELS: FIELD_LABELS,
    resolveHeader: resolveHeader, mapHeaders: mapHeaders, cleanValue: cleanValue, parseRows: parseRows, norm: norm
  };
  if (typeof module !== "undefined") module.exports = window.CsvSchema;
})();
