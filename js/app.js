(function () {
  "use strict";

  var api = window.RepertorioAPI;

  // ============================================================
  // Detecta o aparelho: computador (tela larga + mouse) x celular/tablet (toque)
  // ============================================================
  (function detectDevice() {
    var mq = window.matchMedia ? window.matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)") : null;
    function apply() {
      var d = mq && mq.matches ? "desktop" : "mobile";
      document.documentElement.dataset.device = d;
      var dr = document.getElementById("drawer"); // recalcula posição do menu lateral
      if (dr && dr.classList.contains("open")) window.dispatchEvent(new Event("resize"));
    }
    apply();
    if (mq) { if (mq.addEventListener) mq.addEventListener("change", apply); else mq.addListener(apply); }
  })();

  // ============================================================
  // State
  // ============================================================
  var currentUser = null;
  var currentBand = null;
  var currentRep = null;
  var songs = [];          // banco da banda atual: {id, nome, banda, afinacao, quemComeca, categoria, nacional}
  var songsById = {};
  var setlist = [];        // ids em ordem
  var filters = { afinacao: "", categoria: "", nacional: "" };
  var titleEdited = false;

  var HOLD_MS = 1000;
  var MOVE_THRESHOLD = 8; // px — acima disso é arrasto, não "segurar"

  // ============================================================
  // Helpers
  // ============================================================
  function $(id) { return document.getElementById(id); }
  function stripAccents(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function normalizeHeader(h) {
    return stripAccents(String(h || "").trim().toLowerCase()).replace(/[^a-z0-9]/g, "");
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function uniqueSorted(arr) {
    return Array.from(new Set(arr.filter(Boolean))).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }
  function errMsg(e) { return (e && e.message) || "Erro inesperado."; }
  function setStatus(id, msg, isErr) {
    var el = $(id);
    el.textContent = msg || "";
    el.classList.toggle("err", !!isErr);
  }
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  // ============================================================
  // Navegação entre telas
  // ============================================================
  var SCREENS = ["screenAuth", "screenBands", "screenReps", "screenEditor"];
  function showScreen(name) {
    if (typeof setDrawer === "function") setDrawer(false);
    if ($("playScreen") && !$("playScreen").classList.contains("hidden")) { $("playScreen").classList.add("hidden"); releaseWake(); }
    SCREENS.forEach(function (id) { $(id).classList.toggle("hidden", id !== name); });
    hidePopup();
  }

  // ============================================================
  // Login / cadastro
  // ============================================================
  function resetAuthTab() {
    each(".auth-tab", function (t) { t.classList.toggle("active", t.dataset.tab === "login"); });
    $("loginForm").classList.remove("hidden");
    $("registerForm").classList.add("hidden");
    setStatus("authStatus", "");
  }
  each(".auth-tab", function (tab) {
    tab.addEventListener("click", function () {
      each(".auth-tab", function (t) { t.classList.toggle("active", t === tab); });
      $("loginForm").classList.toggle("hidden", tab.dataset.tab !== "login");
      $("registerForm").classList.toggle("hidden", tab.dataset.tab !== "register");
      setStatus("authStatus", "");
    });
  });
  $("loginForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    setStatus("authStatus", "Entrando...");
    api.auth.login({ email: $("loginEmail").value, password: $("loginPassword").value })
      .then(function (u) { $("loginForm").reset(); enterBandsScreen(u); })
      .catch(function (e) { setStatus("authStatus", errMsg(e), true); });
  });
  $("registerForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    setStatus("authStatus", "Criando conta...");
    api.auth.register({ name: $("registerName").value, email: $("registerEmail").value, password: $("registerPassword").value })
      .then(function (u) { $("registerForm").reset(); enterBandsScreen(u); })
      .catch(function (e) { setStatus("authStatus", errMsg(e), true); });
  });
  $("logoutBtn").addEventListener("click", function () {
    api.auth.logout().then(function () {
      currentUser = null; currentBand = null; currentRep = null;
      songs = []; songsById = {}; setlist = [];
      $("bandsList").innerHTML = ""; $("repsList").innerHTML = "";
      $("setlistList").innerHTML = ""; $("bankList").innerHTML = "";
      resetAuthTab();
      showScreen("screenAuth");
    });
  });

  // ============================================================
  // Bandas
  // ============================================================
  function enterBandsScreen(user) {
    if (user) currentUser = user;
    $("bandsHello").textContent = "Olá, " + (currentUser ? currentUser.name.split(" ")[0] : "") + " 👋";
    setStatus("bandsStatus", "");
    $("bandsList").innerHTML = "";
    showScreen("screenBands");
    return renderBandsList();
  }
  function renderBandsList() {
    return api.bands.list().then(function (list) {
      var box = $("bandsList");
      if (!list.length) {
        box.innerHTML = '<p class="empty-hint">Você ainda não tem bandas. Crie a primeira abaixo.</p>';
        return;
      }
      box.innerHTML = list.map(function (b) {
        return '<div class="pick-row" data-id="' + escapeHtml(b.id) + '">' +
          '<button type="button" class="pick-main">' + escapeHtml(b.name) + '</button>' +
          '<button type="button" class="pick-del" aria-label="Excluir banda">✕</button></div>';
      }).join("");
      each("#bandsList .pick-row", function (row) {
        var b = list.filter(function (x) { return x.id === row.dataset.id; })[0];
        row.querySelector(".pick-main").addEventListener("click", function () { selectBand(b); });
        row.querySelector(".pick-del").addEventListener("click", function () {
          if (!confirm('Excluir a banda "' + b.name + '" com todas as músicas e repertórios?')) return;
          api.bands.remove(b.id).then(renderBandsList).catch(function (e) { setStatus("bandsStatus", errMsg(e), true); });
        });
      });
    }).catch(function (e) { setStatus("bandsStatus", errMsg(e), true); });
  }
  $("newBandForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    api.bands.create({ name: $("newBandName").value })
      .then(function () { $("newBandForm").reset(); setStatus("bandsStatus", ""); return renderBandsList(); })
      .catch(function (e) { setStatus("bandsStatus", errMsg(e), true); });
  });

  // ============================================================
  // Repertórios
  // ============================================================
  function selectBand(band) {
    currentBand = band; currentRep = null;
    $("repsBandName").textContent = band.name;
    setStatus("repsStatus", "");
    $("repsList").innerHTML = "";
    showScreen("screenReps");
    return renderRepsList();
  }
  function renderRepsList() {
    return api.repertoires.list(currentBand.id).then(function (list) {
      var box = $("repsList");
      if (!list.length) {
        box.innerHTML = '<p class="empty-hint">Nenhum repertório ainda. Crie o primeiro abaixo (ex.: "Primeiro Set").</p>';
        return;
      }
      box.innerHTML = list.map(function (r) {
        return '<div class="pick-row" data-id="' + escapeHtml(r.id) + '">' +
          '<button type="button" class="pick-main">' + escapeHtml(r.titulo) +
          '<span class="pick-sub">' + r.songIds.length + (r.songIds.length === 1 ? " música" : " músicas") + '</span></button>' +
          '<button type="button" class="pick-del" aria-label="Excluir repertório">✕</button></div>';
      }).join("");
      each("#repsList .pick-row", function (row) {
        var r = list.filter(function (x) { return x.id === row.dataset.id; })[0];
        row.querySelector(".pick-main").addEventListener("click", function () { selectRepertoire(r); });
        row.querySelector(".pick-del").addEventListener("click", function () {
          if (!confirm('Excluir o repertório "' + r.titulo + '"?')) return;
          api.repertoires.remove(r.id).then(renderRepsList).catch(function (e) { setStatus("repsStatus", errMsg(e), true); });
        });
      });
    }).catch(function (e) { setStatus("repsStatus", errMsg(e), true); });
  }
  $("newRepForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    api.repertoires.create(currentBand.id, $("newRepName").value)
      .then(function (r) { $("newRepForm").reset(); setStatus("repsStatus", ""); return selectRepertoire(r); })
      .catch(function (e) { setStatus("repsStatus", errMsg(e), true); });
  });
  $("backToBandsBtn").addEventListener("click", function () { enterBandsScreen(); });
  $("backToRepsBtn").addEventListener("click", function () { selectBand(currentBand); });

  // ============================================================
  // Editor: carrega banco + repertório
  // ============================================================
  function selectRepertoire(rep) {
    selectMode = false; selected = {}; $("phone").classList.remove("selecting"); $("selBar").classList.add("hidden"); $("selModeBtn").textContent = "☑ Selecionar";
    currentRep = rep;
    titleEdited = false;
    $("editorTitle").textContent = currentBand.name + " · " + rep.titulo;
    $("tituloInput").value = currentBand.name + " - " + rep.titulo;
    setStatus("importStatus", "");
    filters = { afinacao: "", categoria: "", nacional: "" };
    songs = []; songsById = {}; setlist = [];
    $("setlistList").innerHTML = ""; $("bankList").innerHTML = "";
    $("setlistCount").textContent = "0 músicas"; $("bankCount").textContent = "0 músicas";
    showScreen("screenEditor");
    return loadBank().then(function () {
      return api.repertoires.get(rep.id);
    }).then(function (fresh) {
      currentRep = fresh;
      setlist = fresh.songIds.filter(function (id) { return songsById[id]; });
      renderSetlist();
      renderBank();
    }).catch(function (e) { setStatus("importStatus", errMsg(e), true); });
  }
  $("tituloInput").addEventListener("input", function () { titleEdited = true; });

  function loadBank() {
    return api.songs.list(currentBand.id).then(function (list) {
      songs = list.map(function (s) {
        s.banda = s.bandaOriginal;
        return s;
      }).sort(function (a, b) { return a.nome.localeCompare(b.nome, "pt-BR"); });
      songsById = {};
      songs.forEach(function (s) { songsById[s.id] = s; });
      populateFilterOptions();
      $("filterAfinacao").value = filters.afinacao;
      $("filterCategoria").value = filters.categoria;
      $("filterNacional").value = filters.nacional;
    });
  }

  function populateFilterOptions() {
    fillSelect("filterAfinacao", uniqueSorted(songs.map(function (s) { return s.afinacao; })), "Afinação: todas");
    fillSelect("filterCategoria", uniqueSorted(songs.map(function (s) { return s.categoria; })), "Categoria: todas");
    fillSelect("filterNacional", uniqueSorted(songs.map(function (s) { return s.nacional; })), "Nac./Int.: todos");
  }
  function fillSelect(id, values, placeholder) {
    $(id).innerHTML = '<option value="">' + escapeHtml(placeholder) + "</option>" +
      values.map(function (v) { return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + "</option>"; }).join("");
  }

  // Salva a ordem do setlist na "API" (fire-and-forget; o estado local manda na tela)
  function saveSetlistToStorage() {
    if (!currentRep) return;
    api.repertoires.setSongIds(currentRep.id, setlist.slice()).catch(function (e) {
      setStatus("importStatus", "Falha ao salvar: " + errMsg(e), true);
    });
  }

  // ============================================================
  // Banco (lista + filtros + adicionar ao setlist)
  // ============================================================
  function filteredSongs() {
    return songs.filter(function (s) {
      if (filters.afinacao && s.afinacao !== filters.afinacao) return false;
      if (filters.categoria && s.categoria !== filters.categoria) return false;
      if (filters.nacional && s.nacional !== filters.nacional) return false;
      return true;
    });
  }

  function renderBank() {
    var list = filteredSongs();
    var container = $("bankList");
    $("bankCount").textContent = list.length + (list.length === 1 ? " música" : " músicas");

    if (!songs.length) {
      container.innerHTML = '<p class="empty-hint">Ainda não há músicas nesta banda.<br>Toque no + para criar uma, importe um CSV pelo menu ☰ ou comece com o exemplo.<br>' +
        '<button type="button" class="mini-btn" id="loadExampleBtn">✨ Carregar exemplo</button></p>';
      $("loadExampleBtn").addEventListener("click", loadExampleSongs);
      return;
    }
    if (!list.length) {
      container.innerHTML = '<p class="empty-hint">Nenhuma música encontrada com esses filtros.</p>';
      return;
    }

    container.innerHTML = list.map(function (s) {
      var already = setlist.indexOf(s.id) !== -1;
      var picked = !!selected[s.id];
      return (
        '<div class="bank-row' + (already && !selectMode ? " added" : "") + (picked ? " picked" : "") + '" data-id="' + escapeHtml(s.id) + '">' +
        (selectMode ? '<span class="sel-box">' + (picked ? "☑" : "☐") + "</span>" : "") +
        '<span class="bank-name">' + escapeHtml(s.nome) + (s.anotacao ? ' <span class="note-dot" title="Tem anotação">●</span>' : "") + "</span>" +
        (s.banda ? '<span class="bank-band">' + escapeHtml(s.banda) + "</span>" : "") +
        '<button class="edit-btn" type="button" aria-label="Editar música">✎</button>' +
        (selectMode ? "" : '<span class="add-mark">' + (already ? "✓" : "+") + "</span>") +
        "</div>"
      );
    }).join("");

    each("#bankList .bank-row", function (row) {
      row.querySelector(".edit-btn").addEventListener("click", function (ev) {
        ev.stopPropagation();
        openSongModal(songsById[row.dataset.id]);
      });
      wireHoldAndTap(row, {
        onTap: function () { if (selectMode) toggleSel(row.dataset.id); else addToSetlist(row.dataset.id); },
        getSong: function () { return songsById[row.dataset.id]; }
      });
    });
  }

  // ---- seleção em massa (aba Músicas) ----
  var selectMode = false, selected = {};
  function selIds() { return Object.keys(selected).filter(function (id) { return selected[id] && songsById[id]; }); }
  function updateSelBar() {
    var n = selIds().length;
    $("selCount").textContent = n + (n === 1 ? " selecionada" : " selecionadas");
    ["selAddBtn", "selEditBtn", "selDelBtn"].forEach(function (id) { $(id).disabled = !n; });
    var vis = filteredSongs();
    $("selAllBtn").textContent = vis.length && vis.every(function (x) { return selected[x.id]; }) ? "Nenhuma" : "Todas";
  }
  function setSelectMode(on) {
    selectMode = on; selected = {};
    $("phone").classList.toggle("selecting", on);
    $("selBar").classList.toggle("hidden", !on);
    $("selModeBtn").textContent = on ? "✕ Sair" : "☑ Selecionar";
    renderBank(); updateSelBar();
  }
  function toggleSel(id) {
    selected[id] = !selected[id];
    var row = document.querySelector('#bankList .bank-row[data-id="' + id + '"]');
    if (row) { row.classList.toggle("picked", !!selected[id]); row.querySelector(".sel-box").textContent = selected[id] ? "☑" : "☐"; }
    updateSelBar();
  }
  $("selModeBtn").addEventListener("click", function () { setSelectMode(!selectMode); });
  $("selAllBtn").addEventListener("click", function () {
    var vis = filteredSongs(), all = vis.length && vis.every(function (x) { return selected[x.id]; });
    vis.forEach(function (x) { selected[x.id] = !all; });
    renderBank(); updateSelBar();
  });
  $("selAddBtn").addEventListener("click", function () {
    var n = 0;
    selIds().forEach(function (id) { if (setlist.indexOf(id) === -1) { setlist.push(id); n++; } });
    if (n) { saveSetlistToStorage(); renderSetlist(); }
    toast(n ? n + (n === 1 ? " música adicionada" : " músicas adicionadas") + " ao repertório." : "Todas já estavam no repertório.");
    setSelectMode(false);
  });
  $("selDelBtn").addEventListener("click", function () {
    var ids = selIds();
    if (!ids.length || !confirm("Excluir " + ids.length + (ids.length === 1 ? " música" : " músicas") + " do banco (e de todos os repertórios)? Não dá para desfazer.")) return;
    api.songs.removeMany(ids).then(function (r) {
      setSelectMode(false);
      return refreshAfterSongChange().then(function () { toast(r.removed + (r.removed === 1 ? " música excluída." : " músicas excluídas.")); });
    }).catch(function (e) { alert(errMsg(e)); });
  });
  $("selEditBtn").addEventListener("click", function () {
    var n = selIds().length; if (!n) return;
    $("bulkForm").reset(); setStatus("bulkStatus", "");
    $("bulkTitle").textContent = "Editar " + n + (n === 1 ? " música" : " músicas");
    $("bulkOverlay").classList.remove("hidden");
  });
  // marcar o campo automaticamente ao digitar nele
  each("#bulkForm .bulk-f", function (lab) {
    var cb = lab.querySelector("input[type=checkbox]");
    ["input", "change"].forEach(function (evn) {
      lab.addEventListener(evn, function (ev) { if (ev.target !== cb) cb.checked = true; });
    });
  });
  $("bulkAnotacao").addEventListener("keydown", tabKey);
  $("bulkCancel").addEventListener("click", function () { $("bulkOverlay").classList.add("hidden"); });
  $("bulkOverlay").addEventListener("click", function (ev) { if (ev.target === $("bulkOverlay")) $("bulkOverlay").classList.add("hidden"); });
  $("bulkForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var ids = selIds(), ch = {}, on = {};
    each("#bulkForm input[type=checkbox]", function (c) { if (c.checked) on[c.dataset.f] = true; });
    if (!Object.keys(on).length) { setStatus("bulkStatus", "Marque ao menos um campo para alterar.", true); return; }
    if (on.afinacao) ch.afinacao = $("bulkAfinacao").value.trim().toUpperCase();
    if (on.quemComeca) ch.quemComeca = $("bulkQuem").value;
    if (on.categoria) { var c = $("bulkCategoria").value.trim(); ch.categoria = c ? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() : ""; }
    if (on.nacional) ch.nacional = $("bulkNacional").value;
    var append = on.anotacao && $("bulkNoteMode").value === "append", add = $("bulkAnotacao").value;
    if (on.anotacao && !append) ch.anotacao = add;
    var calls;
    if (append) {
      // acrescentar: cada música recebe o texto no fim da sua anotação atual
      calls = Promise.all(ids.map(function (id) {
        var cur = songsById[id].anotacao || "", own = Object.assign({}, ch);
        own.anotacao = add ? (cur ? cur + "\n" + add : add) : cur;
        return api.songs.updateMany([id], own);
      }));
    } else calls = api.songs.updateMany(ids, ch);
    calls.then(function () {
      $("bulkOverlay").classList.add("hidden");
      setSelectMode(false);
      return refreshAfterSongChange().then(function () { toast(ids.length + (ids.length === 1 ? " música atualizada." : " músicas atualizadas.")); });
    }).catch(function (e) { setStatus("bulkStatus", errMsg(e), true); });
  });

  function addToSetlist(id) {
    if (!songsById[id] || setlist.indexOf(id) !== -1) return;
    setlist.push(id);
    saveSetlistToStorage();
    renderSetlist();
    renderBank();
  }
  function removeFromSetlist(id) {
    var idx = setlist.indexOf(id);
    if (idx === -1) return;
    setlist.splice(idx, 1);
    saveSetlistToStorage();
    renderSetlist();
    renderBank();
  }

  // ============================================================
  // Setlist (arrastável)
  // ============================================================
  function renderSetlist() {
    var container = $("setlistList");
    $("setlistCount").textContent = setlist.length + (setlist.length === 1 ? " música" : " músicas");

    if (!setlist.length) {
      container.innerHTML = '<p class="empty-hint">Toque numa música do banco abaixo para adicionar aqui.</p>';
      return;
    }

    container.innerHTML = setlist.map(function (id, i) {
      var s = songsById[id];
      if (!s) return "";
      return (
        '<div class="set-row" data-id="' + escapeHtml(id) + '">' +
        '<span class="drag-dots">⠿</span>' +
        '<span class="set-index">' + (i + 1) + "</span>" +
        '<span class="set-name">' + escapeHtml(s.nome) + (s.anotacao ? ' <span class="note-dot" title="Tem anotação">●</span>' : "") + "</span>" +
        '<button class="edit-btn" type="button" aria-label="Editar música">✎</button>' +
        '<button class="remove-btn" type="button" aria-label="Remover">✕</button>' +
        "</div>"
      );
    }).join("");

    each("#setlistList .set-row", function (row) {
      row.querySelector(".remove-btn").addEventListener("click", function (ev) {
        ev.stopPropagation();
        removeFromSetlist(row.dataset.id);
      });
      row.querySelector(".edit-btn").addEventListener("click", function (ev) {
        ev.stopPropagation();
        openSongModal(songsById[row.dataset.id]);
      });
      wireHoldAndTap(row, {
        onTap: function () { openPlay(row.dataset.id); }, // tocar numa música do setlist = play a partir dela
        getSong: function () { return songsById[row.dataset.id]; },
        dragContainer: container
      });
    });
  }

  // ---- Hold-to-preview (mouse hover OR touch/mouse press-hold) + tap + optional drag ----
  function wireHoldAndTap(el, opts) {
    let holdTimer = null;
    let pressStartX = 0, pressStartY = 0;
    let dragging = false;
    let moved = false;
    let held = false; // o popup de 1s apareceu: soltar o dedo não conta como toque

    function clearHoldTimer() {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    }

    // Desktop: hovering the mouse (no press needed) for 1s shows the popup.
    let hoverTimer = null;
    el.addEventListener("mouseenter", function () {
      if (dragging) return;
      hoverTimer = setTimeout(function () { showPopup(el, opts.getSong()); }, HOLD_MS);
    });
    el.addEventListener("mouseleave", function () {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      hidePopup();
    });

    // Press-and-hold (touch, or mouse button down) also shows the popup,
    // and — inside a drag container — turns into a vertical drag if the
    // pointer moves past the threshold before the hold fires.
    el.addEventListener("pointerdown", function (ev) {
      if (ev.target.closest(".remove-btn, .edit-btn")) return;
      pressStartX = ev.clientX; pressStartY = ev.clientY;
      dragging = false; moved = false; held = false;
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }

      holdTimer = setTimeout(function () {
        if (!moved) { held = true; showPopup(el, opts.getSong()); }
      }, HOLD_MS);

      // mouse arrasta pela linha toda; dedo/caneta só pela alça ⠿ (o resto da linha rola a lista)
      if (opts.dragContainer && (ev.pointerType === "mouse" || ev.target.closest(".drag-dots"))) {
        startPotentialDrag(el, opts.dragContainer, ev);
      }
    });

    el.addEventListener("pointermove", function (ev) {
      const dx = ev.clientX - pressStartX, dy = ev.clientY - pressStartY;
      if (!moved && Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
        moved = true;
        clearHoldTimer();
        hidePopup();
      }
    });

    el.addEventListener("pointerup", function (ev) {
      clearHoldTimer();
      hidePopup();
      if (ev.target.closest(".remove-btn, .edit-btn")) return;
      if (!moved && !dragging && !held && opts.onTap) opts.onTap();
    });
    el.addEventListener("pointercancel", function () {
      clearHoldTimer();
      hidePopup();
    });

    // expose a way for the drag helper to flag that a real drag occurred
    el._markDragging = function (v) { dragging = v; };
  }

  // ---- Vertical drag-to-reorder for the setlist ----
  // Strategy: never touch the DOM structure mid-drag (that would detach the
  // very row the pointer is holding). Instead, slide sibling rows out of the
  // way with CSS transforms, track the target index purely in memory, and
  // only commit to `setlist` + do one clean re-render on drop.
  function startPotentialDrag(row, container, downEvent) {
    const pointerId = downEvent.pointerId;
    const startY = downEvent.clientY;
    const allRows = Array.prototype.slice.call(container.querySelectorAll(".set-row"));
    const startIndex = allRows.indexOf(row);
    const draggedId = setlist[startIndex];
    const rowHeight = row.getBoundingClientRect().height + 6; // + row margin-bottom
    const otherRows = allRows.filter(function (r) { return r !== row; });

    let active = false;
    let targetIndex = startIndex;

    function applySiblingShifts() {
      otherRows.forEach(function (r, i) {
        // i is this row's position among "the others", i.e. its original
        // index with the dragged row taken out of the sequence.
        let shifted = 0;
        if (startIndex < targetIndex) {
          // dragging downward: rows between the old and new slot move up one
          if (i >= startIndex && i < targetIndex) shifted = -1;
        } else if (startIndex > targetIndex) {
          // dragging upward: rows between the new and old slot move down one
          if (i >= targetIndex && i < startIndex) shifted = 1;
        }
        r.style.transform = shifted ? "translateY(" + (shifted * rowHeight) + "px)" : "";
      });
    }

    function onMove(ev) {
      if (ev.pointerId !== pointerId) return;
      const dy = ev.clientY - startY;
      if (!active) {
        if (Math.abs(dy) < MOVE_THRESHOLD) return;
        active = true;
        row.classList.add("dragging");
        row._markDragging && row._markDragging(true);
        row.setPointerCapture && row.setPointerCapture(pointerId);
        otherRows.forEach(function (r) { r.style.transition = "transform 0.12s ease"; });
      }
      row.style.transform = "translateY(" + dy + "px)";

      const shift = Math.round(dy / rowHeight);
      targetIndex = Math.min(setlist.length - 1, Math.max(0, startIndex + shift));
      applySiblingShifts();
    }

    function onUp(ev) {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (active) {
        const curIdx = setlist.indexOf(draggedId);
        if (curIdx !== -1 && targetIndex !== curIdx) {
          const arr = setlist.slice();
          arr.splice(curIdx, 1);
          arr.splice(targetIndex, 0, draggedId);
          setlist = arr;
        }
        saveSetlistToStorage();
        renderSetlist(); // one clean re-render, drops all inline transforms
      }
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }

  // ============================================================
  // Details popup
  // ============================================================
  function showPopup(anchorEl, song) {
    if (!song) return;
    const popup = document.getElementById("popup");
    document.getElementById("popBanda").textContent = song.banda || "—";
    document.getElementById("popAfinacao").textContent = song.afinacao || "—";
    document.getElementById("popQuem").textContent = song.quemComeca || "—";
    document.getElementById("popCategoria").textContent = song.categoria || "—";
    document.getElementById("popNacional").textContent = song.nacional || "—";
    document.getElementById("popAnotacao").textContent = song.anotacao || "—";
    document.getElementById("popRowAnot").style.display = song.anotacao ? "" : "none";

    const rect = anchorEl.getBoundingClientRect();
    popup.classList.add("visible");
    const popupRect = popup.getBoundingClientRect();
    let top = rect.top - popupRect.height - 8;
    if (top < 8) top = rect.bottom + 8;
    let left = rect.left;
    if (left + popupRect.width > window.innerWidth - 8) left = window.innerWidth - popupRect.width - 8;
    popup.style.top = top + "px";
    popup.style.left = Math.max(8, left) + "px";
  }
  function hidePopup() {
    document.getElementById("popup").classList.remove("visible");
  }

  // ============================================================
  // Música: criar / editar / excluir (modal)
  // ============================================================
  var editingSongId = null;
  function songPayload(s, over) {
    var o = {
      nome: s.nome, bandaOriginal: s.bandaOriginal, afinacao: s.afinacao, quemComeca: s.quemComeca,
      categoria: s.categoria, nacional: s.nacional, anotacao: s.anotacao
    };
    Object.keys(over || {}).forEach(function (k) { o[k] = over[k]; });
    return o;
  }
  function openSongModal(song) {
    editingSongId = song ? song.id : null;
    $("songForm").reset();
    setStatus("songStatus", "");
    $("songModalTitle").textContent = song ? "Editar música" : "Nova música";
    $("songDeleteBtn").classList.toggle("hidden", !song);
    if (song) {
      $("songNome").value = song.nome; $("songBanda").value = song.bandaOriginal || "";
      $("songAfinacao").value = song.afinacao || ""; $("songQuemComeca").value = song.quemComeca || "";
      $("songCategoria").value = song.categoria || ""; $("songNacional").value = song.nacional || "";
      $("songAnotacao").value = song.anotacao || "";
    }
    $("songModalOverlay").classList.remove("hidden");
    mdPreviewOn = false; refreshMdUi();
    autoGrow($("songAnotacao"), 0.35);
    setTimeout(function () { $(song ? "songAnotacao" : "songNome").focus(); }, 30);
  }
  function closeSongModal() { $("songModalOverlay").classList.add("hidden"); editingSongId = null; }
  function refreshAfterSongChange() {
    return loadBank().then(function () {
      setlist = setlist.filter(function (id) { return songsById[id]; });
      renderSetlist();
      renderBank();
    });
  }
  $("newSongBtn").addEventListener("click", function () { openSongModal(null); });
  function insertTab(ta) {
    var a = ta.selectionStart, b = ta.selectionEnd;
    ta.value = ta.value.slice(0, a) + "\t" + ta.value.slice(b);
    ta.selectionStart = ta.selectionEnd = a + 1;
    ta.dispatchEvent(new Event("input"));
  }
  function tabKey(ev) { if (ev.key === "Tab" && !ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey) { ev.preventDefault(); insertTab(ev.target); } }
  $("songAnotacao").addEventListener("keydown", tabKey);
  var mdPreviewOn = false;
  function refreshMdUi() {
    var v = $("songAnotacao").value, det = window.MiniMd.detect(v);
    $("mdBadge").classList.toggle("hidden", !det);
    $("mdPreviewBtn").classList.toggle("hidden", !det);
    if (!det) mdPreviewOn = false;
    $("mdPreview").classList.toggle("hidden", !(det && mdPreviewOn));
    $("mdPreviewBtn").textContent = mdPreviewOn ? "✎ Editar" : "👁 Prévia";
    if (det && mdPreviewOn) $("mdPreview").innerHTML = window.MiniMd.render(v);
    $("songAnotacao").classList.toggle("hidden", det && mdPreviewOn);
  }
  $("mdPreviewBtn").addEventListener("click", function () { mdPreviewOn = !mdPreviewOn; refreshMdUi(); if (!mdPreviewOn) $("songAnotacao").focus(); });
  $("songAnotacao").addEventListener("input", function () { autoGrow($("songAnotacao"), 0.35); refreshMdUi(); });
  $("songCancelBtn").addEventListener("click", closeSongModal);
  $("songModalOverlay").addEventListener("click", function (ev) {
    if (ev.target === $("songModalOverlay")) closeSongModal();
  });
  $("songForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var data = {
      nome: $("songNome").value,
      bandaOriginal: $("songBanda").value,
      afinacao: $("songAfinacao").value,
      quemComeca: $("songQuemComeca").value,
      categoria: $("songCategoria").value,
      nacional: $("songNacional").value,
      anotacao: $("songAnotacao").value
    };
    var editing = editingSongId;
    var call = editing ? api.songs.update(editing, data) : api.songs.create(currentBand.id, data);
    call.then(function (s) {
      closeSongModal();
      return refreshAfterSongChange().then(function () {
        toast(editing ? '"' + s.nome + '" atualizada.' : '"' + s.nome + '" criada. Toque nela para adicionar ao repertório.');
      });
    }).catch(function (e) { setStatus("songStatus", errMsg(e), true); });
  });
  $("songDeleteBtn").addEventListener("click", function () {
    var id = editingSongId, s = songsById[id];
    if (!id || !confirm('Excluir "' + s.nome + '" do banco (e de todos os repertórios)?')) return;
    api.songs.remove(id).then(function () {
      closeSongModal();
      return refreshAfterSongChange();
    }).catch(function (e) { setStatus("songStatus", errMsg(e), true); });
  });

  // ============================================================
  // Modo Play: um slide por música (ou por parágrafo); rolar para os lados navega
  // ============================================================
  var PLAY_KEY = "repertorio-digital:play:v1";
  var playSettings = { size: 22, split: false, md: "auto" };
  try {
    var savedPlay = JSON.parse(localStorage.getItem(PLAY_KEY) || "null");
    if (savedPlay) {
      playSettings.size = Math.max(14, Math.min(56, parseInt(savedPlay.size, 10) || 22));
      playSettings.split = !!savedPlay.split;
      playSettings.md = ["auto", "on", "off"].indexOf(savedPlay.md) !== -1 ? savedPlay.md : "auto";
    }
  } catch (e) { /* ignore */ }
  function savePlaySettings() {
    try { localStorage.setItem(PLAY_KEY, JSON.stringify(playSettings)); } catch (e) { /* ignore */ }
  }
  function applyPlaySettings() {
    $("playScreen").style.setProperty("--note-size", playSettings.size + "px");
    $("playSize").value = playSettings.size;
    $("playSizeVal").textContent = playSettings.size + " px";
    $("playSplit").checked = playSettings.split;
    $("playMd").value = playSettings.md;
  }

  // textarea que começa pequena, cresce com o texto e para numa altura máxima
  // proporcional à altura do aparelho (depois disso rola por dentro).
  function autoGrow(ta, frac) {
    var cap = Math.max(80, Math.round(Math.min(window.innerHeight * frac, $("phone").clientHeight * 0.55)));
    ta.style.height = "auto";
    var h = ta.scrollHeight + 2;
    ta.style.height = Math.min(h, cap) + "px";
    ta.style.overflowY = h > cap ? "auto" : "hidden";
  }

  var wakeLock = null;
  function requestWake() {
    try {
      if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; }).catch(function () {});
    } catch (e) { /* ignore */ }
  }
  function releaseWake() {
    try { if (wakeLock) { wakeLock.release(); } } catch (e) { /* ignore */ }
    wakeLock = null;
  }

  function splitParagraphs(text) {
    return String(text || "").split(/\n[ \t]*\n+/).map(function (t) { return t.trim(); }).filter(Boolean);
  }
  function useMd(txt) {
    return playSettings.md === "on" || (playSettings.md === "auto" && window.MiniMd.detect(txt));
  }
  function noteHtml(txt) {
    if (txt && useMd(txt)) return window.MiniMd.render(txt);
    return txt ? escapeHtml(txt) : '<span class="ps-empty">Sem anotações. Toque em ✎ para adicionar.</span>';
  }

  var playSlides = []; // [{id, part, parts, song}]
  function buildPlaySlides() {
    playSlides = [];
    $("playTrack").innerHTML = setlist.map(function (id, i) {
      var s = songsById[id];
      if (!s) return "";
      var parts = playSettings.split ? splitParagraphs(s.anotacao) : [String(s.anotacao || "")];
      if (!parts.length) parts = [""];
      var chips = [s.afinacao, s.quemComeca, s.categoria, s.nacional].filter(Boolean).map(function (c) {
        return '<span class="ps-chip">' + escapeHtml(c) + "</span>";
      }).join("");
      return parts.map(function (txt, pi) {
        playSlides.push({ id: id, part: pi, parts: parts.length, song: i });
        return '<article class="play-slide" data-id="' + escapeHtml(id) + '" data-part="' + pi + '">' +
          '<div class="ps-num">' + String(i + 1).padStart(2, "0") +
          (parts.length > 1 ? '<span class="ps-part">parte ' + (pi + 1) + "/" + parts.length + "</span>" : "") + "</div>" +
          '<h2 class="ps-name">' + escapeHtml(s.nome) + "</h2>" +
          (s.banda ? '<div class="ps-band">' + escapeHtml(s.banda) + "</div>" : "") +
          '<div class="ps-chips">' + chips + "</div>" +
          '<div class="ps-note' + (txt && useMd(txt) ? " md" : "") + '">' + noteHtml(txt) + "</div>" +
          '<textarea class="ps-edit hidden" rows="3" maxlength="6000" placeholder="Anotações desta música"></textarea>' +
          '<div class="ps-actions"><button type="button" class="btn ps-edit-btn">✎ Anotação</button>' +
          '<button type="button" class="btn ps-cancel hidden">Cancelar</button>' +
          '<button type="button" class="btn primary ps-save hidden">Salvar</button></div>' +
          "</article>";
      }).join("");
    }).join("");
    each("#playTrack .play-slide", wirePlaySlide);
  }
  function wirePlaySlide(slide) {
    var id = slide.dataset.id, part = parseInt(slide.dataset.part, 10) || 0;
    var note = slide.querySelector(".ps-note"), ta = slide.querySelector(".ps-edit");
    var bEdit = slide.querySelector(".ps-edit-btn"), bSave = slide.querySelector(".ps-save"), bCancel = slide.querySelector(".ps-cancel");
    function mode(editing) {
      note.classList.toggle("hidden", editing); ta.classList.toggle("hidden", !editing);
      bEdit.classList.toggle("hidden", editing); bSave.classList.toggle("hidden", !editing); bCancel.classList.toggle("hidden", !editing);
      if (editing) autoGrow(ta, 0.4);
    }
    ta.addEventListener("input", function () { autoGrow(ta, 0.4); });
    ta.addEventListener("keydown", tabKey);
    bEdit.addEventListener("click", function () { ta.value = songsById[id].anotacao || ""; mode(true); ta.focus(); });
    bCancel.addEventListener("click", function () { mode(false); });
    bSave.addEventListener("click", function () {
      var s = songsById[id];
      api.songs.update(id, songPayload(s, { anotacao: ta.value })).then(function (u) {
        s.anotacao = u.anotacao;
        rebuildPlay(id, part);
        renderSetlist(); renderBank();
      }).catch(function (e) { alert(errMsg(e)); });
    });
  }

  function playIndex() {
    var t = $("playTrack");
    return t.clientWidth ? Math.round(t.scrollLeft / t.clientWidth) : 0;
  }
  function updatePlayCounter() {
    if (!playSlides.length) return;
    var sl = playSlides[Math.min(playIndex(), playSlides.length - 1)];
    var txt = (sl.song + 1) + " / " + setlist.length;
    if (sl.parts > 1) txt += " · " + (sl.part + 1) + "/" + sl.parts;
    $("playCounter").textContent = txt;
  }
  function slideIndexOf(id, part) {
    var first = -1, i;
    for (i = 0; i < playSlides.length; i++) {
      if (playSlides[i].id !== id) continue;
      if (first === -1) first = i;
      if (playSlides[i].part === part) return i;
    }
    return first === -1 ? 0 : first;
  }
  function jumpToSlide(idx) {
    var t = $("playTrack");
    t.style.scrollBehavior = "auto";
    t.scrollLeft = idx * t.clientWidth;
    t.style.scrollBehavior = "";
    playTarget = idx;
    updatePlayCounter();
  }
  function rebuildPlay(keepId, keepPart) {
    if (keepId === undefined) {
      var cur = playSlides[Math.min(playIndex(), playSlides.length - 1)];
      keepId = cur && cur.id; keepPart = cur ? cur.part : 0;
    }
    buildPlaySlides();
    jumpToSlide(slideIndexOf(keepId, keepPart));
  }
  function openPlay(startId) {
    if (!setlist.length) { alert("Adicione músicas ao repertório antes de dar play."); return; }
    hidePopup();
    applyPlaySettings();
    buildPlaySlides();
    $("playScreen").classList.remove("hidden");
    jumpToSlide(startId ? slideIndexOf(startId, 0) : 0);
    requestWake();
  }
  function closePlay() {
    $("playScreen").classList.add("hidden");
    setPlaySettingsOpen(false);
    releaseWake();
  }
  var playTarget = 0, playLastScroll = 0;
  function playGo(dir) {
    var t = $("playTrack");
    // se ainda está rolando, parte do destino anterior (cliques rápidos não se perdem)
    var base = Date.now() - playLastScroll < 200 ? playTarget : playIndex();
    playTarget = Math.max(0, Math.min(playSlides.length - 1, base + dir));
    t.scrollTo({ left: playTarget * t.clientWidth, behavior: "smooth" });
  }
  function setPlaySettingsOpen(open) {
    $("playSettings").classList.toggle("hidden", !open);
    $("playSettingsBtn").setAttribute("aria-expanded", open ? "true" : "false");
  }
  function setPlaySize(v) {
    playSettings.size = Math.max(14, Math.min(56, Math.round(v)));
    applyPlaySettings(); savePlaySettings();
  }
  $("playBtn").addEventListener("click", function () { openPlay(null); });
  $("playClose").addEventListener("click", closePlay);
  $("playPrev").addEventListener("click", function () { playGo(-1); });
  $("playNext").addEventListener("click", function () { playGo(1); });
  $("playSettingsBtn").addEventListener("click", function () {
    setPlaySettingsOpen($("playSettings").classList.contains("hidden"));
  });
  $("playSize").addEventListener("input", function (ev) { setPlaySize(parseInt(ev.target.value, 10)); });
  $("playSizeDown").addEventListener("click", function () { setPlaySize(playSettings.size - 2); });
  $("playSizeUp").addEventListener("click", function () { setPlaySize(playSettings.size + 2); });
  $("playMd").addEventListener("change", function (ev) {
    playSettings.md = ev.target.value; savePlaySettings();
    var cur = playSlides[Math.min(playIndex(), playSlides.length - 1)];
    rebuildPlay(cur && cur.id, cur && cur.part);
  });
  $("playSplit").addEventListener("change", function (ev) {
    playSettings.split = ev.target.checked; savePlaySettings();
    rebuildPlay();
  });
  $("playTrack").addEventListener("scroll", function () { playLastScroll = Date.now(); updatePlayCounter(); });
  window.addEventListener("resize", function () {
    if (!$("playScreen").classList.contains("hidden")) jumpToSlide(Math.min(playIndex(), playSlides.length - 1));
  });
  document.addEventListener("keydown", function (ev) {
    if ($("playScreen").classList.contains("hidden")) return;
    if (/^(TEXTAREA|INPUT)$/.test(ev.target.tagName)) return;
    if (ev.key === "ArrowRight") playGo(1);
    else if (ev.key === "ArrowLeft") playGo(-1);
    else if (ev.key === "Escape") closePlay();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && !$("playScreen").classList.contains("hidden")) requestWake();
  });
  applyPlaySettings();

  // ============================================================
  // Importar CSV + CSV de exemplo
  // ============================================================
  var SAMPLE_CSV =
    "Nome,banda,afinação,quem começa,categoria,nacional/internacional,Anotação Maurício,Anotação Flávio\n" +
    "Mercador de Almas,Detonautas,,VS,Rock,Nacional,,14 – 2 (DRIVE)\n" +
    "Breed,Nirvana,,Guitarra,Grunge,Internacional,,14 – 3 (FUZZ DRIVE)\n" +
    "Plush,Stone Temple Pilots,,Conta 4,Grunge,Internacional,,\n" +
    "Even Flow,Pearl Jam,Drop D,Conta 4,Grunge,Internacional,,14 – 2 (DRIV)\n" +
    "Everlong,Foo Fighters,Drop D,Guitarra,Grunge,Internacional,,18 – 3 (DRIVE)\n" +
    "Outro Lugar,Detonautas,,Virada bateria,Punk,Nacional,8e,14 – 2 (DRIV)\n" +
    "Chop Suey,System of a Down,Drop C,Guitarra,Metal,Internacional,,\n";

  function downloadTextFile(filename, text, mime) {
    var blob = new Blob(["﻿" + text], { type: mime || "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // Decodifica bytes de CSV: UTF-8 (com/sem BOM), UTF-16 ou Windows-1252 (Excel BR);
  // e conserta "mojibake" (UTF-8 lido como Latin-1: "mÃºsica" -> "música").
  var CP_REV = null;
  function cpByte(code) {
    if (code < 256) return code;
    if (!CP_REV) {
      CP_REV = {};
      var td = new TextDecoder("windows-1252");
      for (var b = 0x80; b < 0xA0; b++) CP_REV[td.decode(new Uint8Array([b])).charCodeAt(0)] = b;
    }
    return CP_REV[code];
  }
  function fixMojibake(t) {
    if (!/[ÃÂ][\u0080-\u00BF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u0192\u02C6\u02DC\u2013-\u203A\u20AC\u2122]/.test(t)) return t;
    var bytes = new Uint8Array(t.length);
    for (var i = 0; i < t.length; i++) { var c = cpByte(t.charCodeAt(i)); if (c == null) return t; bytes[i] = c; }
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (e) { return t; }
  }
  function decodeBytes(buf) {
    var b = new Uint8Array(buf), enc = "utf-8", txt;
    if (b[0] === 0xFF && b[1] === 0xFE) enc = "utf-16le";
    else if (b[0] === 0xFE && b[1] === 0xFF) enc = "utf-16be";
    try { txt = new TextDecoder(enc, { fatal: true }).decode(b); }
    catch (e) { txt = new TextDecoder("windows-1252").decode(b); }
    txt = fixMojibake(txt.replace(/^\ufeff/, ""));
    if (txt.indexOf("\ufffd") !== -1) toast("Aviso: alguns caracteres do arquivo estavam corrompidos e não puderam ser recuperados.");
    return txt;
  }
  function readFileText(file, cb, onerr) {
    var reader = new FileReader();
    reader.onload = function () { cb(decodeBytes(reader.result)); };
    reader.onerror = onerr;
    reader.readAsArrayBuffer(file);
  }

  // Lê o CSV com cabeçalho tolerante (ver js/csv-schema.js). Devolve {rows, info}.
  function csvTextToRows(text) {
    var parsed = Papa.parse(text.replace(/^\ufeff/, ""), { header: false, skipEmptyLines: true });
    var res = window.CsvSchema.parseRows(parsed.data || []);
    return { rows: res.songs, info: res.info, headers: (parsed.data && parsed.data[0]) || [] };
  }

  // ----------------------------------------------------------
  // Duplicadas no upload: manter / sobrepor / comparar
  // ----------------------------------------------------------
  var CMP_FIELDS = [
    ["nome", "Nome"], ["bandaOriginal", "Banda"], ["afinacao", "Afinação"], ["quemComeca", "Quem começa"],
    ["categoria", "Categoria"], ["nacional", "Nac./Int."], ["anotacao", "Anotação"]
  ];
  function nk(s) { return stripAccents(String(s == null ? "" : s)).toLowerCase().replace(/\s+/g, " ").trim(); }
  function findExisting(row) {
    var n = nk(row.nome), b = nk(row.bandaOriginal), i, s;
    for (i = 0; i < songs.length; i++) {
      s = songs[i];
      if (nk(s.nome) === n && nk(s.bandaOriginal) === b) return s;
    }
    if (!b) { // arquivo sem banda: casa só pelo nome
      for (i = 0; i < songs.length; i++) if (nk(songs[i].nome) === n) return songs[i];
    }
    return null;
  }
  // Quais campos mudariam se sobrepor (campo vazio no arquivo NÃO apaga o atual).
  // Nome e banda são a identidade da música (já casaram), então não entram como diferença.
  function diffFields(existing, row) {
    return CMP_FIELDS.filter(function (f) {
      if (f[0] === "nome" || f[0] === "bandaOriginal") return false;
      var nv = String(row[f[0]] || "").trim(), ov = String(existing[f[0]] || "").trim();
      return nv !== "" && nv !== ov;
    }).map(function (f) { return f[0]; });
  }
  function planImport(rows) {
    var byKey = {}, order = [];
    rows.forEach(function (r) { // linhas repetidas no próprio arquivo: vale a última
      var k = nk(r.nome) + "|" + nk(r.bandaOriginal);
      if (!(k in byKey)) order.push(k);
      byKey[k] = r;
    });
    var plan = { fresh: [], dups: [], identical: 0 };
    order.forEach(function (k) {
      var r = byKey[k], ex = findExisting(r);
      if (!ex) { plan.fresh.push(r); return; }
      var d = diffFields(ex, r);
      if (!d.length) { plan.identical++; return; }
      plan.dups.push({ row: r, existing: ex, diffs: d });
    });
    return plan;
  }
  function cellHtml(v) {
    v = String(v || "");
    return '<div class="cellbox">' + (v ? escapeHtml(v) : '<span class="nil">—</span>') + "</div>";
  }
  // Abre a tela de comparação. Resolve com {índice: "keep"|"overwrite"} ou null (cancelou).
  function askDuplicates(plan) {
    if (!plan.dups.length) return Promise.resolve({});
    return new Promise(function (resolve) {
      var choices = {};
      plan.dups.forEach(function (_, i) { choices[i] = "keep"; });
      $("dupSummary").textContent = plan.dups.length + (plan.dups.length === 1 ? " música já existe" : " músicas já existem") +
        " no banco com dados diferentes. Compare e escolha. Verde = valor do arquivo, vermelho = valor atual do banco." +
        (plan.identical ? " (" + plan.identical + " idêntica(s) foram ignoradas.)" : "") +
        " Sobrepor usa os campos preenchidos do arquivo; campos vazios no arquivo mantêm o atual.";
      $("dupList").innerHTML = plan.dups.map(function (d, i) {
        var rows = CMP_FIELDS.filter(function (f) {
          if (f[0] === "nome" || f[0] === "bandaOriginal") return false; // já aparecem no título
          return d.existing[f[0]] || d.row[f[0]];
        }).map(function (f) {
          var isDiff = d.diffs.indexOf(f[0]) !== -1;
          return "<tr><td>" + f[1] + '</td><td class="' + (isDiff ? "diff-old" : "") + '">' + cellHtml(d.existing[f[0]]) +
            '</td><td class="' + (isDiff ? "diff-new" : "") + '">' + cellHtml(d.row[f[0]]) + "</td></tr>";
        }).join("");
        return '<div class="dup-card" data-i="' + i + '">' +
          '<div class="dup-title">' + escapeHtml(d.existing.nome) + (d.existing.bandaOriginal ? "<small>" + escapeHtml(d.existing.bandaOriginal) + "</small>" : "") + "</div>" +
          '<table class="dup-cmp"><thead><tr><th></th><th>No banco</th><th>No arquivo</th></tr></thead><tbody>' + rows + "</tbody></table>" +
          '<div class="dup-choice"><button type="button" data-c="keep" class="active">Manter a do banco</button>' +
          '<button type="button" data-c="overwrite">Sobrepor com o arquivo</button></div></div>';
      }).join("");
      function paint(card) {
        var c = choices[card.dataset.i];
        each("#dupList .dup-card[data-i='" + card.dataset.i + "'] .dup-choice button", function (b) { b.classList.toggle("active", b.dataset.c === c); });
      }
      each("#dupList .dup-card", function (card) {
        each("#dupList .dup-card[data-i='" + card.dataset.i + "'] .dup-choice button", function (btn) {
          btn.addEventListener("click", function () { choices[card.dataset.i] = btn.dataset.c; paint(card); });
        });
      });
      function setAll(c) { each("#dupList .dup-card", function (card) { choices[card.dataset.i] = c; paint(card); }); }
      function done(val) {
        $("dupOverlay").classList.add("hidden");
        $("dupKeepAll").onclick = $("dupOverwriteAll").onclick = $("dupApply").onclick = $("dupCancel").onclick = null;
        resolve(val);
      }
      $("dupKeepAll").onclick = function () { setAll("keep"); };
      $("dupOverwriteAll").onclick = function () { setAll("overwrite"); };
      $("dupApply").onclick = function () { done(choices); };
      $("dupCancel").onclick = function () { done(null); };
      $("dupOverlay").classList.remove("hidden");
      $("dupList").scrollTop = 0;
    });
  }
  // Aplica: cria as novas, atualiza as escolhidas para sobrepor. Devolve contagens.
  function applyImportPlan(plan, choices) {
    var res = { created: 0, overwritten: 0, kept: 0, identical: plan.identical };
    var chain = Promise.resolve();
    if (plan.fresh.length) {
      chain = chain.then(function () { return api.songs.importCsv(currentBand.id, plan.fresh); })
        .then(function (r) { res.created = r.created; res.overwritten += r.updated; });
    }
    plan.dups.forEach(function (d, i) {
      if (choices[i] !== "overwrite") { res.kept++; return; }
      chain = chain.then(function () {
        var merged = songPayload(d.existing, {});
        d.diffs.forEach(function (f) { merged[f] = d.row[f]; });
        return api.songs.update(d.existing.id, merged);
      }).then(function () { res.overwritten++; });
    });
    return chain.then(function () { return res; });
  }
  function summaryMsg(res) {
    var parts = [res.created + " nova(s)"];
    if (res.overwritten) parts.push(res.overwritten + " sobreposta(s)");
    if (res.kept) parts.push(res.kept + " mantida(s)");
    if (res.identical) parts.push(res.identical + " idêntica(s) ignorada(s)");
    return parts.join(", ");
  }

  function importCsvText(text, label) {
    var parsed = csvTextToRows(text), rows = parsed.rows;
    if (!rows.length) {
      var why = parsed.info.map && Object.keys(parsed.info.map).some(function (k) { return parsed.info.map[k] === "nome"; })
        ? "nenhuma música válida foi encontrada."
        : 'não achei a coluna "Nome". Colunas lidas: ' + parsed.headers.join(", ") + ".";
      setStatus("importStatus", "CSV lido, mas " + why, true);
      return Promise.resolve();
    }
    var plan = planImport(rows);
    setDrawer(false);
    return askDuplicates(plan).then(function (choices) {
      if (!choices) { setStatus("importStatus", "Importação cancelada."); return; }
      return applyImportPlan(plan, choices).then(function (res) {
        return loadBank().then(function () {
          renderBank();
          var msg = label + ": " + summaryMsg(res) + ".";
          if (parsed.info.unknown.length) msg += " Colunas ignoradas: " + parsed.info.unknown.join(", ") + ".";
          setStatus("importStatus", msg);
          toast("Músicas importadas: " + summaryMsg(res) + ".");
        });
      });
    }).catch(function (e) { setStatus("importStatus", "Erro ao importar: " + errMsg(e), true); });
  }

  $("csvInput").addEventListener("change", function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var input = ev.target;
    readFileText(file, function (t) { importCsvText(t, file.name); input.value = ""; },
      function () { setStatus("importStatus", "Não foi possível ler o arquivo.", true); });
  });
  $("downloadSampleBtn").addEventListener("click", function () {
    downloadTextFile("modelo_musicas.csv", SAMPLE_CSV);
  });
  function loadExampleSongs() {
    setStatus("importStatus", "Carregando exemplo...");
    fetch("data/musicas.csv", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .then(decodeBytes)
      .then(function (t) { return importCsvText(t, "Exemplo"); })
      .catch(function (e) { setStatus("importStatus", "Não foi possível carregar data/musicas.csv (" + errMsg(e) + "). Use um servidor http(s).", true); });
  }

  // ============================================================
  // Toast (aviso rápido)
  // ============================================================
  var toastTimer = null;
  function toast(msg) {
    var el = $("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; $("phone").appendChild(el); }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  // ============================================================
  // Menu lateral (colapsa/expande)
  // ============================================================
  function setDrawer(open) {
    // o menu abre logo abaixo da barra superior, para o ☰ continuar acessível (abre/fecha pelo mesmo botão)
    var bar = document.querySelector("#screenEditor .top-bar");
    var top = bar && bar.offsetHeight ? bar.offsetHeight : 0;
    $("drawer").style.top = top + "px";
    $("drawerScrim").style.top = top + "px";
    $("drawer").classList.toggle("open", open);
    $("drawerScrim").classList.toggle("open", open);
    $("drawer").setAttribute("aria-hidden", open ? "false" : "true");
    $("menuBtn").setAttribute("aria-expanded", open ? "true" : "false");
  }
  $("menuBtn").addEventListener("click", function () { setDrawer(!$("drawer").classList.contains("open")); });
  $("drawerClose").addEventListener("click", function () { setDrawer(false); });
  $("drawerScrim").addEventListener("click", function () { setDrawer(false); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && $("drawer").classList.contains("open")) setDrawer(false);
  });

  // ============================================================
  // Repertório em CSV: baixar / importar (com os dados das músicas)
  // ============================================================
  var REP_COLUMNS = ["Ordem", "Nome", "banda", "afinação", "quem começa", "categoria", "nacional/internacional", "Anotação"];
  function songKey(nome, banda) {
    return (String(nome || "").trim() + "|" + String(banda || "").trim()).toLowerCase();
  }
  function fileSlug(t) {
    return stripAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "repertorio";
  }
  $("exportRepBtn").addEventListener("click", function () {
    if (!setlist.length) { alert("O repertório está vazio. Adicione músicas antes de baixar."); return; }
    var rows = setlist.map(function (id, i) {
      var s = songsById[id];
      return [i + 1, s.nome, s.bandaOriginal, s.afinacao, s.quemComeca, s.categoria, s.nacional, s.anotacao];
    });
    var csv = Papa.unparse({ fields: REP_COLUMNS, data: rows });
    downloadTextFile("repertorio_" + fileSlug(currentBand.name + " " + currentRep.titulo) + ".csv", csv);
    toast("Repertório baixado (" + rows.length + " músicas).");
  });

  function importRepertoireText(text, label) {
    var parsed = csvTextToRows(text), rows = parsed.rows;
    if (!rows.length) {
      setStatus("importStatus", "Repertório não importado: nenhuma música válida (precisa da coluna Nome).", true);
      return Promise.resolve();
    }
    if (setlist.length && !confirm("Substituir o repertório atual (" + setlist.length + " músicas) pelas " + rows.length + " do arquivo?")) return Promise.resolve();
    var ordered = rows.map(function (r, i) { return { r: r, i: i }; });
    if (rows.some(function (r) { return r.ordem; })) {
      ordered.sort(function (a, b) {
        var x = parseInt(a.r.ordem, 10), y = parseInt(b.r.ordem, 10);
        if (isNaN(x)) x = 1e9; if (isNaN(y)) y = 1e9;
        return x - y || a.i - b.i;
      });
    }
    var plan = planImport(rows);
    setDrawer(false);
    return askDuplicates(plan).then(function (choices) {
      if (!choices) { setStatus("importStatus", "Importação cancelada."); return; }
      return applyImportPlan(plan, choices).then(function (res) {
        return loadBank().then(function () {
          var ids = [];
          ordered.forEach(function (o) {
            var ex = findExisting(o.r);
            if (ex && ids.indexOf(ex.id) === -1) ids.push(ex.id);
          });
          setlist = ids;
          saveSetlistToStorage();
          renderSetlist();
          renderBank();
          setView("setlist");
          var msg = label + ": repertório com " + ids.length + " música(s) (" + summaryMsg(res) + ").";
          setStatus("importStatus", msg);
          toast("Repertório importado (" + ids.length + ").");
        });
      });
    }).catch(function (e) { setStatus("importStatus", "Erro ao importar repertório: " + errMsg(e), true); });
  }
  $("repCsvInput").addEventListener("change", function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var input = ev.target;
    readFileText(file, function (t) { importRepertoireText(t, file.name); input.value = ""; },
      function () { setStatus("importStatus", "Não foi possível ler o arquivo.", true); });
  });

  // ============================================================
  // Botões de visão (Repertório / Ambos / Banco)
  // ============================================================
  var VIEW_KEY = "repertorio-digital:view:v1";
  function setView(view) {
    $("phone").dataset.view = view;
    each(".view-toggle button", function (btn) { btn.classList.toggle("active", btn.dataset.view === view); });
    try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* ignore */ }
  }
  each(".view-toggle button", function (btn) {
    btn.addEventListener("click", function () { setView(btn.dataset.view); });
  });
  (function restoreView() {
    var v = "setlist";
    try { v = localStorage.getItem(VIEW_KEY) || "setlist"; } catch (e) { /* ignore */ }
    setView(v === "bank" ? "bank" : "setlist"); // a aba "Ambos" não existe mais
  })();

  // ============================================================
  // Filtros
  // ============================================================
  $("filterAfinacao").addEventListener("change", function (ev) { filters.afinacao = ev.target.value; renderBank(); updateSelBar(); });
  $("filterCategoria").addEventListener("change", function (ev) { filters.categoria = ev.target.value; renderBank(); });
  $("filterNacional").addEventListener("change", function (ev) { filters.nacional = ev.target.value; renderBank(); });

  // ============================================================
  // Print / PDF — same visual spec as the Repertório Maker PDF
  // ============================================================
  const MM_TO_PX = 96 / 25.4;
  const TABLE_W_MM = 210 * 0.92;
  const GAP_MM = 4;
  const COMENT_COL_W_MM = 74;
  const NAME_COL_W_MM = TABLE_W_MM - COMENT_COL_W_MM - GAP_MM;
  const NAME_MAX_MM = 40;
  const COMENT_MAX_MM = 36;
  const NAME_LS_MM = 0.35;
  const COMENT_LS_MM = 0.45;
  const PER_PAGE = 20;

  const STAR_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
    '<g fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M50 6 L58 34 L88 34 L63 51 L72 80 L50 62 L28 80 L37 51 L12 34 L42 34 Z" fill="#000" stroke="none"/>' +
    '<path d="M15 90 L30 60 M85 90 L70 60" stroke-width="5"/></g></svg>';
  const FOOTER_SVG = '<svg viewBox="0 0 300 40" xmlns="http://www.w3.org/2000/svg"><g fill="#000">' +
    '<circle cx="10" cy="20" r="4"/><circle cx="30" cy="20" r="4"/><circle cx="50" cy="20" r="4"/>' +
    '<path d="M150 5 L158 22 L176 22 L162 32 L167 40" fill="none" stroke="#000" stroke-width="3"/>' +
    '<circle cx="250" cy="20" r="4"/><circle cx="270" cy="20" r="4"/><circle cx="290" cy="20" r="4"/></g></svg>';

  function buildComent(s) {
    return [s.afinacao, s.quemComeca].filter(Boolean).map(function (x) { return x.toUpperCase(); }).join(" | ");
  }

  function printRowHtml(n, s) {
    const label = String(n).padStart(2, "0") + ". " + s.nome.toUpperCase();
    const coment = buildComent(s);
    const comentHtml = coment ? '<span class="p-coment" data-text="' + escapeHtml(coment) + '">' + escapeHtml(coment) + "</span>" : '<span class="p-coment"></span>';
    return '<div class="p-row"><span class="p-name" data-text="' + escapeHtml(label) + '">' + escapeHtml(label) + "</span>" + comentHtml + "</div>";
  }

  function splitTitle(raw) {
    const t = (raw || "").trim();
    const parts = t.split(/\s+-\s+/);
    if (parts.length >= 2) return { main: parts[0].trim(), sub: parts.slice(1).join(" - ").trim() };
    return { main: t || "REPERTÓRIO", sub: "" };
  }

  function buildPrintSheets() {
    const titulo = document.getElementById("tituloInput").value;
    const { main, sub } = splitTitle(titulo);
    const list = setlist.map(function (id) { return songsById[id]; }).filter(Boolean);

    const pages = [];
    for (let i = 0; i < list.length; i += PER_PAGE) pages.push(list.slice(i, i + PER_PAGE));
    if (!pages.length) pages.push([]);

    const html = pages.map(function (pageSongs, idx) {
      const label = "PÁGINA " + (idx + 1) + " DE " + pages.length;
      const rows = pageSongs.map(function (s, i) { return printRowHtml(idx * PER_PAGE + i + 1, s); }).join("\n");
      return (
        '<div class="sheet"><div class="p-header">' + STAR_SVG +
        '<div class="p-header-text"><div class="p-band">' + escapeHtml(main) + '</div>' +
        '<div class="p-set">' + escapeHtml(sub ? sub + " · " : "") + label + "</div></div>" +
        STAR_SVG + "</div>" +
        '<div class="p-list-wrap"><div class="p-list">' + rows + "</div></div>" +
        '<div class="p-footer">' + FOOTER_SVG + "</div></div>"
      );
    }).join("\n");

    document.getElementById("printRoot").innerHTML = html;
    return document.fonts.ready.then(fitPrintSheets);
  }

  function fitPrintSheets() {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");


    function widthFitPx(text, fontFamily, letterSpacingMm, availableWidthPx, maxPx) {
      if (!text) return maxPx;
      const refPx = 200;
      ctx.font = refPx + "px " + fontFamily;
      const w = ctx.measureText(text).width;
      const ratio = w / refPx;
      const letterSpacingPx = letterSpacingMm * MM_TO_PX;
      const nGaps = Math.max(text.length - 1, 0);
      const fit = (availableWidthPx - letterSpacingPx * nGaps) / ratio;
      return Math.max(1, Math.min(fit, maxPx));
    }
    function shrinkToFit(el, getContainerWidth) {
      if (!el) return;
      let guard = 60;
      while (el.scrollWidth > getContainerWidth() + 0.5 && guard > 0) {
        const cs = getComputedStyle(el);
        const curFs = parseFloat(cs.fontSize);
        const curLs = parseFloat(cs.letterSpacing) || 0;
        el.style.fontSize = (curFs * 0.96) + "px";
        el.style.letterSpacing = (curLs * 0.96) + "px";
        guard--;
      }
    }

    document.querySelectorAll("#printRoot .sheet").forEach(function (sheet) {
      const rows = sheet.querySelectorAll(".p-row");
      if (rows.length) {
        rows.forEach(function (row) {
          row.querySelector(".p-name").style.fontSize = "3mm";
          const c = row.querySelector(".p-coment");
          if (c) c.style.fontSize = "3mm";
        });
        const rowHeightPx = rows[0].getBoundingClientRect().height;
        const heightMaxPx = rowHeightPx * 0.92;
        const nameAvailPx = NAME_COL_W_MM * MM_TO_PX;
        const comentAvailPx = COMENT_COL_W_MM * MM_TO_PX;
        const nameMaxPx = NAME_MAX_MM * MM_TO_PX;
        const comentMaxPx = COMENT_MAX_MM * MM_TO_PX;

        rows.forEach(function (row) {
          const nameEl = row.querySelector(".p-name");
          const comentEl = row.querySelector(".p-coment");
          // 1º o comentário (limitado à coluna da direita); 2º o nome usa TODO o espaço
          // que sobrou naquela linha (largura da tabela − comentário real − respiro).
          let nameAvail = nameAvailPx + comentAvailPx; // linha sem comentário: largura toda
          if (comentEl && comentEl.dataset.text) {
            const cfs = widthFitPx(comentEl.dataset.text, "Bebas Neue", COMENT_LS_MM, comentAvailPx, Math.min(comentMaxPx, heightMaxPx));
            comentEl.style.fontSize = (cfs / MM_TO_PX) + "mm";
            nameAvail = TABLE_W_MM * MM_TO_PX - comentEl.getBoundingClientRect().width - GAP_MM * MM_TO_PX;
          }
          const nfs = widthFitPx(nameEl.dataset.text, "Anton", NAME_LS_MM, nameAvail, Math.min(nameMaxPx, heightMaxPx));
          nameEl.style.fontSize = (nfs / MM_TO_PX) + "mm";
        });

        rows.forEach(function (row) {
          [row.querySelector(".p-name"), row.querySelector(".p-coment")].forEach(function (el) {
            if (el && el.dataset.text) shrinkToFit(el, function () { return el.clientWidth; });
          });
        });
      }

      [sheet.querySelector(".p-band"), sheet.querySelector(".p-set")].forEach(function (el) {
        if (!el) return;
        const headerText = el.closest(".p-header-text");
        shrinkToFit(el, function () { return headerText.clientWidth; });
      });
    });
  }

  document.getElementById("printBtn").addEventListener("click", function () {
    if (!setlist.length) {
      alert("Adicione ao menos uma música ao repertório antes de imprimir.");
      return;
    }
    setDrawer(false);
    buildPrintSheets().then(function () {
      window.print();
    });
  });

  // ============================================================
  // Init
  // ============================================================
  document.addEventListener("click", function (ev) {
    if (!ev.target.closest(".bank-row, .set-row, .popup")) hidePopup();
  });

  function boot() {
    api.auth.me().then(function (u) {
      if (u) { enterBandsScreen(u); }
      else { resetAuthTab(); showScreen("screenAuth"); }
    });
  }
  boot();
})();
