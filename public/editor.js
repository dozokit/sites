// Runs inside the editor's preview only. Two modes, each with its own colour:
// - Edit (the default, green): only what the owner can change themself, texts and photos, reacts;
//   a click opens it for a free edit.
// - Ask Claude (orange, turned on by the editor's button): anything can be picked, at any level, as
//   in Broken Here's picker. A click picks the element under the mouse, ↑ / ↓ (or the editor's
//   trail) move to the element around it or back in, Shift+click adds more. The editor turns the
//   picks into a prompt for Claude.
(function () {
  var GREEN = "#1f8a4c", ORANGE = "#e8590c";
  var on = false, picks = [], current = -1, boxes = [], editBox = null, editEl = null;
  var key = "scroll:" + location.search;

  function overlay(dashed) {
    var b = document.createElement("div");
    b.setAttribute("aria-hidden", "true");
    b.style.cssText = "position:fixed;pointer-events:none;z-index:9999;border:2px " + (dashed ? "dashed" : "solid") + " " + ORANGE + ";border-radius:4px;display:none";
    document.body.appendChild(b);
    return b;
  }
  var hl = overlay(true);
  function place(b, el, tag, color) {
    color = color || ORANGE;
    b.style.borderColor = color;
    var r = el.getBoundingClientRect();
    b.style.display = "block";
    b.style.left = r.left - 3 + "px";
    b.style.top = r.top - 3 + "px";
    b.style.width = r.width + 6 + "px";
    b.style.height = r.height + 6 + "px";
    b.textContent = "";
    if (tag) {
      var t = document.createElement("span");
      t.textContent = tag;
      t.style.cssText = "position:absolute;left:-2px;top:-22px;background:" + color + ";color:#fff;font:600 11px/1 system-ui;padding:4px 6px;border-radius:4px 4px 4px 0;white-space:nowrap";
      b.appendChild(t);
    }
  }

  var NAMES = { H1: "Headline", H2: "Title", H3: "Subtitle", H4: "Subtitle", P: "Text", UL: "List", OL: "List", LI: "Item", NAV: "Menu", FOOTER: "Footer", FORM: "Form", TABLE: "Table", TR: "Row", FIGURE: "Photo", IMG: "Photo", PICTURE: "Photo", BUTTON: "Button", BLOCKQUOTE: "Quote", ADDRESS: "Address" };
  function short(s) {
    s = (s || "").replace(/\s+/g, " ").trim();
    return s.length > 24 ? s.slice(0, 23) + "…" : s;
  }
  // A name the owner recognises: what it is, plus its words when that helps tell it apart.
  function name(el) {
    if (el.dataset.section) {
      var h = el.querySelector("h1, h2");
      return el.matches(".hero, [class*=hero]") ? "Top of the page" : "Section “" + short(h ? h.textContent : el.id) + "”";
    }
    if (el.dataset.kind === "image") return "Photo";
    if (el.matches(".btn, [class*=btn], [class*=button]")) return "Button “" + short(el.textContent) + "”";
    if (el.tagName === "A") return "Link “" + short(el.textContent) + "”";
    if (el.matches(".topbar, body > header")) return "Top bar";
    if (el.querySelectorAll(":scope > a, :scope > button").length > 1 && !el.matches("nav")) return "Buttons";
    // Lists and boxes are named after their class when they have one ("Gallery", "Mosaic").
    var c = (el.getAttribute("class") || "").split(/\s+/).filter(function (x) { return x && !/^(l|s|is|has)-/.test(x); })[0];
    if (NAMES[el.tagName] && !(c && /^(UL|OL|LI|DIV|FIGURE)$/.test(el.tagName))) return NAMES[el.tagName];
    if (c) return (c.charAt(0).toUpperCase() + c.slice(1)).replace(/--.*/, "").replace(/[-_]+/g, " ");
    return NAMES[el.tagName] || el.tagName.toLowerCase();
  }
  function seen(el) {
    var r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }
  // From the section (or top bar, or footer) down to the element, without layout wrappers.
  function levels(el) {
    var out = [];
    for (var e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      // Layout wrappers say nothing to the owner.
      if (e === hl || !seen(e) || (e !== el && !e.dataset.section && /(^|\s)(wrap|container|inner)(\s|$)/.test(e.getAttribute("class") || ""))) continue;
      out.unshift(e);
      if (e.dataset.section || e.matches("body > header, .topbar, footer")) break;
    }
    // Of two layers covering the same area, the outer one stays (and always the one clicked).
    return out.filter(function (e, i) {
      var p = out[i - 1];
      if (!p || i === out.length - 1) return true;
      var a = e.getBoundingClientRect(), b = p.getBoundingClientRect();
      return Math.abs(a.width - b.width) + Math.abs(a.height - b.height) > 4;
    }).slice(-7);
  }
  function photos(el) {
    var list = el.tagName === "IMG" ? [el] : [].slice.call(el.querySelectorAll("img"));
    return list.map(function (i) { var m = (i.getAttribute("src") || "").match(/\/img\/([^/?#]+)/); return m && decodeURIComponent(m[1]); }).filter(Boolean).slice(0, 12);
  }
  // A CSS path from the section, for blocks the chat app wrote itself.
  function selector(el) {
    var parts = [];
    for (var e = el; e && e !== document.body; e = e.parentElement) {
      if (e.id) { parts.unshift("#" + e.id); break; }
      var c = (e.getAttribute("class") || "").split(/\s+/)[0];
      var same = e.parentElement ? [].filter.call(e.parentElement.children, function (x) { return x.tagName === e.tagName; }) : [];
      parts.unshift(e.tagName.toLowerCase() + (c ? "." + c : "") + (same.length > 1 ? ":nth-of-type(" + (same.indexOf(e) + 1) + ")" : ""));
    }
    return parts.join(" > ");
  }
  function describe(p) {
    var el = p.levels[p.i], r = el.getBoundingClientRect();
    var edit = el.closest("[data-edit]") === el ? el : null;
    var section = el.closest("[data-section]");
    var link = el.closest("a[href]");
    return {
      trail: p.levels.map(name),
      i: p.i,
      path: edit ? edit.getAttribute("data-edit") : null,
      kind: edit ? edit.getAttribute("data-kind") || "text" : null,
      section: section ? section.getAttribute("data-section") : null,
      selector: edit ? null : selector(el),
      text: el.tagName === "IMG" ? "" : short(el.textContent).length ? el.textContent.replace(/\s+/g, " ").trim().slice(0, 300) : "",
      href: link && link.getAttribute("href").charAt(0) !== "#" ? link.href : null,
      photos: photos(el),
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    };
  }
  // What the owner can change themself under the pointer: a text or a photo.
  function free(t) {
    var el = t && t.closest ? t.closest("[data-edit]") : null;
    return el && el.getAttribute("data-kind") !== "html" ? el : null;
  }
  function freeLabel(el) {
    return el.getAttribute("data-kind") === "image" ? "Change photo · free" : "Edit text · free";
  }
  function sendEdit() {
    if (!editBox) editBox = overlay(false);
    place(editBox, editEl, freeLabel(editEl), GREEN);
    parent.postMessage({ type: "edit", item: describe({ levels: [editEl], i: 0 }) }, location.origin);
  }
  function send() {
    boxes.forEach(function (b) { b.remove(); });
    boxes = picks.map(function (p, k) {
      var b = overlay(false);
      place(b, p.levels[p.i], k === current ? name(p.levels[p.i]) : "");
      return b;
    });
    parent.postMessage({ type: "picks", items: picks.map(describe), current: current }, location.origin);
  }

  document.addEventListener("mouseover", function (e) {
    if (!on) {
      var f = free(e.target);
      return f ? place(hl, f, freeLabel(f), GREEN) : (hl.style.display = "none");
    }
    var el = e.target;
    if (!el || el === document.body || el === document.documentElement || !seen(el)) return (hl.style.display = "none");
    place(hl, el, name(el), ORANGE);
  });
  document.addEventListener("mouseout", function (e) {
    if (!e.relatedTarget) hl.style.display = "none";
  });
  document.addEventListener(
    "click",
    function (e) {
      // In the preview nothing navigates or submits: a click is a pick. A link to a part of
      // the page still scrolls there.
      e.preventDefault();
      e.stopPropagation();
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      var to = a && a.getAttribute("href").length > 1 && document.getElementById(a.getAttribute("href").slice(1));
      if (to) to.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!on) {
        var f = free(e.target);
        if (!f) return;
        hl.style.display = "none";
        editEl = f;
        return sendEdit();
      }
      var ls = levels(e.target);
      if (!ls.length) return;
      var p = { levels: ls, i: ls.length - 1 };
      if (e.shiftKey) picks.push(p);
      else picks = [p];
      current = picks.length - 1;
      hl.style.display = "none";
      send();
    },
    true,
  );
  document.addEventListener("submit", function (e) {
    e.preventDefault();
  }, true);

  function step(d) {
    var p = picks[current];
    if (!p) return;
    p.i = Math.max(0, Math.min(p.levels.length - 1, p.i + d));
    send();
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!picks[current]) return;
      e.preventDefault();
      step(e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "Escape" && (picks.length || on)) {
      picks = [];
      current = -1;
      send();
      parent.postMessage({ type: "stop" }, location.origin);
    }
  });
  // The editor's trail, chips and keys.
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin || !e.data) return;
    var d = e.data;
    if (d.type === "mode") {
      on = Boolean(d.on);
      document.documentElement.style.cursor = on ? "crosshair" : "";
      hl.style.display = "none";
      editEl = null;
      if (editBox) editBox.style.display = "none";
    } else if (d.type === "unedit") {
      editEl = null;
      if (editBox) editBox.style.display = "none";
    } else if (d.type === "level" && picks[current]) {
      if (typeof d.i === "number") picks[current].i = Math.max(0, Math.min(picks[current].levels.length - 1, d.i));
      else return step(d.delta);
      send();
    } else if (d.type === "unpick") {
      picks.splice(d.k, 1);
      current = Math.min(current, picks.length - 1);
      send();
    } else if (d.type === "current") {
      current = d.k;
      send();
    } else if (d.type === "clear") {
      picks = [];
      current = -1;
      send();
    }
  });

  var queued = false;
  window.addEventListener("scroll", function () {
    hl.style.display = "none";
    sessionStorage.setItem(key, String(scrollY));
    if ((picks.length || editEl) && !queued) {
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        if (picks.length) send();
        if (editEl) sendEdit();
      });
    }
  }, { passive: true });
  // After a change the preview reloads; it comes back where the owner was.
  var y = Number(sessionStorage.getItem(key) || 0);
  if (y) scrollTo(0, y);
})();
