/* =============================================================================
   Planos Interactivos — Delimitación de propiedades sobre planos / fotos aéreas
   HTML5 Canvas + JavaScript puro (sin dependencias, sin build).
   Coordenadas almacenadas en espacio "mundo" (px de la imagen). El render aplica
   una transformación de zoom/pan. Todo el hit-testing se hace en espacio pantalla.
   ============================================================================= */
(() => {
  "use strict";

  // ---------- Estado global ----------
  const PALETTE = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#ffffff"];
  const DASHES = { solid: [], dashed: [14, 9], dotted: [2, 7] };

  const state = {
    tool: "draw",                 // 'draw' | 'select' | 'delete'
    polygons: [],                 // ver crearPoligono()
    draft: null,                  // polígono en construcción
    selection: { polyId: null, vertex: null, edge: null }, // edge/vertex = índice
    hover: { polyId: null, vertex: null, edge: null },
    view: { scale: 1, x: 0, y: 0 },
    bg: null,                     // {canvas|image, w, h}
    nextNum: 1,
    drag: null,                   // estado de arrastre en curso
    space: false,                 // barra espaciadora -> pan temporal
  };

  // ---------- Utilidades DOM ----------
  const $ = (s) => document.querySelector(s);
  const el = (tag, props = {}, kids = []) => {
    const n = document.createElement(tag);
    Object.assign(n, props);
    for (const k of [].concat(kids)) n.append(k);
    return n;
  };

  const canvas = $("#board");
  const ctx = canvas.getContext("2d");
  const wrap = $(".canvas-wrap");

  // ---------- Transformaciones mundo<->pantalla ----------
  const toScreen = (p) => ({ x: p.x * state.view.scale + state.view.x, y: p.y * state.view.scale + state.view.y });
  const toWorld = (sx, sy) => ({ x: (sx - state.view.x) / state.view.scale, y: (sy - state.view.y) / state.view.scale });

  // ---------- Modelo ----------
  function crearPoligono(first) {
    const color = PALETTE[(state.nextNum - 1) % PALETTE.length];
    return {
      id: "p" + Date.now() + "_" + Math.floor(Math.random() * 1e4),
      name: "Lindero " + state.nextNum++,
      points: first ? [first] : [],
      closed: false,
      stroke: color,
      width: 3,
      dash: "solid",
      fillEnabled: true,
      fill: color,
      fillOpacity: 0.18,
      visible: true,
      edges: {},        // { [indiceArista]: { stroke?, label? } }
    };
  }

  const getPoly = (id) => state.polygons.find((p) => p.id === id) || null;
  const selectedPoly = () => getPoly(state.selection.polyId);

  // =============================================================================
  //  RENDER
  // =============================================================================
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = wrap.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  function cssSize() {
    const r = wrap.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function render() {
    const { w, h } = cssSize();
    ctx.clearRect(0, 0, w, h);

    // Fondo (imagen o plano sintético)
    if (state.bg) {
      const src = state.bg.canvas || state.bg.image;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, state.view.x, state.view.y, state.bg.w * state.view.scale, state.bg.h * state.view.scale);
    }

    for (const poly of state.polygons) if (poly.visible) drawPolygon(poly, false);
    if (state.draft) drawPolygon(state.draft, true);
  }

  function applyDash(name) { ctx.setLineDash(DASHES[name] || []); }

  function drawPolygon(poly, isDraft) {
    if (poly.points.length === 0) return;
    const pts = poly.points.map(toScreen);
    const sel = state.selection.polyId === poly.id;
    const hov = state.hover.polyId === poly.id;

    // Relleno
    if (poly.fillEnabled && (poly.closed || isDraft) && pts.length >= 3) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = hexToRgba(poly.fill, hov ? Math.min(1, poly.fillOpacity + 0.12) : poly.fillOpacity);
      ctx.fill();
    }

    // Aristas (una por una para permitir color/etiqueta por arista)
    const n = pts.length;
    const segCount = poly.closed ? n : n - 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 0; i < segCount; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const ov = poly.edges[i] || {};
      const isSelEdge = sel && state.selection.edge === i;
      const isHovEdge = hov && state.hover.edge === i;
      applyDash(poly.dash);
      ctx.lineWidth = poly.width + (isSelEdge ? 2 : 0);
      ctx.strokeStyle = ov.stroke || poly.stroke;
      if (isSelEdge || isHovEdge) {
        ctx.save();
        ctx.shadowColor = "rgba(59,130,246,.9)";
        ctx.shadowBlur = 10;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (isSelEdge || isHovEdge) ctx.restore();

      // Etiqueta de la arista
      if (ov.label) drawLabel(ov.label, (a.x + b.x) / 2, (a.y + b.y) / 2, ov.stroke || poly.stroke);
    }
    ctx.setLineDash([]);

    // Vértices (en select/delete, draft, o polígono seleccionado)
    const showVerts = isDraft || sel || state.tool !== "draw";
    if (showVerts) {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const isSelV = sel && state.selection.vertex === i;
        const isHovV = hov && state.hover.vertex === i;
        const isFirst = isDraft && i === 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isSelV || isHovV || isFirst ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = isFirst ? "#22c55e" : isSelV ? "#3b82f6" : "#fff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = poly.stroke;
        ctx.stroke();
      }
    }

    // Nombre del lindero cerca del centroide
    if (poly.closed && poly.points.length >= 3) {
      const c = centroid(pts);
      drawLabel(poly.name, c.x, c.y, poly.stroke, true);
    }
  }

  function drawLabel(text, x, y, color, big) {
    ctx.save();
    ctx.font = (big ? "600 13px " : "500 12px ") + "Inter, system-ui, sans-serif";
    const padX = 7, padY = 4;
    const w = ctx.measureText(text).width;
    const bx = x - w / 2 - padX, by = y - 9 - padY, bw = w + padX * 2, bh = 18 + padY;
    roundRect(bx, by, bw, bh, 6);
    ctx.fillStyle = "rgba(13,18,24,.82)";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = hexToRgba(color, 0.9);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, by + bh / 2);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- Geometría / hit-testing (en pantalla) ----------
  function centroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
  }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function distToSeg(px, py, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return dist(px, py, a.x + t * dx, a.y + t * dy);
  }
  function pointInPoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // Devuelve el objeto bajo el cursor priorizando vértice > arista > relleno.
  function hitTest(sx, sy) {
    const VT = 11, ET = 8; // tolerancias en px
    for (let pi = state.polygons.length - 1; pi >= 0; pi--) {
      const poly = state.polygons[pi];
      if (!poly.visible) continue;
      const pts = poly.points.map(toScreen);
      for (let i = 0; i < pts.length; i++)
        if (dist(sx, sy, pts[i].x, pts[i].y) <= VT) return { polyId: poly.id, vertex: i, edge: null };
      const segCount = poly.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segCount; i++)
        if (distToSeg(sx, sy, pts[i], pts[(i + 1) % pts.length]) <= ET) return { polyId: poly.id, vertex: null, edge: i };
      if (poly.closed && pts.length >= 3 && pointInPoly(sx, sy, pts))
        return { polyId: poly.id, vertex: null, edge: null };
    }
    return { polyId: null, vertex: null, edge: null };
  }

  // =============================================================================
  //  INTERACCIÓN
  // =============================================================================
  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const s = getPos(e);

    // Pan: botón medio, o barra espaciadora, o herramienta select sobre vacío
    if (e.button === 1 || state.space) { startPan(s); return; }

    if (state.tool === "draw") return onDrawDown(s);
    if (state.tool === "delete") return onDeleteDown(s);

    // --- Select ---
    const hit = hitTest(s.x, s.y);
    if (hit.vertex !== null) {
      selectPoly(hit.polyId, null, hit.vertex);
      state.drag = { type: "vertex", polyId: hit.polyId, index: hit.vertex };
    } else if (hit.polyId) {
      selectPoly(hit.polyId, hit.edge, null);
      state.drag = { type: "move", polyId: hit.polyId, last: s };
    } else {
      selectPoly(null);
      startPan(s);
    }
    render();
  });

  function startPan(s) {
    state.drag = { type: "pan", last: s };
    wrap.classList.add("panning");
  }

  function onDrawDown(s) {
    const w = toWorld(s.x, s.y);
    if (!state.draft) state.draft = crearPoligono(w);
    else {
      // ¿clic cerca del primer punto? -> cerrar
      const first = toScreen(state.draft.points[0]);
      if (state.draft.points.length >= 3 && dist(s.x, s.y, first.x, first.y) <= 12) return finishDraft(true);
      state.draft.points.push(w);
    }
    render();
    updateTip();
  }

  function onDeleteDown(s) {
    const hit = hitTest(s.x, s.y);
    if (!hit.polyId) return;
    const poly = getPoly(hit.polyId);
    if (hit.vertex !== null) {
      poly.points.splice(hit.vertex, 1);
      remapEdges(poly, hit.vertex);
      if (poly.points.length < 2) return deletePoly(poly.id);
      if (poly.points.length < 3) poly.closed = false;
    } else if (hit.edge !== null) {
      // Quitar una arista: abre el perímetro por ese segmento
      poly.closed = false;
      const rot = (hit.edge + 1) % poly.points.length;
      poly.points = poly.points.slice(rot).concat(poly.points.slice(0, rot));
      poly.edges = {};
    }
    syncSelectionValidity();
    refreshLayers(); render();
  }

  function remapEdges(poly, removedIndex) {
    const next = {};
    for (const k of Object.keys(poly.edges)) {
      const i = +k;
      if (i < removedIndex) next[i] = poly.edges[k];
      else if (i > removedIndex) next[i - 1] = poly.edges[k];
    }
    poly.edges = next;
  }

  canvas.addEventListener("pointermove", (e) => {
    const s = getPos(e);
    if (state.drag) return onDragMove(s);

    // Hover highlight (select/delete)
    if (state.tool !== "draw") {
      const hit = hitTest(s.x, s.y);
      if (hit.polyId !== state.hover.polyId || hit.vertex !== state.hover.vertex || hit.edge !== state.hover.edge) {
        state.hover = hit; render();
      }
    } else if (state.draft) {
      render(); // (podría dibujarse línea guía; mantenemos simple)
    }
  });

  function onDragMove(s) {
    const d = state.drag;
    if (d.type === "pan") {
      state.view.x += s.x - d.last.x;
      state.view.y += s.y - d.last.y;
      d.last = s; render(); updateZoomLabel();
    } else if (d.type === "vertex") {
      getPoly(d.polyId).points[d.index] = toWorld(s.x, s.y);
      render();
    } else if (d.type === "move") {
      const poly = getPoly(d.polyId);
      const dx = (s.x - d.last.x) / state.view.scale, dy = (s.y - d.last.y) / state.view.scale;
      poly.points = poly.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      d.last = s; render();
    }
  }

  window.addEventListener("pointerup", () => {
    if (state.drag && state.drag.type === "pan") wrap.classList.remove("panning");
    state.drag = null;
  });

  canvas.addEventListener("dblclick", () => { if (state.draft) finishDraft(false); });

  // Zoom con rueda centrado en el cursor
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const s = getPos(e);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(s.x, s.y, factor);
  }, { passive: false });

  function zoomAt(sx, sy, factor) {
    const newScale = Math.max(0.1, Math.min(8, state.view.scale * factor));
    const f = newScale / state.view.scale;
    state.view.x = sx - (sx - state.view.x) * f;
    state.view.y = sy - (sy - state.view.y) * f;
    state.view.scale = newScale;
    render(); updateZoomLabel();
  }

  // ---------- Teclado ----------
  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    if (e.code === "Space") { state.space = true; wrap.classList.add("panning"); e.preventDefault(); return; }
    if (e.key === "Escape") { if (state.draft) { state.draft = null; render(); updateTip(); } else selectPoly(null), render(); }
    if (e.key === "Enter" && state.draft) finishDraft(state.draft.points.length >= 3);
    if ((e.key === "Delete" || e.key === "Backspace")) deleteSelection();
    if (e.key === "v" || e.key === "1") setTool("select");
    if (e.key === "d" || e.key === "2") setTool("draw");
    if (e.key === "x" || e.key === "3") setTool("delete");
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") { state.space = false; if (!state.drag) wrap.classList.remove("panning"); }
  });

  function finishDraft(close) {
    const d = state.draft;
    if (!d || d.points.length < 2) { state.draft = null; render(); updateTip(); return; }
    d.closed = !!close && d.points.length >= 3;
    state.polygons.push(d);
    state.draft = null;
    selectPoly(d.id);
    refreshLayers(); render(); updateTip();
  }

  function deleteSelection() {
    const { polyId, vertex } = state.selection;
    if (!polyId) return;
    if (vertex !== null) {
      const poly = getPoly(polyId);
      poly.points.splice(vertex, 1);
      remapEdges(poly, vertex);
      if (poly.points.length < 2) return deletePoly(polyId);
      state.selection.vertex = null;
      refreshLayers(); render();
    } else {
      deletePoly(polyId);
    }
  }

  // =============================================================================
  //  SELECCIÓN / PANELES
  // =============================================================================
  function selectPoly(id, edge = null, vertex = null) {
    state.selection = { polyId: id, edge, vertex };
    refreshLayers();
    refreshStylePanel();
  }
  function syncSelectionValidity() {
    if (!getPoly(state.selection.polyId)) state.selection = { polyId: null, edge: null, vertex: null };
  }

  function deletePoly(id) {
    state.polygons = state.polygons.filter((p) => p.id !== id);
    if (state.selection.polyId === id) selectPoly(null);
    refreshLayers(); render();
  }

  // ---------- Panel de capas ----------
  function refreshLayers() {
    const list = $("#layers");
    list.innerHTML = "";
    if (state.polygons.length === 0) {
      list.append(el("div", { className: "empty-hint", textContent: "Aún no hay linderos. Usa la herramienta Dibujar y haz clic en el plano para colocar vértices." }));
      return;
    }
    state.polygons.forEach((poly) => {
      const row = el("div", { className: "layer" + (state.selection.polyId === poly.id ? " selected" : "") + (poly.visible ? "" : " hidden-l") });
      const swatch = el("div", { className: "swatch" }); swatch.style.background = poly.stroke;
      const name = el("div", { className: "name", textContent: poly.name });
      const meta = el("div", { className: "meta", textContent: poly.points.length + "pt" });
      const eye = el("button", { className: "ic", title: "Mostrar/ocultar", textContent: poly.visible ? "👁" : "🚫" });
      const trash = el("button", { className: "ic del", title: "Eliminar", textContent: "🗑" });

      row.onmouseenter = () => { state.hover = { polyId: poly.id, vertex: null, edge: null }; render(); };
      row.onmouseleave = () => { state.hover = { polyId: null, vertex: null, edge: null }; render(); };
      row.onclick = (ev) => { if (ev.target === eye || ev.target === trash) return; selectPoly(poly.id); setTool("select"); render(); };
      eye.onclick = (ev) => { ev.stopPropagation(); poly.visible = !poly.visible; refreshLayers(); render(); };
      trash.onclick = (ev) => { ev.stopPropagation(); deletePoly(poly.id); };

      row.append(swatch, name, meta, eye, trash);
      list.append(row);
    });
  }

  // ---------- Panel de estilos ----------
  function refreshStylePanel() {
    const host = $("#style-body");
    host.innerHTML = "";
    const poly = selectedPoly();
    if (!poly) {
      host.append(el("div", { className: "placeholder", innerHTML: "Selecciona un lindero en el lienzo o en la lista de capas para editar su <b>color</b>, <b>grosor</b>, <b>tipo de línea</b>, <b>relleno</b> y <b>etiquetas</b>." }));
      return;
    }

    // Nombre
    host.append(field("Nombre del lindero", textInput(poly.name, (v) => { poly.name = v || poly.name; refreshLayers(); render(); })));

    // Color del perímetro + paleta
    const colorInput = el("input", { type: "color", value: poly.stroke });
    colorInput.oninput = () => { poly.stroke = colorInput.value; render(); refreshLayers(); };
    const swatches = el("div", { className: "row" });
    PALETTE.forEach((c) => {
      const b = el("button", { className: "ic", title: c });
      b.style.cssText = `width:22px;height:22px;border-radius:6px;background:${c};border:1px solid rgba(255,255,255,.25)`;
      b.onclick = () => { poly.stroke = c; colorInput.value = c; render(); refreshLayers(); };
      swatches.append(b);
    });
    host.append(field("Color del perímetro", el("div", {}, [el("div", { className: "row" }, [colorInput, hint("Aplica a todo el contorno")]), el("div", { style: "height:8px" }), swatches])));

    // Grosor
    host.append(rangeField("Grosor de línea", 1, 14, poly.width, (v) => { poly.width = v; render(); }, (v) => v + " px"));

    // Tipo de línea
    host.append(field("Tipo de línea", segmented(
      [["solid", "──"], ["dashed", "– –"], ["dotted", "· ·"]],
      poly.dash, (v) => { poly.dash = v; render(); }
    )));

    // Relleno
    const fillToggle = switchCtrl(poly.fillEnabled, (v) => { poly.fillEnabled = v; render(); refreshStylePanel(); });
    host.append(field("Relleno translúcido", el("div", { className: "row between" }, [el("span", { className: "hint", textContent: poly.fillEnabled ? "Activado" : "Desactivado" }), fillToggle])));
    if (poly.fillEnabled) {
      const fc = el("input", { type: "color", value: poly.fill });
      fc.oninput = () => { poly.fill = fc.value; render(); };
      host.append(field("Color de relleno", el("div", { className: "row" }, [fc, hint("Sombreado del terreno")])));
      host.append(rangeField("Opacidad del relleno", 0, 100, Math.round(poly.fillOpacity * 100), (v) => { poly.fillOpacity = v / 100; render(); }, (v) => v + "%"));
    }

    // Cerrar/abrir perímetro
    const closeBtn = el("button", { className: "btn", textContent: poly.closed ? "Abrir perímetro" : "Cerrar perímetro" });
    closeBtn.onclick = () => { if (poly.points.length >= 3) { poly.closed = !poly.closed; render(); refreshStylePanel(); } };
    host.append(el("div", { style: "margin:13px 0" }, [closeBtn]));

    // ----- Edición por arista (línea individual) -----
    const edge = state.selection.edge;
    if (edge !== null && (poly.closed || edge < poly.points.length - 1)) {
      const ov = poly.edges[edge] || (poly.edges[edge] = {});
      const sep = el("div", { style: "border-top:1px solid var(--line);margin:6px 0 14px" });
      host.append(sep);
      host.append(el("h3", { textContent: "Línea seleccionada (#" + (edge + 1) + ")", style: "font-size:12px;color:var(--accent);letter-spacing:.6px;text-transform:uppercase;font-weight:700;margin:0 0 12px" }));

      const ec = el("input", { type: "color", value: ov.stroke || poly.stroke });
      ec.oninput = () => { ov.stroke = ec.value; render(); };
      const clr = el("button", { className: "btn", textContent: "Usar color del perímetro" });
      clr.onclick = () => { delete ov.stroke; render(); refreshStylePanel(); };
      host.append(field("Color de esta línea", el("div", {}, [el("div", { className: "row" }, [ec, hint('Ej: "Norte" en rojo')]), el("div", { style: "height:8px" }), clr])));

      const lbl = textInput(ov.label || "", (v) => { ov.label = v; render(); });
      lbl.placeholder = 'Ej: "35 metros"';
      host.append(field("Etiqueta / medida (flota junto al trazo)", lbl));
    } else {
      host.append(hint('Consejo: con la herramienta Seleccionar, haz clic en una <b>línea</b> concreta del perímetro para darle un color propio o una etiqueta (ej. "35 m").', true));
    }

    // Eliminar lindero
    const del = el("button", { className: "btn danger", textContent: "🗑  Eliminar este lindero" });
    del.onclick = () => deletePoly(poly.id);
    host.append(el("div", { style: "margin-top:14px" }, [del]));
  }

  // ---------- Constructores de controles ----------
  function field(label, control) {
    return el("div", { className: "field" }, [el("label", { textContent: label }), control]);
  }
  function textInput(value, onInput) {
    const i = el("input", { type: "text", value });
    i.oninput = () => onInput(i.value);
    return i;
  }
  function hint(html, block) {
    const s = el(block ? "div" : "span", { className: "hint", innerHTML: html });
    if (block) s.style.marginTop = "10px";
    return s;
  }
  function rangeField(label, min, max, value, onInput, fmt) {
    const r = el("input", { type: "range", min, max, value });
    const v = el("span", { className: "val", textContent: fmt(value) });
    r.oninput = () => { v.textContent = fmt(+r.value); onInput(+r.value); };
    return el("div", { className: "field" }, [el("label", { textContent: label }), el("div", { className: "row" }, [r, v])]);
  }
  function segmented(options, current, onPick) {
    const box = el("div", { className: "seg" });
    options.forEach(([val, label]) => {
      const b = el("button", { className: current === val ? "on" : "", textContent: label });
      b.onclick = () => { onPick(val); [...box.children].forEach((c) => c.classList.remove("on")); b.classList.add("on"); };
      box.append(b);
    });
    return box;
  }
  function switchCtrl(checked, onChange) {
    const wrap = el("label", { className: "switch" });
    const input = el("input", { type: "checkbox", checked });
    input.onchange = () => onChange(input.checked);
    wrap.append(input, el("span", { className: "track" }), el("span", { className: "thumb" }));
    return wrap;
  }

  // =============================================================================
  //  HERRAMIENTAS / TOPBAR
  // =============================================================================
  function setTool(t) {
    state.tool = t;
    if (t !== "draw" && state.draft) finishDraft(state.draft.points.length >= 3);
    document.querySelectorAll(".tool[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
    wrap.className = "canvas-wrap tool-" + t;
    updateTip();
    render();
  }

  function updateTip() {
    const tip = $("#tip");
    if (state.tool === "draw") {
      tip.textContent = state.draft
        ? `Haz clic para añadir vértices · clic en el punto verde o Enter para cerrar · Esc cancela (${state.draft.points.length} pts)`
        : "Haz clic en el plano para empezar a delimitar el terreno";
    } else if (state.tool === "select") {
      tip.textContent = "Arrastra vértices para ajustar · clic en una línea para etiquetarla · arrastra el fondo para mover";
    } else {
      tip.textContent = "Haz clic en un vértice para quitarlo · clic en una línea para abrir el perímetro";
    }
  }

  function updateZoomLabel() { $("#zoom").textContent = Math.round(state.view.scale * 100) + "%"; }

  function fitView() {
    if (!state.bg) return;
    const { w, h } = cssSize();
    const scale = Math.min(w / state.bg.w, h / state.bg.h) * 0.92;
    state.view.scale = scale;
    state.view.x = (w - state.bg.w * scale) / 2;
    state.view.y = (h - state.bg.h * scale) / 2;
    render(); updateZoomLabel();
  }

  // =============================================================================
  //  CARGA DE ARCHIVOS
  // =============================================================================
  function loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => { state.bg = { image: img, w: img.naturalWidth, h: img.naturalHeight }; fitView(); };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function loadTextFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      $("#deed").textContent = reader.result.slice(0, 4000);
      $("#deed-name").textContent = "📄 " + file.name;
    };
    reader.readAsText(file);
  }

  function wireDrop(zone, accept, handler) {
    const input = zone.querySelector("input[type=file]");
    zone.onclick = () => input.click();
    input.onchange = () => { if (input.files[0]) handler(input.files[0]); input.value = ""; };
    ["dragover", "dragenter"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("over"); }));
    zone.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) handler(f); });
  }

  // ---------- Plano sintético por defecto (terreno visto desde arriba) ----------
  function buildDefaultBackground() {
    const W = 1280, H = 860;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");

    // Vegetación de fondo
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#7d9b63"); grad.addColorStop(1, "#5f7e49");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);

    // Ruido / parches de terreno
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${60 + Math.random() * 60},${90 + Math.random() * 60},${50 + Math.random() * 40},.18)`;
      const r = 6 + Math.random() * 26;
      g.beginPath(); g.arc(Math.random() * W, Math.random() * H, r, 0, Math.PI * 2); g.fill();
    }

    // Carretera diagonal
    g.save();
    g.translate(W * 0.2, -40); g.rotate(0.5);
    g.fillStyle = "#6b7280"; g.fillRect(0, 0, 90, 1100);
    g.setLineDash([26, 22]); g.strokeStyle = "#f8fafc"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(45, 0); g.lineTo(45, 1100); g.stroke();
    g.restore();

    // Parcelas (rectángulos tipo loteo)
    const lots = [
      [120, 110, 360, 250], [520, 90, 300, 210], [880, 140, 300, 260],
      [150, 430, 320, 300], [520, 470, 280, 260], [860, 470, 320, 300],
    ];
    g.setLineDash([]);
    lots.forEach(([x, y, w, h], i) => {
      g.fillStyle = i % 2 ? "rgba(180,160,120,.35)" : "rgba(150,170,130,.35)";
      g.fillRect(x, y, w, h);
      g.strokeStyle = "rgba(40,50,40,.45)"; g.lineWidth = 2; g.strokeRect(x, y, w, h);
      // "Edificación"
      g.fillStyle = "rgba(110,90,70,.7)";
      g.fillRect(x + 30, y + 30, w * 0.4, h * 0.35);
      g.fillStyle = "rgba(150,120,95,.9)";
      g.fillRect(x + 30, y + 30, w * 0.4, 10);
    });

    // Árboles
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      g.fillStyle = "rgba(30,60,30,.55)";
      g.beginPath(); g.arc(x, y, 7 + Math.random() * 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = "rgba(70,110,60,.7)";
      g.beginPath(); g.arc(x - 2, y - 2, 5 + Math.random() * 6, 0, Math.PI * 2); g.fill();
    }

    // Marca de agua
    g.fillStyle = "rgba(255,255,255,.5)";
    g.font = "600 18px Inter, sans-serif";
    g.fillText("PLANO DE EJEMPLO · Sustitúyelo subiendo tu foto aérea o plano", 30, H - 26);

    state.bg = { canvas: c, w: W, h: H };
  }

  // =============================================================================
  //  INICIALIZACIÓN
  // =============================================================================
  function init() {
    // Toolbar
    document.querySelectorAll(".tool[data-tool]").forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
    $("#fit").onclick = fitView;
    $("#zoom-in").onclick = () => { const { w, h } = cssSize(); zoomAt(w / 2, h / 2, 1.2); };
    $("#zoom-out").onclick = () => { const { w, h } = cssSize(); zoomAt(w / 2, h / 2, 1 / 1.2); };
    $("#clear-all").onclick = () => {
      if (state.polygons.length && !confirm("¿Eliminar todos los linderos dibujados?")) return;
      state.polygons = []; state.draft = null; selectPoly(null); refreshLayers(); render();
    };
    $("#export").onclick = exportJSON;
    $("#import").onclick = () => $("#import-input").click();
    $("#import-input").onchange = (e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; };

    // Drop zones
    wireDrop($("#drop-img"), "image", loadImageFile);
    wireDrop($("#drop-txt"), "text", loadTextFile);

    window.addEventListener("resize", resize);

    buildDefaultBackground();
    resize();
    fitView();
    setTool("draw");
    refreshLayers();
    refreshStylePanel();
    updateZoomLabel();
  }

  // ---------- Persistencia (export/import del proyecto) ----------
  function exportJSON() {
    const data = { version: 1, nextNum: state.nextNum, view: state.view, polygons: state.polygons };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "linderos.json" });
    document.body.append(a); a.click(); a.remove();
  }
  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        state.polygons = data.polygons || [];
        state.nextNum = data.nextNum || state.polygons.length + 1;
        if (data.view) state.view = data.view;
        // Normaliza campos por compatibilidad
        state.polygons.forEach((p) => { p.edges = p.edges || {}; if (p.visible === undefined) p.visible = true; });
        selectPoly(null); refreshLayers(); render(); updateZoomLabel();
      } catch (err) { alert("Archivo no válido: " + err.message); }
    };
    reader.readAsText(file);
  }

  // ---------- helpers de color ----------
  function hexToRgba(hex, a) {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // expón export para el HTML
  window.__planos = { exportJSON };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
