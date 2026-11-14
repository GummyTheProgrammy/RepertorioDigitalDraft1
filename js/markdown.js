/*
 * markdown.js — mini-Markdown seguro (estilo "mini Obsidian") para as anotações.
 * Escapa o HTML ANTES de formatar, então nada do texto vira tag. Sem links/imagens.
 * Suporta: # títulos, **negrito**, *itálico*, ~~riscado~~, ==destaque==, `código`,
 * listas (- * 1.), tarefas (- [ ] / - [x]), > citação, --- linha, ``` bloco de código.
 * Espaços/tabs do início das linhas são preservados (cifras, tablaturas).
 */
(function () {
  "use strict";
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var BLOCK = /^(\s*)(#{1,3}\s+\S|[-*+]\s+\S|\d+[.)]\s+\S|>\s?\S|---+\s*$|```)/;
  var INLINE = /\*\*[^*\n]+\*\*|(^|[\s(])\*[^*\s][^*\n]*\*|~~[^~\n]+~~|==[^=\n]+==|`[^`\n]+`/;

  function detect(text) {
    text = String(text || "");
    return text.split("\n").some(function (l) { return BLOCK.test(l); }) || INLINE.test(text);
  }
  function inline(t) {
    t = esc(t);
    var codes = [];
    t = t.replace(/`([^`\n]+)`/g, function (_, c) { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    t = t.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
         .replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*/g, "$1<em>$2</em>")
         .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
         .replace(/==([^=\n]+)==/g, "<mark>$1</mark>");
    return t.replace(/\u0000(\d+)\u0000/g, function (_, i) { return "<code>" + codes[+i] + "</code>"; });
  }
  function render(text) {
    var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n"), out = [], inCode = false, m;
    lines.forEach(function (raw) {
      if (/^\s*```/.test(raw)) { inCode = !inCode; return; }
      if (inCode) { out.push('<div class="md-code">' + (esc(raw) || "&nbsp;") + "</div>"); return; }
      if (!raw.trim()) { out.push('<div class="md-gap"></div>'); return; }
      if ((m = raw.match(/^\s*(#{1,3})\s+(.*)$/))) { out.push('<div class="md-h md-h' + m[1].length + '">' + inline(m[2]) + "</div>"); return; }
      if (/^\s*---+\s*$/.test(raw)) { out.push('<hr class="md-hr">'); return; }
      if ((m = raw.match(/^(\s*)>\s?(.*)$/))) { out.push('<div class="md-q">' + inline(m[2]) + "</div>"); return; }
      if ((m = raw.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/))) {
        var done = m[2] !== " ";
        out.push('<div class="md-li md-task' + (done ? " done" : "") + '" style="padding-left:' + (m[1].replace(/\t/g, "    ").length * 0.5) + 'em"><span class="md-mark">' + (done ? "☑" : "☐") + "</span>" + inline(m[3]) + "</div>");
        return;
      }
      if ((m = raw.match(/^(\s*)[-*+]\s+(.*)$/))) { out.push('<div class="md-li" style="padding-left:' + (m[1].replace(/\t/g, "    ").length * 0.5) + 'em"><span class="md-mark">•</span>' + inline(m[2]) + "</div>"); return; }
      if ((m = raw.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) { out.push('<div class="md-li" style="padding-left:' + (m[1].replace(/\t/g, "    ").length * 0.5) + 'em"><span class="md-mark">' + m[2] + ".</span>" + inline(m[3]) + "</div>"); return; }
      out.push('<div class="md-p">' + inline(raw) + "</div>");
    });
    return out.join("");
  }
  window.MiniMd = { render: render, detect: detect, esc: esc };
})();
