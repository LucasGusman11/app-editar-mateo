/* Modo simple: barra flotante según lo que elegís, botón + para agregar,
   guardado automático y guía de inicio. El modo avanzado muestra todo lo demás. */
(function () {
  'use strict';
  const E = window.ED; if (!E) return;
  const { S, $, $$, esc, toast } = E;

  /* ---------- estilos ---------- */
  const st = document.createElement('style');
  st.textContent = `
.switch{display:flex;align-items:center;gap:.4rem;font-size:.82rem;color:var(--muted);cursor:pointer;white-space:nowrap}
.switch input{accent-color:var(--brand)}
body.simple .left .tabs button[data-tab=files],body.simple .left .tabs button[data-tab=layers],body.simple #modeSeg button[data-mode=code],
body.simple #zoom,body.simple .bottombar,body.simple #filetabs,body.simple .crumb,body.simple #moreMenu .adv-only,body.simple #devbar{display:none!important}
body:not(.simple) .simple-only{display:none!important}
body.simple #insertWhere,body.simple #insertWhere + .note,body.simple #myComps{display:none!important}
body.simple .right{display:none}
body.simple.show-right .right{display:flex}
body.simple .left{width:270px}
body.simple .blockgrid{grid-template-columns:1fr 1fr}
body.simple .blk{padding:.8rem .4rem;font-size:.85rem}
.qbar{position:absolute;z-index:25;display:flex;gap:2px;background:#0A0A09;border:1px solid #3d3d3a;border-radius:12px;padding:4px;box-shadow:0 14px 34px rgba(0,0,0,.45)}
html[data-theme=light] .qbar{background:#fff;border-color:#cfcfc9}
.qbar button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:54px;height:50px;background:none;border:0;border-radius:9px;color:var(--fg);font-size:.7rem;padding:0 .45rem}
.qbar button:hover,.qbar button[aria-expanded=true]{background:var(--brand-dim)}
.qbar button svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.qbar .sep{width:1px;background:#333;margin:6px 2px}
.qbar button.danger{color:#ff8b6b}
.qplus{position:absolute;z-index:24;width:34px;height:34px;border-radius:50%;border:0;background:var(--brand);color:#000;font-size:1.4rem;line-height:1;box-shadow:0 6px 16px rgba(0,0,0,.4);cursor:pointer}
.qpop{position:absolute;z-index:30;background:#0A0A09;border:1px solid #3d3d3a;border-radius:12px;padding:.7rem;box-shadow:0 18px 40px rgba(0,0,0,.55);max-width:340px}
html[data-theme=light] .qpop{background:#fff;border-color:#cfcfc9}
.qpop h4{font-size:.75rem;color:var(--muted);font-weight:600;margin:.2rem 0 .45rem}
.qpop .sw{display:flex;flex-wrap:wrap;gap:.35rem}
.qpop .sw button{width:30px;height:30px;border-radius:50%;border:2px solid rgba(127,127,127,.5);padding:0;cursor:pointer}
.qpop .opts{display:grid;grid-template-columns:1fr 1fr;gap:.35rem}
.qpop .opts button{background:var(--panel2);border:1px solid transparent;border-radius:8px;padding:.55rem .4rem;color:var(--fg);font-size:.8rem;text-align:center}
.qpop .opts button:hover{border-color:var(--brand)}
.qpop input[type=text],.qpop input[type=search]{width:100%;background:#0C0C0B;border:1px solid #363633;padding:.5rem;border-radius:8px;color:var(--fg)}
html[data-theme=light] .qpop input{background:#fff}
.tour{position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center}
.tour-card{background:var(--panel);border:1px solid #3d3d3a;border-radius:16px;padding:1.6rem 1.8rem;max-width:440px;box-shadow:0 30px 70px rgba(0,0,0,.5)}
.tour-card h2{font:900 2rem/1 var(--display);color:var(--brand);text-transform:uppercase;margin-bottom:.8rem}
.tour-card p{font-size:1rem;line-height:1.5}
.tour-card .dots{display:flex;gap:.35rem;margin-top:1.2rem}.tour-card .dots i{width:8px;height:8px;border-radius:50%;background:#555}.tour-card .dots i.on{background:var(--brand)}
.tour-card .acts{justify-content:space-between;margin-top:1rem}
`;
  document.head.appendChild(st);

  const I = {
    minus: '<path d="M5 12h14"/>', plus: '<path d="M12 5v14M5 12h14"/>', color: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 000 16z" fill="currentColor"/>',
    align: '<path d="M4 6h16M7 12h10M4 18h16"/>', link: '<path d="M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1"/>',
    anim: '<path d="M4 12h3l3-7 4 14 3-7h3"/>', dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
    del: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    img: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9.5" r="1.5"/>', edit: '<path d="M4 20h4l11-11-4-4L4 16z"/>',
    bg: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 14l6-6 10 10"/>', space: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>', bold: '<path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>', reset: '<path d="M4 4v6h6M4 10a8 8 0 112 6"/>'
  };
  const ic = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;

  /* ---------- modo simple / avanzado ---------- */
  const adv = $('#advToggle');
  function setSimple(simple) {
    document.body.classList.toggle('simple', simple);
    adv.checked = !simple; localStorage.setItem('ed-simple', simple ? '1' : '0');
    if (simple) {
      if (S.mode === 'code' && S.kind === 'html') E.setMode('visual');
      const cur = document.querySelector('.left .tabs button[aria-selected=true]');
      if (!cur || /files|layers/.test(cur.dataset.tab)) E.tab('left', 'blocks');
      document.body.classList.remove('show-right');
    }
    place();
  }
  adv.onchange = () => setSimple(!adv.checked);
  $$('#moreMenu #mHistory, #moreMenu #mOptimize, #moreMenu #mSitemap').forEach(b => b.classList.add('adv-only'));

  // selector de páginas
  function renderPages() {
    const sel = $('#pagePick'); if (!sel) return;
    const pages = [...S.files.keys()].filter(p => /\.html?$/i.test(p)).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
    sel.innerHTML = pages.map(p => `<option value="${esc(p)}" ${p === S.path ? 'selected' : ''}>Página: ${esc(p === 'index.html' ? 'Inicio (index.html)' : p)}</option>`).join('') + '<option value="__new">+ Nueva página…</option>';
  }
  $('#pagePick').onchange = e => { const v = e.target.value; if (v === '__new') { $('#mNewPage').click(); renderPages(); return; } if (v && v !== S.path) { S.mode = 'visual'; E.openFile(v); } };
  new MutationObserver(renderPages).observe($('#fileTree'), { childList: true });

  /* ---------- barra flotante ---------- */
  const wrap = $('#previewWrap');
  const bar = document.createElement('div'); bar.className = 'qbar hidden'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Acciones rápidas');
  const plus = document.createElement('button'); plus.className = 'qplus hidden'; plus.title = 'Agregar algo debajo'; plus.setAttribute('aria-label', 'Agregar algo debajo'); plus.textContent = '+';
  const pop = document.createElement('div'); pop.className = 'qpop hidden';
  wrap.append(bar, plus, pop);
  const frame = () => E.frame();
  const kindOf = el => {
    if (!el) return null;
    if (el.tagName === 'IMG') return 'img';
    if (el.closest('a') || el.tagName === 'BUTTON') return 'link';
    if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return 'text';
    return 'block';
  };
  const B = (k, label, fn, cls) => ({ k, label, fn, cls });
  function buttons(el) {
    const kind = kindOf(el), list = [];
    if (kind === 'text' || kind === 'link') list.push(B('minus', 'Más chico', () => fontStep(el, -1)), B('plus', 'Más grande', () => fontStep(el, 1)), B('color', 'Color', b => colorPop(b, el, 'color')), B('align', 'Alinear', () => alignCycle(el)), B('link', 'Link', b => linkPop(b, el)));
    if (kind === 'img') list.push(B('img', 'Cambiar', () => E.replaceImageFromDisk(el)), B('edit', 'Editar', () => { const p = E.srcToPath(E.srcOf(el).getAttribute('src')); p && S.files.has(p) ? window.EDX.editImage(p, el) : toast('Esta imagen no es un archivo de la carpeta.'); }));
    if (kind === 'block') list.push(B('bg', 'Fondo', b => colorPop(b, el, 'background-color')), B('space', 'Espacio', b => spacePop(b, el)));
    list.push(B('anim', 'Animar', b => animPop(b, el)));
    list.push('|', B('dup', 'Duplicar', () => E.dupEl()), B('up', 'Contenedor', () => { const p = el.parentElement && el.parentElement.closest('[data-eid]'); if (p && p.tagName !== 'HTML' && p.tagName !== 'BODY') E.select(p); }));
    if (E.ownStyle(el, 'translate')) list.push(B('reset', 'A su lugar', () => E.resetPos(el)));
    list.push(B('del', 'Borrar', () => E.removeEl(), 'danger'), B('more', 'Más', () => { document.body.classList.add('show-right'); E.tab('right', 'style'); }));
    return list;
  }
  function renderBar() {
    const el = S.sel;
    if (!el || S.mode !== 'visual' || S.kind !== 'html' || !S.live || el === S.live.body || !el.isConnected) { bar.classList.add('hidden'); plus.classList.add('hidden'); closePop(); return; }
    bar.innerHTML = '';
    buttons(el).forEach(b => {
      if (b === '|') { const s = document.createElement('span'); s.className = 'sep'; bar.appendChild(s); return; }
      const x = document.createElement('button'); x.type = 'button'; x.innerHTML = ic(b.k) + esc(b.label); x.title = b.label; if (b.cls) x.className = b.cls;
      x.onmousedown = e => e.preventDefault();
      x.onclick = () => b.fn(x);
      bar.appendChild(x);
    });
    bar.classList.remove('hidden'); plus.classList.remove('hidden');
    place();
  }
  function rectOf(el) {
    const fr = frame().getBoundingClientRect(), wr = wrap.getBoundingClientRect(), r = el.getBoundingClientRect(), z = S.zoom;
    return { left: fr.left - wr.left + r.left * z + wrap.scrollLeft, top: fr.top - wr.top + r.top * z + wrap.scrollTop, width: r.width * z, height: r.height * z, wr, fr };
  }
  function place() {
    if (bar.classList.contains('hidden') || !S.sel || !S.sel.isConnected) return;
    const r = rectOf(S.sel), editing = S.live && S.live.activeElement && S.live.activeElement.isContentEditable;
    const bw = bar.offsetWidth, bh = bar.offsetHeight, maxX = wrap.clientWidth - bw - 6;
    let top = r.top - bh - 30; if (top < wrap.scrollTop + 4 || editing) top = r.top + r.height + 12;
    if (top + bh > wrap.scrollTop + wrap.clientHeight - 4) top = Math.max(wrap.scrollTop + 4, r.top + 8);
    bar.style.left = Math.max(6, Math.min(r.left, maxX)) + 'px'; bar.style.top = top + 'px';
    plus.style.left = (r.left + r.width / 2 - 17) + 'px';
    plus.style.top = Math.min(r.top + r.height - 17, wrap.scrollTop + wrap.clientHeight - 40) + 'px';
    plus.classList.toggle('hidden', r.top + r.height < wrap.scrollTop || r.top > wrap.scrollTop + wrap.clientHeight);
  }
  let hooked = null;
  function hookFrame() {
    const w = frame().contentWindow; if (!w || hooked === w) return; hooked = w;
    w.addEventListener('scroll', () => { place(); closePop(); }, { passive: true });
    w.addEventListener('resize', place);
    w.document.addEventListener('focusin', place); w.document.addEventListener('focusout', place);
  }
  document.addEventListener('ed-select', () => { hookFrame(); closePop(); renderBar(); });
  addEventListener('resize', place);
  setInterval(() => { if (!bar.classList.contains('hidden')) place(); }, 400);

  /* ---------- acciones rápidas ---------- */
  function fontStep(el, dir) {
    E.snap(); const cs = S.live.defaultView.getComputedStyle(el);
    const cur = parseFloat(E.ownStyle(el, 'font-size')) || parseFloat(cs.fontSize);
    const step = cur >= 64 ? 8 : cur >= 32 ? 4 : 2;
    E.setStyle(el, 'font-size', Math.max(8, Math.round(cur + dir * step)) + 'px'); place();
  }
  function alignCycle(el) {
    E.snap(); const cs = S.live.defaultView.getComputedStyle(el), order = ['left', 'center', 'right'];
    const cur = E.ownStyle(el, 'text-align') || (cs.textAlign === 'start' ? 'left' : cs.textAlign);
    const next = order[(order.indexOf(cur) + 1) % 3]; E.setStyle(el, 'text-align', next);
    toast({ left: 'Alineado a la izquierda', center: 'Centrado', right: 'Alineado a la derecha' }[next]);
  }
  function openPop(btn, html) {
    pop.innerHTML = html; pop.classList.remove('hidden');
    const b = btn.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    let left = b.left - wr.left + wrap.scrollLeft, top = b.bottom - wr.top + wrap.scrollTop + 8;
    left = Math.min(left, wrap.scrollLeft + wrap.clientWidth - pop.offsetWidth - 8);
    if (top + pop.offsetHeight > wrap.scrollTop + wrap.clientHeight) top = b.top - wr.top + wrap.scrollTop - pop.offsetHeight - 8;
    pop.style.left = Math.max(6, left) + 'px'; pop.style.top = top + 'px';
    btn.setAttribute('aria-expanded', 'true'); pop._btn = btn;
  }
  function closePop() { pop.classList.add('hidden'); if (pop._btn) pop._btn.setAttribute('aria-expanded', 'false'); }
  document.addEventListener('mousedown', e => { if (!pop.contains(e.target) && !bar.contains(e.target)) closePop(); });
  function colorPop(btn, el, prop) {
    const pal = E.siteColors(), extra = ['#000000', '#FFFFFF', '#E2541E', '#1E7BE0', '#3FA66B', '#F2D21B', '#8C8C88'];
    openPop(btn, `<h4>${prop === 'color' ? 'Color del texto' : 'Color de fondo'}</h4>
      ${pal.length ? `<p class="note" style="margin-bottom:.35rem">Colores de tu web</p><div class="sw">${pal.map(c => `<button title="${esc(c.n)}" data-v="var(${esc(c.n)})" style="background:${c.v}"></button>`).join('')}</div>` : ''}
      <p class="note" style="margin:.6rem 0 .35rem">Otros</p><div class="sw">${extra.map(c => `<button title="${c}" data-v="${c}" style="background:${c}"></button>`).join('')}<label title="Elegir cualquier color" style="display:inline-flex"><input type="color" style="width:30px;height:30px;border:0;padding:0;background:none"></label></div>
      <div class="acts"><button class="btn sm" data-v="">Quitar color</button></div>`);
    let snapped = false; const set = v => { if (!snapped) { E.snap(); snapped = true; } E.setStyle(el, prop, v); };
    pop.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { set(b.dataset.v); if (!b.dataset.v) closePop(); });
    pop.querySelector('input[type=color]').oninput = e => set(e.target.value);
  }
  function spacePop(btn, el) {
    const opts = [['0', 'Nada'], ['1.5rem', 'Poco'], ['3rem', 'Medio'], ['5rem', 'Mucho'], ['8rem', 'Muchísimo']];
    openPop(btn, `<h4>Espacio arriba y abajo (adentro)</h4><div class="opts">${opts.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
      <h4 style="margin-top:.7rem">Separación con lo de abajo</h4><div class="opts">${opts.map(([v, l]) => `<button data-m="${v}">${l}</button>`).join('')}</div>`);
    pop.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { E.snap(); E.setStyle(el, 'padding-top', b.dataset.v); E.setStyle(el, 'padding-bottom', b.dataset.v); place(); });
    pop.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { E.snap(); E.setStyle(el, 'margin-bottom', b.dataset.m); place(); });
  }
  function animPop(btn, el) {
    const A = [['fade', 'Aparecer'], ['fade-up', 'Subir'], ['slide-left', 'Desde un costado'], ['zoom-in', 'Agrandarse'], ['blur', 'Enfocar'], ['clip-up', 'Cortina'], ['bounce-in', 'Rebote'], ['letters', 'Letra por letra']];
    const L = [['float', 'Flotar'], ['pulse', 'Latir']], H = [['grow', 'Agrandar al pasar el mouse'], ['lift', 'Elevar al pasar el mouse']];
    const cur = el.getAttribute('data-ed-anim') || '';
    openPop(btn, `<h4>Cuando aparece en pantalla</h4><div class="opts">${A.map(([v, l]) => `<button data-a="${v}" style="${cur === v ? 'border-color:var(--brand)' : ''}">${l}</button>`).join('')}</div>
      <h4 style="margin-top:.7rem">Otros movimientos</h4><div class="opts">${[...L.map(([v, l]) => `<button data-l="${v}">${l}</button>`), ...H.map(([v, l]) => `<button data-h="${v}">${l}</button>`)].join('')}</div>
      <div class="acts"><button class="btn sm" data-clear>Sin animación</button><button class="btn sm" data-allfx>Ver los 70 efectos…</button></div>`);
    const fxTab = () => document.querySelector('.right .tabs button[data-tab=fx]');
    const apply = (attr, v) => {
      // usa la pestaña Efectos para instalar el motor de efectos y aplicar
      fxTab().click();
      const g = { 'data-ed-anim': 'anim', 'data-ed-loop': 'loop', 'data-ed-hfx': 'hfx' }[attr];
      const b = document.querySelector(`#fxBox .chips[data-g="${g}"] button[data-v="${v}"]`);
      if (b) b.click(); else toast('Este efecto no aplica a este elemento.');
      closePop();
    };
    pop.querySelectorAll('[data-a]').forEach(b => b.onclick = () => apply('data-ed-anim', b.dataset.a));
    pop.querySelectorAll('[data-l]').forEach(b => b.onclick = () => apply('data-ed-loop', b.dataset.l));
    pop.querySelectorAll('[data-h]').forEach(b => b.onclick = () => apply('data-ed-hfx', b.dataset.h));
    pop.querySelector('[data-clear]').onclick = () => { fxTab().click(); const c = document.querySelector('#fxClear'); c && c.click(); closePop(); };
    pop.querySelector('[data-allfx]').onclick = () => { document.body.classList.add('show-right'); fxTab().click(); closePop(); };
  }
  function linkPop(btn, el) {
    const a = el.closest('a');
    const pages = [...S.files.keys()].filter(p => /\.html?$/i.test(p));
    const ids = [...S.doc.querySelectorAll('section[id],[role=tabpanel][id],main [id]')].map(x => x.id).slice(0, 20);
    openPop(btn, `<h4>¿A dónde lleva?</h4>
      <input type="text" id="qHref" placeholder="Pegá una dirección (https://...)" value="${esc(a ? a.getAttribute('href') || '' : '')}">
      <div class="opts" style="margin-top:.5rem"><button data-k="wa">WhatsApp</button><button data-k="mail">Mail</button><button data-k="tel">Teléfono</button><button data-k="ig">Instagram</button></div>
      ${pages.length > 1 || ids.length ? `<h4 style="margin-top:.7rem">De tu web</h4><div class="opts">${pages.map(p => `<button data-h="${esc(E.relPath(E.dirOf(S.path), p))}">${esc(p === 'index.html' ? 'Inicio' : p.replace(/\.html?$/, ''))}</button>`).join('')}${ids.map(i => `<button data-h="#${esc(i)}">#${esc(i)}</button>`).join('')}</div>` : ''}
      <div class="acts"><button class="btn primary sm" data-ok>Listo</button>${a ? '<button class="btn sm" data-rm>Quitar link</button>' : ''}</div>`);
    const inp = pop.querySelector('#qHref'); inp.focus();
    const done = v => {
      if (!v) return; E.snap();
      if (a) { E.setAttr(a, 'href', v); if (/^https?:/.test(v) && !/^#/.test(v)) { E.setAttr(a, 'target', '_blank'); E.setAttr(a, 'rel', 'noopener'); } }
      else {
        // convertir el texto en link
        const L = S.live, r = L.createRange(); r.selectNodeContents(el); const s = L.getSelection(); s.removeAllRanges(); s.addRange(r);
        el.focus(); L.execCommand('createLink', false, v); s.removeAllRanges();
        const src = E.srcOf(el); if (src) { src.innerHTML = el.innerHTML.replace(/ (contenteditable|spellcheck|data-ed-hover|data-ed-sel)="[^"]*"/g, ''); }
        E.markDirty();
      }
      closePop(); toast('Link listo.'); E.renderElement();
    };
    pop.querySelector('[data-ok]').onclick = () => done(inp.value.trim());
    inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim()); };
    pop.querySelectorAll('[data-h]').forEach(b => b.onclick = () => done(b.dataset.h));
    pop.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (k === 'wa') { const n = prompt('Número con código de país, sin + (ej. 5493511234567)'); if (n) done('https://wa.me/' + n.replace(/\D/g, '')); }
      if (k === 'mail') { const m = prompt('Mail'); if (m) done('mailto:' + m.trim()); }
      if (k === 'tel') { const t = prompt('Teléfono (ej. +5493511234567)'); if (t) done('tel:' + t.replace(/[^\d+]/g, '')); }
      if (k === 'ig') { const u = prompt('Usuario de Instagram (sin @)'); if (u) done('https://www.instagram.com/' + u.replace(/^@/, '').trim() + '/'); }
    });
    const rm = pop.querySelector('[data-rm]'); if (rm) rm.onclick = () => { E.snap(); E.setAttr(a, 'href', null); closePop(); toast('Link quitado.'); };
  }

  /* ---------- botón + : agregar debajo ---------- */
  plus.onclick = () => {
    const all = E.BLOCKS.flatMap(([cat, list]) => list.map(b => ({ ...b, cat })));
    const fav = ['Título', 'Párrafo', 'Imagen', 'Botón', 'Galería', '2 columnas', 'Video de YouTube', 'Botón WhatsApp'];
    openPop(plus, `<h4>Agregar debajo</h4><input type="search" id="qSearch" placeholder="Buscar: foto, botón, video, columnas…">
      <div class="opts" id="qBlocks" style="margin-top:.5rem;max-height:260px;overflow:auto"></div>`);
    const box = pop.querySelector('#qBlocks'), q = pop.querySelector('#qSearch');
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const syn = { foto: 'imagen galeria carrusel', fotos: 'galeria carrusel imagen', texto: 'parrafo titulo', boton: 'boton whatsapp', redes: 'redes instagram', columnas: 'columnas', contacto: 'formulario contacto whatsapp mapa' };
    const show = () => {
      const t = norm(q.value.trim()); const words = (syn[t] || t).split(/\s+/).filter(Boolean);
      const list = t ? all.filter(b => words.some(w => norm(b.l + ' ' + b.cat).includes(w))) : fav.map(f => all.find(b => b.l === f)).filter(Boolean);
      box.innerHTML = list.map((b, i) => `<button data-i="${all.indexOf(b)}">${esc(b.l)}</button>`).join('') || '<p class="note">No encontré eso. Probá con otra palabra.</p>';
      box.querySelectorAll('[data-i]').forEach(btn => btn.onclick = async () => {
        const bk = all[+btn.dataset.i]; closePop(); const html = await bk.html(); if (!html) return;
        E.insertHTML(html, E.srcOf(S.sel), 'after', bk);
      });
    };
    q.oninput = show; show(); q.focus();
  };

  /* ---------- guardado automático ---------- */
  let lastChange = 0, autosave = localStorage.getItem('ed-autosave') !== '0';
  const statusEl = $('#status');
  new MutationObserver(() => { if (/sin guardar/i.test(statusEl.textContent)) lastChange = Date.now(); }).observe(statusEl, { childList: true, characterData: true, subtree: true });
  setInterval(() => {
    if (!autosave || !S.root || !document.body.classList.contains('simple')) return;
    const dirty = [...S.buffers.values()].some(b => b.dirty);
    const typing = S.live && S.live.activeElement && S.live.activeElement.isContentEditable;
    if (dirty && Date.now() - lastChange > (typing ? 4000 : 1800)) E.save();
  }, 1000);
  const mi = document.createElement('button'); mi.setAttribute('role', 'menuitem'); mi.id = 'mAuto';
  const label = () => { mi.textContent = (autosave ? '✓ ' : '') + 'Guardado automático (modo simple)'; };
  label(); mi.onclick = () => { autosave = !autosave; localStorage.setItem('ed-autosave', autosave ? '1' : '0'); label(); $('#moreMenu').classList.add('hidden'); toast(autosave ? 'Se guarda solo mientras editás.' : 'Guardado automático apagado: acordate de tocar Guardar.'); };
  $('#mKeys').before(mi);

  /* ---------- guía de inicio ---------- */
  const STEPS = [
    ['Tocá para cambiar', 'Hacé clic en cualquier texto o imagen de tu web. Arriba aparece una barra con lo que podés hacer: tamaño, color, link, animar…'],
    ['Arrastrá para mover', 'Apretá sobre algo y arrastralo: queda donde lo soltás. Si te equivocás, Ctrl + Z lo deshace.'],
    ['Agregá cosas nuevas', 'Con el botón naranja + debajo de lo elegido, o desde la columna de la izquierda: textos, fotos, botones, videos, secciones enteras.'],
    ['Se guarda solo', 'Cada cambio se guarda automáticamente (con copia de respaldo). Para verla como un visitante, tocá “Ver la web”. ¿Necesitás más? Activá “Modo avanzado”.']
  ];
  function tour(i = 0) {
    let t = document.querySelector('.tour'); if (!t) { t = document.createElement('div'); t.className = 'tour'; document.body.appendChild(t); }
    const [h, p] = STEPS[i];
    t.innerHTML = `<div class="tour-card" role="dialog" aria-modal="true" aria-label="Guía"><h2>${esc(h)}</h2><p>${esc(p)}</p><div class="dots">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="acts"><button class="btn sm" data-skip>Saltar</button><button class="btn primary" data-next>${i < STEPS.length - 1 ? 'Siguiente' : '¡Empezar!'}</button></div></div>`;
    t.querySelector('[data-next]').focus();
    t.querySelector('[data-next]').onclick = () => i < STEPS.length - 1 ? tour(i + 1) : end();
    t.querySelector('[data-skip]').onclick = end;
    function end() { t.remove(); localStorage.setItem('ed-tour', '1'); }
  }
  const mt = document.createElement('button'); mt.setAttribute('role', 'menuitem'); mt.textContent = 'Ver la guía de inicio'; mt.onclick = () => { $('#moreMenu').classList.add('hidden'); tour(0); };
  $('#mKeys').before(mt);

  /* ---------- arranque ---------- */
  setSimple(localStorage.getItem('ed-simple') !== '0');
  const iv = setInterval(() => { if (S.root && S.kind) { clearInterval(iv); renderPages(); if (!localStorage.getItem('ed-tour')) setTimeout(() => tour(0), 800); } }, 400);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
})();
