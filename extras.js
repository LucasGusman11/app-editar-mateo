/* Módulos extra del editor: editor de imágenes, componentes, más bloques, publicar,
   optimizar imágenes, sitemap y tema. Usan la API window.ED que expone app.js. */
(function () {
  'use strict';
  const E = window.ED;
  if (!E) return;
  const { S, $, $$, esc, toast } = E;
  window.EDX = {};

  /* ================================================================
     editor de imágenes
     ================================================================ */
  EDX.editImage = async function (path, imgEl) {
    const h = S.files.get(path); if (!h) { toast('No encontré ese archivo.'); return; }
    const res = await window.ImageEditor.open(await h.getFile(), path.split('/').pop());
    if (!res) return;
    const sameFmt = E.ext(path).replace('jpeg', 'jpg') === res.ext;
    const choice = await E.ask('Guardar la imagen editada',
      `<p>¿Cómo la guardo?</p><p class="note">${sameFmt ? 'Si reemplazás el archivo, la web la usa en todos lados donde estaba. La versión anterior queda en respaldos.' : 'Cambiaste el formato, así que se guarda como archivo nuevo.'}</p>`,
      sameFmt ? 'Reemplazar el archivo' : 'Guardar como nuevo', 'Cancelar');
    if (!choice) return;
    let out = path;
    if (sameFmt) {
      await E.writeFile('respaldos/imagenes/' + E.stamp() + '/' + path, await E.readBytes(path), false);
      await E.writeFile(path, res.blob);
    } else {
      out = path.replace(/\.[^.]+$/, '') + '-editada.' + res.ext;
      let n = 2; while (S.files.has(out)) out = path.replace(/\.[^.]+$/, '') + '-editada-' + (n++) + '.' + res.ext;
      await E.writeFile(out, res.blob);
    }
    E.assetURLs.delete(out); E.renderFiles(); E.renderAssets();
    if (imgEl && imgEl.isConnected) await E.setImage(imgEl, out);
    else if (S.kind === 'html' && S.live) {
      // refrescar las imágenes de la vista que usan este archivo
      const url = URL.createObjectURL(res.blob);
      S.live.querySelectorAll('img').forEach(im => { if (E.srcToPath(E.srcOf(im)?.getAttribute('src')) === out) im.src = url; });
    }
    if (S.kind === 'image' && S.path === path) E.showImage(out);
    if (!sameFmt && S.kind === 'html' && imgEl) toast('Imagen guardada como ' + out + ' y aplicada. Tocá Guardar.');
    else toast('Imagen guardada: ' + out + (sameFmt ? ' (la anterior quedó en respaldos/imagenes).' : '.'));
  };

  /* ================================================================
     componentes reutilizables (se guardan en .editor/componentes.json)
     ================================================================ */
  let comps = {};
  const COMP_FILE = '.editor/componentes.json';
  async function loadComps() {
    try { const d = await (await (await (await S.root.getDirectoryHandle('.editor')).getFileHandle('componentes.json')).getFile()).text(); comps = JSON.parse(d) || {}; }
    catch { comps = {}; }
    renderComps();
  }
  async function saveComps() { await E.writeFile(COMP_FILE, JSON.stringify(comps, null, 2), false); renderComps(); }
  function compCss(node) { // estilos del editor que usa el componente
    const out = {};
    [node, ...node.querySelectorAll('[data-ed]')].forEach(x => { const id = x.getAttribute && x.getAttribute('data-ed'); if (!id) return; out[id] = E.DEVS.map(d => [S.css[d][id] || null, S.css[d][id + ':hover'] || null, S.hide[d].has(id)]); });
    return out;
  }
  function applyCompCss(css, model, hide) {
    Object.entries(css || {}).forEach(([id, arr]) => E.DEVS.forEach((d, i) => {
      const [base, hov, hid] = arr[i] || [];
      if (base) model[d][id] = { ...base }; else delete model[d][id];
      if (hov) model[d][id + ':hover'] = { ...hov }; else delete model[d][id + ':hover'];
      hid ? hide[d].add(id) : hide[d].delete(id);
    }));
  }
  EDX.makeComponent = async function () {
    const el = S.sel; if (!el) return;
    const name = (prompt('Nombre del componente (por ejemplo: Pie de página, Tarjeta de proyecto)') || '').trim(); if (!name) return;
    E.snap();
    const s = E.srcOf(el);
    [el, s].forEach(x => x.setAttribute('data-ed-comp', name));
    E.edId(el); // asegura id de estilos
    comps[name] = { html: E.stripIds(s).outerHTML, css: compCss(s), at: Date.now() };
    await saveComps(); E.markDirty(); E.renderElement();
    toast('Componente “' + name + '” guardado. Lo encontrás en Agregar → Mis componentes.');
  };
  EDX.insertComponent = function (name) {
    const c = comps[name]; if (!c) return;
    applyCompCss(c.css, S.css, S.hide);
    E.insertHTML(c.html, S.sel ? E.srcOf(S.sel) : null, S.sel ? S.where : 'inside', { tip: 'Componente “' + name + '” agregado.' }, true);
  };
  EDX.syncComponent = async function () {
    const el = S.sel; const name = el && el.getAttribute('data-ed-comp'); if (!name) return;
    if (!confirm(`¿Actualizar “${name}” en todas las páginas con este diseño?`)) return;
    const s = E.srcOf(el);
    comps[name] = { html: E.stripIds(s).outerHTML, css: compCss(s), at: Date.now() };
    await saveComps();
    let count = 0;
    if (S.kind === 'html' && S.mode !== 'code') E.commitHTML();
    for (const p of [...S.files.keys()].filter(p => E.ext(p) === 'html')) {
      if (p === S.path) {
        E.snap();
        S.doc.querySelectorAll(`[data-ed-comp="${CSS.escape(name)}"]`).forEach(x => { if (x === s) return; const t = S.doc.createElement('template'); t.innerHTML = comps[name].html; const n = t.content.firstElementChild; E.renumber(n); x.replaceWith(n); count++; });
        applyCompCss(comps[name].css, S.css, S.hide); E.writeEdCss(); continue;
      }
      const text = S.buffers.has(p) ? S.buffers.get(p).text : await E.readText(p);
      if (!text.includes('data-ed-comp="' + name + '"')) continue;
      const d = new DOMParser().parseFromString(text, 'text/html');
      const inst = d.querySelectorAll(`[data-ed-comp="${CSS.escape(name)}"]`); if (!inst.length) continue;
      inst.forEach(x => { const t = d.createElement('template'); t.innerHTML = comps[name].html; x.replaceWith(t.content.firstElementChild); count++; });
      // estilos del editor de esa página
      const model = { desktop: {}, tablet: {}, mobile: {} }, hide = { desktop: new Set(), tablet: new Set(), mobile: new Set() };
      const prev = { doc: S.doc, css: S.css, hide: S.hide };
      S.doc = d; E.readEdCss(); applyCompCss(comps[name].css, S.css, S.hide);
      // escribir estilos en esa página (sin tocar la vista actual)
      const live = S.live; S.live = null; E.writeEdCss(); S.live = live;
      const dt = /^\s*<!doctype[^>]*>/i.exec(text)?.[0] || '<!DOCTYPE html>';
      S.buffers.set(p, { text: dt + '\n' + d.documentElement.outerHTML + '\n', dirty: true });
      S.doc = prev.doc; S.css = prev.css; S.hide = prev.hide;
      void model; void hide;
    }
    E.markDirty(); E.updateStatus(); E.renderFiles(); E.reloadPreview();
    toast(`“${name}” actualizado en ${count} lugar${count === 1 ? '' : 'es'}. Revisá y tocá Guardar.`);
  };
  EDX.unlinkComponent = function () { const el = S.sel; if (!el) return; E.snap(); [el, E.srcOf(el)].forEach(x => x.removeAttribute('data-ed-comp')); E.markDirty(); E.renderElement(); toast('Ya no está vinculado al componente.'); };
  function renderComps() {
    let box = $('#myComps');
    if (!box) { box = document.createElement('div'); box.id = 'myComps'; $('#blocks').before(box); }
    const names = Object.keys(comps);
    box.innerHTML = `<h4 style="font-size:.75rem;font-weight:600;color:var(--muted);padding:.6rem .75rem .3rem">Mis componentes</h4>` +
      (names.length ? `<div class="blockgrid">${names.map(n => `<button class="blk" data-comp="${esc(n)}" title="Clic para insertar · clic derecho para borrar"><svg viewBox="0 0 34 22" aria-hidden="true"><rect x="4" y="3" width="26" height="16" rx="3"/><path d="M10 9h14M10 13h9"/></svg>${esc(n)}</button>`).join('')}</div>`
        : '<p class="note pad">Elegí algo en la página y tocá “Guardar como componente” en el panel Elemento para reusarlo en otras páginas.</p>');
    box.querySelectorAll('[data-comp]').forEach(b => {
      b.onclick = () => { if (S.kind !== 'html' || S.mode !== 'visual') { toast('Abrí una página en modo Visual.'); return; } EDX.insertComponent(b.dataset.comp); };
      b.oncontextmenu = e => { e.preventDefault(); E.showCtx([['Insertar', () => EDX.insertComponent(b.dataset.comp)], ['Borrar de la biblioteca', async () => { if (!confirm('¿Borrar el componente “' + b.dataset.comp + '” de la biblioteca? Las copias que ya están en las páginas no se borran.')) return; delete comps[b.dataset.comp]; await saveComps(); }, 'danger']], e.clientX, e.clientY); };
    });
  }
  // botones de componente en el panel Elemento
  const origRenderElement = E.renderElement;
  new MutationObserver(() => {
    const box = $('#elBox'); if (!box || box.querySelector('#compSec') || !S.sel || !box.querySelector('.tagname')) return;
    const name = S.sel.getAttribute('data-ed-comp');
    const sec = document.createElement('div'); sec.className = 'sec'; sec.id = 'compSec';
    sec.innerHTML = name ? `<h3>Componente “${esc(name)}”</h3><p class="note">Si lo cambiás acá, podés pasar los cambios a todas las páginas.</p><div class="acts"><button class="btn primary sm" id="cSync">Actualizar en todas las páginas</button><button class="btn sm" id="cUnlink">Desvincular</button></div>`
      : `<h3>Reusar</h3><div class="acts"><button class="btn sm" id="cMake">Guardar como componente</button>${S.sel.tagName === 'IMG' ? '<button class="btn sm" id="cImg">Editar imagen…</button>' : ''}</div>`;
    const acts = box.querySelectorAll('.sec')[1]; (acts || box).after(sec);
    sec.querySelector('#cSync') && (sec.querySelector('#cSync').onclick = EDX.syncComponent);
    sec.querySelector('#cUnlink') && (sec.querySelector('#cUnlink').onclick = EDX.unlinkComponent);
    sec.querySelector('#cMake') && (sec.querySelector('#cMake').onclick = EDX.makeComponent);
    sec.querySelector('#cImg') && (sec.querySelector('#cImg').onclick = () => $('#iEdit') && $('#iEdit').click());
  }).observe($('#elBox'), { childList: true });
  void origRenderElement;

  /* ================================================================
     más bloques y secciones completas (con un script chico cuando hace falta)
     ================================================================ */
  const UI_CSS = `.ed-menu{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0;position:relative}
.ed-menu .ed-brand{font-weight:700;font-size:1.2rem;text-decoration:none;color:inherit}
.ed-menu ul{display:flex;gap:1.5rem;list-style:none;margin:0;padding:0}
.ed-menu ul a{color:inherit;text-decoration:none}
.ed-menu .ed-burger{display:none;background:none;border:0;color:inherit;font-size:1.6rem;cursor:pointer;padding:.25rem .5rem}
@media (max-width:700px){.ed-menu .ed-burger{display:block}.ed-menu ul{display:none;position:absolute;left:0;right:0;top:100%;flex-direction:column;gap:0;background:inherit;background-color:var(--bg,#fff);padding:.5rem 0;z-index:50;box-shadow:0 14px 30px rgba(0,0,0,.25)}.ed-menu.is-open ul{display:flex}.ed-menu ul a{display:block;padding:.75rem 1rem}}
.ed-slider{position:relative;margin:2rem 0}
.ed-slider .ed-track{display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;scrollbar-width:none}
.ed-slider .ed-track::-webkit-scrollbar{display:none}
.ed-slider .ed-track>*{flex:0 0 100%;scroll-snap-align:start;margin:0}
.ed-slider .ed-track img{width:100%;height:auto;display:block}
.ed-slider .ed-prev,.ed-slider .ed-next{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;font-size:1.3rem;cursor:pointer}
.ed-slider .ed-prev{left:.75rem}.ed-slider .ed-next{right:.75rem}
.ed-faq details{border-bottom:1px solid rgba(127,127,127,.35);padding:1rem 0}
.ed-faq summary{cursor:pointer;font-weight:600;font-size:1.1em;list-style:none;display:flex;justify-content:space-between;gap:1rem}
.ed-faq summary::after{content:"+";font-size:1.3em;line-height:1}
.ed-faq details[open] summary::after{content:"−"}
.ed-faq details p{margin:.75rem 0 0}
@media (max-width:700px){[data-ed-stack]{grid-template-columns:1fr!important}}`;
  const UI_JS = `(function(){function go(){document.querySelectorAll('.ed-menu .ed-burger').forEach(function(b){b.addEventListener('click',function(){var m=b.closest('.ed-menu');var o=m.classList.toggle('is-open');b.setAttribute('aria-expanded',o)})});document.querySelectorAll('.ed-slider').forEach(function(s){var t=s.querySelector('.ed-track');var n=function(d){t.scrollBy({left:d*t.clientWidth,behavior:'smooth'})};var p=s.querySelector('.ed-prev'),x=s.querySelector('.ed-next');p&&p.addEventListener('click',function(){n(-1)});x&&x.addEventListener('click',function(){n(1)});var auto=+s.getAttribute('data-auto');if(auto&&!matchMedia('(prefers-reduced-motion: reduce)').matches)setInterval(function(){if(t.scrollLeft+t.clientWidth>=t.scrollWidth-4)t.scrollTo({left:0});else n(1)},auto*1000)});var cs=document.querySelectorAll('[data-ed-count]');if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;io.unobserve(e.target);var el=e.target,to=+el.getAttribute('data-ed-count'),t0=null;function f(ts){t0=t0||ts;var k=Math.min(1,(ts-t0)/1500);el.textContent=Math.round(to*(1-Math.pow(1-k,3))).toLocaleString();if(k<1)requestAnimationFrame(f)}requestAnimationFrame(f)})});cs.forEach(function(c){io.observe(c)})}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go()})();`;
  function ensureUi() {
    if (S.doc.getElementById('editor-ui')) return;
    const st = S.doc.createElement('style'); st.id = 'editor-ui'; st.textContent = '\n' + UI_CSS + '\n';
    const sc = S.doc.createElement('script'); sc.id = 'editor-ui-js'; sc.textContent = UI_JS;
    [st, sc].forEach(x => { x.setAttribute('data-eid', ++S.eid); S.doc.head.appendChild(x); });
  }
  const img = () => E.imageHTML();
  const imgNM = () => E.imageHTML().replace('margin:0 0 1.5rem', 'margin:0');
  const btn = 'display:inline-block;padding:.85em 1.6em;border:2px solid currentColor;border-radius:999px;text-decoration:none;font-weight:600';
  const card = 'border:1px solid rgba(127,127,127,.35);border-radius:16px;padding:1.75rem';
  const ICONSET = {
    'Estrella': '<path d="M12 2l3 7h7l-5.5 4.5 2 7.5L12 17l-6.5 4 2-7.5L2 9h7z"/>', 'Corazón': '<path d="M12 21s-8-5-8-11a5 5 0 019-3 5 5 0 019 3c0 6-8 11-8 11z"/>',
    'Check': '<path d="M4 12l5 5L20 6"/>', 'Mail': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', 'Teléfono': '<path d="M5 3h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A17 17 0 013 5a2 2 0 012-2z"/>',
    'Ubicación': '<path d="M12 22s-7-7-7-12a7 7 0 0114 0c0 5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>', 'Cámara': '<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="4"/><path d="M8 6l2-3h4l2 3"/>',
    'Flecha': '<path d="M4 12h16M14 6l6 6-6 6"/>', 'Rayo': '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', 'Pincel': '<path d="M18 3l3 3-9 9-3-3zM9 12c-3 0-5 2-5 5 0 1-1 2-2 2 2 2 7 2 9-1 1-2 0-4-2-6z"/>',
    'Usuario': '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 5-7 8-7s7 2 8 7"/>', 'Reloj': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  const svgIcon = (k, size = 40) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONSET[k]}</svg>`;
  const IC2 = { menu: '<path d="M4 6h26M4 11h26M4 16h26"/>', slider: '<rect x="6" y="3" width="22" height="16"/><path d="M3 11l2-2M3 11l2 2M31 11l-2-2M31 11l-2 2"/>', faq: '<path d="M4 6h22M4 11h22M4 16h22M29 5v2M29 10v2M29 15v2"/>',
    quote2: '<path d="M4 5h11v9H8l-4 4zM19 5h11v9h-7l-4 4z"/>', price: '<rect x="3" y="3" width="8" height="16"/><rect x="13" y="1" width="8" height="20"/><rect x="23" y="3" width="8" height="16"/>',
    count: '<path d="M6 16V6l-3 2M13 6h5v4h-5v6h5M23 6h5v10h-5M23 11h5"/>', icon: '<path d="M17 3l3 7h7l-5.5 4.5 2 7.5L17 17l-6.5 4 2-7.5L7 10h7z"/>', hero: '<rect x="2" y="2" width="30" height="18"/><path d="M7 8h20M10 12h14"/><rect x="13" y="15" width="8" height="3"/>',
    about: '<circle cx="9" cy="11" r="5"/><path d="M18 7h12M18 11h12M18 15h8"/>', serv: '<rect x="2" y="5" width="9" height="12"/><rect x="13" y="5" width="9" height="12"/><rect x="24" y="5" width="8" height="12"/>',
    proj: '<rect x="2" y="2" width="14" height="8"/><rect x="18" y="2" width="14" height="8"/><rect x="2" y="12" width="14" height="8"/><rect x="18" y="12" width="14" height="8"/>', contact: '<rect x="2" y="4" width="14" height="14"/><path d="M20 6h12M20 10h12M20 14h8"/>', foot: '<path d="M2 14h30M6 18h6M15 18h6M24 18h6"/>' };
  Object.assign(E.IC, IC2);
  const add = (cat, list) => { const c = E.BLOCKS.find(b => b[0] === cat); if (c) c[1].push(...list); else E.BLOCKS.push([cat, list]); };
  add('Diseño', [
    { l: 'Menú (con hamburguesa)', i: 'menu', after: ensureUi, html: () => `<nav class="ed-menu" aria-label="Principal"><a class="ed-brand" href="#">Mi marca</a><button class="ed-burger" type="button" aria-label="Abrir menú" aria-expanded="false">☰</button><ul><li><a href="#">Inicio</a></li><li><a href="#">Proyectos</a></li><li><a href="#">Sobre mí</a></li><li><a href="#">Contacto</a></li></ul></nav>`, tip: 'Menú agregado: en celular se vuelve hamburguesa. Elegí cada link para poner a dónde lleva.' },
    { l: 'Preguntas frecuentes', i: 'faq', after: ensureUi, html: () => `<div class="ed-faq" style="margin:2rem 0">${[['¿Cuánto tarda un proyecto?', 'Depende del alcance; normalmente entre 2 y 4 semanas.'], ['¿Cómo trabajamos?', 'Primero charlamos tu idea, después te muestro propuestas y ajustamos juntos.'], ['¿Qué necesito para empezar?', 'Contame sobre tu marca y lo que querés comunicar.']].map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>` },
    { l: 'Contador', i: 'count', after: ensureUi, html: () => `<div data-ed-stack style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2rem;text-align:center;margin:3rem 0">${[['25', 'Proyectos'], ['12', 'Clientes'], ['3', 'Años']].map(([n, l]) => `<div><p style="font-size:3.5rem;font-weight:700;margin:0;line-height:1"><span data-ed-count="${n}">${n}</span>+</p><p style="margin:.4rem 0 0">${l}</p></div>`).join('')}</div>`, tip: 'Contador agregado: los números suben al aparecer. Para cambiar el número, cambiá el atributo data-ed-count en Elemento → Avanzado y también el texto.' },
    { l: 'Ícono', i: 'icon', html: async () => {
        const ok = await E.ask('Elegí un ícono', `<div class="chips" id="icPick">${Object.keys(ICONSET).map(k => `<button type="button" data-k="${k}" aria-pressed="false" style="display:flex;align-items:center;gap:.4rem">${svgIcon(k, 20)} ${k}</button>`).join('')}</div>`, 'Insertar', 'Cancelar').catch(() => false);
        const sel = window.__icK; window.__icK = null; return ok && sel ? `<p style="margin:1rem 0">${svgIcon(sel, 48)}</p>` : null; }, tip: 'Ícono agregado. Su color sigue al color del texto (cambialo en Estilo).' }
  ]);
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#icPick button'); if (!b) return; window.__icK = b.dataset.k; b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
  add('Imágenes y medios', [
    { l: 'Carrusel de fotos', i: 'slider', after: ensureUi, html: () => `<div class="ed-slider" data-auto="0"><div class="ed-track">${[1, 2, 3].map(() => imgNM()).join('')}</div><button class="ed-prev" type="button" aria-label="Anterior">‹</button><button class="ed-next" type="button" aria-label="Siguiente">›</button></div>`, tip: 'Carrusel agregado. Doble clic en cada foto para elegirla. Para que pase solo, cambiá data-auto a 4 (segundos) en Elemento → Avanzado del carrusel.' }
  ]);
  add('Texto', [
    { l: 'Testimonios', i: 'quote2', html: () => `<div data-ed-stack style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.5rem;margin:3rem 0">${[1, 2].map(() => `<blockquote style="${card};margin:0"><p style="font-size:1.15em;margin:0 0 1rem">“Un comentario de alguien que trabajó con vos.”</p><cite style="font-style:normal;opacity:.75">Nombre · Empresa</cite></blockquote>`).join('')}</div>` },
    { l: 'Precios', i: 'price', html: () => `<div data-ed-stack style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.5rem;margin:3rem 0">${[['Básico', '$ 50.000', 'Logo + paleta'], ['Completo', '$ 120.000', 'Identidad + papelería + redes'], ['A medida', 'Consultar', 'Lo que tu marca necesite']].map(([n, p, d]) => `<div style="${card}"><h3 style="margin-top:0">${n}</h3><p style="font-size:2rem;font-weight:700;margin:.5rem 0">${p}</p><p>${d}</p><p><a href="#" style="${btn}">Quiero este</a></p></div>`).join('')}</div>` }
  ]);
  add('Secciones completas', [
    { l: 'Portada', i: 'hero', html: () => `<section style="min-height:80vh;display:flex;flex-direction:column;justify-content:center;padding:6rem 0"><p style="margin:0 0 1rem;opacity:.75">Diseño gráfico · Córdoba</p><h1 style="font-size:clamp(3rem,8vw,6.5rem);line-height:.95;margin:0">Tu nombre o tu marca</h1><p style="font-size:1.25rem;max-width:40ch;margin:1.5rem 0 2rem">Una frase corta que cuente qué hacés y para quién.</p><p><a href="#" style="${btn}">Ver proyectos</a></p></section>` },
    { l: 'Sobre mí', i: 'about', html: () => `<section data-ed-stack style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:3rem;align-items:center;padding:5rem 0">${imgNM()}<div><h2>Sobre mí</h2><p>Contá quién sos, cómo trabajás y qué te apasiona del diseño.</p><p>Sumá experiencia, estudios o clientes con los que trabajaste.</p></div></section>` },
    { l: 'Servicios', i: 'serv', html: () => `<section style="padding:5rem 0"><h2>Servicios</h2><div data-ed-stack style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.5rem;margin-top:2rem">${[['Pincel', 'Identidad visual', 'Logos, paletas y sistemas de marca.'], ['Cámara', 'Redes sociales', 'Piezas y plantillas para tus redes.'], ['Rayo', 'Envases', 'Packaging que se destaca en la góndola.']].map(([ic, t, d]) => `<div style="${card}">${svgIcon(ic)}<h3>${t}</h3><p>${d}</p></div>`).join('')}</div></section>` },
    { l: 'Proyectos', i: 'proj', html: () => `<section style="padding:5rem 0"><h2>Proyectos</h2><div data-ed-stack style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2rem;margin-top:2rem">${[1, 2, 3, 4].map(n => `<a href="#" style="text-decoration:none;color:inherit;display:block">${imgNM()}<h3 style="margin:.9rem 0 .2rem">Proyecto ${n}</h3><p style="margin:0;opacity:.7">Identidad visual · 2025</p></a>`).join('')}</div></section>`, tip: 'Sección de proyectos agregada. Doble clic en cada imagen para elegirla.' },
    { l: 'Contacto', i: 'contact', html: () => { const f = 'display:block;width:100%;padding:.75rem;margin:.35rem 0 1rem;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;font:inherit';
        return `<section data-ed-stack style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3rem;padding:5rem 0"><div><h2>Hablemos</h2><p>Contame tu idea y te respondo a la brevedad.</p><p>${svgIcon('Mail', 20)} tu@mail.com<br>${svgIcon('Teléfono', 20)} +54 9 351 000 0000<br>${svgIcon('Ubicación', 20)} Córdoba, Argentina</p></div><form action="https://formsubmit.co/tu@mail.com" method="POST"><input type="hidden" name="_captcha" value="false"><input type="hidden" name="_template" value="table"><label>Nombre<input name="nombre" required style="${f}"></label><label>Mail<input type="email" name="mail" required style="${f}"></label><label>Mensaje<textarea name="mensaje" rows="5" required style="${f}"></textarea></label><button type="submit" style="${btn};background:none;color:inherit;cursor:pointer">Enviar</button></form></section>`; },
      tip: 'Sección de contacto agregada. Elegí el formulario y poné tu mail en el panel Elemento para recibir los mensajes.' },
    { l: 'Pie de página', i: 'foot', html: () => `<footer style="padding:3rem 0;border-top:1px solid rgba(127,127,127,.35);display:flex;flex-wrap:wrap;justify-content:space-between;gap:1.5rem"><p style="margin:0">© ${new Date().getFullYear()} Tu nombre</p><p style="margin:0;display:flex;gap:1.25rem"><a href="#">Instagram</a><a href="#">Behance</a><a href="#">LinkedIn</a></p></footer>` }
  ]);
  // el bloque Formulario original pasa a usar FormSubmit
  const fb = E.BLOCKS.flatMap(b => b[1]).find(b => b.l === 'Formulario');
  if (fb) fb.html = async () => {
    const m = prompt('¿A qué mail llegan los mensajes?'); if (!m) return null;
    const f = 'display:block;width:100%;padding:.75rem;margin:.35rem 0 1rem;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;font:inherit';
    return `<form action="https://formsubmit.co/${esc(m.trim())}" method="POST" style="max-width:520px;margin:2rem 0"><input type="hidden" name="_captcha" value="false"><input type="hidden" name="_template" value="table"><input type="hidden" name="_subject" value="Nuevo mensaje desde la web"><label>Nombre<input name="nombre" required style="${f}"></label><label>Mail<input type="email" name="mail" required style="${f}"></label><label>Mensaje<textarea name="mensaje" rows="5" required style="${f}"></textarea></label><button type="submit" style="${btn};background:none;color:inherit;cursor:pointer">Enviar</button></form>`;
  }, fb.tip = 'Formulario agregado: los mensajes llegan a tu mail (el primero te pide confirmarlo).';
  E.renderBlocks();

  /* ================================================================
     publicar en Netlify
     ================================================================ */
  async function publish() {
    const cfgKey = 'netlify:' + S.root.name;
    const cfg = (await E.kv(cfgKey)) || {};
    E.modal('Publicar en internet', `
      <p>La forma más simple y gratis es <b>Netlify</b>. Hay dos caminos:</p>
      <div class="sec"><h3>Opción 1: sin cuenta técnica (arrastrar)</h3>
        <p class="note">Descargá el .zip y arrastralo en <b>app.netlify.com/drop</b>. Te da un link al instante.</p>
        <div class="acts"><button class="btn sm" id="pbZip">Descargar .zip</button></div></div>
      <div class="sec"><h3>Opción 2: publicar con un botón</h3>
        <p class="note">Una sola vez: entrá a app.netlify.com → User settings → Applications → <b>New access token</b>, copiá el código y pegalo acá. Queda guardado solo en esta compu.</p>
        <label class="field"><span>Código de acceso de Netlify</span><input class="inp" id="pbTok" type="password" placeholder="nfp_..." value="${esc(cfg.token || '')}"></label>
        <label class="field"><span>Nombre del sitio (opcional, para el link)</span><input class="inp" id="pbName" placeholder="mateo-carballo" value="${esc(cfg.name || '')}"></label>
        ${cfg.url ? `<p class="note" style="margin-top:.5rem">Último publicado: <b>${esc(cfg.url)}</b></p>` : ''}
        <div class="acts"><button class="btn primary sm" id="pbGo">${cfg.siteId ? 'Publicar cambios' : 'Publicar por primera vez'}</button></div>
        <p class="note" id="pbMsg" style="margin-top:.5rem"></p></div>`);
    $('#pbZip').onclick = () => { E.closeModal(); $('#mExport').click(); };
    $('#pbGo').onclick = async () => {
      const token = $('#pbTok').value.trim(), name = E.slug($('#pbName').value || '');
      if (!token) { $('#pbMsg').textContent = 'Pegá el código de acceso.'; return; }
      $('#pbMsg').textContent = 'Armando la web y subiéndola…'; $('#pbGo').disabled = true;
      try {
        const zip = await E.exportZipBytes();
        const H = { Authorization: 'Bearer ' + token };
        let siteId = cfg.siteId, url;
        if (!siteId) {
          const r = await fetch('https://api.netlify.com/api/v1/sites', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(name ? { name } : {}) });
          if (!r.ok) throw new Error(r.status === 401 ? 'El código de acceso no es válido.' : r.status === 422 ? 'Ese nombre de sitio ya está usado. Probá otro.' : 'Netlify respondió ' + r.status);
          const site = await r.json(); siteId = site.id; url = site.ssl_url || site.url;
        }
        const d = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/zip' }, body: zip });
        if (!d.ok) throw new Error(d.status === 401 ? 'El código de acceso no es válido.' : 'Netlify respondió ' + d.status);
        const dep = await d.json(); url = dep.ssl_url || dep.url || url;
        await E.kv(cfgKey, { token, name, siteId, url });
        $('#pbMsg').innerHTML = `¡Publicado! Tu web está en <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a> (puede tardar unos segundos en verse).`;
      } catch (err) {
        $('#pbMsg').textContent = 'No se pudo publicar: ' + (err.message || err) + (String(err).includes('fetch') ? ' Revisá tu conexión a internet.' : '');
      }
      $('#pbGo').disabled = false;
    };
  }

  /* ================================================================
     optimizar imágenes a WebP y sitemap
     ================================================================ */
  async function optimizeAll() {
    const all = [...S.files.keys()].filter(p => /\.(jpe?g|png)$/i.test(p));
    if (!all.length) { toast('No hay imágenes JPG o PNG para optimizar.'); return; }
    // no tocar las que se usan como imagen para redes o ícono (WebP no siempre funciona ahí)
    const protect = new Set();
    for (const p of [...S.files.keys()].filter(p => E.ext(p) === 'html')) {
      const t = S.buffers.has(p) ? S.buffers.get(p).text : await E.readText(p);
      const d = new DOMParser().parseFromString(t, 'text/html');
      d.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]').forEach(m => protect.add((m.getAttribute('content') || '').split('/').pop()));
      d.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]').forEach(l => protect.add((l.getAttribute('href') || '').split('/').pop()));
    }
    const list = all.filter(p => !protect.has(p.split('/').pop()));
    const ok = await E.ask('Optimizar imágenes', `<p>Voy a pasar <b>${list.length}</b> imágenes a WebP (pesan mucho menos y se ven igual), achicar las que superen 2000 px de ancho y actualizar todas las referencias en el código.</p><p class="note">Los originales quedan en respaldos/originales. ${protect.size ? 'Dejo sin tocar las que se usan para redes o como ícono.' : ''}</p>`, 'Optimizar', 'Cancelar');
    if (!ok) return;
    if (S.kind === 'html' && S.mode !== 'code') E.commitHTML();
    const st = E.stamp(); let before = 0, after = 0, done = 0; const renames = [];
    for (const p of list) {
      const f = await S.files.get(p).getFile(); before += f.size;
      const bmp = await createImageBitmap(f); const k = Math.min(1, 2000 / bmp.width);
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.82));
      if (!blob || blob.size >= f.size) { after += f.size; continue; }
      const np = p.replace(/\.(jpe?g|png)$/i, '.webp');
      if (S.files.has(np)) { after += f.size; continue; }
      await E.writeFile('respaldos/originales/' + st + '/' + p, await f.arrayBuffer(), false);
      await E.writeFile(np, blob); await E.removeFile(p); E.assetURLs.delete(p);
      renames.push([p.split('/').pop(), np.split('/').pop()]); after += blob.size; done++;
      toast(`Optimizando… ${done}/${list.length}`, 2000);
    }
    // actualizar referencias en html, css y js
    let refs = 0;
    for (const p of [...S.files.keys()].filter(p => /\.(html?|css|js|json)$/i.test(p))) {
      let t = S.buffers.has(p) ? S.buffers.get(p).text : (p === S.path && S.doc ? E.serialize() : await E.readText(p));
      if (p === S.path && S.kind === 'html' && S.doc && S.mode !== 'code') t = E.serialize();
      let changed = false;
      renames.forEach(([a, b]) => { const rx = new RegExp('(^|[\\/"\'(\\s])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=["\')\\s?#]|$)', 'g'); t = t.replace(rx, (m, pre) => { changed = true; refs++; return pre + b; }); });
      if (changed) { S.buffers.set(p, { text: t, dirty: true }); if (p === S.path && S.kind === 'html') E.parseDoc(t); }
    }
    E.updateStatus(); E.renderFiles(); E.renderAssets(); if (S.kind === 'html') E.reloadPreview();
    E.modal('Imágenes optimizadas', `<p><b>${done}</b> imágenes pasadas a WebP. Peso total: <b>${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB</b>.</p><p>${refs} referencias actualizadas en el código. Tocá <b>Guardar</b> para dejar los cambios.</p><p class="note">Los originales están en respaldos/originales/${st}.</p>`);
  }
  async function sitemap() {
    const pages = [...S.files.keys()].filter(p => /\.html?$/i.test(p));
    const prev = (await E.kv('domain:' + S.root.name)) || '';
    const dom = prompt('¿Cuál es la dirección de la web? (por ejemplo https://mateocarballo.com)', prev || 'https://'); if (!dom || dom === 'https://') return;
    const base = dom.replace(/\/+$/, ''); await E.kv('domain:' + S.root.name, base);
    const today = new Date().toISOString().slice(0, 10);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(p => `  <url><loc>${base}/${p === 'index.html' ? '' : p.replace(/(^|\/)index\.html$/, '$1')}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`;
    await E.writeFile('sitemap.xml', xml);
    await E.writeFile('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n`);
    E.renderFiles();
    toast('Listo: sitemap.xml y robots.txt creados. Al publicar, Google encuentra todas tus páginas.', 5000);
  }

  /* ================================================================
     tema y menú
     ================================================================ */
  const applyTheme = t => document.documentElement.setAttribute('data-theme', t);
  applyTheme(localStorage.getItem('ed-theme') || 'dark');
  const mi = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', () => { $('#moreMenu').classList.add('hidden'); if (!S.root && !/mTheme|mLang/.test(id)) return; fn(); }); };
  mi('#mPublish', publish); mi('#mOptimize', optimizeAll); mi('#mSitemap', sitemap);
  mi('#mTheme', () => { const t = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; applyTheme(t); localStorage.setItem('ed-theme', t); });
  mi('#mLang', () => { const l = localStorage.getItem('ed-lang') === 'en' ? 'es' : 'en'; localStorage.setItem('ed-lang', l); if (!S.root || ![...S.buffers.values()].some(b => b.dirty) || confirm(l === 'en' ? 'Reload to switch to English? Unsaved changes will be offered for recovery.' : '¿Recargar para pasar a español?')) location.reload(); });

  // cargar componentes cuando se abre una carpeta
  const iv = setInterval(() => { if (S.root) { clearInterval(iv); loadComps(); } }, 400);
  renderComps();
})();
