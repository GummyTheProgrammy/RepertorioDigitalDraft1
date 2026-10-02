(function () {
  "use strict";

  // ============================================================
  // State
  // ============================================================
  let songs = [];          // full database, each: {id, nome, banda, afinacao, quemComeca, categoria, nacional}
  let songsById = {};
  let setlist = [];        // array of song ids, in order
  let filters = { afinacao: "", categoria: "", nacional: "" };

  const HOLD_MS = 1000;
  const MOVE_THRESHOLD = 8; // px — beyond this we treat a touch as a drag, not a hold

  // ============================================================
  // Helpers
  // ============================================================
  function stripAccents(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function normalizeHeader(h) {
    return stripAccents(String(h || "").trim().toLowerCase()).replace(/[^a-z0-9]/g, "");
  }
  function slug(s) {
    return stripAccents(String(s || "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function uniqueSorted(arr) {
    return Array.from(new Set(arr.filter(Boolean))).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }

  // ============================================================
  // CSV loading
  // ============================================================
  function loadSongs() {
    return fetch("data/musicas.csv", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(parseSongsCsv)
      .catch(function (err) {
        console.error("Falha ao carregar data/musicas.csv:", err);
        document.getElementById("bankList").innerHTML =
          '<p class="empty-hint">Não foi possível carregar data/musicas.csv. Confira se o arquivo existe e se o site está sendo servido por http(s).</p>';
      });
  }

  function parseSongsCsv(text, opts) {
    opts = opts || {};
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: normalizeHeader });
    const rows = parsed.data || [];
    songs = rows.map(function (row, i) {
      const nome = String(row["nome"] || "").trim();
      const banda = String(row["banda"] || "").trim();
      const afinacao = String(row["afinacao"] || "").trim();
      const quemComeca = String(row["quemcomeca"] || "").trim();
      const categoria = String(row["categoria"] || "").trim();
      const nacional = String(row["nacionalinternacional"] || "").trim();
      const id = slug(nome) + "-" + slug(banda) + "-" + i;
      return { id: id, nome: nome, banda: banda, afinacao: afinacao, quemComeca: quemComeca, categoria: categoria, nacional: nacional };
    }).filter(function (s) { return s.nome; });

    songsById = {};
    songs.forEach(function (s) { songsById[s.id] = s; });

    populateFilterOptions();
    filters = { afinacao: "", categoria: "", nacional: "" };
    document.getElementById("filterAfinacao").value = "";
    document.getElementById("filterCategoria").value = "";
    document.getElementById("filterNacional").value = "";

    if (opts.resetSetlist) {
      setlist = [];
      saveSetlistToStorage();
    } else {
      restoreSetlistFromStorage();
    }
    renderBank();
    renderSetlist();
    return songs.length;
  }

  function populateFilterOptions() {
    fillSelect("filterAfinacao", uniqueSorted(songs.map(function (s) { return s.afinacao; })), "Afinação: todas");
    fillSelect("filterCategoria", uniqueSorted(songs.map(function (s) { return s.categoria; })), "Categoria: todas");
    fillSelect("filterNacional", uniqueSorted(songs.map(function (s) { return s.nacional; })), "Nac./Int.: todos");
  }
  function fillSelect(id, values, placeholder) {
    const el = document.getElementById(id);
    el.innerHTML = '<option value="">' + escapeHtml(placeholder) + "</option>" +
      values.map(function (v) { return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + "</option>"; }).join("");
  }

  // ============================================================
  // localStorage persistence (setlist survives a reload)
  // ============================================================
  const STORAGE_KEY = "repertorio-maker:setlist:v1";
  function saveSetlistToStorage() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(setlist)); } catch (e) { /* ignore */ }
  }
  function restoreSetlistFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) setlist = ids.filter(function (id) { return songsById[id]; });
    } catch (e) { /* ignore */ }
  }

  // ============================================================
  // Bank (song database) rendering + filters + add-to-setlist
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
    const list = filteredSongs();
    const container = document.getElementById("bankList");
    document.getElementById("bankCount").textContent = list.length + (list.length === 1 ? " música" : " músicas");

    if (!list.length) {
      container.innerHTML = '<p class="empty-hint">Nenhuma música encontrada com esses filtros.</p>';
      return;
    }

    container.innerHTML = list.map(function (s) {
      const already = setlist.indexOf(s.id) !== -1;
      return (
        '<div class="bank-row' + (already ? " added" : "") + '" data-id="' + s.id + '">' +
        '<span class="bank-name">' + escapeHtml(s.nome) + "</span>" +
        (s.banda ? '<span class="bank-band">' + escapeHtml(s.banda) + "</span>" : "") +
        '<span class="add-mark">' + (already ? "✓" : "+") + "</span>" +
        "</div>"
      );
    }).join("");

    Array.prototype.forEach.call(container.querySelectorAll(".bank-row"), function (row) {
      wireHoldAndTap(row, {
        onTap: function () { addToSetlist(row.dataset.id); },
        getSong: function () { return songsById[row.dataset.id]; }
      });
    });
  }

  function addToSetlist(id) {
    if (!songsById[id]) return;
    if (setlist.indexOf(id) !== -1) return; // already there
    setlist.push(id);
    saveSetlistToStorage();
    renderSetlist();
    renderBank();
  }
  function removeFromSetlist(id) {
    const idx = setlist.indexOf(id);
    if (idx === -1) return;
    setlist.splice(idx, 1);
    saveSetlistToStorage();
    renderSetlist();
    renderBank();
  }

  // ============================================================
  // Setlist rendering + drag to reorder
  // ============================================================
  function renderSetlist() {
    const container = document.getElementById("setlistList");
    document.getElementById("setlistCount").textContent = setlist.length + (setlist.length === 1 ? " música" : " músicas");

    if (!setlist.length) {
      container.innerHTML = '<p class="empty-hint" id="setlistEmptyHint">Toque numa música da lista abaixo para adicionar aqui.</p>';
      return;
    }

    container.innerHTML = setlist.map(function (id, i) {
      const s = songsById[id];
      if (!s) return "";
      return (
        '<div class="set-row" data-id="' + id + '">' +
        '<span class="drag-dots">⠿</span>' +
        '<span class="set-index">' + (i + 1) + "</span>" +
        '<span class="set-name">' + escapeHtml(s.nome) + "</span>" +
        '<button class="remove-btn" type="button" aria-label="Remover">✕</button>' +
        "</div>"
      );
    }).join("");

    Array.prototype.forEach.call(container.querySelectorAll(".set-row"), function (row) {
      row.querySelector(".remove-btn").addEventListener("click", function (ev) {
        ev.stopPropagation();
        removeFromSetlist(row.dataset.id);
      });
      wireHoldAndTap(row, {
        onTap: null, // tapping a setlist row does nothing (removal is via the X button)
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
      if (ev.target.closest(".remove-btn")) return;
      pressStartX = ev.clientX; pressStartY = ev.clientY;
      dragging = false; moved = false;
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }

      holdTimer = setTimeout(function () {
        if (!moved) showPopup(el, opts.getSong());
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

    el.addEventListener("pointerup", function () {
      clearHoldTimer();
      hidePopup();
      if (!moved && !dragging && opts.onTap) opts.onTap();
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
  // Manual CSV import + sample CSV download
  // ============================================================
  const SAMPLE_CSV =
    "Nome,banda,afinação,quem começa,categoria,nacional/internacional\n" +
    "Mercador de Almas,Jardins do Jack,,VS,Abertura,Nacional\n" +
    "Breed,Nirvana,,Guitarra,Grunge,Internacional\n" +
    "Plush,Stone Temple Pilots,,Conta 4,Grunge,Internacional\n" +
    "Enter Sandman,Metallica,,Emenda,Metal,Internacional\n" +
    "Everlong,Foo Fighters,Drop D,Guitarra,Rock,Internacional\n" +
    "Even Flow,Pearl Jam,Drop D,Conta 4,Grunge,Internacional\n" +
    "Máscara (Sweet Dreams incidental),Casa das Máquinas,Drop C,Conta 4,Rock Nacional,Nacional\n" +
    "Chop Suey,System of a Down,Drop C,Guitarra,Metal,Internacional\n";

  function setImportStatus(msg, isErr) {
    const el = document.getElementById("importStatus");
    el.textContent = msg;
    el.classList.toggle("err", !!isErr);
  }

  function downloadTextFile(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  document.getElementById("csvInput").addEventListener("change", function (ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const n = parseSongsCsv(reader.result, { resetSetlist: true });
        if (!n) {
          setImportStatus("CSV lido, mas nenhuma música válida foi encontrada. Confira as colunas.", true);
          setWelcomeStatus("CSV lido, mas nenhuma música válida foi encontrada. Confira as colunas.", true);
          return;
        }
        setImportStatus(file.name + " importado — " + n + " música(s). Repertório reiniciado.");
        hideWelcome();
      } catch (e) {
        setImportStatus("Erro ao ler o CSV: " + e.message, true);
        setWelcomeStatus("Erro ao ler o CSV: " + e.message, true);
      }
      ev.target.value = ""; // allow re-selecting the same file later
    };
    reader.onerror = function () {
      setImportStatus("Não foi possível ler o arquivo.", true);
      setWelcomeStatus("Não foi possível ler o arquivo.", true);
    };
    reader.readAsText(file, "UTF-8");
  });

  document.getElementById("downloadSampleBtn").addEventListener("click", function () {
    downloadTextFile("modelo_musicas.csv", SAMPLE_CSV);
  });

  // ============================================================
  // Welcome screen
  // ============================================================
  function setWelcomeStatus(msg, isErr) {
    const el = document.getElementById("welcomeStatus");
    el.textContent = msg;
    el.classList.toggle("err", !!isErr);
  }
  function hideWelcome() {
    document.getElementById("welcomeScreen").classList.add("hidden");
  }
  document.getElementById("welcomeSampleBtn").addEventListener("click", function () {
    if (songs.length) {
      hideWelcome();
      return;
    }
    setWelcomeStatus("Carregando exemplo...");
    loadSongs().then(function () {
      if (songs.length) { hideWelcome(); } else { setWelcomeStatus("Não foi possível carregar o exemplo.", true); }
    });
  });

  // ============================================================
  // View toggle (Repertório / Ambos / Banco)
  // ============================================================
  const VIEW_KEY = "repertorio-maker:view:v1";
  function setView(view) {
    document.getElementById("phone").dataset.view = view;
    Array.prototype.forEach.call(document.querySelectorAll(".view-toggle button"), function (btn) {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    try { localStorage.setItem(VIEW_KEY, view); } catch (e) { /* ignore */ }
  }
  Array.prototype.forEach.call(document.querySelectorAll(".view-toggle button"), function (btn) {
    btn.addEventListener("click", function () { setView(btn.dataset.view); });
  });
  (function restoreView() {
    let v = "both";
    try { v = localStorage.getItem(VIEW_KEY) || "both"; } catch (e) { /* ignore */ }
    setView(v);
  })();

  // ============================================================
  // Filters wiring
  // ============================================================
  document.getElementById("filterAfinacao").addEventListener("change", function (ev) {
    filters.afinacao = ev.target.value; renderBank();
  });
  document.getElementById("filterCategoria").addEventListener("change", function (ev) {
    filters.categoria = ev.target.value; renderBank();
  });
  document.getElementById("filterNacional").addEventListener("change", function (ev) {
    filters.nacional = ev.target.value; renderBank();
  });

  // ============================================================
  // Print / PDF — same visual spec as the Repertório Maker PDF
  // ============================================================
  const MM_TO_PX = 96 / 25.4;
  const TABLE_W_MM = 210 * 0.92;
  const COMENT_COL_W_MM = 74;
  const GAP_MM = 4;
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
          const nfs = widthFitPx(nameEl.dataset.text, "Anton", NAME_LS_MM, nameAvailPx, Math.min(nameMaxPx, heightMaxPx));
          nameEl.style.fontSize = (nfs / MM_TO_PX) + "mm";
          if (comentEl && comentEl.dataset.text) {
            const cfs = widthFitPx(comentEl.dataset.text, "Bebas Neue", COMENT_LS_MM, comentAvailPx, Math.min(comentMaxPx, heightMaxPx));
            comentEl.style.fontSize = (cfs / MM_TO_PX) + "mm";
          }
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

  loadSongs();
})();
