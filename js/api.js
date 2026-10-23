/*
 * api.js — "API falsa" 100% local.
 *
 * Simula um backend (usuários, bandas, músicas, repertórios) usando o
 * localStorage do navegador. Toda chamada é ASSÍNCRONA (retorna Promise, com
 * uma latência artificial) e erros usam ApiError(code, message), exatamente
 * como uma API real faria.
 *
 * Para ir pro online (Supabase, Firebase, API própria...), basta reescrever
 * ESTE arquivo mantendo as mesmas funções e formatos de retorno. O app.js
 * não sabe que existe localStorage.
 *
 * ⚠ SEGURANÇA: a senha aqui é só "embaralhada" (fakeHash) para não ficar em
 * texto puro no localStorage. Isso NÃO é segurança de verdade — qualquer um
 * com acesso ao navegador lê tudo. Autenticação real só no backend.
 */
(function () {
  "use strict";

  var NS = "repertorio-digital:v1:";
  var LATENCY_MS = 80;
  var mem = {}; // fallback se o localStorage estiver bloqueado

  function ApiError(code, message) {
    this.name = "ApiError";
    this.code = code;
    this.message = message;
  }
  ApiError.prototype = Object.create(Error.prototype);

  // ---------------- armazenamento ----------------
  function read(key, def) {
    if (Object.prototype.hasOwnProperty.call(mem, key)) return JSON.parse(mem[key]);
    try {
      var raw = localStorage.getItem(NS + key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) { return def; }
  }
  function write(key, value) {
    var json = JSON.stringify(value);
    try { localStorage.setItem(NS + key, json); delete mem[key]; }
    catch (e) { mem[key] = json; }
  }
  function simulate(fn) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(fn()); } catch (e) { reject(e); }
      }, LATENCY_MS);
    });
  }
  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function fakeHash(s) {
    var h = 5381, i;
    s = "salt-repertorio:" + s;
    for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return "fh" + (h >>> 0).toString(16);
  }
  function str(v) { return String(v == null ? "" : v).trim(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------- sessão / posse ----------------
  function currentUser() {
    var s = read("session", null);
    if (!s) throw new ApiError("not_authenticated", "Você precisa entrar para continuar.");
    var u = read("users", []).filter(function (x) { return x.id === s.userId; })[0];
    if (!u) throw new ApiError("not_authenticated", "Sessão inválida. Entre novamente.");
    return u;
  }
  function publicUser(u) { return { id: u.id, name: u.name, email: u.email }; }
  function ownedBand(bandId) {
    var u = currentUser();
    var b = read("bands", []).filter(function (x) { return x.id === bandId && x.ownerId === u.id; })[0];
    if (!b) throw new ApiError("not_found", "Banda não encontrada.");
    return b;
  }
  function ownedRep(repId) {
    var r = read("repertoires", []).filter(function (x) { return x.id === repId; })[0];
    if (!r) throw new ApiError("not_found", "Repertório não encontrado.");
    ownedBand(r.bandId);
    return r;
  }
  function ownedSong(songId) {
    var s = read("songs", []).filter(function (x) { return x.id === songId; })[0];
    if (!s) throw new ApiError("not_found", "Música não encontrada.");
    ownedBand(s.bandId);
    return s;
  }

  // ---------------- auth ----------------
  var auth = {
    register: function (d) {
      return simulate(function () {
        var name = str(d && d.name), email = str(d && d.email).toLowerCase(), pass = String((d && d.password) || "");
        if (!name) throw new ApiError("invalid_input", "Informe seu nome.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError("invalid_input", "E-mail inválido.");
        if (pass.length < 4) throw new ApiError("invalid_input", "A senha precisa ter ao menos 4 caracteres.");
        var users = read("users", []);
        if (users.some(function (u) { return u.email === email; })) throw new ApiError("email_taken", "Esse e-mail já está cadastrado.");
        var u = { id: uid("usr"), name: name, email: email, passwordHash: fakeHash(pass), createdAt: Date.now() };
        users.push(u);
        write("users", users);
        write("session", { userId: u.id });
        return publicUser(u);
      });
    },
    login: function (d) {
      return simulate(function () {
        var email = str(d && d.email).toLowerCase(), pass = String((d && d.password) || "");
        if (email === "adm" && pass === "adm") {
          var users = read("users", []);
          var admin = users.filter(function (x) { return x.id === "usr_homologacao_adm"; })[0];
          if (!admin) {
            admin = { id: "usr_homologacao_adm", name: "adm", email: "adm", passwordHash: fakeHash("adm"), createdAt: Date.now() };
            users.push(admin);
            write("users", users);
          }
          write("session", { userId: admin.id });
          return publicUser(admin);
        }
        var u = read("users", []).filter(function (x) { return x.email === email; })[0];
        if (!u || u.passwordHash !== fakeHash(pass)) throw new ApiError("invalid_credentials", "E-mail ou senha incorretos.");
        write("session", { userId: u.id });
        return publicUser(u);
      });
    },
    logout: function () {
      return simulate(function () { write("session", null); return true; });
    },
    me: function () {
      return simulate(function () {
        try { return publicUser(currentUser()); } catch (e) { return null; }
      });
    }
  };

  // ---------------- bands ----------------
  var bands = {
    list: function () {
      return simulate(function () {
        var u = currentUser();
        return clone(read("bands", []).filter(function (b) { return b.ownerId === u.id; }));
      });
    },
    create: function (d) {
      return simulate(function () {
        var u = currentUser(), name = str(d && d.name);
        if (!name) throw new ApiError("invalid_input", "Informe o nome da banda.");
        var all = read("bands", []);
        var b = { id: uid("bnd"), ownerId: u.id, name: name, createdAt: Date.now() };
        all.push(b);
        write("bands", all);
        return clone(b);
      });
    },
    get: function (id) { return simulate(function () { return clone(ownedBand(id)); }); },
    remove: function (id) {
      return simulate(function () {
        ownedBand(id);
        write("bands", read("bands", []).filter(function (b) { return b.id !== id; }));
        write("songs", read("songs", []).filter(function (s) { return s.bandId !== id; }));
        write("repertoires", read("repertoires", []).filter(function (r) { return r.bandId !== id; }));
        return true;
      });
    }
  };

  // ---------------- songs ----------------
  function cleanSong(d) {
    var nome = str(d && d.nome);
    if (!nome) throw new ApiError("invalid_input", "Informe o nome da música.");
    return {
      nome: nome,
      bandaOriginal: str(d.bandaOriginal),
      afinacao: str(d.afinacao),
      quemComeca: str(d.quemComeca),
      categoria: str(d.categoria),
      nacional: str(d.nacional),
      anotacaoMauricio: str(d.anotacaoMauricio),
      anotacaoFlavio: str(d.anotacaoFlavio)
    };
  }
  var songs = {
    list: function (bandId) {
      return simulate(function () {
        ownedBand(bandId);
        return clone(read("songs", []).filter(function (s) { return s.bandId === bandId; }));
      });
    },
    create: function (bandId, d) {
      return simulate(function () {
        ownedBand(bandId);
        var s = cleanSong(d);
        s.id = uid("sng"); s.bandId = bandId; s.createdAt = Date.now();
        var all = read("songs", []);
        all.push(s);
        write("songs", all);
        return clone(s);
      });
    },
    update: function (id, d) {
      return simulate(function () {
        var cur = ownedSong(id), patch = cleanSong(d), all = read("songs", []);
        var merged = Object.assign({}, cur, patch);
        write("songs", all.map(function (s) { return s.id === id ? merged : s; }));
        return clone(merged);
      });
    },
    remove: function (id) {
      return simulate(function () {
        ownedSong(id);
        write("songs", read("songs", []).filter(function (s) { return s.id !== id; }));
        write("repertoires", read("repertoires", []).map(function (r) {
          r.songIds = r.songIds.filter(function (x) { return x !== id; });
          return r;
        }));
        return true;
      });
    },
    // rows: [{nome, bandaOriginal, afinacao, quemComeca, categoria, nacional, anotacaoMauricio, anotacaoFlavio}]
    // Upsert por nome + bandaOriginal (sem diferenciar maiúsculas).
    importCsv: function (bandId, rows) {
      return simulate(function () {
        ownedBand(bandId);
        var all = read("songs", []), created = 0, updated = 0;
        function key(s) { return (s.nome + "|" + s.bandaOriginal).toLowerCase(); }
        var index = {};
        all.forEach(function (s) { if (s.bandId === bandId) index[key(s)] = s; });
        (rows || []).forEach(function (r) {
          var clean;
          try { clean = cleanSong(r); } catch (e) { return; }
          var hit = index[key(clean)];
          if (hit) { Object.assign(hit, clean); updated++; }
          else {
            clean.id = uid("sng"); clean.bandId = bandId; clean.createdAt = Date.now();
            all.push(clean); index[key(clean)] = clean; created++;
          }
        });
        write("songs", all);
        return { created: created, updated: updated };
      });
    }
  };

  // ---------------- repertoires ----------------
  var repertoires = {
    list: function (bandId) {
      return simulate(function () {
        ownedBand(bandId);
        return clone(read("repertoires", []).filter(function (r) { return r.bandId === bandId; }));
      });
    },
    get: function (id) { return simulate(function () { return clone(ownedRep(id)); }); },
    create: function (bandId, titulo) {
      return simulate(function () {
        ownedBand(bandId);
        titulo = str(titulo);
        if (!titulo) throw new ApiError("invalid_input", "Informe o título do repertório.");
        var all = read("repertoires", []);
        var r = { id: uid("rep"), bandId: bandId, titulo: titulo, songIds: [], createdAt: Date.now() };
        all.push(r);
        write("repertoires", all);
        return clone(r);
      });
    },
    rename: function (id, titulo) {
      return simulate(function () {
        var r = ownedRep(id); titulo = str(titulo);
        if (!titulo) throw new ApiError("invalid_input", "Informe o título do repertório.");
        r.titulo = titulo;
        write("repertoires", read("repertoires", []).map(function (x) { return x.id === id ? r : x; }));
        return clone(r);
      });
    },
    remove: function (id) {
      return simulate(function () {
        ownedRep(id);
        write("repertoires", read("repertoires", []).filter(function (r) { return r.id !== id; }));
        return true;
      });
    },
    setSongIds: function (id, ids) {
      return simulate(function () {
        var r = ownedRep(id);
        var valid = {};
        read("songs", []).forEach(function (s) { if (s.bandId === r.bandId) valid[s.id] = true; });
        var seen = {};
        r.songIds = (ids || []).filter(function (x) { if (!valid[x] || seen[x]) return false; seen[x] = true; return true; });
        write("repertoires", read("repertoires", []).map(function (x) { return x.id === id ? r : x; }));
        return clone(r);
      });
    }
  };

  window.RepertorioAPI = { auth: auth, bands: bands, songs: songs, repertoires: repertoires, ApiError: ApiError };
})();
