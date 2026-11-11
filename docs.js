(function () {
  var root = document.body.dataset.root;
  // Fold buttons on the h2 sections.
  function fold(sec, folded) {
    sec.classList.toggle("folded", folded);
    sec.querySelector(".fold").setAttribute("aria-expanded", String(!folded));
  }
  document.querySelectorAll(".dsec .fold").forEach(function (b) {
    b.addEventListener("click", function () { var s = b.closest(".dsec"); fold(s, !s.classList.contains("folded")); });
  });
  function all(folded) { document.querySelectorAll(".dsec").forEach(function (s) { fold(s, folded); }); }
  var a = document.getElementById("fold-all"), b = document.getElementById("unfold-all");
  if (a) a.addEventListener("click", function () { all(true); });
  if (b) b.addEventListener("click", function () { all(false); });
  // A link to something inside a folded section opens it.
  function reveal() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    var sec = el && el.closest(".dsec");
    if (sec && sec.classList.contains("folded")) { fold(sec, false); el.scrollIntoView(); }
  }
  window.addEventListener("hashchange", reveal);
  reveal();
  // Copy buttons.
  document.querySelectorAll(".code .cbtn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.parentNode.querySelector("code").textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () {
        btn.textContent = "copied"; setTimeout(function () { btn.textContent = "copy"; }, 1200);
      }, function () {});
    });
  });
  // Search over every heading and every method.
  var q = document.getElementById("q"), box = document.getElementById("results"), idx = window.WEFT_SEARCH || [], sel = -1;
  function search(text) {
    var words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var scored = [];
    idx.forEach(function (e) {
      var head = e[1].toLowerCase(), body = (e[0] + " " + e[3]).toLowerCase(), s = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        if (head.indexOf(w) === 0) s += 6; else if (head.indexOf(w) > 0) s += 4; else if (body.indexOf(w) >= 0) s += 1; else return;
      }
      scored.push([s, e]);
    });
    scored.sort(function (x, y) { return y[0] - x[0]; });
    return scored.slice(0, 20).map(function (x) { return x[1]; });
  }
  function show() {
    var found = search(q.value);
    box.innerHTML = ""; sel = -1;
    box.hidden = !q.value.trim();
    if (box.hidden) return;
    if (!found.length) { var p = document.createElement("p"); p.textContent = "Nothing found"; box.appendChild(p); return; }
    found.forEach(function (e) {
      var l = document.createElement("a"); l.href = root + e[2];
      l.textContent = e[1]; var s = document.createElement("small"); s.textContent = e[0]; l.appendChild(s); box.appendChild(l);
    });
  }
  function move(d) {
    var links = box.querySelectorAll("a"); if (!links.length) return;
    if (sel >= 0) links[sel].classList.remove("on");
    sel = (sel + d + links.length) % links.length; links[sel].classList.add("on"); links[sel].scrollIntoView({ block: "nearest" });
  }
  q.addEventListener("input", show);
  q.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") { ev.preventDefault(); move(1); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); move(-1); }
    else if (ev.key === "Enter") { var l = box.querySelectorAll("a")[Math.max(sel, 0)]; if (l) location.href = l.href; }
    else if (ev.key === "Escape") { q.value = ""; show(); q.blur(); }
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "/" && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { ev.preventDefault(); q.focus(); }
  });
})();
