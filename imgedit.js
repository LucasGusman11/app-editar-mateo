/* Editor de imágenes (estilo Photoshop, lo esencial).
   ImageEditor.open(blob, nombre) -> Promise<{ blob, ext } | null> */
(function () {
  'use strict';
  const css = `
#ie{position:fixed;inset:0;z-index:90;background:var(--bg);display:flex;flex-direction:column;color:var(--fg)}
#ie.hidden{display:none}
#ie .ie-top{height:50px;display:flex;align-items:center;gap:.5rem;padding:0 .75rem;background:#000;border-bottom:1px solid var(--line)}
html[data-theme=light] #ie .ie-top{background:#fff}
#ie .ie-top b{font:900 1.3rem/1 var(--display);color:var(--brand);margin-right:.5rem}
#ie .ie-top .info{color:var(--muted);font-size:.82rem;white-space:nowrap}
#ie .ie-main{flex:1;display:flex;min-height:0}
#ie .ie-tools{width:58px;flex:none;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;padding:.4rem 0;gap:.2rem;overflow-y:auto}
#ie .ie-tools button{width:44px;height:40px;border:1px solid transparent;background:none;color:var(--fg);font-size:.66rem;line-height:1.1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
#ie .ie-tools button svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8}
#ie .ie-tools button[aria-pressed=true]{border-color:var(--brand);background:var(--brand-dim)}
#ie .ie-tools hr{width:70%;border:0;border-top:1px solid var(--line);margin:.2rem 0}
#ie .ie-colors{position:relative;width:44px;height:44px;margin-top:.3rem}
#ie .ie-colors input{position:absolute;width:28px;height:28px;border:1px solid #888;padding:0;background:none}
#ie .ie-colors .c1{left:0;top:0;z-index:2}#ie .ie-colors .c2{right:0;bottom:0}
#ie .ie-stage{flex:1;position:relative;overflow:hidden;background:#2a2a28}
#ie canvas#ieView{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
#ie .ie-side{width:300px;flex:none;background:var(--panel);border-left:1px solid var(--line);overflow-y:auto}
#ie .ie-sec{padding:.8rem .9rem;border-bottom:1px solid var(--line)}
#ie .ie-sec h3{font-size:.78rem;font-weight:600;color:var(--muted);margin-bottom:.55rem}
#ie .rng{display:grid;grid-template-columns:92px 1fr 40px;align-items:center;gap:.4rem;font-size:.8rem;margin-top:.3rem}
#ie .rng input{accent-color:var(--brand);width:100%}
#ie .rng output{text-align:right;color:var(--muted);font-size:.75rem}
#ie .presets{display:grid;grid-template-columns:repeat(3,1fr);gap:.35rem}
#ie .presets button{border:1px solid #333;background:#000;padding:0;color:var(--fg);font-size:.7rem;display:flex;flex-direction:column}
#ie .presets canvas{width:100%;aspect-ratio:1;display:block}
#ie .presets span{padding:.15rem}
#ie .grid2{display:grid;grid-template-columns:1fr 1fr;gap:.4rem}
#ie .opt{font-size:.82rem}
#ie .opt .field{margin-top:.45rem}
`;
  const ICONS = {
    move: '<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>',
    crop: '<path d="M6 2v16h16M2 6h16v16"/>', brush: '<path d="M18 3l3 3-9 9-3-3zM9 12c-3 0-5 2-5 5 0 1-1 2-2 2 2 2 7 2 9-1 1-2 0-4-2-6z"/>',
    eraser: '<path d="M7 21h12M3 15l8-8 7 7-6 6H8z"/>', text: '<path d="M5 5h14M12 5v15M9 20h6"/>', shape: '<rect x="3" y="3" width="10" height="10"/><circle cx="16" cy="16" r="5"/>',
    pick: '<path d="M14 4l6 6-9 9H5v-6zM16 2l6 6"/>', fill: '<path d="M4 12l8-8 8 8-8 8zM20 15c0 2 1 3 1 4a1 1 0 01-2 0c0-1 1-2 1-4z"/>', wand: '<path d="M3 21l12-12M15 3v3M18 6h3M15 9l3 3M20 2l-2 2"/>'
  };
  const FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Impact', 'Courier New', 'Big Shoulders Display', 'Instrument Sans'];
  const ADJ = [['brightness', 'Brillo', 0, 200, 100, '%'], ['contrast', 'Contraste', 0, 200, 100, '%'], ['exposure', 'Exposición', -100, 100, 0, ''], ['saturate', 'Saturación', 0, 300, 100, '%'],
    ['hue', 'Tono', -180, 180, 0, '°'], ['temperature', 'Temperatura', -100, 100, 0, ''], ['grayscale', 'Blanco y negro', 0, 100, 0, '%'], ['sepia', 'Sepia', 0, 100, 0, '%'],
    ['blur', 'Desenfoque', 0, 30, 0, 'px'], ['sharpen', 'Nitidez', 0, 100, 0, ''], ['vignette', 'Viñeta', 0, 100, 0, ''], ['invert', 'Invertir', 0, 100, 0, '%']];
  const PRESETS = { 'Original': {}, 'B&N': { grayscale: 100, contrast: 115 }, 'Sepia': { sepia: 80, contrast: 105 }, 'Vintage': { sepia: 35, saturate: 80, contrast: 90, vignette: 45, temperature: 20 },
    'Cálido': { temperature: 40, saturate: 115 }, 'Frío': { temperature: -40, saturate: 95 }, 'Drama': { contrast: 140, saturate: 85, vignette: 60, exposure: -10 },
    'Desvaído': { contrast: 80, saturate: 70, brightness: 110 }, 'Noir': { grayscale: 100, contrast: 165, vignette: 55, exposure: -15 } };

  let root, view, vctx, T = {};
  const st = { base: null, small: null, adj: {}, undo: [], redo: [], tool: 'move', zoom: 1, ox: 0, oy: 0, color: '#E2541E', color2: '#FFFFFF',
    crop: null, cropRatio: 0, text: null, shape: null, stroke: null, straighten: 0, resolve: null, name: '', ext: 'jpg' };

  /* ---------- utilidades de canvas ---------- */
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const clone = c => { const n = mk(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };
  function shrink(c, max) { const k = Math.min(1, max / Math.max(c.width, c.height)); const n = mk(c.width * k, c.height * k); const x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, n.width, n.height); return n; }
  const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

  function build() {
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    root = document.createElement('div'); root.id = 'ie'; root.className = 'hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Editor de imágenes');
    const tool = (id, label, key) => `<button data-tool="${id}" title="${label} (${key})" aria-pressed="false"><svg viewBox="0 0 24 24">${ICONS[id]}</svg>${label}</button>`;
    root.innerHTML = `
      <div class="ie-top"><b>Imagen</b><span class="info" id="ieInfo"></span><span class="grow"></span>
        <button class="icon" id="ieUndo" title="Deshacer (Ctrl+Z)">↶</button><button class="icon" id="ieRedo" title="Rehacer (Ctrl+Y)">↷</button>
        <button class="icon" id="ieZOut" title="Alejar (-)">−</button><button class="btn sm" id="ieFit" title="Ajustar a la pantalla (0)">Ajustar</button><button class="icon" id="ieZIn" title="Acercar (+)">+</button>
        <select class="sel" id="ieFmt" title="Formato al guardar"><option value="jpg">JPG</option><option value="png">PNG (con transparencia)</option><option value="webp">WebP (más liviano)</option></select>
        <label class="info" title="Calidad">Calidad <input type="range" id="ieQ" min="50" max="100" value="86" style="width:80px;accent-color:var(--brand);vertical-align:middle"></label>
        <button class="btn" id="ieCancel">Cancelar</button><button class="btn primary" id="ieSave">Guardar imagen</button></div>
      <div class="ie-main">
        <div class="ie-tools" role="toolbar" aria-label="Herramientas">
          ${tool('move', 'Mover', 'V')}${tool('crop', 'Recortar', 'C')}<hr>${tool('brush', 'Pincel', 'B')}${tool('eraser', 'Borrador', 'E')}${tool('text', 'Texto', 'T')}${tool('shape', 'Formas', 'U')}<hr>${tool('pick', 'Gotero', 'I')}${tool('fill', 'Bote', 'G')}${tool('wand', 'Varita', 'W')}
          <div class="ie-colors" title="Color principal y secundario (X los intercambia)"><input type="color" class="c1" id="ieC1" value="#E2541E"><input type="color" class="c2" id="ieC2" value="#FFFFFF"></div>
        </div>
        <div class="ie-stage" id="ieStage"><canvas id="ieView"></canvas></div>
        <div class="ie-side">
          <div class="ie-sec opt" id="ieOpt"></div>
          <div class="ie-sec"><h3>Transformar</h3>
            <div class="grid2"><button class="btn sm" data-tf="rl">↺ Rotar izq.</button><button class="btn sm" data-tf="rr">↻ Rotar der.</button><button class="btn sm" data-tf="fh">⇋ Voltear horiz.</button><button class="btn sm" data-tf="fv">⇵ Voltear vert.</button></div>
            <div class="rng"><span>Enderezar</span><input type="range" id="ieStr" min="-45" max="45" step="0.5" value="0"><output>0°</output></div>
            <div class="acts"><button class="btn sm" id="ieStrApply">Aplicar enderezado</button></div>
            <div class="grid2" style="margin-top:.6rem"><label class="field"><span>Ancho (px)</span><input class="inp" type="number" id="ieW" min="1"></label><label class="field"><span>Alto (px)</span><input class="inp" type="number" id="ieH" min="1"></label></div>
            <label class="chk" style="margin-top:.4rem"><input type="checkbox" id="ieLock" checked> Mantener proporción</label>
            <div class="acts"><button class="btn sm" id="ieResize">Cambiar tamaño</button></div>
          </div>
          <div class="ie-sec"><h3>Ajustes</h3><div id="ieAdj"></div>
            <div class="acts"><button class="btn primary sm" id="ieAdjApply">Aplicar ajustes</button><button class="btn sm" id="ieAdjReset">Restablecer</button></div></div>
          <div class="ie-sec"><h3>Filtros</h3><div class="presets" id="iePresets"></div></div>
        </div>
      </div>`;
    document.body.appendChild(root);
    view = root.querySelector('#ieView'); vctx = view.getContext('2d');
    const q = s => root.querySelector(s);
    T = { info: q('#ieInfo'), opt: q('#ieOpt'), adj: q('#ieAdj'), w: q('#ieW'), h: q('#ieH'), lock: q('#ieLock'), str: q('#ieStr'), fmt: q('#ieFmt'), q: q('#ieQ'), c1: q('#ieC1'), c2: q('#ieC2'), stage: q('#ieStage') };
    T.adj.innerHTML = ADJ.map(a => `<div class="rng"><span>${a[1]}</span><input type="range" min="${a[2]}" max="${a[3]}" value="${a[4]}" data-adj="${a[0]}"><output>${a[4]}${a[5]}</output></div>`).join('');
    root.querySelectorAll('[data-adj]').forEach(r => r.oninput = () => { st.adj[r.dataset.adj] = +r.value; r.nextElementSibling.textContent = r.value + ADJ.find(a => a[0] === r.dataset.adj)[5]; schedulePreview(); });
    root.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
    root.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => transform(b.dataset.tf));
    q('#ieUndo').onclick = undo; q('#ieRedo').onclick = redo;
    q('#ieZIn').onclick = () => zoomBy(1.25); q('#ieZOut').onclick = () => zoomBy(0.8); q('#ieFit').onclick = fit;
    q('#ieAdjApply').onclick = bakeAdj; q('#ieAdjReset').onclick = resetAdj;
    q('#ieCancel').onclick = () => close(null); q('#ieSave').onclick = saveOut;
    T.str.oninput = () => { st.straighten = +T.str.value; T.str.nextElementSibling.textContent = T.str.value + '°'; draw(); };
    q('#ieStrApply').onclick = applyStraighten;
    T.w.oninput = () => { if (T.lock.checked) T.h.value = Math.round(T.w.value * st.base.height / st.base.width); };
    T.h.oninput = () => { if (T.lock.checked) T.w.value = Math.round(T.h.value * st.base.width / st.base.height); };
    q('#ieResize').onclick = resize;
    T.c1.oninput = () => { st.color = T.c1.value; refreshOpt(); draw(); }; T.c2.oninput = () => { st.color2 = T.c2.value; draw(); };
    new ResizeObserver(() => { sizeView(); draw(); }).observe(T.stage);
    view.addEventListener('pointerdown', down); view.addEventListener('pointermove', move); view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
    view.addEventListener('wheel', e => { e.preventDefault(); const r = view.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    view.addEventListener('dblclick', () => { if (st.tool === 'crop' && st.crop) applyCrop(); });
    document.addEventListener('keydown', keys, true);
  }

  /* ---------- abrir y cerrar ---------- */
  async function open(blob, name) {
    if (!root) build();
    const bmp = await createImageBitmap(blob);
    st.base = mk(bmp.width, bmp.height); st.base.getContext('2d').drawImage(bmp, 0, 0);
    st.name = name || 'imagen'; st.ext = (name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    T.fmt.value = ['png', 'webp'].includes(st.ext) ? st.ext : 'jpg';
    st.undo = []; st.redo = []; st.crop = null; st.text = null; st.shape = null; resetAdj(true);
    st.straighten = 0; T.str.value = 0; T.str.nextElementSibling.textContent = '0°';
    root.classList.remove('hidden');
    sizeView(); fit(); setTool('move'); updateInfo(); makeSmall(); renderPresets();
    return new Promise(res => { st.resolve = res; });
  }
  function close(result) { root.classList.add('hidden'); const r = st.resolve; st.resolve = null; st.base = null; st.small = null; r && r(result); }

  function updateInfo() { T.info.textContent = `${st.name} · ${st.base.width} × ${st.base.height} px · ${Math.round(st.zoom * 100)}%`; T.w.value = st.base.width; T.h.value = st.base.height; }
  function makeSmall() { st.small = shrink(st.base, 1100); st.preview = null; schedulePreview(); }
  function push() { st.undo.push(clone(st.base)); if (st.undo.length > 15) st.undo.shift(); st.redo = []; }
  function setBase(c, keep) { if (!keep) push(); st.base = c; makeSmall(); updateInfo(); draw(); }
  function undo() { if (!st.undo.length) return; st.redo.push(st.base); st.base = st.undo.pop(); makeSmall(); updateInfo(); fitIfNeeded(); draw(); }
  function redo() { if (!st.redo.length) return; st.undo.push(st.base); st.base = st.redo.pop(); makeSmall(); updateInfo(); fitIfNeeded(); draw(); }

  /* ---------- vista ---------- */
  function sizeView() { const r = T.stage.getBoundingClientRect(); const d = devicePixelRatio || 1; view.width = r.width * d; view.height = r.height * d; vctx.setTransform(d, 0, 0, d, 0, 0); }
  function fit() { if (!st.base) return; const r = T.stage.getBoundingClientRect(); st.zoom = Math.min((r.width - 60) / st.base.width, (r.height - 60) / st.base.height, 1); st.ox = (r.width - st.base.width * st.zoom) / 2; st.oy = (r.height - st.base.height * st.zoom) / 2; updateInfo(); draw(); }
  function fitIfNeeded() { const r = T.stage.getBoundingClientRect(); if (st.base.width * st.zoom > r.width || st.base.height * st.zoom > r.height) fit(); }
  function zoomBy(f, cx, cy) { const r = T.stage.getBoundingClientRect(); cx = cx ?? r.width / 2; cy = cy ?? r.height / 2; const nz = Math.max(0.05, Math.min(16, st.zoom * f)); st.ox = cx - (cx - st.ox) * nz / st.zoom; st.oy = cy - (cy - st.oy) * nz / st.zoom; st.zoom = nz; updateInfo(); draw(); }
  const toImg = e => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left - st.ox) / st.zoom, y: (e.clientY - r.top - st.oy) / st.zoom }; };
  const toView = (x, y) => [st.ox + x * st.zoom, st.oy + y * st.zoom];

  function draw() {
    if (!st.base) return;
    const r = T.stage.getBoundingClientRect(), W = st.base.width * st.zoom, H = st.base.height * st.zoom;
    vctx.clearRect(0, 0, r.width, r.height);
    // fondo a cuadros (transparencia)
    vctx.save(); vctx.beginPath(); vctx.rect(st.ox, st.oy, W, H); vctx.clip();
    const sz = 10; for (let y = 0; y < H; y += sz) for (let x = 0; x < W; x += sz) { vctx.fillStyle = ((x / sz + y / sz) & 1) ? '#cfcfcf' : '#f2f2f2'; vctx.fillRect(st.ox + x, st.oy + y, sz, sz); }
    vctx.restore();
    const src = hasAdj() && st.preview ? st.preview : st.base;
    vctx.save(); vctx.imageSmoothingQuality = 'high';
    if (st.straighten) { vctx.translate(st.ox + W / 2, st.oy + H / 2); vctx.rotate(st.straighten * Math.PI / 180); const k = coverScale(st.base.width, st.base.height, st.straighten); vctx.scale(k, k); vctx.drawImage(src, -W / 2, -H / 2, W, H); }
    else vctx.drawImage(src, st.ox, st.oy, W, H);
    vctx.restore();
    if (st.straighten) { vctx.save(); vctx.strokeStyle = 'rgba(255,255,255,.5)'; vctx.lineWidth = 1; for (let i = 1; i < 6; i++) { vctx.beginPath(); vctx.moveTo(st.ox + W * i / 6, st.oy); vctx.lineTo(st.ox + W * i / 6, st.oy + H); vctx.moveTo(st.ox, st.oy + H * i / 6); vctx.lineTo(st.ox + W, st.oy + H * i / 6); vctx.stroke(); } vctx.restore(); }
    // trazo en curso
    if (st.stroke) { vctx.save(); vctx.globalAlpha = st.tool === 'eraser' ? 0.6 : st.opacity; vctx.drawImage(st.stroke.layer, st.ox, st.oy, W, H); vctx.restore(); }
    // forma en curso
    if (st.shape) { vctx.save(); vctx.translate(st.ox, st.oy); vctx.scale(st.zoom, st.zoom); paintShape(vctx, st.shape); vctx.restore(); }
    // texto
    if (st.text) { vctx.save(); vctx.translate(st.ox, st.oy); vctx.scale(st.zoom, st.zoom); const bb = paintText(vctx, st.text); vctx.setLineDash([6 / st.zoom, 4 / st.zoom]); vctx.strokeStyle = '#E2541E'; vctx.lineWidth = 1.5 / st.zoom; vctx.strokeRect(bb.x - 6, bb.y - 6, bb.w + 12, bb.h + 12); vctx.restore(); }
    // recorte
    if (st.crop) {
      const c = st.crop, [x, y] = toView(c.x, c.y), w = c.w * st.zoom, h = c.h * st.zoom;
      vctx.save(); vctx.fillStyle = 'rgba(0,0,0,.55)'; vctx.beginPath(); vctx.rect(st.ox, st.oy, W, H); vctx.rect(x, y, w, h); vctx.fill('evenodd');
      vctx.strokeStyle = '#fff'; vctx.lineWidth = 1.5; vctx.strokeRect(x, y, w, h);
      vctx.strokeStyle = 'rgba(255,255,255,.45)'; vctx.lineWidth = 1; for (let i = 1; i < 3; i++) { vctx.beginPath(); vctx.moveTo(x + w * i / 3, y); vctx.lineTo(x + w * i / 3, y + h); vctx.moveTo(x, y + h * i / 3); vctx.lineTo(x + w, y + h * i / 3); vctx.stroke(); }
      vctx.fillStyle = '#E2541E'; [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([a, b]) => vctx.fillRect(a - 5, b - 5, 10, 10));
      vctx.font = '600 12px system-ui'; vctx.fillStyle = '#fff'; vctx.fillText(`${Math.round(c.w)} × ${Math.round(c.h)}`, x + 6, y + 16);
      vctx.restore();
    }
  }

  /* ---------- herramientas ---------- */
  function setTool(t) {
    if (st.text && t !== 'text') commitText();
    st.tool = t; st.shape = null;
    root.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', b.dataset.tool === t));
    view.style.cursor = { move: 'grab', crop: 'crosshair', brush: 'crosshair', eraser: 'crosshair', text: 'text', shape: 'crosshair', pick: 'copy', fill: 'cell', wand: 'cell' }[t];
    if (t !== 'crop') st.crop = null;
    refreshOpt(); draw();
  }
  const opts = { size: 24, opacity: 1, hardness: 0.8, shapeType: 'rect', fill: false, line: 6, tol: 32, global: false,
    font: 'Arial', fsize: 64, bold: true, italic: false, align: 'left', shadow: false, ratio: 0 };
  function refreshOpt() {
    const o = T.opt, t = st.tool;
    const rng = (k, l, min, max, step, unit = '') => `<div class="rng"><span>${l}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${opts[k]}" data-o="${k}"><output>${opts[k]}${unit}</output></div>`;
    const titles = { move: 'Mover', crop: 'Recortar', brush: 'Pincel', eraser: 'Borrador', text: 'Texto', shape: 'Formas', pick: 'Gotero', fill: 'Bote de pintura', wand: 'Varita: borrar un color' };
    let h = `<h3>${titles[t]}</h3>`;
    if (t === 'move') h += '<p class="note">Arrastrá para moverte por la imagen. Ruedita del mouse: zoom.</p>';
    if (t === 'crop') h += `<p class="note">Arrastrá sobre la imagen para marcar el recorte. Doble clic o Enter para aplicar.</p>
      <div class="chips" style="margin-top:.5rem">${[['0', 'Libre'], ['1', '1:1'], ['1.3333', '4:3'], ['1.5', '3:2'], ['1.7778', '16:9'], ['0.8', '4:5'], ['0.5625', '9:16']].map(([v, l]) => `<button type="button" data-ratio="${v}" aria-pressed="${+v === opts.ratio}">${l}</button>`).join('')}</div>
      <div class="acts"><button class="btn primary sm" id="ieCropApply">Recortar</button><button class="btn sm" id="ieCropCancel">Cancelar</button></div>`;
    if (t === 'brush' || t === 'eraser') h += rng('size', 'Tamaño', 1, 300, 1, 'px') + rng('opacity', 'Opacidad', 0.05, 1, 0.05) + rng('hardness', 'Dureza', 0, 1, 0.05) + (t === 'brush' ? '<p class="note">Usa el color principal (abajo a la izquierda).</p>' : '<p class="note">Lo borrado queda transparente (guardá en PNG o WebP).</p>');
    if (t === 'text') h += `<label class="field"><span>Texto</span><textarea class="inp" id="ieTxt" placeholder="Hacé clic en la imagen para ubicarlo">${st.text ? st.text.str : ''}</textarea></label>
      <label class="field"><span>Tipografía</span><select class="inp" data-o="font">${FONTS.map(f => `<option ${f === opts.font ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      ${rng('fsize', 'Tamaño', 8, 400, 1, 'px')}
      <div class="chips" style="margin-top:.5rem"><button type="button" data-tg="bold" aria-pressed="${opts.bold}"><b>Negrita</b></button><button type="button" data-tg="italic" aria-pressed="${opts.italic}"><i>Cursiva</i></button><button type="button" data-tg="shadow" aria-pressed="${opts.shadow}">Sombra</button></div>
      <div class="chips" style="margin-top:.4rem">${[['left', 'Izq.'], ['center', 'Centro'], ['right', 'Der.']].map(([v, l]) => `<button type="button" data-al="${v}" aria-pressed="${opts.align === v}">${l}</button>`).join('')}</div>
      <p class="note" style="margin-top:.4rem">Arrastrá el texto para moverlo. Enter para fijarlo.</p>
      <div class="acts"><button class="btn primary sm" id="ieTxtApply">Fijar texto</button><button class="btn sm" id="ieTxtCancel">Quitar</button></div>`;
    if (t === 'shape') h += `<div class="chips">${[['rect', 'Rectángulo'], ['round', 'Redondeado'], ['ellipse', 'Círculo'], ['line', 'Línea'], ['arrow', 'Flecha']].map(([v, l]) => `<button type="button" data-shape="${v}" aria-pressed="${opts.shapeType === v}">${l}</button>`).join('')}</div>
      ${rng('line', 'Grosor', 1, 60, 1, 'px')}<label class="chk" style="margin-top:.4rem"><input type="checkbox" data-o="fill" ${opts.fill ? 'checked' : ''}> Relleno (color secundario)</label>
      <p class="note" style="margin-top:.4rem">Arrastrá sobre la imagen. Shift: proporción exacta.</p>`;
    if (t === 'pick') h += '<p class="note">Hacé clic en la imagen para tomar ese color como principal.</p>';
    if (t === 'fill') h += rng('tol', 'Tolerancia', 0, 150, 1) + '<p class="note">Pinta con el color principal la zona parecida donde hagas clic.</p>';
    if (t === 'wand') h += rng('tol', 'Tolerancia', 0, 150, 1) + `<label class="chk" style="margin-top:.4rem"><input type="checkbox" data-o="global" ${opts.global ? 'checked' : ''}> Borrar ese color en toda la imagen</label><p class="note" style="margin-top:.4rem">Ideal para quitar fondos lisos. Guardá en PNG o WebP para mantener la transparencia.</p>`;
    o.innerHTML = h;
    o.querySelectorAll('input[type=range][data-o]').forEach(r => r.oninput = () => { opts[r.dataset.o] = +r.value; r.nextElementSibling.textContent = r.value + (/size|line|fsize/.test(r.dataset.o) ? 'px' : ''); if (st.text) { syncText(); draw(); } });
    o.querySelectorAll('input[type=checkbox][data-o]').forEach(c => c.onchange = () => { opts[c.dataset.o] = c.checked; });
    o.querySelectorAll('select[data-o]').forEach(s => s.onchange = () => { opts[s.dataset.o] = s.value; syncText(); draw(); });
    o.querySelectorAll('[data-ratio]').forEach(b => b.onclick = () => { opts.ratio = +b.dataset.ratio; refreshOpt(); if (st.crop && opts.ratio) { st.crop.h = st.crop.w / opts.ratio; clampCrop(); draw(); } });
    o.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { opts[b.dataset.tg] = !opts[b.dataset.tg]; b.setAttribute('aria-pressed', opts[b.dataset.tg]); syncText(); draw(); });
    o.querySelectorAll('[data-al]').forEach(b => b.onclick = () => { opts.align = b.dataset.al; refreshOpt(); syncText(); draw(); });
    o.querySelectorAll('[data-shape]').forEach(b => b.onclick = () => { opts.shapeType = b.dataset.shape; refreshOpt(); });
    const q = s => o.querySelector(s);
    if (q('#ieCropApply')) { q('#ieCropApply').onclick = applyCrop; q('#ieCropCancel').onclick = () => { st.crop = null; draw(); }; }
    if (q('#ieTxt')) { q('#ieTxt').oninput = e => { if (!st.text) { const b = st.base; st.text = { x: b.width * 0.1, y: b.height * 0.1, str: '' }; } st.text.str = e.target.value; syncText(); draw(); }; q('#ieTxtApply').onclick = commitText; q('#ieTxtCancel').onclick = () => { st.text = null; refreshOpt(); draw(); }; }
  }
  function syncText() { if (!st.text) return; Object.assign(st.text, { font: opts.font, size: opts.fsize, bold: opts.bold, italic: opts.italic, align: opts.align, shadow: opts.shadow, color: st.color }); }

  let drag = null;
  function down(e) {
    if (!st.base) return; view.setPointerCapture(e.pointerId);
    const p = toImg(e), t = st.tool;
    if (t === 'move' || e.button === 1) { drag = { pan: true, x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy }; view.style.cursor = 'grabbing'; return; }
    if (t === 'crop') {
      const c = st.crop;
      if (c && p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h) drag = { cropMove: true, dx: p.x - c.x, dy: p.y - c.y };
      else { st.crop = { x: p.x, y: p.y, w: 0, h: 0 }; drag = { cropNew: true, sx: p.x, sy: p.y }; }
      return;
    }
    if (t === 'brush' || t === 'eraser') {
      const layer = mk(st.base.width, st.base.height), lx = layer.getContext('2d');
      lx.lineCap = 'round'; lx.lineJoin = 'round'; lx.lineWidth = opts.size; lx.strokeStyle = t === 'eraser' ? '#000' : st.color;
      if (opts.hardness < 1) { lx.shadowBlur = (1 - opts.hardness) * opts.size * 0.6; lx.shadowColor = lx.strokeStyle; }
      lx.beginPath(); lx.moveTo(p.x, p.y); lx.lineTo(p.x + 0.01, p.y); lx.stroke();
      st.opacity = opts.opacity; st.stroke = { layer, lx, last: p }; drag = { stroke: true }; draw(); return;
    }
    if (t === 'text') {
      if (st.text) { const bb = textBox(st.text); if (p.x > bb.x - 10 && p.x < bb.x + bb.w + 10 && p.y > bb.y - 10 && p.y < bb.y + bb.h + 10) { drag = { textMove: true, dx: p.x - st.text.x, dy: p.y - st.text.y }; return; } commitText(); }
      st.text = { x: p.x, y: p.y, str: 'Texto' }; syncText(); refreshOpt(); const ta = T.opt.querySelector('#ieTxt'); if (ta) { ta.focus(); ta.select(); } draw(); return;
    }
    if (t === 'shape') { st.shape = { type: opts.shapeType, x1: p.x, y1: p.y, x2: p.x, y2: p.y, stroke: st.color, fill: opts.fill ? st.color2 : null, line: opts.line }; drag = { shape: true }; return; }
    if (t === 'pick') { const d = st.base.getContext('2d').getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data; st.color = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join(''); T.c1.value = st.color; window.ED && ED.toast('Color tomado: ' + st.color.toUpperCase()); return; }
    if (t === 'fill' || t === 'wand') { flood(Math.floor(p.x), Math.floor(p.y), t === 'wand'); return; }
  }
  function move(e) {
    if (!drag) return; const p = toImg(e);
    if (drag.pan) { st.ox = drag.ox + e.clientX - drag.x; st.oy = drag.oy + e.clientY - drag.y; draw(); return; }
    if (drag.cropNew) {
      let w = p.x - drag.sx, h = p.y - drag.sy;
      if (opts.ratio) h = Math.sign(h || 1) * Math.abs(w) / opts.ratio;
      st.crop = { x: Math.min(drag.sx, drag.sx + w), y: Math.min(drag.sy, drag.sy + h), w: Math.abs(w), h: Math.abs(h) }; clampCrop(); draw(); return;
    }
    if (drag.cropMove) { st.crop.x = p.x - drag.dx; st.crop.y = p.y - drag.dy; clampCrop(true); draw(); return; }
    if (drag.stroke) { const s = st.stroke; s.lx.beginPath(); s.lx.moveTo(s.last.x, s.last.y); s.lx.lineTo(p.x, p.y); s.lx.stroke(); s.last = p; draw(); return; }
    if (drag.textMove) { st.text.x = p.x - drag.dx; st.text.y = p.y - drag.dy; draw(); return; }
    if (drag.shape) {
      let { x1, y1 } = st.shape, x2 = p.x, y2 = p.y;
      if (e.shiftKey) { if (/line|arrow/.test(st.shape.type)) { const a = Math.round(Math.atan2(y2 - y1, x2 - x1) / (Math.PI / 4)) * Math.PI / 4, d = Math.hypot(x2 - x1, y2 - y1); x2 = x1 + Math.cos(a) * d; y2 = y1 + Math.sin(a) * d; } else { const m = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)); x2 = x1 + Math.sign(x2 - x1) * m; y2 = y1 + Math.sign(y2 - y1) * m; } }
      st.shape.x2 = x2; st.shape.y2 = y2; draw();
    }
  }
  function up() {
    if (!drag) return; const d = drag; drag = null;
    if (d.pan) { view.style.cursor = 'grab'; return; }
    if (d.stroke) {
      const c = clone(st.base), x = c.getContext('2d');
      x.globalAlpha = opts.opacity; x.globalCompositeOperation = st.tool === 'eraser' ? 'destination-out' : 'source-over';
      x.drawImage(st.stroke.layer, 0, 0); st.stroke = null; setBase(c); return;
    }
    if (d.shape) { const s = st.shape; st.shape = null; if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 2) { draw(); return; } const c = clone(st.base); paintShape(c.getContext('2d'), s); setBase(c); return; }
    if (d.cropNew && st.crop && (st.crop.w < 4 || st.crop.h < 4)) { st.crop = null; draw(); }
  }
  function clampCrop(moving) {
    const c = st.crop, B = st.base;
    if (moving) { c.x = Math.max(0, Math.min(c.x, B.width - c.w)); c.y = Math.max(0, Math.min(c.y, B.height - c.h)); return; }
    c.x = Math.max(0, c.x); c.y = Math.max(0, c.y); c.w = Math.min(c.w, B.width - c.x); c.h = Math.min(c.h, B.height - c.y);
    if (opts.ratio) { if (c.w / c.h > opts.ratio) c.w = c.h * opts.ratio; else c.h = c.w / opts.ratio; }
  }
  function applyCrop() {
    const c = st.crop; if (!c || c.w < 2 || c.h < 2) return;
    const n = mk(c.w, c.h); n.getContext('2d').drawImage(st.base, c.x, c.y, c.w, c.h, 0, 0, n.width, n.height);
    st.crop = null; setBase(n); fit();
  }

  /* ---------- formas y texto ---------- */
  function paintShape(x, s) {
    x.save(); x.lineWidth = s.line; x.strokeStyle = s.stroke; x.fillStyle = s.fill || 'transparent'; x.lineCap = 'round'; x.lineJoin = 'round';
    const l = Math.min(s.x1, s.x2), t = Math.min(s.y1, s.y2), w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1);
    x.beginPath();
    if (s.type === 'rect') x.rect(l, t, w, h);
    else if (s.type === 'round') x.roundRect(l, t, w, h, Math.min(w, h) * 0.18);
    else if (s.type === 'ellipse') x.ellipse(l + w / 2, t + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else { x.moveTo(s.x1, s.y1); x.lineTo(s.x2, s.y2); }
    if (s.fill && !/line|arrow/.test(s.type)) x.fill();
    x.stroke();
    if (s.type === 'arrow') { const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), L = Math.max(14, s.line * 3.5); x.beginPath(); x.moveTo(s.x2, s.y2); x.lineTo(s.x2 - L * Math.cos(a - 0.45), s.y2 - L * Math.sin(a - 0.45)); x.moveTo(s.x2, s.y2); x.lineTo(s.x2 - L * Math.cos(a + 0.45), s.y2 - L * Math.sin(a + 0.45)); x.stroke(); }
    x.restore();
  }
  const fontOf = t => `${t.italic ? 'italic ' : ''}${t.bold ? '700' : '400'} ${t.size}px "${t.font}"`;
  function textBox(t) { const c = mk(1, 1).getContext('2d'); c.font = fontOf(t); const lines = (t.str || ' ').split('\n'); const w = Math.max(...lines.map(l => c.measureText(l).width)); const lh = t.size * 1.15; const x = t.align === 'center' ? t.x - w / 2 : t.align === 'right' ? t.x - w : t.x; return { x, y: t.y, w, h: lh * lines.length }; }
  function paintText(x, t) {
    x.save(); x.font = fontOf(t); x.fillStyle = t.color; x.textBaseline = 'top'; x.textAlign = t.align;
    if (t.shadow) { x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = t.size * 0.15; x.shadowOffsetY = t.size * 0.05; }
    (t.str || '').split('\n').forEach((l, i) => x.fillText(l, t.x, t.y + i * t.size * 1.15));
    x.restore(); return textBox(t);
  }
  function commitText() { const t = st.text; st.text = null; if (!t || !t.str.trim()) { refreshOpt(); draw(); return; } syncTextFrom(t); const c = clone(st.base); paintText(c.getContext('2d'), t); setBase(c); refreshOpt(); }
  function syncTextFrom(t) { if (!t.font) Object.assign(t, { font: opts.font, size: opts.fsize, bold: opts.bold, italic: opts.italic, align: opts.align, shadow: opts.shadow, color: st.color }); }

  /* ---------- bote y varita ---------- */
  function flood(x0, y0, erase) {
    const B = st.base, W = B.width, H = B.height; if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
    const c = clone(B), cx = c.getContext('2d'), img = cx.getImageData(0, 0, W, H), d = img.data;
    const i0 = (y0 * W + x0) * 4, r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3], tol = opts.tol;
    const near = i => Math.abs(d[i] - r0) <= tol && Math.abs(d[i + 1] - g0) <= tol && Math.abs(d[i + 2] - b0) <= tol && Math.abs(d[i + 3] - a0) <= tol;
    const [fr, fg, fb] = hexRGB(st.color);
    const paint = i => { if (erase) d[i + 3] = 0; else { d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255; } };
    if (erase && opts.global) { for (let i = 0; i < d.length; i += 4) if (near(i)) d[i + 3] = 0; }
    else {
      const seen = new Uint8Array(W * H), stack = [x0, y0];
      while (stack.length) {
        const y = stack.pop(), x = stack.pop(); let lx = x;
        while (lx >= 0 && !seen[y * W + lx] && near((y * W + lx) * 4)) lx--;
        lx++; let up = false, dn = false;
        for (let xx = lx; xx < W; xx++) {
          const k = y * W + xx; if (seen[k] || !near(k * 4)) break;
          seen[k] = 1;
          if (y > 0) { const n = k - W; if (!seen[n] && near(n * 4)) { if (!up) { stack.push(xx, y - 1); up = true; } } else up = false; }
          if (y < H - 1) { const n = k + W; if (!seen[n] && near(n * 4)) { if (!dn) { stack.push(xx, y + 1); dn = true; } } else dn = false; }
        }
      }
      for (let k = 0; k < seen.length; k++) if (seen[k]) paint(k * 4);
    }
    cx.putImageData(img, 0, 0); setBase(c);
    if (erase && T.fmt.value === 'jpg') { T.fmt.value = 'png'; window.ED && ED.toast('Cambié el formato a PNG para mantener la transparencia.'); }
  }

  /* ---------- transformar ---------- */
  function transform(k) {
    const B = st.base; let n;
    if (k === 'rl' || k === 'rr') { n = mk(B.height, B.width); const x = n.getContext('2d'); x.translate(n.width / 2, n.height / 2); x.rotate((k === 'rr' ? 90 : -90) * Math.PI / 180); x.drawImage(B, -B.width / 2, -B.height / 2); }
    else { n = mk(B.width, B.height); const x = n.getContext('2d'); if (k === 'fh') { x.translate(B.width, 0); x.scale(-1, 1); } else { x.translate(0, B.height); x.scale(1, -1); } x.drawImage(B, 0, 0); }
    setBase(n); fit();
  }
  function coverScale(w, h, deg) { const a = Math.abs(deg) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return Math.max((w * c + h * s) / w, (w * s + h * c) / h); }
  function applyStraighten() {
    if (!st.straighten) return; const B = st.base, n = mk(B.width, B.height), x = n.getContext('2d');
    x.translate(B.width / 2, B.height / 2); x.rotate(st.straighten * Math.PI / 180); const k = coverScale(B.width, B.height, st.straighten); x.scale(k, k); x.drawImage(B, -B.width / 2, -B.height / 2);
    st.straighten = 0; T.str.value = 0; T.str.nextElementSibling.textContent = '0°'; setBase(n);
  }
  function resize() {
    const w = Math.round(+T.w.value), h = Math.round(+T.h.value); if (!(w > 0 && h > 0) || (w === st.base.width && h === st.base.height)) return;
    let c = st.base;
    while (c.width / 2 >= w && c.height / 2 >= h) { const half = mk(c.width / 2, c.height / 2); const x = half.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, half.width, half.height); c = half; }
    const n = mk(w, h), x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, w, h);
    setBase(n); fit();
  }

  /* ---------- ajustes ---------- */
  const DEF = Object.fromEntries(ADJ.map(a => [a[0], a[4]]));
  const hasAdj = () => Object.keys(st.adj).some(k => st.adj[k] !== DEF[k]);
  function resetAdj(silent) { st.adj = { ...DEF }; root.querySelectorAll('[data-adj]').forEach(r => { r.value = DEF[r.dataset.adj]; r.nextElementSibling.textContent = r.value + ADJ.find(a => a[0] === r.dataset.adj)[5]; }); st.preview = null; if (!silent) draw(); }
  let pvT = null;
  function schedulePreview() { cancelAnimationFrame(pvT); pvT = requestAnimationFrame(() => { st.preview = hasAdj() && st.small ? adjust(st.small, st.small.width / st.base.width) : null; draw(); }); }
  function adjust(src, k = 1) {
    const a = st.adj, n = mk(src.width, src.height), x = n.getContext('2d');
    const br = a.brightness / 100 * Math.pow(2, a.exposure / 100);
    x.filter = `brightness(${br}) contrast(${a.contrast}%) saturate(${a.saturate}%) hue-rotate(${a.hue}deg) grayscale(${a.grayscale}%) sepia(${a.sepia}%) invert(${a.invert}%) blur(${a.blur * k}px)`;
    x.drawImage(src, 0, 0); x.filter = 'none';
    if (a.temperature || a.sharpen) {
      const img = x.getImageData(0, 0, n.width, n.height), d = img.data, t = a.temperature * 0.6;
      if (t) for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, Math.max(0, d[i] + t)); d[i + 2] = Math.min(255, Math.max(0, d[i + 2] - t)); }
      if (a.sharpen) {
        const w = n.width, h = n.height, s = a.sharpen / 100 * 1.5, o = new Uint8ClampedArray(d);
        for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) { const i = (y * w + xx) * 4; for (let c = 0; c < 3; c++) { const v = o[i + c] * (1 + 4 * s) - s * (o[i - 4 + c] + o[i + 4 + c] + o[i - w * 4 + c] + o[i + w * 4 + c]); d[i + c] = v; } }
      }
      x.putImageData(img, 0, 0);
    }
    if (a.vignette) {
      const g = x.createRadialGradient(n.width / 2, n.height / 2, Math.min(n.width, n.height) * 0.25, n.width / 2, n.height / 2, Math.hypot(n.width, n.height) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a.vignette / 100 * 0.85})`);
      x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(0, 0, n.width, n.height); x.globalCompositeOperation = 'source-over';
    }
    return n;
  }
  function bakeAdj() { if (!hasAdj()) return; const n = adjust(st.base); resetAdj(true); setBase(n); }
  function renderPresets() {
    const box = root.querySelector('#iePresets'); box.innerHTML = '';
    const thumb = shrink(st.base, 160), sq = mk(90, 90); const k = Math.max(90 / thumb.width, 90 / thumb.height);
    sq.getContext('2d').drawImage(thumb, (90 - thumb.width * k) / 2, (90 - thumb.height * k) / 2, thumb.width * k, thumb.height * k);
    Object.entries(PRESETS).forEach(([name, p]) => {
      const b = document.createElement('button'); b.type = 'button';
      const prev = st.adj; st.adj = { ...DEF, ...p }; const c = adjust(sq, 90 / st.base.width); st.adj = prev;
      b.appendChild(c); const s = document.createElement('span'); s.textContent = name; b.appendChild(s);
      b.onclick = () => { st.adj = { ...DEF, ...p }; root.querySelectorAll('[data-adj]').forEach(r => { r.value = st.adj[r.dataset.adj]; r.nextElementSibling.textContent = r.value + ADJ.find(a => a[0] === r.dataset.adj)[5]; }); schedulePreview(); };
      box.appendChild(b);
    });
  }

  /* ---------- guardar ---------- */
  async function saveOut() {
    if (st.text) commitText();
    if (hasAdj()) bakeAdj();
    if (st.straighten) applyStraighten();
    if (st.crop && confirm('Tenés un recorte marcado sin aplicar. ¿Aplicarlo antes de guardar?')) applyCrop();
    const fmt = T.fmt.value, mime = fmt === 'png' ? 'image/png' : fmt === 'webp' ? 'image/webp' : 'image/jpeg';
    let c = st.base;
    if (fmt === 'jpg') { c = mk(st.base.width, st.base.height); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(st.base, 0, 0); }
    const blob = await new Promise(r => c.toBlob(r, mime, +T.q.value / 100));
    close({ blob, ext: fmt, width: c.width, height: c.height });
  }
  function keys(e) {
    if (!root || root.classList.contains('hidden')) return;
    const tag = e.target.tagName; if (/INPUT|TEXTAREA|SELECT/.test(tag) && e.key !== 'Escape') return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    e.stopPropagation();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 's') { e.preventDefault(); saveOut(); return; }
    if (e.key === 'Escape') { if (st.crop) { st.crop = null; draw(); } else if (st.text) { st.text = null; refreshOpt(); draw(); } else close(null); return; }
    if (e.key === 'Enter') { if (st.crop) applyCrop(); else if (st.text) commitText(); return; }
    const map = { v: 'move', c: 'crop', b: 'brush', e: 'eraser', t: 'text', u: 'shape', i: 'pick', g: 'fill', w: 'wand' };
    if (map[k] && !mod) { setTool(map[k]); return; }
    if (k === '+' || k === '=') zoomBy(1.25); if (k === '-') zoomBy(0.8); if (k === '0') fit();
    if (k === 'x') { [st.color, st.color2] = [st.color2, st.color]; T.c1.value = st.color; T.c2.value = st.color2; }
  }

  window.ImageEditor = { open };
})();
