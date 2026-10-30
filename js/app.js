(function () {
  "use strict";

  var api = window.RepertorioAPI;

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
      return (
        '<div class="bank-row' + (already ? " added" : "") + '" data-id="' + escapeHtml(s.id) + '">' +
        '<span class="bank-name">' + escapeHtml(s.nome) + (s.anotacao ? ' <span class="note-dot" title="Tem anotação">●</span>' : "") + "</span>" +
        (s.banda ? '<span class="bank-band">' + escapeHtml(s.banda) + "</span>" : "") +
        '<button class="edit-btn" type="button" aria-label="Editar música">✎</button>' +
        '<span class="add-mark">' + (already ? "✓" : "+") + "</span>" +
        "</div>"
      );
    }).join("");

    each("#bankList .bank-row", function (row) {
      row.querySelector(".edit-btn").addEventListener("click", function (ev) {
        ev.stopPropagation();
        openSongModal(songsById[row.dataset.id]);
      });
      wireHoldAndTap(row, {
        onTap: function () { addToSetlist(row.dataset.id); },
        getSong: function () { return songsById[row.dataset.id]; }
      });
    });
  }

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

      if (opts.dragContainer) {
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
  // Modo Play: um slide por música; rolar para os lados navega
  // ============================================================
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
  function noteHtml(s) {
    return s.anotacao
      ? escapeHtml(s.anotacao)
      : '<span class="ps-empty">Sem anotações. Toque em ✎ para adicionar.</span>';
  }
  function buildPlaySlides() {
    $("playTrack").innerHTML = setlist.map(function (id, i) {
      var s = songsById[id];
      if (!s) return "";
      var chips = [s.afinacao, s.quemComeca, s.categoria, s.nacional].filter(Boolean).map(function (c) {
        return '<span class="ps-chip">' + escapeHtml(c) + "</span>";
      }).join("");
      return '<article class="play-slide" data-id="' + escapeHtml(id) + '">' +
        '<div class="ps-num">' + String(i + 1).padStart(2, "0") + "</div>" +
        '<h2 class="ps-name">' + escapeHtml(s.nome) + "</h2>" +
        (s.banda ? '<div class="ps-band">' + escapeHtml(s.banda) + "</div>" : "") +
        '<div class="ps-chips">' + chips + "</div>" +
        '<div class="ps-note">' + noteHtml(s) + "</div>" +
        '<textarea class="ps-edit hidden" rows="5" maxlength="600" placeholder="Anotações desta música"></textarea>' +
        '<div class="ps-actions"><button type="button" class="btn ps-edit-btn">✎ Anotação</button>' +
        '<button type="button" class="btn ps-cancel hidden">Cancelar</button>' +
        '<button type="button" class="btn primary ps-save hidden">Salvar</button></div>' +
        "</article>";
    }).join("");
    each("#playTrack .play-slide", wirePlaySlide);
  }
  function wirePlaySlide(slide) {
    var id = slide.dataset.id;
    var note = slide.querySelector(".ps-note"), ta = slide.querySelector(".ps-edit");
    var bEdit = slide.querySelector(".ps-edit-btn"), bSave = slide.querySelector(".ps-save"), bCancel = slide.querySelector(".ps-cancel");
    function mode(editing) {
      note.classList.toggle("hidden", editing); ta.classList.toggle("hidden", !editing);
      bEdit.classList.toggle("hidden", editing); bSave.classList.toggle("hidden", !editing); bCancel.classList.toggle("hidden", !editing);
    }
    bEdit.addEventListener("click", function () { ta.value = songsById[id].anotacao || ""; mode(true); ta.focus(); });
    bCancel.addEventListener("click", function () { mode(false); });
    bSave.addEventListener("click", function () {
      var s = songsById[id];
      api.songs.update(id, songPayload(s, { anotacao: ta.value })).then(function (u) {
        s.anotacao = u.anotacao;
        note.innerHTML = noteHtml(s);
        mode(false);
        renderSetlist(); renderBank();
      }).catch(function (e) { alert(errMsg(e)); });
    });
  }
  function playIndex() {
    var t = $("playTrack");
    return t.clientWidth ? Math.round(t.scrollLeft / t.clientWidth) : 0;
  }
  function updatePlayCounter() {
    $("playCounter").textContent = (Math.min(playIndex(), setlist.length - 1) + 1) + " / " + setlist.length;
  }
  function openPlay(startId) {
    if (!setlist.length) { alert("Adicione músicas ao repertório antes de dar play."); return; }
    hidePopup();
    buildPlaySlides();
    $("playScreen").classList.remove("hidden");
    var idx = startId ? Math.max(0, setlist.indexOf(startId)) : 0;
    var t = $("playTrack");
    t.style.scrollBehavior = "auto";
    t.scrollLeft = idx * t.clientWidth;
    t.style.scrollBehavior = "";
    updatePlayCounter();
    requestWake();
  }
  function closePlay() {
    $("playScreen").classList.add("hidden");
    releaseWake();
  }
  var playTarget = 0, playLastScroll = 0;
  function playGo(dir) {
    var t = $("playTrack");
    // se ainda está rolando, parte do destino anterior (cliques rápidos não se perdem)
    var base = Date.now() - playLastScroll < 200 ? playTarget : playIndex();
    playTarget = Math.max(0, Math.min(setlist.length - 1, base + dir));
    t.scrollTo({ left: playTarget * t.clientWidth, behavior: "smooth" });
  }
  $("playBtn").addEventListener("click", function () { openPlay(null); });
  $("playClose").addEventListener("click", closePlay);
  $("playPrev").addEventListener("click", function () { playGo(-1); });
  $("playNext").addEventListener("click", function () { playGo(1); });
  $("playTrack").addEventListener("scroll", function () { playLastScroll = Date.now(); updatePlayCounter(); });
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

  // Lê o CSV com cabeçalho tolerante (ver js/csv-schema.js). Devolve {rows, info}.
  function csvTextToRows(text) {
    var parsed = Papa.parse(text.replace(/^\ufeff/, ""), { header: false, skipEmptyLines: true });
    var res = window.CsvSchema.parseRows(parsed.data || []);
    return { rows: res.songs, info: res.info, headers: (parsed.data && parsed.data[0]) || [] };
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
    return api.songs.importCsv(currentBand.id, rows).then(function (res) {
      return loadBank().then(function () {
        renderBank();
        var msg = label + ": " + res.created + " nova(s), " + res.updated + " atualizada(s).";
        if (parsed.info.unknown.length) msg += " Colunas ignoradas: " + parsed.info.unknown.join(", ") + ".";
        setStatus("importStatus", msg);
        toast("Músicas importadas: " + res.created + " nova(s), " + res.updated + " atualizada(s).");
      });
    }).catch(function (e) { setStatus("importStatus", "Erro ao importar: " + errMsg(e), true); });
  }

  $("csvInput").addEventListener("change", function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var input = ev.target;
    var reader = new FileReader();
    reader.onload = function () { importCsvText(String(reader.result), file.name); input.value = ""; };
    reader.onerror = function () { setStatus("importStatus", "Não foi possível ler o arquivo.", true); };
    reader.readAsText(file, "UTF-8");
  });
  $("downloadSampleBtn").addEventListener("click", function () {
    downloadTextFile("modelo_musicas.csv", SAMPLE_CSV);
  });
  function loadExampleSongs() {
    setStatus("importStatus", "Carregando exemplo...");
    fetch("data/musicas.csv", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
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
    return api.songs.importCsv(currentBand.id, rows).then(function (res) {
      return loadBank().then(function () {
        var byKey = {};
        songs.forEach(function (s) { byKey[songKey(s.nome, s.bandaOriginal)] = s.id; });
        var ids = [];
        ordered.forEach(function (o) {
          var id = byKey[songKey(o.r.nome, o.r.bandaOriginal)];
          if (id && ids.indexOf(id) === -1) ids.push(id);
        });
        setlist = ids;
        saveSetlistToStorage();
        renderSetlist();
        renderBank();
        setView("setlist");
        var msg = label + ": repertório com " + ids.length + " música(s)";
        if (res.created) msg += "; " + res.created + " nova(s) no banco";
        setStatus("importStatus", msg + ".");
        toast("Repertório importado (" + ids.length + ").");
      });
    }).catch(function (e) { setStatus("importStatus", "Erro ao importar repertório: " + errMsg(e), true); });
  }
  $("repCsvInput").addEventListener("change", function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var input = ev.target, reader = new FileReader();
    reader.onload = function () { importRepertoireText(String(reader.result), file.name); input.value = ""; };
    reader.onerror = function () { setStatus("importStatus", "Não foi possível ler o arquivo.", true); };
    reader.readAsText(file, "UTF-8");
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
  $("filterAfinacao").addEventListener("change", function (ev) { filters.afinacao = ev.target.value; renderBank(); });
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
