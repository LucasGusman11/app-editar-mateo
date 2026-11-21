/* Editor web — edita una carpeta de sitio web con el mouse o con código.
   - Lee y escribe archivos con la API de acceso a archivos (Chrome / Edge).
   - La vista previa se sirve desde la carpeta abierta con un service worker (sw.js).
   - Los estilos visuales se guardan en <style id="editor-estilos"> con reglas por dispositivo. */
(function () {
  'use strict';

  /* ================================================================
     utilidades
     ================================================================ */
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const ext = p => (p.split('.').pop() || '').toLowerCase();
  const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const uid = () => 'e' + Math.random().toString(36).slice(2, 8);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function toast(m, ms) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms || 3000); }

  const TEXT_EXT = ['html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'md', 'svg', 'xml'];
  const IMG_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico'];
  const MIME = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
    svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
    ico: 'image/x-icon', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', txt: 'text/plain', md: 'text/plain',
    xml: 'application/xml', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', pdf: 'application/pdf' };
  const SKIP_DIRS = ['node_modules', '.git', 'respaldos', '.vscode', '.next'];

  // dispositivos: los estilos van en cascada de escritorio a celular
  const DEV = {
    desktop: { name: 'Escritorio', width: '100%', media: null, only: '(min-width: 861px)' },
    tablet: { name: 'Tablet', width: '820px', media: '(max-width: 860px)', only: '(min-width: 481px) and (max-width: 860px)' },
    mobile: { name: 'Celular', width: '390px', media: '(max-width: 480px)', only: '(max-width: 480px)' }
  };
  const DEVS = ['desktop', 'tablet', 'mobile'];

  /* ================================================================
     estado
     ================================================================ */
  const S = {
    root: null, files: new Map(), buffers: new Map(),
    path: null, kind: null, mode: 'visual', dev: 'desktop', zoom: 1,
    doc: null, doctype: '<!DOCTYPE html>', eid: 0,
    css: null, hide: null,                // modelo de estilos del editor
    live: null, sel: null, selEid: null,
    undo: [], redo: [], typing: false,
    cm: null, cmPath: null,
    scripts: true, showHidden: false, outline: false,
    clip: null, pendingFind: null, where: 'after', multi: [], tabs: []
  };

  /* ================================================================
     service worker: sirve la carpeta en /site/
     ================================================================ */
  if (!('serviceWorker' in navigator) || !window.showDirectoryPicker) {
    $('#err').textContent = 'Abrí el editor con "Abrir editor.bat" y usá Google Chrome o Microsoft Edge.';
    $('#pick').disabled = true;
  } else {
    navigator.serviceWorker.register('sw.js').catch(e => { $('#err').textContent = 'No se pudo preparar la vista previa: ' + e.message; });
    navigator.serviceWorker.addEventListener('message', async e => {
      if (!e.data || e.data.type !== 'file') return;
      const port = e.ports[0];
      try { port.postMessage(await provide(e.data.path, e.data.edit)); } catch { port.postMessage({ status: 404 }); }
    });
  }
  async function provide(path, edit) {
    const type = MIME[ext(path)] || 'application/octet-stream';
    const cur = path === S.path && S.kind === 'html' && S.doc;
    if (cur && edit) return { status: 200, type, body: liveHTML() };
    if (cur) return { status: 200, type, body: serialize() };
    const b = S.buffers.get(path);
    if (b) return { status: 200, type: type + (/^text|json|svg/.test(type) ? '; charset=utf-8' : ''), body: b.text };
    const h = S.files.get(path) || await findHandle(path);
    if (!h) return { status: 404 };
    return { status: 200, type, body: await (await h.getFile()).arrayBuffer() };
  }

  /* ================================================================
     carpeta, archivos y borradores
     ================================================================ */
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('editor-web', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = rej; });
  async function kv(k, v, del) {
    const db = await idb();
    return new Promise(res => {
      const tx = db.transaction('kv', v === undefined && !del ? 'readonly' : 'readwrite'), st = tx.objectStore('kv');
      const r = del ? st.delete(k) : v === undefined ? st.get(k) : st.put(v, k);
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    });
  }
  (async () => { const h = await kv('root').catch(() => null); if (h) { const b = $('#resume'); b.textContent = 'Seguir con "' + h.name + '"'; b.classList.remove('hidden'); } })();
  $('#resume').onclick = async () => {
    const h = await kv('root');
    if (h && (await h.requestPermission({ mode: 'readwrite' })) === 'granted') openRoot(h);
    else $('#err').textContent = 'No se pudo usar esa carpeta. Elegila de nuevo.';
  };
  $('#pick').onclick = async () => {
    try { openRoot(await showDirectoryPicker({ mode: 'readwrite', id: 'editor-web' })); }
    catch (e) { if (e.name !== 'AbortError') $('#err').textContent = 'No se pudo abrir: ' + e.message; }
  };

  async function openRoot(h) {
    await navigator.serviceWorker.ready;
    S.root = h; await kv('root', h);
    $('#folderName').textContent = h.name;
    $('#start').classList.add('hidden');
    await scan();
    await offerDraft();
    const first = S.files.has('index.html') ? 'index.html' : [...S.files.keys()].find(p => ext(p) === 'html');
    if (first) openFile(first); else { layout('empty'); $('#emptyView').classList.remove('hidden'); }
  }
  async function scan() {
    S.files.clear();
    async function walk(dir, prefix) {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'directory') { if (!SKIP_DIRS.includes(name) && !name.startsWith('.')) await walk(h, prefix + name + '/'); }
        else S.files.set(prefix + name, h);
      }
    }
    await walk(S.root, '');
    renderFiles(); renderAssets();
  }
  async function dirHandle(path, create) {
    let d = S.root;
    for (const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create: !!create });
    return d;
  }
  async function findHandle(path) {
    try { const d = await dirHandle(dirOf(path)); return await d.getFileHandle(path.split('/').pop()); } catch { return null; }
  }
  async function readText(path) { const h = S.files.get(path) || await findHandle(path); return (await h.getFile()).text(); }
  async function readBytes(path) { const h = S.files.get(path) || await findHandle(path); return new Uint8Array(await (await h.getFile()).arrayBuffer()); }
  async function writeFile(path, data, track = true) {
    const d = await dirHandle(dirOf(path), true);
    const fh = await d.getFileHandle(path.split('/').pop(), { create: true });
    const w = await fh.createWritable(); await w.write(data); await w.close();
    if (track && !path.startsWith('respaldos/')) S.files.set(path, fh);
  }
  async function removeFile(path) { const d = await dirHandle(dirOf(path)); await d.removeEntry(path.split('/').pop()); S.files.delete(path); S.buffers.delete(path); }

  // borradores automáticos (por si se cierra sin guardar)
  const draftKey = () => 'draft:' + (S.root ? S.root.name : '');
  setInterval(async () => {
    if (!S.root) return;
    const d = {};
    for (const [p, b] of S.buffers) if (b.dirty) d[p] = (p === S.path && S.kind === 'html' && S.doc) ? serialize() : b.text;
    if (Object.keys(d).length) await kv(draftKey(), { at: Date.now(), files: d });
  }, 4000);
  async function offerDraft() {
    const d = await kv(draftKey());
    if (!d || !d.files || !Object.keys(d.files).length) return;
    const when = new Date(d.at).toLocaleString('es-AR');
    const ok = await ask('Cambios sin guardar', `<p>La última vez quedaron cambios sin guardar (${esc(when)}) en: <b>${Object.keys(d.files).map(esc).join(', ')}</b>.</p><p class="note">Si los recuperás, aparecen como cambios pendientes y podés revisarlos antes de guardar.</p>`, 'Recuperar', 'Descartar');
    if (ok) { for (const [p, t] of Object.entries(d.files)) S.buffers.set(p, { text: t, dirty: true }); updateStatus(); renderFiles(); toast('Cambios recuperados. Revisalos y tocá Guardar.'); }
    else await kv(draftKey(), undefined, true);
  }

  /* ================================================================
     árbol de archivos
     ================================================================ */
  const openDirs = new Set(['']);
  function renderFiles() {
    renderTabs && renderTabs();
    const tree = {};
    [...S.files.keys()].sort((a, b) => a.localeCompare(b)).forEach(p => {
      let node = tree; const parts = p.split('/');
      parts.slice(0, -1).forEach(d => { node[d + '/'] = node[d + '/'] || {}; node = node[d + '/']; });
      node[parts[parts.length - 1]] = p;
    });
    const box = $('#fileTree'); box.innerHTML = '';
    const icon = p => { const e = ext(p); if (e === 'html' || e === 'htm') return ['html', '<>'];
      if (e === 'css') return ['css', '#']; if (e === 'js' || e === 'mjs') return ['js', 'JS']; if (IMG_EXT.includes(e)) return ['img', '▣']; return ['', '·']; };
    function build(node, parent, prefix) {
      Object.keys(node).sort((a, b) => (b.endsWith('/') - a.endsWith('/')) || a.localeCompare(b)).forEach(k => {
        if (k.endsWith('/')) {
          const full = prefix + k, open = openDirs.has(full);
          const d = document.createElement('div'); d.className = 'dir' + (open ? '' : ' closed');
          const b = document.createElement('button'); b.className = 'item';
          b.innerHTML = `<span class="ic">${open ? '▾' : '▸'}</span>${esc(k.slice(0, -1))}`;
          b.onclick = () => { open ? openDirs.delete(full) : openDirs.add(full); renderFiles(); };
          const kids = document.createElement('div'); kids.className = 'kids';
          d.append(b, kids); parent.appendChild(d); build(node[k], kids, full);
        } else {
          const p = node[k], [cls, ic] = icon(p), dirty = S.buffers.get(p)?.dirty;
          const b = document.createElement('button'); b.className = 'item'; b.dataset.path = p; b.title = p;
          b.innerHTML = `<span class="ic ${cls}">${ic}</span>${esc(k)}${dirty ? ' •' : ''}`;
          if (p === S.path) b.classList.add('on');
          b.onclick = () => openFile(p);
          b.oncontextmenu = e => { e.preventDefault(); fileMenu(p, e.clientX, e.clientY); };
          parent.appendChild(b);
        }
      });
    }
    build(tree, box, '');
  }
  $('#refreshFiles').onclick = scan;

  function fileMenu(p, x, y) {
    const items = [['Abrir', () => openFile(p)], ['Renombrar…', () => renameFile(p)], ['Duplicar', () => duplicateFile(p)]];
    if (ext(p) === 'html') items.push(['Nueva página basada en esta…', () => newPage(p)]);
    items.push('-', ['Borrar…', () => deleteFile(p), 'danger']);
    showCtx(items, x, y);
  }
  async function renameFile(p) {
    const nn = prompt('Nuevo nombre para ' + p, p.split('/').pop()); if (!nn || nn === p.split('/').pop()) return;
    const np = dirOf(p) + nn.replace(/[\\/:*?"<>|]/g, '-');
    if (S.files.has(np)) { toast('Ya existe un archivo con ese nombre.'); return; }
    const data = S.buffers.has(p) ? S.buffers.get(p).text : await readBytes(p);
    await writeFile(np, data); await removeFile(p);
    if (S.path === p) S.path = np;
    renderFiles(); renderAssets(); toast('Renombrado. Ojo: si otras páginas lo usaban con el nombre viejo, hay que actualizar esos links.', 5000);
  }
  async function duplicateFile(p) {
    const base = p.replace(/(\.[^./]+)$/, ''), e = p.slice(base.length);
    let n = 2, np; do { np = `${base}-copia${n > 2 ? '-' + (n - 1) : ''}${e}`; n++; } while (S.files.has(np));
    await writeFile(np, S.buffers.has(p) ? S.buffers.get(p).text : await readBytes(p));
    renderFiles(); renderAssets(); toast('Copia creada: ' + np);
  }
  async function deleteFile(p) {
    if (!confirm('¿Borrar ' + p + '?\nSe guarda una copia en respaldos/borrados por las dudas.')) return;
    await writeFile('respaldos/borrados/' + stamp() + '/' + p, await readBytes(p), false);
    await removeFile(p);
    if (S.path === p) { S.path = null; S.doc = null; layout('empty'); $('#emptyView').classList.remove('hidden'); }
    renderFiles(); renderAssets(); toast('Archivo borrado (copia en respaldos/borrados).');
  }

  function renderTabs() {
    const bar = $('#filetabs'); if (!bar) return; bar.innerHTML = '';
    S.tabs = S.tabs.filter(p => S.files.has(p));
    S.tabs.forEach(p => {
      const t = document.createElement('div'); t.className = 'ftab' + (p === S.path ? ' on' : '');
      t.innerHTML = `<button class="fname" title="${esc(p)}">${esc(p.split('/').pop())}${S.buffers.get(p)?.dirty ? ' •' : ''}</button><button class="fx" title="Cerrar" aria-label="Cerrar ${esc(p)}">×</button>`;
      t.querySelector('.fname').onclick = () => p !== S.path && openFile(p);
      t.querySelector('.fx').onclick = () => { S.tabs = S.tabs.filter(x => x !== p); if (p === S.path) { const n = S.tabs[S.tabs.length - 1]; if (n) openFile(n); } renderTabs(); };
      bar.appendChild(t);
    });
  }
  /* ================================================================
     abrir archivos y modos
     ================================================================ */
  async function openFile(path) {
    if (S.kind === 'html' && S.doc) commitHTML();
    hideRte(); hideCtx();
    S.path = path; S.sel = null; S.selEid = null;
    if (!S.tabs.includes(path)) { S.tabs.push(path); if (S.tabs.length > 8) S.tabs.shift(); }
    renderTabs();
    const e = ext(path);
    S.kind = (e === 'html' || e === 'htm') ? 'html' : (IMG_EXT.includes(e) && e !== 'svg') ? 'image' : TEXT_EXT.includes(e) ? 'text' : 'other';
    $('#fileName').textContent = path;
    $$('#fileTree .item').forEach(b => b.classList.toggle('on', b.dataset.path === path));
    $('#emptyView').classList.add('hidden');
    S.undo = []; S.redo = []; updateUndo();
    if (S.kind === 'html') {
      if (!S.buffers.has(path)) S.buffers.set(path, { text: await readText(path), dirty: false });
      parseDoc(S.buffers.get(path).text);
      setMode(S.mode === 'code' ? 'code' : S.mode);
    } else if (S.kind === 'text') {
      if (!S.buffers.has(path)) S.buffers.set(path, { text: await readText(path), dirty: false });
      setMode('code');
    } else if (S.kind === 'image') showImage(path);
    else { layout('empty'); $('#emptyView').classList.remove('hidden'); $('#emptyView p').textContent = 'Este tipo de archivo no se puede editar acá.'; }
    renderPage(); clearSel(); renderAssetsHint();
  }
  const previewable = () => S.kind === 'text' && ['css', 'js'].includes(ext(S.path)) && S.files.has('index.html');
  function layout(which) {
    $('#codeWrap').classList.toggle('hidden', which !== 'code');
    $('#previewWrap').classList.toggle('hidden', !(which === 'visual' || which === 'try' || (which === 'code' && (S.kind === 'html' || previewable()))));
    $('#imageView').classList.toggle('hidden', which !== 'image');
    $$('#modeSeg button').forEach(b => { b.disabled = S.kind !== 'html' && b.dataset.mode !== 'code'; b.setAttribute('aria-pressed', b.dataset.mode === which); });
    updateDevbar();
  }
  function setMode(m) {
    if (S.kind === 'html') {
      if (m === 'code' && S.mode !== 'code') commitHTML();
      if (m !== 'code' && S.mode === 'code' && S.cmPath === S.path && S.cm) parseDoc(S.cm.state.doc.toString());
      S.mode = m;
    }
    hideRte(); hideCtx();
    if (m === 'code' || S.kind === 'text') { layout('code'); openCode(); if (S.kind === 'html' || previewable()) reloadPreview(); }
    else { layout(m); reloadPreview(); }
    $('#hint').textContent = S.kind === 'html' && S.mode === 'visual'
      ? 'Clic: elegir · Doble clic en imagen: reemplazar · Clic derecho: más opciones · ? : atajos'
      : S.mode === 'try' ? 'Modo Probar: usá la web como un visitante. Volvé a Visual para editar.'
      : 'Los cambios del código se ven en la vista previa al instante · Ctrl+F: buscar en el archivo';
    clearSel();
  }
  $$('#modeSeg button').forEach(b => b.onclick = () => { if (S.kind === 'html') setMode(b.dataset.mode); });

  /* ================================================================
     documento html y modelo de estilos del editor
     ================================================================ */
  function parseDoc(text) {
    S.doc = new DOMParser().parseFromString(text, 'text/html');
    S.eid = 0; S.doc.documentElement.querySelectorAll('*').forEach(el => el.setAttribute('data-eid', ++S.eid));
    S.doctype = /^\s*<!doctype[^>]*>/i.exec(text)?.[0] || '<!DOCTYPE html>';
    readEdCss();
  }
  function serialize(keepIds) {
    const d = S.doc.documentElement.cloneNode(true);
    if (!keepIds) { d.removeAttribute('data-eid'); d.querySelectorAll('[data-eid]').forEach(el => el.removeAttribute('data-eid')); }
    return S.doctype + '\n' + d.outerHTML + '\n';
  }
  function commitHTML() { if (S.doc && S.kind === 'html') { const b = S.buffers.get(S.path); if (b && b.dirty) b.text = serialize(); } }

  function readEdCss() {
    S.css = { desktop: {}, tablet: {}, mobile: {} }; S.hide = { desktop: new Set(), tablet: new Set(), mobile: new Set() };
    const st = S.doc.getElementById('editor-estilos'); if (!st) return;
    const sheet = new CSSStyleSheet();
    try { sheet.replaceSync(st.textContent); } catch { return; }
    const norm = s => s.replace(/\s+/g, ' ').trim();
    const take = (rules, dev, hideDev) => [...rules].forEach(r => {
      if (!(r instanceof CSSStyleRule)) return;
      const m = r.selectorText.match(/\[data-ed="([^"]+)"\](:hover)?/); if (!m) return;
      const id = m[1] + (m[2] ? ':hover' : '');
      if (hideDev) { if (!m[2]) S.hide[hideDev].add(id); return; }
      const o = S.css[dev][id] = S.css[dev][id] || {};
      for (const p of r.style) o[p] = r.style.getPropertyValue(p);
    });
    [...sheet.cssRules].forEach(r => {
      if (r instanceof CSSStyleRule) return take([r], 'desktop');
      if (r instanceof CSSMediaRule) {
        const mt = norm(r.media.mediaText);
        for (const d of DEVS) {
          if (DEV[d].media && norm(DEV[d].media) === mt) return take(r.cssRules, d);
          if (norm(DEV[d].only) === mt) return take(r.cssRules, null, d);
        }
      }
    });
  }
  function edCssText() {
    const exists = id => S.doc.querySelector(`[data-ed="${id.split(':')[0]}"]`);
    const sel = id => { const [b, st] = id.split(':'); return `[data-ed="${b}"]${st ? ':' + st : ''}`; };
    const block = (dev) => Object.entries(S.css[dev]).filter(([id, o]) => exists(id) && Object.keys(o).length)
      .sort((a, b) => a[0].includes(':') - b[0].includes(':'))
      .map(([id, o]) => `${sel(id)}{${Object.entries(o).map(([p, v]) => `${p}:${v} !important`).join(';')}}`).join('\n');
    let out = '/* Estilos del editor web (se generan solos) */\n' + block('desktop');
    ['tablet', 'mobile'].forEach(d => { const b = block(d); if (b) out += `\n@media ${DEV[d].media}{\n${b}\n}`; });
    DEVS.forEach(d => { const ids = [...S.hide[d]].filter(exists); if (ids.length) out += `\n@media ${DEV[d].only}{\n${ids.map(id => `[data-ed="${id}"]`).join(',')}{display:none !important}\n}`; });
    return out;
  }
  function writeEdCss() {
    const txt = edCssText();
    let st = S.doc.getElementById('editor-estilos');
    if (!st) { st = S.doc.createElement('style'); st.id = 'editor-estilos'; st.setAttribute('data-eid', ++S.eid); S.doc.head.appendChild(st); }
    st.textContent = '\n' + txt + '\n';
    if (S.live) { let ls = S.live.getElementById('editor-estilos'); if (!ls) { ls = S.live.createElement('style'); ls.id = 'editor-estilos'; S.live.head.appendChild(ls); } ls.textContent = st.textContent; }
    markDirty();
  }
  function edId(el) { // id estable del editor para un elemento (vivo + fuente)
    let id = el.getAttribute('data-ed');
    if (!id) { id = uid(); el.setAttribute('data-ed', id); const s = srcOf(el); s && s.setAttribute('data-ed', id); }
    return id;
  }
  function setStyle(el, prop, val, state) {
    const id = edId(el) + (state ? ':' + state : ''), o = S.css[S.dev][id] = S.css[S.dev][id] || {};
    if (val === '' || val == null) delete o[prop]; else o[prop] = val;
    writeEdCss(); positionLabel();
  }
  const ownStyle = (el, prop, state) => { const id = el.getAttribute('data-ed'); const k = id && (id + (state ? ':' + state : '')); return k && S.css[S.dev][k] ? S.css[S.dev][k][prop] || '' : ''; };
  function cloneEdIds(node) { // al duplicar o pegar: ids nuevos con los mismos estilos
    [node, ...node.querySelectorAll('[data-ed]')].forEach(x => {
      const old = x.getAttribute && x.getAttribute('data-ed'); if (!old) return;
      const nid = uid(); x.setAttribute('data-ed', nid);
      DEVS.forEach(d => { if (S.css[d][old]) S.css[d][nid] = { ...S.css[d][old] }; if (S.css[d][old + ':hover']) S.css[d][nid + ':hover'] = { ...S.css[d][old + ':hover'] }; if (S.hide[d].has(old)) S.hide[d].add(nid); });
    });
  }

  function liveHTML() {
    const d = S.doc.documentElement.cloneNode(true);
    const head = d.querySelector('head');
    if (!S.scripts) d.querySelectorAll('script').forEach(s => s.remove());
    head.insertAdjacentHTML('afterbegin', '<script>window.MC_EDIT=true;window.EDITOR_WEB=true<\/script>');
    head.insertAdjacentHTML('beforeend', `<style id="__ed">
      [data-ed-hover]{outline:1px dashed #E2541E!important;outline-offset:2px}
      [data-ed-sel]{outline:2px solid #E2541E!important;outline-offset:2px}
      [contenteditable=true]{cursor:text}
      [contenteditable=true],img[data-eid],a[data-eid],[data-eid]>span{pointer-events:auto!important}
      html.ed-anim-on [data-ed-anim]:not(.ed-in){opacity:1!important;transform:none!important}
      #__ed_lbl{position:fixed;z-index:2147483646;pointer-events:none;background:#E2541E;color:#000;font:600 11px/1 system-ui,sans-serif;padding:3px 6px;white-space:nowrap;display:none}
      #__ed_drop{position:fixed;z-index:2147483646;pointer-events:none;background:#E2541E;display:none}
      #__ed_drop.box{background:rgba(226,84,30,.15);outline:2px dashed #E2541E}
      #__ed_h{position:fixed;z-index:2147483646;pointer-events:none;display:none}
      #__ed_h .mv{position:absolute;right:-2px;top:-26px;width:24px;height:22px;border:0;background:#E2541E;color:#000;font:14px/22px system-ui;cursor:grab;pointer-events:auto;padding:0}
      #__ed_h i{position:absolute;background:#fff;border:2px solid #E2541E;pointer-events:auto;box-sizing:border-box}
      #__ed_h .rw{right:-6px;top:50%;width:10px;height:26px;margin-top:-13px;cursor:ew-resize}
      #__ed_h .rh{bottom:-6px;left:50%;width:26px;height:10px;margin-left:-13px;cursor:ns-resize}
      #__ed_h .rc{right:-7px;bottom:-7px;width:12px;height:12px;cursor:nwse-resize}
      ${S.showHidden ? '[hidden]{display:block!important}' : ''}
      ${S.outline ? 'body *{outline:1px dashed rgba(127,127,127,.45)}' : ''}
    </style>`);
    return S.doctype + '\n' + d.outerHTML;
  }
  const srcOf = el => el && el.getAttribute && S.doc && S.doc.querySelector(`[data-eid="${el.getAttribute('data-eid')}"]`);
  const liveById = id => S.live && S.live.querySelector(`[data-eid="${id}"]`);

  function markDirty() { const b = S.buffers.get(S.path); if (b && !b.dirty) { b.dirty = true; renderFiles(); } updateStatus(); scheduleAudit(); }
  function updateStatus() {
    const any = [...S.buffers.values()].some(b => b.dirty);
    const st = $('#status');
    st.textContent = any ? 'Cambios sin guardar' : (st.dataset.saved ? 'Todo guardado' : 'Sin cambios');
    st.className = 'status ' + (any ? 'dirty' : st.dataset.saved ? 'saved' : '');
    $('#save').disabled = !any;
  }
  addEventListener('beforeunload', e => { if ([...S.buffers.values()].some(b => b.dirty)) { e.preventDefault(); e.returnValue = ''; } });

  /* ================================================================
     historial
     ================================================================ */
  function snap() { if (!S.doc) return; S.undo.push(serialize(true)); if (S.undo.length > 80) S.undo.shift(); S.redo = []; updateUndo(); }
  function restore(from, to) {
    if (!from.length) return;
    to.push(serialize(true));
    S.doc = new DOMParser().parseFromString(from.pop(), 'text/html');
    S.eid = Math.max(0, ...[...S.doc.querySelectorAll('[data-eid]')].map(e => +e.getAttribute('data-eid')));
    readEdCss(); markDirty(); reloadPreview(); updateUndo(); renderPage();
  }
  function updateUndo() { $('#undo').disabled = !S.undo.length; $('#redo').disabled = !S.redo.length; }
  $('#undo').onclick = () => S.mode === 'code' ? S.cm && window.CM && S.cm.focus() : restore(S.undo, S.redo);
  $('#redo').onclick = () => S.mode === 'code' ? S.cm && S.cm.focus() : restore(S.redo, S.undo);

  /* ================================================================
     vista previa
     ================================================================ */
  const frame = $('#frame');
  let keep = null;
  function reloadPreview() {
    const W = frame.contentWindow;
    try { if (S.live && W) keep = { y: W.scrollY, tab: W.MC && W.MC.current ? W.MC.current() : null }; } catch { keep = null; }
    const target = S.kind === 'html' ? S.path : 'index.html';
    const editing = S.kind === 'html' && S.mode === 'visual';
    const asEdit = S.kind === 'html' && S.mode !== 'try';
    S.live = null; hideRte();
    frame.onload = () => setupLive(editing);
    frame.src = '/site/' + target.split('/').map(encodeURIComponent).join('/') + '?' + (asEdit ? '__edit=1&' : '') + 't=' + Date.now();
  }
  function applyFrameSize() {
    const cw = +$('#customW').value;
    $('#frameHolder').style.width = cw >= 280 ? cw + 'px' : DEV[S.dev].width;
    $('#frameHolder').style.zoom = S.zoom;
  }
  $$('#devSeg button').forEach(b => b.onclick = () => {
    S.dev = b.dataset.dev; $$('#devSeg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    applyFrameSize(); updateDevbar(); if (S.sel) renderStyle();
  });
  $('#zoom').onchange = e => { S.zoom = +e.target.value; applyFrameSize(); positionLabel(); };
  $('#customW').oninput = () => applyFrameSize();
  function updateDevbar() {
    const show = S.kind === 'html' && S.mode === 'visual' && S.dev !== 'desktop';
    $('#devbar').classList.toggle('hidden', !show);
    if (show) $('#devbar').textContent = `Estás editando para ${DEV[S.dev].name}: los cambios de estilo se aplican solo en pantallas ${S.dev === 'tablet' ? 'de hasta 860 px' : 'de hasta 480 px'}. Los textos e imágenes cambian en todas.`;
  }
  $('#optScripts').onchange = e => { S.scripts = e.target.checked; if (S.kind === 'html') reloadPreview(); };
  $('#optHidden').onchange = e => { S.showHidden = e.target.checked; if (S.kind === 'html') reloadPreview(); };
  $('#optOutline').onchange = e => { S.outline = e.target.checked; if (S.kind === 'html') reloadPreview(); };

  const TEXT_TAGS = /^(H[1-6]|P|SPAN|A|LI|DT|DD|FIGCAPTION|BLOCKQUOTE|CITE|STRONG|EM|B|I|U|S|SMALL|LABEL|TD|TH|CAPTION|DIV|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|MAIN|NAV|Q|TIME|SUP|SUB|MARK|ADDRESS|SUMMARY|LEGEND)$/;
  const hasOwnText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());

  function setupLive(editing) {
    S.live = frame.contentDocument;
    const L = S.live, W = frame.contentWindow;
    if (keep) { try { if (keep.tab && W.MC) W.MC.show(keep.tab); W.scrollTo(0, keep.y); } catch {} keep = null; }
    renderLayers();
    if (!editing) { scheduleAudit(); return; }
    L.documentElement.insertAdjacentHTML('beforeend', '<div id="__ed_lbl"></div><div id="__ed_drop"></div><div id="__ed_h"><button class="mv" title="Arrastrá para mover">✥</button><i class="rw" title="Ancho"></i><i class="rh" title="Alto"></i><i class="rc" title="Ancho y alto"></i></div>');
    setupHandles(L);
    L.querySelectorAll('[data-eid]').forEach(el => {
      if (el.closest('script,style,svg,button,select,textarea,[role=tablist],iframe')) return;
      if (hasOwnText(el) && TEXT_TAGS.test(el.tagName)) {
        el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false');
        el.querySelectorAll('[data-eid]').forEach(c => { if (!hasOwnText(c) && c.tagName !== 'BR') c.setAttribute('contenteditable', 'false'); });
      }
    });
    let hov = null;
    L.addEventListener('mouseover', e => {
      const t = e.target.closest && e.target.closest('[data-eid]'); if (t === hov) return;
      if (hov) hov.removeAttribute('data-ed-hover'); hov = t; if (t && t !== L.body) t.setAttribute('data-ed-hover', '');
    });
    L.addEventListener('mouseleave', () => { if (hov) hov.removeAttribute('data-ed-hover'); hov = null; });
    L.addEventListener('click', e => {
      if (e.target.closest('a')) e.preventDefault();
      if (e.target.closest('form')) e.preventDefault();
      hideCtx();
      const t = e.target.closest('[data-eid]'); if (t) (e.shiftKey && S.sel ? toggleMulti(t) : select(t));
    }, true);
    L.addEventListener('submit', e => e.preventDefault(), true);
    L.addEventListener('dblclick', e => { const img = e.target.closest('img[data-eid]'); if (img) replaceImageFromDisk(img); });
    L.addEventListener('focusin', e => { if (e.target.closest && e.target.closest('[contenteditable=true]')) S.typing = false; });
    L.addEventListener('input', e => {
      const el = e.target.closest && e.target.closest('[contenteditable=true]'); if (!el) return;
      if (!S.typing) { snap(); S.typing = true; }
      syncText(el);
    });
    L.addEventListener('keydown', e => {
      const inEdit = e.target.closest && e.target.closest('[contenteditable=true]');
      if (e.key === 'Enter' && inEdit) { e.preventDefault(); if (e.shiftKey) L.execCommand('insertLineBreak'); }
      shortcuts(e, !!inEdit);
    });
    L.addEventListener('paste', e => {
      if (!(e.target.closest && e.target.closest('[contenteditable=true]'))) return;
      e.preventDefault(); L.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    L.addEventListener('selectionchange', () => updateRte());
    L.addEventListener('contextmenu', e => {
      const t = e.target.closest('[data-eid]'); if (!t) return;
      e.preventDefault(); select(t);
      const r = frame.getBoundingClientRect();
      elementMenu(r.left + e.clientX * S.zoom, r.top + e.clientY * S.zoom);
    });
    W.addEventListener('scroll', () => { positionLabel(); updateRte(); hideCtx(); }, { passive: true });
    W.addEventListener('resize', positionLabel);
    // soltar bloques e imágenes arrastrados desde los paneles
    L.addEventListener('dragover', e => { if (!dragKind) return; e.preventDefault(); showDrop(dropTarget(e)); });
    L.addEventListener('dragleave', e => { if (e.target === L.documentElement) hideDrop(); });
    L.addEventListener('drop', e => { if (!dragKind) return; e.preventDefault(); const t = dropTarget(e); hideDrop(); doDrop(t); });
    if (S.selEid) { const el = liveById(S.selEid); if (el) select(el, true); }
    if (S.pendingFind) { findInLive(S.pendingFind); S.pendingFind = null; }
    scheduleAudit();
  }
  function cleanInner(el) {
    const c = el.cloneNode(true);
    const attrs = ['contenteditable', 'spellcheck', 'data-ed-hover', 'data-ed-sel'];
    [c, ...c.querySelectorAll('*')].forEach(x => attrs.forEach(a => x.removeAttribute(a)));
    return c.innerHTML;
  }
  function syncText(el) {
    const s = srcOf(el); if (s) { s.innerHTML = cleanInner(el); markDirty(); }
    if (S.sel === el) { const ta = $('#elText'); if (ta && document.activeElement !== ta) ta.value = plain(el); }
    positionLabel();
  }
  const plain = el => el.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  function findInLive(text) {
    const w = S.live.createTreeWalker(S.live.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) if (n.textContent.toLowerCase().includes(text.toLowerCase())) {
      const el = n.parentElement.closest('[data-eid]'); if (!el) continue;
      const panel = el.closest('[role=tabpanel][hidden]'); if (panel && frame.contentWindow.MC) frame.contentWindow.MC.show(panel.id);
      select(el); el.scrollIntoView({ block: 'center' }); return;
    }
  }

  /* ---------- etiqueta del elemento elegido ---------- */
  function positionLabel() {
    if (!S.live) return; const lbl = S.live.getElementById('__ed_lbl'); if (!lbl) return;
    if (!S.sel || !S.sel.isConnected) { lbl.style.display = 'none'; return; }
    const r = S.sel.getBoundingClientRect();
    lbl.textContent = `${describe(S.sel)} · ${Math.round(r.width)} × ${Math.round(r.height)}`;
    lbl.style.display = 'block';
    lbl.style.left = Math.max(0, r.left) + 'px';
    lbl.style.top = (r.top > 22 ? r.top - 20 : r.bottom + 4) + 'px';
    const h = S.live.getElementById('__ed_h');
    if (h) { const body = S.sel === S.live.body; h.style.display = body ? 'none' : 'block'; Object.assign(h.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }
  }
  function setupHandles(L) {
    const h = L.getElementById('__ed_h'); let mode = null, start = null;
    const W = L.defaultView;
    h.addEventListener('pointerdown', e => {
      if (!S.sel) return; e.preventDefault(); e.stopPropagation();
      const t = e.target; mode = t.classList.contains('mv') ? 'move' : t.classList.contains('rw') ? 'w' : t.classList.contains('rh') ? 'h' : t.classList.contains('rc') ? 'wh' : null;
      if (!mode) return;
      const r = S.sel.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
      t.setPointerCapture(e.pointerId);
      if (S.sel.isContentEditable) S.sel.blur();
      snap();
    });
    h.addEventListener('pointermove', e => {
      if (!mode) return;
      if (mode === 'move') {
        h.style.visibility = 'hidden'; const under = L.elementFromPoint(e.clientX, e.clientY); h.style.visibility = '';
        if (!under) return;
        if (S.sel.contains(under)) { hideDrop(); h._t = null; return; }
        const t = dropTarget({ target: under, clientY: e.clientY }); h._t = t; showDrop(t); return;
      }
      const dw = e.clientX - start.x, dh = e.clientY - start.y;
      if (mode.includes('w')) S.sel.style.setProperty('width', Math.max(20, Math.round(start.w + dw)) + 'px', 'important');
      if (mode.includes('h')) S.sel.style.setProperty('height', Math.max(10, Math.round(start.h + dh)) + 'px', 'important');
      positionLabel();
    });
    h.addEventListener('pointerup', e => {
      if (!mode) return; const m = mode; mode = null;
      if (m === 'move') {
        hideDrop(); const t = h._t; h._t = null; if (!t) { S.undo.pop(); updateUndo(); return; }
        const s = srcOf(S.sel), target = srcOf(t.el) || S.doc.body;
        if (s.contains(target)) return;
        if (t.pos === 'before') target.before(s); else if (t.pos === 'after') target.after(s); else target.append(s);
        markDirty(); reloadPreview(); toast('Elemento movido.'); return;
      }
      const el = S.sel, w = el.style.getPropertyValue('width'), hh = el.style.getPropertyValue('height');
      el.style.removeProperty('width'); el.style.removeProperty('height'); if (!el.getAttribute('style')) el.removeAttribute('style');
      if (m.includes('w') && w) setStyle(el, 'width', w); if (m.includes('h') && hh) setStyle(el, 'height', hh);
      renderStyle(); toast(`Tamaño cambiado para ${DEV[S.dev].name}.`);
    });
  }

  /* ---------- barra de formato de texto ---------- */
  const rte = $('#rte');
  function hideRte() { rte.classList.add('hidden'); }
  function updateRte() {
    if (!S.live || S.mode !== 'visual') return hideRte();
    const a = S.live.activeElement;
    const ed = a && a.closest && a.closest('[contenteditable=true]');
    if (!ed) return hideRte();
    const fr = frame.getBoundingClientRect(), wr = $('#previewWrap').getBoundingClientRect(), r = ed.getBoundingClientRect();
    rte.classList.remove('hidden');
    const x = fr.left - wr.left + r.left * S.zoom + $('#previewWrap').scrollLeft;
    let y = fr.top - wr.top + r.top * S.zoom - rte.offsetHeight - 8 + $('#previewWrap').scrollTop;
    if (y < 4) y = fr.top - wr.top + r.bottom * S.zoom + 8;
    rte.style.left = Math.max(4, Math.min(x, wr.width - rte.offsetWidth - 4)) + 'px';
    rte.style.top = y + 'px';
  }
  rte.querySelectorAll('button').forEach(b => {
    b.onmousedown = e => e.preventDefault();
    b.onclick = () => {
      const L = S.live; const ed = L.activeElement && L.activeElement.closest('[contenteditable=true]'); if (!ed) return;
      snap();
      if (b.dataset.cmd === 'link') {
        const url = prompt('¿A dónde lleva el link? (por ejemplo https://..., mailto:..., tel:...)', 'https://');
        if (!url) return; L.execCommand('createLink', false, url);
      } else L.execCommand(b.dataset.cmd);
      syncText(ed);
    };
  });

  /* ---------- arrastrar bloques e imágenes a la página ---------- */
  let dragKind = null, dragData = null;
  function dropTarget(e) {
    let t = e.target.closest && e.target.closest('[data-eid]');
    if (!t || t === S.live.documentElement) t = S.live.body;
    const r = t.getBoundingClientRect(), y = e.clientY;
    const container = /^(SECTION|DIV|MAIN|ARTICLE|ASIDE|HEADER|FOOTER|FIGURE|UL|OL|NAV|FORM|BODY)$/.test(t.tagName);
    let pos = y < r.top + r.height / 2 ? 'before' : 'after';
    if (t === S.live.body || (container && y > r.top + r.height * 0.25 && y < r.bottom - r.height * 0.25)) pos = 'inside';
    return { el: t, pos };
  }
  function showDrop({ el, pos }) {
    const d = S.live.getElementById('__ed_drop'); if (!d) return;
    const r = el.getBoundingClientRect();
    d.style.display = 'block';
    if (pos === 'inside') { d.className = 'box'; Object.assign(d.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }
    else { d.className = ''; Object.assign(d.style, { left: r.left + 'px', top: (pos === 'before' ? r.top - 2 : r.bottom - 1) + 'px', width: r.width + 'px', height: '3px' }); }
  }
  function hideDrop() { const d = S.live && S.live.getElementById('__ed_drop'); if (d) d.style.display = 'none'; }
  async function doDrop({ el, pos }) {
    const target = srcOf(el) || S.doc.body;
    if (dragKind === 'block') { const html = await dragData.html(); if (html) insertHTML(html, target, pos, dragData); }
    if (dragKind === 'asset') insertHTML(imageHTML(dragData), target, pos);
    dragKind = null; dragData = null;
  }

  /* ================================================================
     atajos de teclado
     ================================================================ */
  function shortcuts(e, inEdit) {
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (mod && k === 's') { e.preventDefault(); save(); return; }
    if (mod && e.shiftKey && k === 'f') { e.preventDefault(); openSearch(); return; }
    if (S.kind !== 'html' || S.mode !== 'visual') return;
    if (inEdit) { if (e.key === 'Escape') { S.live.activeElement.blur(); hideRte(); } return; }
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); restore(S.undo, S.redo); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); restore(S.redo, S.undo); }
    else if (mod && k === 'c' && S.sel) { e.preventDefault(); copyEl(); }
    else if (mod && k === 'x' && S.sel) { e.preventDefault(); copyEl(); removeEl(true); }
    else if (mod && k === 'v' && S.clip) { e.preventDefault(); pasteEl(); }
    else if (mod && k === 'd' && S.sel) { e.preventDefault(); dupEl(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); removeEl(); }
    else if (e.key === 'Escape') { clearSel(); hideCtx(); }
    else if (e.key === 'ArrowUp' && e.altKey && S.sel) { e.preventDefault(); moveEl(-1); }
    else if (e.key === 'ArrowDown' && e.altKey && S.sel) { e.preventDefault(); moveEl(1); }
    else if (e.key === '?' ) { e.preventDefault(); showKeys(); }
    else if (k === 'enter' && S.sel && S.sel.getAttribute('contenteditable') === 'true') { e.preventDefault(); S.sel.focus(); }
  }
  const isFormField = t => t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); save(); return; }
    if (mod && e.shiftKey && k === 'f') { e.preventDefault(); if (S.root) openSearch(); return; }
    if (e.key === 'Escape') { hideCtx(); closeModal(); closeMore(); }
    if (isFormField(e.target) || (e.target.closest && (e.target.closest('.cm-editor') || e.target.closest('.modal')))) return;
    shortcuts(e, false);
  });

  /* ================================================================
     selección y panel Elemento
     ================================================================ */
  const NAMES = { h1: 'Título 1', h2: 'Título 2', h3: 'Título 3', h4: 'Título 4', h5: 'Título 5', h6: 'Título 6', p: 'Párrafo', img: 'Imagen', a: 'Link',
    button: 'Botón', section: 'Sección', div: 'Bloque', span: 'Texto', figure: 'Figura', figcaption: 'Epígrafe', ul: 'Lista', ol: 'Lista numerada', li: 'Ítem',
    header: 'Encabezado', footer: 'Pie', main: 'Contenido', nav: 'Navegación', blockquote: 'Cita', video: 'Video', svg: 'Gráfico', canvas: 'Lienzo', body: 'Página',
    dl: 'Datos', dt: 'Dato', dd: 'Valor', i: 'Detalle', iframe: 'Contenido externo', form: 'Formulario', input: 'Campo', textarea: 'Campo de texto', hr: 'Separador',
    strong: 'Negrita', em: 'Cursiva', small: 'Texto chico', article: 'Artículo', aside: 'Lateral', label: 'Etiqueta', table: 'Tabla' };
  const describe = el => el.getAttribute('data-ed-name') || NAMES[el.tagName.toLowerCase()] || el.tagName.toLowerCase();

  function clearSel() {
    if (S.sel) S.sel.removeAttribute('data-ed-sel');
    S.multi.forEach(m => m.removeAttribute && m.removeAttribute('data-ed-sel')); S.multi = [];
    S.sel = null; S.selEid = null; positionLabel(); hideRte();
    const editing = S.kind === 'html' && S.mode === 'visual';
    $('#elBox').innerHTML = `<p class="note">${editing ? 'Hacé clic en algo de la página para editarlo. Con clic derecho tenés más opciones.' : S.kind === 'html' ? 'Pasá a modo Visual para elegir elementos.' : 'Abrí una página .html para editar sus elementos.'}</p>`;
    $('#styleBox').innerHTML = '<p class="note">Elegí un elemento para cambiar su estilo.</p>';
    $$('#layers .layer').forEach(l => l.classList.remove('on'));
    renderAssetsHint(); document.dispatchEvent(new Event('ed-select'));
  }
  function select(el, quiet) {
    if (!el || el === S.live.documentElement) return;
    if (S.sel) S.sel.removeAttribute('data-ed-sel');
    S.multi.forEach(m => m.removeAttribute('data-ed-sel'));
    S.sel = el; S.selEid = el.getAttribute('data-eid'); el.setAttribute('data-ed-sel', ''); S.multi = [el];
    S.typing = false;
    renderElement(); renderStyle(); positionLabel(); renderAssetsHint();
    document.dispatchEvent(new Event('ed-select'));
    $$('#layers .layer').forEach(l => l.classList.toggle('on', l.dataset.eid === S.selEid));
    if (!quiet) { openLayerPath(el); const ly = $(`#layers .layer[data-eid="${S.selEid}"]`); if (ly) ly.scrollIntoView({ block: 'nearest' }); }
  }
  function toggleMulti(el) {
    if (el.isContentEditable) el.blur();
    const i = S.multi.indexOf(el);
    if (i >= 0 && S.multi.length > 1) { S.multi.splice(i, 1); el.removeAttribute('data-ed-sel'); if (S.sel === el) { S.sel = S.multi[0]; S.selEid = S.sel.getAttribute('data-eid'); } }
    else if (i < 0) { S.multi.push(el); el.setAttribute('data-ed-sel', ''); }
    renderElement(); renderStyle(); positionLabel();
    toast(S.multi.length + ' elementos elegidos. Los cambios de Estilo se aplican a todos.');
  }
  function reselect() { const el = S.selEid && liveById(S.selEid); if (el) select(el, true); }

  function renderElement() {
    const el = S.sel, box = $('#elBox'); if (!el) return;
    const chain = []; let p = el; while (p && p.nodeType === 1 && p.tagName !== 'HTML') { chain.unshift(p); p = p.parentElement; }
    const tag = el.tagName;
    box.innerHTML = `
      <div class="crumbs" aria-label="Dónde está">${chain.slice(-5).map(c => `<button data-eid="${c.getAttribute('data-eid')}">${esc(describe(c))}</button>`).join('')}</div>
      <p class="tagname">${esc(describe(el))}</p>${S.multi.length > 1 ? `<p class="note">${S.multi.length} elementos elegidos (Shift + clic para sumar o sacar). Estilo y Borrar se aplican a todos.</p>` : '<p class="note">Shift + clic para elegir varios.</p>'}
      <div class="sec" id="elContent"></div>
      <div class="sec"><h3>Acciones</h3><div class="acts">
        <button class="btn sm" id="aParent" title="Elegir el elemento que lo contiene">Contenedor</button>
        <button class="btn sm" id="aUp" title="Alt + ↑">Subir</button>
        <button class="btn sm" id="aDown" title="Alt + ↓">Bajar</button>
        <button class="btn sm" id="aDup" title="Ctrl + D">Duplicar</button>
        <button class="btn sm" id="aCopy" title="Ctrl + C">Copiar</button>
        <button class="btn sm" id="aPaste" title="Ctrl + V" ${S.clip ? '' : 'disabled'}>Pegar después</button>
        <button class="btn sm" id="aWrap">Envolver en bloque</button>
        <button class="btn sm" id="aUnwrap" title="Saca el contenido y quita este contenedor">Desarmar</button>
        <button class="btn sm danger" id="aDel" title="Supr">Borrar</button>
      </div></div>
      <div class="sec"><h3>Avanzado</h3>
        <label class="field"><span>Nombre en Capas</span><input class="inp" id="aName" placeholder="${esc(NAMES[tag.toLowerCase()] || tag.toLowerCase())}"></label>
        <label class="field"><span>Clases</span><input class="inp" id="aClass"></label>
        <label class="field"><span>ID (sirve para links a esta parte: #id)</span><input class="inp" id="aId"></label>
        <div id="aAttrs"></div>
        <div class="acts"><button class="btn sm" id="aAddAttr">Agregar atributo</button><button class="btn sm" id="aCode">Ver y editar su código</button></div>
      </div>`;
    box.querySelectorAll('.crumbs button').forEach(b => b.onclick = () => { const t = liveById(b.dataset.eid); if (t) select(t); });
    const c = $('#elContent');
    if (tag === 'IMG') {
      c.innerHTML = `<h3>Imagen</h3><img class="thumb" alt="" src="${esc(el.currentSrc || el.src)}">
        <div class="acts"><button class="btn primary sm" id="iRep">Elegir de mi compu</button><button class="btn sm" id="iLib">Elegir de la web</button><button class="btn sm" id="iEdit">Editar imagen…</button></div>
        <label class="field"><span>Descripción (para Google y lectores de pantalla)</span><input class="inp" id="iAlt"></label>
        <label class="chk" style="margin-top:.5rem"><input type="checkbox" id="iLazy"> Cargar recién cuando se ve (más rápido)</label>
        <label class="field"><span>Archivo</span><input class="inp" id="iSrc"></label>`;
      $('#iRep').onclick = () => replaceImageFromDisk(el);
      $('#iEdit').onclick = () => { const p = srcToPath(srcOf(el).getAttribute('src')); if (!p || !S.files.has(p)) { toast('Esta imagen no es un archivo de la carpeta (no se puede editar).'); return; } window.EDX && EDX.editImage(p, el); };
      $('#iLib').onclick = () => { tab('left', 'assets'); toast('Tocá una imagen de la lista para usarla.'); };
      bindAttr($('#iAlt'), 'alt'); bindAttr($('#iSrc'), 'src');
      const lz = $('#iLazy'); lz.checked = el.getAttribute('loading') === 'lazy';
      lz.onchange = () => { snap(); setAttr(el, 'loading', lz.checked ? 'lazy' : null); };
    } else if (tag === 'IFRAME') {
      c.innerHTML = `<h3>Contenido externo</h3><label class="field"><span>Dirección (src)</span><input class="inp" id="fSrc"></label><label class="field"><span>Título (accesibilidad)</span><input class="inp" id="fTitle"></label>`;
      bindAttr($('#fSrc'), 'src'); bindAttr($('#fTitle'), 'title');
    } else if (isEditableText(el)) {
      const conv = /^(H[1-6]|P)$/.test(tag);
      c.innerHTML = `<h3>Texto</h3>
        ${conv ? `<label class="field"><span>Tipo de texto</span><select class="inp" id="tTag">${['H1', 'H2', 'H3', 'H4', 'P'].map(t => `<option value="${t}" ${t === tag ? 'selected' : ''}>${NAMES[t.toLowerCase()]}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>También podés escribir directo sobre la página</span><textarea class="inp" id="elText"></textarea></label>`;
      const ta = $('#elText'); ta.value = plain(el);
      ta.onfocus = () => snap();
      ta.oninput = () => { el.innerHTML = esc(ta.value).replace(/\n/g, '<br>'); syncText(el); };
      if (conv) $('#tTag').onchange = e => changeTag(el, e.target.value);
    } else {
      c.innerHTML = `<h3>Contenido</h3><p class="note">${el.children.length ? 'Tiene ' + el.children.length + ' elementos adentro. Hacé clic en uno para editarlo, o usá la pestaña Capas.' : 'Este elemento no tiene texto propio.'}</p>`;
    }
    const a = el.closest('a');
    if (a) linkFields(c, a);
    const form = el.closest('form');
    if (form) formFields(c, form);
    if (tag === 'IMG') c.insertAdjacentHTML('beforeend', '');
    bindAttr($('#aClass'), 'class'); bindAttr($('#aId'), 'id'); bindAttr($('#aName'), 'data-ed-name');
    const skip = ['class', 'id', 'style', 'src', 'alt', 'href', 'target', 'rel', 'data-eid', 'data-ed', 'data-ed-name', 'contenteditable', 'spellcheck', 'data-ed-sel', 'data-ed-hover', 'width', 'height', 'loading', 'data-ed-anim', 'title'];
    const extra = [...el.attributes].filter(x => !skip.includes(x.name));
    $('#aAttrs').innerHTML = extra.map(x => `<label class="field"><span>${esc(x.name)}</span><input class="inp" data-attr="${esc(x.name)}"></label>`).join('');
    $$('#aAttrs input').forEach(inp => bindAttr(inp, inp.dataset.attr));
    $('#aAddAttr').onclick = () => { const n = prompt('Nombre del atributo (por ejemplo title, aria-label, data-algo)'); if (!n || !/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(n)) return; snap(); setAttr(el, n, prompt('Valor') || ''); renderElement(); };
    $('#aParent').onclick = () => { const pp = el.parentElement && el.parentElement.closest('[data-eid]'); if (pp && pp.tagName !== 'HTML') select(pp); };
    $('#aUp').onclick = () => moveEl(-1); $('#aDown').onclick = () => moveEl(1);
    $('#aDup').onclick = dupEl; $('#aDel').onclick = () => removeEl();
    $('#aCopy').onclick = copyEl; $('#aPaste').onclick = pasteEl;
    $('#aWrap').onclick = wrapEl; $('#aUnwrap').onclick = unwrapEl;
    $('#aCode').onclick = elementCode;
  }
  const isEditableText = el => el.getAttribute('contenteditable') === 'true' || (el.closest('button,[role=tablist]') && hasOwnText(el) && [...el.children].every(c => c.tagName === 'BR'));

  function linkFields(c, a) {
    const pages = [...S.files.keys()].filter(p => ext(p) === 'html');
    const ids = [...S.doc.querySelectorAll('[id]')].map(x => x.id).filter(Boolean).slice(0, 80);
    const base = dirOf(S.path);
    c.insertAdjacentHTML('beforeend', `<div class="sec"><h3>Link</h3>
      <label class="field"><span>A dónde lleva</span><input class="inp" id="lHref"></label>
      <label class="field"><span>Elegir rápido</span><select class="inp" id="lPick"><option value="">—</option>
        <optgroup label="Páginas">${pages.map(p => `<option value="${esc(relPath(base, p))}">${esc(p)}</option>`).join('')}</optgroup>
        <optgroup label="Partes de esta página">${ids.map(i => `<option value="#${esc(i)}">#${esc(i)}</option>`).join('')}</optgroup>
        <optgroup label="Otros"><option value="__mail">Mail…</option><option value="__tel">Teléfono…</option><option value="__wa">WhatsApp…</option><option value="__web">Otra web…</option></optgroup>
      </select></label>
      <label class="chk" style="margin-top:.5rem"><input type="checkbox" id="lBlank"> Abrir en otra pestaña</label></div>`);
    const inp = $('#lHref'); inp.value = a.getAttribute('href') || '';
    inp.onfocus = () => snap();
    inp.oninput = () => setAttr(a, 'href', inp.value);
    $('#lPick').onchange = e => {
      let v = e.target.value; if (!v) return;
      if (v === '__mail') { const m = prompt('Mail'); if (!m) return; v = 'mailto:' + m.trim(); }
      if (v === '__tel') { const m = prompt('Teléfono con código de país (ej. +5493511234567)'); if (!m) return; v = 'tel:' + m.replace(/[^\d+]/g, ''); }
      if (v === '__wa') { const m = prompt('Número de WhatsApp con código de país, sin + (ej. 5493511234567)'); if (!m) return; const t = prompt('Mensaje inicial (opcional)', 'Hola!'); v = 'https://wa.me/' + m.replace(/\D/g, '') + (t ? '?text=' + encodeURIComponent(t) : ''); }
      if (v === '__web') { const m = prompt('Dirección web', 'https://'); if (!m) return; v = m.trim(); }
      snap(); inp.value = v; setAttr(a, 'href', v); e.target.value = '';
    };
    const bl = $('#lBlank'); bl.checked = a.getAttribute('target') === '_blank';
    bl.onchange = () => { snap(); setAttr(a, 'target', bl.checked ? '_blank' : null); setAttr(a, 'rel', bl.checked ? 'noopener' : null); };
  }
  function formFields(c, form) {
    const act = form.getAttribute('action') || '';
    const mail = (act.match(/formsubmit\.co\/(.+)$/) || act.match(/^mailto:(.+)$/) || [])[1] || '';
    const fsid = (act.match(/formspree\.io\/f\/(\w+)/) || [])[1] || '';
    c.insertAdjacentHTML('beforeend', `<div class="sec"><h3>Formulario</h3>
      <p class="note">${/formsubmit|formspree/.test(act) ? 'Los mensajes llegan por mail.' : 'Ahora abre el programa de mail del visitante. Poné tu mail para que lleguen directo.'}</p>
      <label class="field"><span>Recibir los mensajes en este mail (FormSubmit, gratis)</span><input class="inp" id="fmMail" placeholder="tu@mail.com"></label>
      <label class="field"><span>O tu código de Formspree (opcional)</span><input class="inp" id="fmSpree" placeholder="xyzabcd"></label>
      <label class="field"><span>Asunto del mail</span><input class="inp" id="fmSubj" placeholder="Nuevo mensaje desde la web"></label>
      <label class="field"><span>Página de gracias (opcional)</span><input class="inp" id="fmNext" placeholder="https://tuweb.com/gracias.html"></label>
      <div class="acts"><button class="btn primary sm" id="fmApply">Aplicar</button></div>
      <p class="note" style="margin-top:.4rem">Con FormSubmit, el primer mensaje te llega para confirmar tu mail.</p></div>`);
    const lf = liveFormOf(form);
    $('#fmMail').value = mail; $('#fmSpree').value = fsid;
    $('#fmSubj').value = form.querySelector('input[name=_subject]')?.value || '';
    $('#fmNext').value = form.querySelector('input[name=_next]')?.value || '';
    $('#fmApply').onclick = () => {
      const m = $('#fmMail').value.trim(), sp = $('#fmSpree').value.trim();
      if (!m && !sp) { toast('Poné un mail o un código de Formspree.'); return; }
      snap();
      const s = srcOf(form);
      const action = sp ? 'https://formspree.io/f/' + sp : 'https://formsubmit.co/' + m;
      [s, form].forEach(f => { f.setAttribute('action', action); f.setAttribute('method', 'POST'); f.removeAttribute('enctype'); });
      const hid = (name, val) => { [s, form].forEach(f => { let i = f.querySelector(`input[name="${name}"]`); if (!val) { i && i.remove(); return; } if (!i) { i = f.ownerDocument.createElement('input'); i.type = 'hidden'; i.name = name; if (f === s) i.setAttribute('data-eid', ++S.eid); f.prepend(i); } i.setAttribute('value', val); i.value = val; }); };
      hid('_subject', $('#fmSubj').value.trim()); hid('_next', $('#fmNext').value.trim()); hid('_template', sp ? '' : 'table'); hid('_captcha', sp ? '' : 'false');
      markDirty(); renderElement(); toast('Formulario listo: los mensajes llegan a tu mail.');
    };
  }
  const liveFormOf = f => f;
  function setAttr(el, name, val) {
    const s = srcOf(el);
    if (val === null || val === undefined) { el.removeAttribute(name); s && s.removeAttribute(name); }
    else { el.setAttribute(name, val); s && s.setAttribute(name, val); }
    markDirty();
  }
  function bindAttr(inp, name) {
    const el = S.sel, s = srcOf(el);
    inp.value = (s ? s.getAttribute(name) : el.getAttribute(name)) || '';
    inp.onfocus = () => snap();
    inp.oninput = () => {
      if (name === 'class') { s && (inp.value ? s.setAttribute('class', inp.value) : s.removeAttribute('class')); el.className = inp.value; el.setAttribute('data-ed-sel', ''); markDirty(); return; }
      setAttr(el, name, inp.value === '' && name !== 'alt' ? null : inp.value);
      if (name === 'data-ed-name') { renderLayers(); positionLabel(); }
    };
  }

  /* ---------- acciones sobre elementos ---------- */
  function renumber(node) { [node, ...node.querySelectorAll('*')].forEach(x => x.setAttribute('data-eid', ++S.eid)); }
  function stripIds(node) { const c = node.cloneNode(true); [c, ...c.querySelectorAll('[data-eid]')].forEach(x => x.removeAttribute('data-eid')); return c; }
  function removeEl(silent) {
    const el = S.sel; if (!el || el === S.live.body) return;
    const all = S.multi.length > 1 ? S.multi.slice() : [el];
    snap(); all.forEach(x => { const s = srcOf(x); s && s.remove(); x.remove(); }); clearSel(); markDirty(); renderLayers();
    if (!silent) toast('Elemento borrado. Ctrl+Z lo trae de vuelta.');
  }
  function dupEl() {
    const el = S.sel; if (!el || el === S.live.body) return; snap();
    const s = srcOf(el); const c = s.cloneNode(true); renumber(c); cloneEdIds(c); s.after(c);
    S.selEid = c.getAttribute('data-eid'); writeEdCss(); reloadPreview(); toast('Elemento duplicado.');
  }
  function copyEl() {
    const s = srcOf(S.sel); if (!s) return;
    const css = {}; [s, ...s.querySelectorAll('[data-ed]')].forEach(x => { const id = x.getAttribute('data-ed'); if (id) css[id] = DEVS.map(d => [S.css[d][id], S.hide[d].has(id)]); });
    S.clip = { html: stripIds(s).outerHTML, css };
    toast('Copiado. Elegí otro lugar y pegá con Ctrl+V.');
    if (S.sel) renderElement();
  }
  function pasteEl() {
    if (!S.clip) return;
    const target = S.sel ? srcOf(S.sel) : null;
    Object.entries(S.clip.css).forEach(([id, arr]) => DEVS.forEach((d, i) => { if (arr[i][0] && !S.css[d][id]) S.css[d][id] = { ...arr[i][0] }; if (arr[i][1]) S.hide[d].add(id); }));
    insertHTML(S.clip.html, target, 'after', null, true);
  }
  function moveEl(dir) {
    const el = S.sel; if (!el) return; const s = srcOf(el);
    const sib = dir < 0 ? s.previousElementSibling : s.nextElementSibling; if (!sib) { toast('No se puede mover más para ese lado.'); return; }
    snap(); dir < 0 ? sib.before(s) : sib.after(s); markDirty(); reloadPreview();
  }
  function wrapEl() {
    const el = S.sel; if (!el || el === S.live.body) return; snap();
    const s = srcOf(el); const w = S.doc.createElement('div'); w.setAttribute('data-eid', ++S.eid);
    s.before(w); w.appendChild(s); S.selEid = w.getAttribute('data-eid'); markDirty(); reloadPreview();
    toast('Ahora está dentro de un bloque nuevo. Podés darle estilo al bloque (fondo, márgenes, columnas).');
  }
  function unwrapEl() {
    const el = S.sel; if (!el || el === S.live.body) return; const s = srcOf(el);
    if (!s.children.length) { toast('No tiene elementos adentro para sacar.'); return; }
    snap(); const first = s.firstElementChild; s.replaceWith(...s.childNodes);
    S.selEid = first.getAttribute('data-eid'); markDirty(); reloadPreview();
  }
  function changeTag(el, tag) {
    const s = srcOf(el); snap();
    const n = S.doc.createElement(tag.toLowerCase());
    [...s.attributes].forEach(a => n.setAttribute(a.name, a.value)); n.innerHTML = s.innerHTML;
    n.setAttribute('data-eid', ++S.eid); s.replaceWith(n); S.selEid = n.getAttribute('data-eid'); markDirty(); reloadPreview();
  }
  function elementCode() {
    const s = srcOf(S.sel);
    const box = $('#elContent');
    box.innerHTML = `<h3>Código del elemento</h3><textarea class="inp mono" id="elHtml" style="min-height:240px"></textarea>
      <div class="acts"><button class="btn primary sm" id="elHtmlApply">Aplicar</button><button class="btn sm" id="elHtmlCancel">Cancelar</button></div>`;
    $('#elHtml').value = stripIds(s).outerHTML;
    $('#elHtmlCancel').onclick = renderElement;
    $('#elHtmlApply').onclick = () => {
      const tpl = S.doc.createElement('template'); tpl.innerHTML = $('#elHtml').value.trim();
      const nodes = [...tpl.content.childNodes]; const first = tpl.content.firstElementChild;
      if (!first) { toast('El código no tiene un elemento válido.'); return; }
      snap(); nodes.forEach(n => n.nodeType === 1 && renumber(n)); s.replaceWith(...nodes);
      S.selEid = first.getAttribute('data-eid'); markDirty(); reloadPreview(); toast('Código aplicado.');
    };
  }
  function insertHTML(html, target, pos, block, keepEd) {
    const tpl = S.doc.createElement('template'); tpl.innerHTML = html.trim();
    const nodes = [...tpl.content.childNodes].filter(n => n.nodeType === 1 || n.textContent.trim());
    if (!nodes.length) return;
    snap();
    nodes.forEach(n => { if (n.nodeType === 1) { renumber(n); if (!keepEd) [n, ...n.querySelectorAll('[data-ed]')].forEach(x => x.removeAttribute('data-ed')); } });
    if (!target) {
      const vis = S.live && S.live.querySelector('[role=tabpanel]:not([hidden])');
      target = (vis && srcOf(vis)) || S.doc.querySelector('main') || S.doc.body; pos = 'inside';
    }
    if (target === S.doc.body && pos !== 'inside') pos = 'inside';
    if (pos === 'before') target.before(...nodes);
    else if (pos === 'inside') { const lastScript = target === S.doc.body ? [...target.children].find(c => c.tagName === 'SCRIPT') : null; lastScript ? lastScript.before(...nodes) : target.append(...nodes); }
    else target.after(...nodes);
    const first = nodes.find(n => n.nodeType === 1);
    if (first) S.selEid = first.getAttribute('data-eid');
    if (block && block.after) block.after(first);
    if (keepEd) writeEdCss(); else markDirty();
    reloadPreview(); renderLayers();
    toast(block && block.tip ? block.tip : 'Agregado. Podés editarlo directamente sobre la página.');
  }

  /* ---------- menú contextual ---------- */
  const ctx = $('#ctx');
  function showCtx(items, x, y) {
    ctx.innerHTML = '';
    items.forEach(it => {
      if (it === '-') { ctx.appendChild(document.createElement('hr')); return; }
      const b = document.createElement('button'); b.textContent = it[0]; if (it[2]) b.className = it[2];
      b.onclick = () => { hideCtx(); it[1](); }; ctx.appendChild(b);
    });
    ctx.classList.remove('hidden');
    const w = ctx.offsetWidth, h = ctx.offsetHeight;
    ctx.style.left = Math.min(x, innerWidth - w - 6) + 'px'; ctx.style.top = Math.min(y, innerHeight - h - 6) + 'px';
    ctx.querySelector('button').focus();
  }
  function hideCtx() { ctx.classList.add('hidden'); }
  document.addEventListener('mousedown', e => { if (!ctx.contains(e.target)) hideCtx(); if (!$('.menuwrap').contains(e.target)) closeMore(); });
  function elementMenu(x, y) {
    const el = S.sel; const items = [];
    if (el.getAttribute('contenteditable') === 'true') items.push(['Editar el texto', () => el.focus()]);
    if (el.tagName === 'IMG') items.push(['Reemplazar imagen…', () => replaceImageFromDisk(el)]);
    items.push(['Copiar', copyEl], ['Pegar después', pasteEl], ['Duplicar', dupEl], '-',
      ['Elegir el contenedor', () => { const pp = el.parentElement && el.parentElement.closest('[data-eid]'); if (pp && pp.tagName !== 'HTML') select(pp); }],
      ['Subir', () => moveEl(-1)], ['Bajar', () => moveEl(1)], ['Envolver en bloque', wrapEl], '-',
      ['Cambiar estilo', () => tab('right', 'style')], ['Ver su código', () => { tab('right', 'el'); elementCode(); }], '-',
      ['Borrar', () => removeEl(), 'danger']);
    if (!S.clip) items.splice(items.findIndex(i => i[0] === 'Pegar después'), 1);
    showCtx(items, x, y);
  }

  /* ================================================================
     imágenes
     ================================================================ */
  async function pickFiles(multiple) {
    try {
      const hs = await showOpenFilePicker({ multiple, types: [{ description: 'Imágenes', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'] } }] });
      return Promise.all(hs.map(h => h.getFile()));
    } catch { return []; }
  }
  async function optimize(file, maxW) {
    if (/svg|gif/.test(file.type)) return { blob: file, ext: ext(file.name) };
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxW / bmp.width), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const png = file.type === 'image/png';
    const blob = await new Promise(r => cv.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.86));
    return { blob, ext: png ? 'png' : 'jpg', w, h };
  }
  const slug = n => n.replace(/\.[^.]+$/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'imagen';
  function imgFolder() {
    const dirs = new Set([...S.files.keys()].filter(p => IMG_EXT.includes(ext(p))).map(dirOf));
    for (const d of ['img/', 'images/', 'imagenes/', 'assets/', 'assets/img/']) if (dirs.has(d)) return d;
    return [...dirs][0] ?? 'img/';
  }
  function relPath(fromDir, to) {
    const a = fromDir.split('/').filter(Boolean), b = to.split('/');
    while (a.length && b.length > 1 && a[0] === b[0]) { a.shift(); b.shift(); }
    return '../'.repeat(a.length) + b.join('/');
  }
  async function storeImage(file) {
    const o = await optimize(file, 2000);
    let name = imgFolder() + slug(file.name) + '.' + o.ext;
    if (S.files.has(name)) name = imgFolder() + slug(file.name) + '-' + Date.now().toString(36) + '.' + o.ext;
    await writeFile(name, o.blob);
    return { path: name, ...o };
  }
  async function imageSize(path) {
    const f = await (S.files.get(path)).getFile(); const url = URL.createObjectURL(f);
    return new Promise(r => { const im = new Image(); im.onload = () => r({ w: im.naturalWidth, h: im.naturalHeight, url }); im.onerror = () => r({ url }); im.src = url; });
  }
  async function setImage(img, path) {
    const { w, h, url } = await imageSize(path);
    snap();
    const s = srcOf(img), rel = relPath(dirOf(S.path), path);
    s.setAttribute('src', rel); s.removeAttribute('srcset'); img.removeAttribute('srcset');
    if (w) { [s, img].forEach(x => { x.setAttribute('width', w); x.setAttribute('height', h); }); }
    img.src = url; markDirty(); if (S.sel === img) renderElement();
  }
  function srcToPath(src) { if (!src || /^(data:|https?:|blob:)/.test(src)) return null; try { return decodeURIComponent(new URL(src, 'http://x/' + S.path).pathname.slice(1)); } catch { return null; } }
  async function replaceImageFromDisk(img) {
    const [file] = await pickFiles(false); if (!file) return;
    const st = await storeImage(file); renderFiles(); renderAssets();
    await setImage(img, st.path); toast('Imagen reemplazada (guardada en ' + st.path + ').');
  }
  const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#d9d9d6"/><path d="M420 520l120-150 90 110 60-70 110 110z" fill="#b5b5b0"/><circle cx="700" cy="330" r="40" fill="#b5b5b0"/><text x="600" y="640" font-family="sans-serif" font-size="34" fill="#8a8a85" text-anchor="middle">Doble clic para elegir una imagen</text></svg>');
  const imageHTML = path => `<figure style="margin:0 0 1.5rem"><img src="${path ? esc(relPath(dirOf(S.path), path)) : PLACEHOLDER}" alt="" loading="lazy" style="width:100%;height:auto;display:block"></figure>`;

  $('#addImages').onclick = async () => {
    const files = await pickFiles(true); if (!files.length) return;
    for (const f of files) await storeImage(f);
    renderFiles(); renderAssets(); toast(files.length + (files.length > 1 ? ' imágenes subidas' : ' imagen subida') + ' a ' + imgFolder());
  };
  const assetURLs = new Map();
  async function renderAssets() {
    const box = $('#assets'); if (!box) return; box.innerHTML = '';
    const imgs = [...S.files.keys()].filter(p => IMG_EXT.includes(ext(p)) && ext(p) !== 'ico').sort();
    if (!imgs.length) { box.innerHTML = '<p class="note">No hay imágenes todavía.</p>'; return; }
    for (const p of imgs) {
      const b = document.createElement('button'); b.className = 'asset'; b.title = p; b.draggable = true;
      b.innerHTML = `<img alt="" loading="lazy"><span>${esc(p.split('/').pop())}</span>`;
      box.appendChild(b);
      (async () => { let u = assetURLs.get(p); if (!u) { u = URL.createObjectURL(await S.files.get(p).getFile()); assetURLs.set(p, u); } b.querySelector('img').src = u; })();
      b.onclick = e => assetMenu(p, e.clientX, e.clientY);
      b.ondragstart = e => { dragKind = 'asset'; dragData = p; e.dataTransfer.setData('text/plain', p); e.dataTransfer.effectAllowed = 'copy'; };
      b.ondragend = () => { setTimeout(() => { dragKind = null; }, 50); hideDrop(); };
    }
  }
  function assetMenu(p, x, y) {
    const items = [];
    const canEdit = S.kind === 'html' && S.mode === 'visual';
    if (canEdit && S.sel && S.sel.tagName === 'IMG') items.push(['Usarla en la imagen elegida', () => setImage(S.sel, p).then(() => toast('Imagen cambiada.'))]);
    if (canEdit && S.sel && S.sel.tagName !== 'IMG') items.push(['Ponerla de fondo del elemento elegido', () => { snap(); setStyle(S.sel, 'background-image', `url("${relPath(dirOf(S.path), p)}")`); if (!ownStyle(S.sel, 'background-size')) setStyle(S.sel, 'background-size', 'cover'); setStyle(S.sel, 'background-position', 'center'); renderStyle(); toast('Fondo aplicado (' + DEV[S.dev].name + ').'); }]);
    if (canEdit) items.push(['Insertar en la página', () => insertHTML(imageHTML(p), S.sel ? srcOf(S.sel) : null, S.sel ? S.where === 'inside' ? 'inside' : 'after' : 'inside')]);
    items.push(['Editar imagen (recortar, ajustar, dibujar)…', () => window.EDX && EDX.editImage(p)], ['Ver archivo', () => openFile(p)], ['Copiar la ruta', () => { navigator.clipboard.writeText(relPath(dirOf(S.path || ''), p)); toast('Ruta copiada.'); }]);
    showCtx(items, x, y);
  }
  function renderAssetsHint() {
    const h = $('#assetHint'); if (!h) return;
    h.textContent = S.sel && S.sel.tagName === 'IMG' ? 'Tocá una imagen para ponerla en la imagen elegida.' : S.sel ? 'Tocá una imagen para ponerla de fondo o insertarla. También podés arrastrarla a la página.' : 'Arrastrá una imagen a la página o tocála para ver opciones.';
  }
  function showImage(path) {
    layout('image');
    S.files.get(path).getFile().then(f => {
      const url = URL.createObjectURL(f); $('#imageViewImg').src = url;
      const im = new Image(); im.onload = () => $('#imageViewInfo').textContent = `${path} · ${im.naturalWidth}×${im.naturalHeight} px · ${(f.size / 1024).toFixed(0)} KB`; im.src = url;
    });
    $('#imageViewEdit').onclick = () => window.EDX && EDX.editImage(path);
    $('#imageViewReplace').onclick = async () => {
      const [file] = await pickFiles(false); if (!file) return;
      const e = ext(path);
      let blob = file;
      if (['png', 'jpg', 'jpeg', 'webp'].includes(e)) {
        const bmp = await createImageBitmap(file); const k = Math.min(1, 2000 / bmp.width);
        const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
        cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        blob = await new Promise(r => cv.toBlob(r, e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : 'image/jpeg', 0.86));
      }
      await writeFile('respaldos/imagenes/' + stamp() + '/' + path, await readBytes(path), false);
      await writeFile(path, blob); assetURLs.delete(path); renderAssets(); showImage(path);
      toast('Archivo reemplazado. La versión anterior quedó en respaldos/imagenes.');
    };
  }

  /* ================================================================
     panel Estilo (por dispositivo)
     ================================================================ */
  function siteColors() {
    const out = []; if (!S.doc) return out;
    S.doc.querySelectorAll('style').forEach(st => {
      const m = st.textContent.match(/:root\s*\{([^}]*)\}/); if (!m) return;
      m[1].replace(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g, (_, n, v) => out.push({ n, v }));
    });
    return out;
  }
  function siteFonts() {
    const set = new Set();
    if (S.live) [...S.live.fonts || []].forEach(f => set.add(f.family.replace(/"/g, '')));
    S.doc && S.doc.querySelectorAll('style').forEach(st => st.textContent.replace(/font-family\s*:\s*["']?([^;"',}]+)/g, (_, f) => set.add(f.trim())));
    S.doc && S.doc.querySelectorAll('link[href*="fonts.googleapis"]').forEach(l => { const m = l.getAttribute('href').match(/family=([^&:]+)/g); m && m.forEach(x => set.add(decodeURIComponent(x.slice(7)).replace(/\+/g, ' '))); });
    ['Arial', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'system-ui'].forEach(f => set.add(f));
    return [...set].filter(f => f && !/^var\(|inherit|initial/.test(f));
  }
  const SHADOWS = { 'Ninguna': 'none', 'Suave': '0 4px 14px rgba(0,0,0,.12)', 'Media': '0 12px 32px rgba(0,0,0,.22)', 'Fuerte': '0 24px 60px rgba(0,0,0,.4)' };
  const FILTERS = [['brightness', 'Brillo', 0, 200, 100, '%'], ['contrast', 'Contraste', 0, 200, 100, '%'], ['saturate', 'Saturación', 0, 200, 100, '%'], ['grayscale', 'Blanco y negro', 0, 100, 0, '%'], ['blur', 'Desenfoque', 0, 20, 0, 'px']];
  const ANIMS = { '': 'Sin animación', 'fade': 'Aparece', 'fade-up': 'Sube y aparece', 'fade-down': 'Baja y aparece', 'slide-left': 'Entra desde la izquierda', 'slide-right': 'Entra desde la derecha', 'zoom': 'Se agranda', 'blur': 'Se enfoca' };

  function renderStyle() {
    const el = S.sel, box = $('#styleBox'); if (!el || !S.live) return;
    const cs = S.live.defaultView.getComputedStyle(el);
    const id = el.getAttribute('data-ed');
    const hex = c => { const m = c && c.match(/[\d.]+/g); if (!m || (m.length > 3 && +m[3] === 0)) return ''; return '#' + m.slice(0, 3).map(x => (+x | 0).toString(16).padStart(2, '0')).join(''); };
    const num = v => { const n = parseFloat(v); return isNaN(n) ? '' : Math.round(n * 100) / 100; };
    const palette = siteColors();
    const pal = prop => palette.length ? `<div class="swatchrow">${palette.map(c => `<button type="button" title="${esc(c.n)}" data-pal="${esc(c.n)}" data-prop="${prop}" style="background:${c.v}"></button>`).join('')}</div>` : '';
    const color = (prop, label) => `<div class="field"><span>${label}</span><div class="colorf"><input type="color" data-p="${prop}"><input class="inp" data-p="${prop}" data-k="text"></div>${pal(prop)}</div>`;
    const n = (prop, label, unit = 'px', extra = '') => `<label class="field"><span>${label}</span><input class="inp" type="number" data-p="${prop}" data-u="${unit}" ${extra}></label>`;
    const t = (prop, label, ph = '') => `<label class="field"><span>${label}</span><input class="inp" data-p="${prop}" placeholder="${esc(ph)}"></label>`;
    const sel = (prop, label, opts) => `<label class="field"><span>${label}</span><select class="inp" data-p="${prop}"><option value="">—</option>${opts.map(o => Array.isArray(o) ? `<option value="${esc(o[0])}">${esc(o[1])}</option>` : `<option>${esc(o)}</option>`).join('')}</select></label>`;
    const chips = (prop, label, opts) => `<div class="field"><span>${label}</span><div class="chips" data-chips="${prop}">${opts.map(o => `<button type="button" data-v="${esc(o[0])}">${esc(o[1])}</button>`).join('')}</div></div>`;
    const isImg = el.tagName === 'IMG' || el.tagName === 'VIDEO';
    const disp = ownStyle(el, 'display') || cs.display;
    box.innerHTML = `
      <div class="sec"><p class="note">Editando para <b>${DEV[S.dev].name}</b>${S.dev !== 'desktop' ? ' (solo en esta pantalla y más chicas)' : ' (se aplica en todas las pantallas)'}. Cambiá arriba de dispositivo para ajustar otra.</p>
        <div class="field"><span>Ocultar en</span><div class="checks">${DEVS.map(d => `<label class="chk"><input type="checkbox" data-hide="${d}" ${id && S.hide[d].has(id) ? 'checked' : ''}> ${DEV[d].name}</label>`).join('')}</div></div>
      </div>
      <div class="sec"><h3>Texto</h3>
        ${sel('font-family', 'Tipografía', siteFonts().map(f => [/\s/.test(f) && !/,/.test(f) ? `"${f}"` : f, f]))}
        ${color('color', 'Color')}
        <div class="row2">${n('font-size', 'Tamaño (px)', 'px', 'min="6"')}${sel('font-weight', 'Grosor', [['300', 'Fina'], ['400', 'Normal'], ['500', 'Media'], ['600', 'Semi negrita'], ['700', 'Negrita'], ['900', 'Extra negrita']])}</div>
        <div class="row2">${n('line-height', 'Interlineado', '', 'step="0.05" min="0.5"')}${n('letter-spacing', 'Espaciado (px)', 'px', 'step="0.5"')}</div>
        ${chips('text-align', 'Alineación', [['left', 'Izq.'], ['center', 'Centro'], ['right', 'Der.'], ['justify', 'Justif.']])}
        <div class="row2">${sel('text-transform', 'Mayúsculas', [['none', 'Normal'], ['uppercase', 'MAYÚSCULAS'], ['lowercase', 'minúsculas'], ['capitalize', 'Cada Palabra']])}${sel('font-style', 'Estilo', [['normal', 'Normal'], ['italic', 'Cursiva']])}</div>
        ${sel('text-decoration', 'Línea', [['none', 'Ninguna'], ['underline', 'Subrayado'], ['line-through', 'Tachado']])}
      </div>
      <div class="sec"><h3>Fondo</h3>
        ${color('background-color', 'Color de fondo')}
        <div class="field"><span>Imagen de fondo</span><div class="acts" style="margin-top:0"><button class="btn sm" id="bgPick">Elegir…</button><button class="btn sm" id="bgClear">Quitar</button></div></div>
        <div class="row2">${sel('background-size', 'Tamaño', [['cover', 'Cubrir'], ['contain', 'Entera'], ['auto', 'Original']])}${sel('background-position', 'Posición', [['center', 'Centro'], ['top', 'Arriba'], ['bottom', 'Abajo'], ['left', 'Izquierda'], ['right', 'Derecha']])}</div>
        ${t('background-image', 'Degradado o imagen (avanzado)', 'linear-gradient(#000, #333)')}
      </div>
      <div class="sec"><h3>Borde y sombra</h3>
        <div class="row2">${n('border-radius', 'Esquinas redondeadas', 'px', 'min="0"')}${n('border-width', 'Grosor del borde', 'px', 'min="0"')}</div>
        <div class="row2">${sel('border-style', 'Tipo de borde', [['none', 'Ninguno'], ['solid', 'Línea'], ['dashed', 'Guiones'], ['dotted', 'Puntos']])}<span></span></div>
        ${color('border-color', 'Color del borde')}
        ${chips('box-shadow', 'Sombra', Object.entries(SHADOWS).map(([k, v]) => [v, k]))}
      </div>
      <div class="sec"><h3>Tamaño y espacio</h3>
        <div class="row2">${t('width', 'Ancho', 'auto, 50%, 300px')}${t('height', 'Alto', 'auto')}</div>
        <div class="row2">${t('max-width', 'Ancho máximo', 'none, 800px')}${t('min-height', 'Alto mínimo', '0, 100vh')}</div>
        <div class="field"><span>Margen afuera (arriba · der. · abajo · izq.)</span><div class="row4">${['top', 'right', 'bottom', 'left'].map(s => `<input class="inp" type="number" data-p="margin-${s}" data-u="px" title="${s}">`).join('')}</div></div>
        <div class="field"><span>Relleno adentro (arriba · der. · abajo · izq.)</span><div class="row4">${['top', 'right', 'bottom', 'left'].map(s => `<input class="inp" type="number" min="0" data-p="padding-${s}" data-u="px" title="${s}">`).join('')}</div></div>
        <div class="acts"><button class="btn sm" id="centerBox">Centrar el bloque</button></div>
      </div>
      <div class="sec"><h3>Distribución de lo que tiene adentro</h3>
        ${chips('display', 'Tipo', [['block', 'Bloque'], ['flex', 'Fila / columna'], ['grid', 'Grilla'], ['inline-block', 'En línea'], ['none', 'Oculto']])}
        <div id="flexOpts" class="${/flex/.test(disp) ? '' : 'hidden'}">
          ${chips('flex-direction', 'Dirección', [['row', 'En fila'], ['column', 'En columna'], ['row-reverse', 'Fila invertida']])}
          <div class="row2">${sel('justify-content', 'Repartir', [['flex-start', 'Al inicio'], ['center', 'Al centro'], ['flex-end', 'Al final'], ['space-between', 'Separados'], ['space-around', 'Con aire']])}${sel('align-items', 'Alinear', [['stretch', 'Estirar'], ['flex-start', 'Arriba'], ['center', 'Centro'], ['flex-end', 'Abajo']])}</div>
          ${sel('flex-wrap', 'Si no entra', [['nowrap', 'Apretar'], ['wrap', 'Pasar abajo']])}
        </div>
        <div id="gridOpts" class="${/grid/.test(disp) ? '' : 'hidden'}">
          <label class="field"><span>Columnas</span><input class="inp" type="number" min="1" max="12" id="gridCols"></label>
        </div>
        ${n('gap', 'Espacio entre elementos', 'px', 'min="0"')}
      </div>
      ${isImg ? `<div class="sec"><h3>Imagen</h3>
        ${chips('object-fit', 'Cómo llena su espacio', [['cover', 'Recortar'], ['contain', 'Entera'], ['fill', 'Estirar']])}
        <div class="row2">${sel('object-position', 'Foco', [['center', 'Centro'], ['top', 'Arriba'], ['bottom', 'Abajo'], ['left', 'Izquierda'], ['right', 'Derecha']])}${sel('aspect-ratio', 'Proporción', [['auto', 'Original'], ['1 / 1', 'Cuadrada'], ['4 / 3', '4:3'], ['3 / 2', '3:2'], ['16 / 9', '16:9'], ['3 / 4', 'Vertical 3:4'], ['9 / 16', 'Historia 9:16']])}</div>
      </div>` : ''}
      <div class="sec"><h3>Efectos</h3>
        <div class="field"><span>Opacidad</span><div class="range"><input type="range" min="0" max="1" step="0.05" data-p="opacity"><output></output></div></div>
        <div class="row2">${n('rotate', 'Rotación (°)', 'deg', 'step="1"')}${n('scale', 'Escala', '', 'step="0.05" min="0"')}</div>
        <div id="filters">${FILTERS.map(f => `<div class="field"><span>${f[1]}</span><div class="range"><input type="range" min="${f[2]}" max="${f[3]}" value="${f[4]}" data-f="${f[0]}" data-u="${f[5]}"><output></output></div></div>`).join('')}</div>
        <div class="row2">${sel('position', 'Posición', [['static', 'Normal'], ['relative', 'Relativa'], ['absolute', 'Absoluta'], ['fixed', 'Fija en pantalla'], ['sticky', 'Pegada al bajar']])}${n('z-index', 'Capa (z-index)', '', 'step="1"')}</div>
        <div class="row4">${['top', 'right', 'bottom', 'left'].map(s => `<input class="inp" data-p="${s}" placeholder="${s === 'top' ? 'arr.' : s === 'right' ? 'der.' : s === 'bottom' ? 'abajo' : 'izq.'}" title="${s}">`).join('')}</div>
      </div>
      <div class="sec"><h3>Al pasar el mouse</h3>
        <p class="note">Cómo cambia cuando alguien pasa el mouse por encima (en computadoras).</p>
        <div class="field"><span>Color del texto</span><div class="colorf"><input type="color" data-hv="color"><input class="inp" data-hv="color" data-k="text" placeholder="sin cambio"></div></div>
        <div class="field"><span>Color de fondo</span><div class="colorf"><input type="color" data-hv="background-color"><input class="inp" data-hv="background-color" data-k="text" placeholder="sin cambio"></div></div>
        <div class="row2"><label class="field"><span>Agrandar</span><select class="inp" data-hv="scale"><option value="">—</option><option value="1.03">Un poco</option><option value="1.06">Más</option><option value="1.1">Mucho</option><option value="0.97">Achicar</option></select></label>
        <label class="field"><span>Subir</span><select class="inp" data-hv="translate"><option value="">—</option><option value="0 -3px">Un poco</option><option value="0 -8px">Más</option></select></label></div>
        <div class="row2"><label class="field"><span>Sombra</span><select class="inp" data-hv="box-shadow"><option value="">—</option>${Object.entries(SHADOWS).filter(([k]) => k !== 'Ninguna').map(([k, v]) => `<option value="${v}">${k}</option>`).join('')}</select></label>
        <label class="field"><span>Opacidad</span><select class="inp" data-hv="opacity"><option value="">—</option><option value="0.85">85%</option><option value="0.7">70%</option><option value="0.5">50%</option><option value="1">100%</option></select></label></div>
        <label class="field"><span>Línea</span><select class="inp" data-hv="text-decoration"><option value="">—</option><option value="underline">Subrayado</option><option value="none">Sin subrayado</option></select></label>
        <div class="acts"><button class="btn sm" id="hvTest">Probar el efecto</button><button class="btn sm" id="hvClear">Quitar efecto</button></div>
      </div>
      <div class="sec"><h3>Animaciones y efectos</h3><p class="note">Están en la pestaña <b>Efectos</b>: al aparecer, en loop, al pasar el mouse, con el scroll y de texto.</p><div class="acts"><button class="btn sm" id="goFx">Abrir Efectos</button></div></div>
      <div class="sec"><h3>Avanzado</h3>
        <label class="field"><span>Estilo escrito a mano (atributo style)</span><textarea class="inp mono" id="rawStyle" style="min-height:64px"></textarea></label>
        <div class="acts"><button class="btn sm" id="clearDev">Quitar estilos en ${DEV[S.dev].name}</button><button class="btn sm danger" id="clearAll">Quitar todos sus estilos</button></div>
      </div>`;

    // valores actuales
    box.querySelectorAll('[data-p]').forEach(inp => {
      const p = inp.dataset.p, own = ownStyle(el, p), comp = cs.getPropertyValue(p);
      if (inp.type === 'color') { inp.value = hex(own || comp) || '#000000'; return; }
      if (inp.dataset.k === 'text') { inp.value = own; inp.placeholder = hex(comp) || 'transparente'; return; }
      if (inp.type === 'range') { inp.value = own || comp || 1; inp.nextElementSibling.textContent = Math.round(inp.value * 100) + '%'; return; }
      if (inp.type === 'number') {
        inp.value = own ? num(own) : '';
        inp.placeholder = p === 'line-height' ? (comp === 'normal' ? '' : num(parseFloat(comp) / parseFloat(cs.fontSize))) : (p === 'letter-spacing' && comp === 'normal') ? '0' : (p === 'scale' || p === 'rotate') ? (comp === 'none' ? '' : num(comp)) : num(comp);
        return;
      }
      if (inp.tagName === 'SELECT') { inp.value = own || ''; if (!own) { const o = [...inp.options].find(o => o.value === comp); if (o) inp.firstElementChild.textContent = '— (' + o.textContent + ')'; } return; }
      inp.value = own; if (!own && !inp.placeholder) inp.placeholder = comp;
    });
    box.querySelectorAll('[data-chips]').forEach(g => { const p = g.dataset.chips, v = ownStyle(el, p) || cs.getPropertyValue(p); g.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); });
    const curFilter = ownStyle(el, 'filter') || '';
    box.querySelectorAll('[data-f]').forEach(r => { const m = curFilter.match(new RegExp(r.dataset.f + '\\(([\\d.]+)')); if (m) r.value = m[1]; r.nextElementSibling.textContent = r.value + r.dataset.u; });
    const gc = $('#gridCols'); const gt = ownStyle(el, 'grid-template-columns') || cs.gridTemplateColumns; const rep = gt.match(/repeat\((\d+)/); gc.value = rep ? rep[1] : (gt && gt !== 'none' ? gt.split(' ').length : '');
    $('#rawStyle').value = srcOf(el)?.getAttribute('style') || '';
    $('#goFx').onclick = () => tab('right', 'fx');

    // escritura
    let snapped = false; const once = () => { if (!snapped) { snap(); snapped = true; } };
    const targets = S.multi.length > 1 ? S.multi.filter(x => x.isConnected) : [el];
    const apply = (p, v, state) => { once(); targets.forEach(t => setStyle(t, p, v, state)); };
    box.querySelectorAll('[data-p]').forEach(inp => {
      const p = inp.dataset.p, u = inp.dataset.u ?? '';
      inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
        let v = inp.value;
        if (inp.type === 'number' && v !== '') v = v + u;
        if (inp.type === 'range') inp.nextElementSibling.textContent = Math.round(v * 100) + '%';
        if (inp.type === 'color') { const tw = inp.nextElementSibling; if (tw) tw.value = v; }
        if (inp.dataset.k === 'text' && /^#[0-9a-f]{6}$/i.test(v)) inp.previousElementSibling.value = v;
        apply(p, v);
        if (p === 'display') { $('#flexOpts').classList.toggle('hidden', !/flex/.test(v)); $('#gridOpts').classList.toggle('hidden', !/grid/.test(v)); }
      });
    });
    box.querySelectorAll('[data-chips]').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
      const p = g.dataset.chips; const on = b.getAttribute('aria-pressed') === 'true' && ownStyle(el, p) === b.dataset.v;
      apply(p, on ? '' : b.dataset.v); g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', !on && x === b));
      if (p === 'display') { $('#flexOpts').classList.toggle('hidden', on || !/flex/.test(b.dataset.v)); $('#gridOpts').classList.toggle('hidden', on || !/grid/.test(b.dataset.v)); }
    }));
    box.querySelectorAll('[data-pal]').forEach(b => b.onclick = () => { apply(b.dataset.prop, `var(${b.dataset.pal})`); renderStyle(); });
    box.querySelectorAll('[data-f]').forEach(r => r.oninput = () => {
      r.nextElementSibling.textContent = r.value + r.dataset.u;
      const parts = [...box.querySelectorAll('[data-f]')].filter(x => +x.value !== FILTERS.find(f => f[0] === x.dataset.f)[4]).map(x => `${x.dataset.f}(${x.value}${x.dataset.u})`);
      apply('filter', parts.join(' '));
    });
    gc.oninput = () => { const v = +gc.value; apply('grid-template-columns', v > 0 ? `repeat(${v}, minmax(0, 1fr))` : ''); if (v > 0 && !ownStyle(el, 'display')) apply('display', 'grid'); };
    box.querySelectorAll('[data-hide]').forEach(c => c.onchange = () => { once(); targets.forEach(t => { const i = edId(t); c.checked ? S.hide[c.dataset.hide].add(i) : S.hide[c.dataset.hide].delete(i); }); writeEdCss(); });
    $('#bgPick').onclick = async () => {
      const imgs = [...S.files.keys()].filter(p => IMG_EXT.includes(ext(p)));
      const r = $('#bgPick').getBoundingClientRect();
      showCtx([['Subir una de mi compu…', async () => { const [f] = await pickFiles(false); if (!f) return; const st = await storeImage(f); renderFiles(); renderAssets(); setBg(st.path); }], '-', ...imgs.slice(0, 40).map(p => [p.split('/').pop(), () => setBg(p)])], r.left, r.bottom + 4);
    };
    const setBg = p => { apply('background-image', `url("${relPath(dirOf(S.path), p)}")`); if (!ownStyle(el, 'background-size')) apply('background-size', 'cover'); if (!ownStyle(el, 'background-position')) apply('background-position', 'center'); renderStyle(); };
    $('#bgClear').onclick = () => { apply('background-image', ''); renderStyle(); };
    $('#centerBox').onclick = () => { apply('margin-left', 'auto'); apply('margin-right', 'auto'); if (!ownStyle(el, 'max-width') && cs.width === S.live.defaultView.getComputedStyle(el.parentElement).width) apply('max-width', '1100px'); renderStyle(); };

    // al pasar el mouse
    box.querySelectorAll('[data-hv]').forEach(inp => {
      const p = inp.dataset.hv, own = ownStyle(el, p, 'hover');
      if (inp.type === 'color') inp.value = /^#/.test(own) ? own.slice(0, 7) : '#000000'; else inp.value = own;
      inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => {
        const v = inp.value;
        if (inp.type === 'color') inp.nextElementSibling.value = v;
        apply(p, v, 'hover');
        if (v && !ownStyle(el, 'transition')) { const prev = S.dev; S.dev = 'desktop'; targets.forEach(t => setStyle(t, 'transition', 'all .25s ease')); S.dev = prev; }
      });
    });
    $('#hvClear').onclick = () => { once(); targets.forEach(t => { const id = edId(t) + ':hover'; DEVS.forEach(d => delete S.css[d][id]); }); writeEdCss(); renderStyle(); };
    $('#hvTest').onclick = () => {
      const o = S.css[S.dev][edId(el) + ':hover'] || S.css.desktop[edId(el) + ':hover']; if (!o) { toast('Primero elegí algún cambio.'); return; }
      const prev = el.getAttribute('style') || ''; el.style.transition = 'all .25s ease';
      Object.entries(o).forEach(([p, v]) => el.style.setProperty(p, v, 'important'));
      setTimeout(() => { prev ? el.setAttribute('style', prev) : el.removeAttribute('style'); }, 1100);
    };
    $('#rawStyle').onfocus = () => snap();
    $('#rawStyle').oninput = e => { const v = e.target.value.trim(); setAttr(el, 'style', v || null); };
    $('#clearDev').onclick = () => { snap(); if (id) { delete S.css[S.dev][id]; writeEdCss(); } renderStyle(); };
    $('#clearAll').onclick = () => { snap(); if (id) { DEVS.forEach(d => { delete S.css[d][id]; delete S.css[d][id + ':hover']; S.hide[d].delete(id); }); writeEdCss(); } setAttr(el, 'style', null); renderStyle(); };
  }

  // animaciones al aparecer: se agrega un script chico a la página la primera vez
  const ANIM_CSS = `[data-ed-anim]{transition-property:opacity,transform,filter;transition-duration:.9s;transition-timing-function:cubic-bezier(.2,.7,.2,1)}
html.ed-anim-on [data-ed-anim]:not(.ed-in){opacity:0}
html.ed-anim-on [data-ed-anim="fade-up"]:not(.ed-in){transform:translateY(40px)}
html.ed-anim-on [data-ed-anim="fade-down"]:not(.ed-in){transform:translateY(-40px)}
html.ed-anim-on [data-ed-anim="slide-left"]:not(.ed-in){transform:translateX(-70px)}
html.ed-anim-on [data-ed-anim="slide-right"]:not(.ed-in){transform:translateX(70px)}
html.ed-anim-on [data-ed-anim="zoom"]:not(.ed-in){transform:scale(.88)}
html.ed-anim-on [data-ed-anim="blur"]:not(.ed-in){filter:blur(14px)}
@media (prefers-reduced-motion:reduce){html.ed-anim-on [data-ed-anim]{opacity:1!important;transform:none!important;filter:none!important;transition:none!important}}`;
  const ANIM_JS = `(function(){if(!('IntersectionObserver' in window)||window.EDITOR_WEB)return;var d=document.documentElement;d.classList.add('ed-anim-on');var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('ed-in');io.unobserve(e.target)}})},{threshold:.15});function go(){document.querySelectorAll('[data-ed-anim]').forEach(function(el){io.observe(el)})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go()})();`;
  function ensureAnimRuntime() {
    if (S.doc.getElementById('editor-anim')) return;
    const st = S.doc.createElement('style'); st.id = 'editor-anim'; st.textContent = '\n' + ANIM_CSS + '\n';
    const sc = S.doc.createElement('script'); sc.id = 'editor-anim-js'; sc.textContent = ANIM_JS;
    [st, sc].forEach(x => { x.setAttribute('data-eid', ++S.eid); S.doc.head.appendChild(x); });
  }
  function previewAnim(el) {
    const type = el.getAttribute('data-ed-anim') || 'fade-up';
    const from = { 'fade': {}, 'fade-up': { transform: 'translateY(40px)' }, 'fade-down': { transform: 'translateY(-40px)' }, 'slide-left': { transform: 'translateX(-70px)' }, 'slide-right': { transform: 'translateX(70px)' }, 'zoom': { transform: 'scale(.88)' }, 'blur': { filter: 'blur(14px)' } }[type] || {};
    const id = el.getAttribute('data-ed');
    const dur = parseFloat(S.css.desktop[id]?.['transition-duration']) || 0.9, delay = parseFloat(S.css.desktop[id]?.['transition-delay']) || 0;
    el.scrollIntoView({ block: 'center' });
    el.animate([{ opacity: 0, ...from }, { opacity: 1, transform: 'none', filter: 'none' }], { duration: dur * 1000, delay: delay * 1000, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
  }

  /* ================================================================
     panel Página
     ================================================================ */
  const CODE_START = 'editor:codigo-propio', CODE_END = 'editor:fin-codigo-propio';
  function customCode(parent) {
    const nodes = [...parent.childNodes]; const a = nodes.findIndex(n => n.nodeType === 8 && n.textContent.trim() === CODE_START), b = nodes.findIndex(n => n.nodeType === 8 && n.textContent.trim() === CODE_END);
    if (a < 0 || b < a) return { html: '', nodes: [] };
    const mid = nodes.slice(a + 1, b);
    return { html: mid.map(n => n.nodeType === 1 ? stripIds(n).outerHTML : n.nodeType === 8 ? `<!--${n.textContent}-->` : n.textContent).join('').trim(), start: nodes[a], end: nodes[b], mid };
  }
  function setCustomCode(parent, html) {
    let c = customCode(parent);
    if (!c.start) {
      const s = S.doc.createComment(' ' + CODE_START + ' '), e = S.doc.createComment(' ' + CODE_END + ' ');
      if (parent === S.doc.body) { parent.append(s, e); } else parent.append(s, e);
      c = customCode(parent);
    }
    c.mid.forEach(n => n.remove());
    const frag = S.doc.createRange().createContextualFragment('\n' + html + '\n');
    frag.querySelectorAll('*').forEach(x => x.setAttribute('data-eid', ++S.eid));
    c.end.before(frag);
  }
  function renderPage() {
    const box = $('#pageBox');
    if (S.kind !== 'html' || !S.doc) { box.innerHTML = '<p class="note">Abrí una página .html.</p>'; return; }
    const d = S.doc;
    const meta = n => d.querySelector(`meta[name="${n}"]`) || d.querySelector(`meta[property="${n}"]`);
    const imgs = [...S.files.keys()].filter(p => IMG_EXT.includes(ext(p)));
    box.innerHTML = `
      <div class="sec"><h3>Datos para Google y redes</h3>
        <label class="field"><span>Título (pestaña del navegador y Google) <output id="tCount"></output></span><input class="inp" id="pTitle"></label>
        <label class="field"><span>Descripción para buscadores <output id="dCount"></output></span><textarea class="inp" id="pDesc" style="min-height:70px"></textarea></label>
        <label class="field"><span>Imagen al compartir en redes</span><select class="inp" id="pOg"><option value="">—</option>${imgs.map(p => `<option value="${esc(relPath(dirOf(S.path), p))}">${esc(p)}</option>`).join('')}</select></label>
        <label class="field"><span>Ícono de la pestaña (favicon)</span><select class="inp" id="pIcon"><option value="">—</option>${imgs.map(p => `<option value="${esc(relPath(dirOf(S.path), p))}">${esc(p)}</option>`).join('')}</select></label>
        <label class="field"><span>Idioma</span><input class="inp" id="pLang" placeholder="es"></label>
      </div>
      <div class="sec"><h3>Colores generales del sitio</h3><div class="vars" id="pVars"></div></div>
      <div class="sec"><h3>Tipografías</h3>
        <p class="note">Agregá una tipografía de Google Fonts por su nombre (por ejemplo: Poppins, Playfair Display). Después aparece en el panel Estilo.</p>
        <div class="acts"><input class="inp" id="gFont" placeholder="Nombre de la tipografía" style="flex:1"><button class="btn sm" id="gFontAdd">Agregar</button></div>
        <p class="note" style="margin-top:.4rem">Necesita internet para verse.</p>
      </div>
      <div class="sec"><h3>Código propio</h3>
        <label class="field"><span>Dentro de &lt;head&gt; (Google Analytics, píxeles, verificaciones)</span><textarea class="inp mono" id="cHead"></textarea></label>
        <label class="field"><span>Al final de la página (chats, widgets)</span><textarea class="inp mono" id="cBody"></textarea></label>
        <div class="acts"><button class="btn sm" id="cApply">Aplicar código</button></div>
      </div>`;
    const count = (inp, out, max) => { const n = inp.value.length; out.textContent = `${n}/${max}`; out.style.color = n > max ? '#ff9b80' : ''; };
    const t = $('#pTitle'); t.value = d.title || ''; count(t, $('#tCount'), 60);
    t.onfocus = snap; t.oninput = () => { let el = d.querySelector('title'); if (!el) { el = d.createElement('title'); d.head.appendChild(el); } el.textContent = t.value; count(t, $('#tCount'), 60); markDirty(); };
    const setMeta = (n, v, prop) => { let m = meta(n); if (!m) { m = d.createElement('meta'); m.setAttribute(prop ? 'property' : 'name', n); m.setAttribute('data-eid', ++S.eid); d.head.appendChild(m); } if (v) m.setAttribute('content', v); else m.remove(); markDirty(); };
    const de = $('#pDesc'); de.value = meta('description')?.getAttribute('content') || ''; count(de, $('#dCount'), 160);
    de.onfocus = snap; de.oninput = () => { setMeta('description', de.value); count(de, $('#dCount'), 160); };
    const og = $('#pOg'); og.value = meta('og:image')?.getAttribute('content') || ''; og.onchange = () => { snap(); setMeta('og:image', og.value, true); };
    const ic = $('#pIcon'); const il = d.querySelector('link[rel~="icon"]'); ic.value = il ? il.getAttribute('href') : '';
    ic.onchange = () => { snap(); let l = d.querySelector('link[rel~="icon"]'); if (!l) { l = d.createElement('link'); l.setAttribute('rel', 'icon'); l.setAttribute('data-eid', ++S.eid); d.head.appendChild(l); } if (ic.value) { l.setAttribute('href', ic.value); l.removeAttribute('type'); } else l.remove(); markDirty(); };
    const lg = $('#pLang'); lg.value = d.documentElement.getAttribute('lang') || '';
    lg.onfocus = snap; lg.oninput = () => { d.documentElement.setAttribute('lang', lg.value); markDirty(); };
    const pv = $('#pVars'), vars = [];
    d.querySelectorAll('style').forEach((st, si) => { const m = st.textContent.match(/:root\s*\{([^}]*)\}/); if (m) m[1].replace(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g, (_, n, v) => vars.push({ n, v, si })); });
    if (!vars.length) pv.innerHTML = '<p class="note">Esta página no define colores generales (variables CSS en :root).</p>';
    vars.forEach(({ n, v, si }) => {
      const row = document.createElement('label'); row.className = 'colorf';
      const full = v.length === 4 ? '#' + [...v.slice(1)].map(c => c + c).join('') : v.slice(0, 7);
      row.innerHTML = `<input type="color" value="${full}"><span>${esc(n)}</span>`;
      const inp = row.querySelector('input');
      inp.onfocus = snap;
      inp.oninput = () => {
        const st = d.querySelectorAll('style')[si];
        st.textContent = st.textContent.replace(/:root\s*\{[^}]*\}/, b => b.replace(new RegExp('(' + n + '\\s*:\\s*)#[0-9a-fA-F]{3,8}'), '$1' + inp.value.toUpperCase()));
        try { S.live.documentElement.style.setProperty(n, inp.value); } catch {}
        markDirty();
      };
      pv.appendChild(row);
    });
    $('#gFontAdd').onclick = () => {
      const name = $('#gFont').value.trim(); if (!name) return; snap();
      const l = d.createElement('link'); l.setAttribute('rel', 'stylesheet'); l.setAttribute('data-eid', ++S.eid);
      l.setAttribute('href', 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name).replace(/%20/g, '+') + ':wght@300;400;500;600;700;900&display=swap');
      d.head.appendChild(l); markDirty(); reloadPreview(); toast('Tipografía agregada. Elegila en el panel Estilo → Tipografía.');
      $('#gFont').value = '';
    };
    $('#cHead').value = customCode(d.head).html; $('#cBody').value = customCode(d.body).html;
    $('#cApply').onclick = () => { snap(); setCustomCode(d.head, $('#cHead').value); setCustomCode(d.body, $('#cBody').value); markDirty(); reloadPreview(); toast('Código propio aplicado.'); };
  }

  /* ================================================================
     panel Revisión (accesibilidad y SEO)
     ================================================================ */
  let auditT = null;
  function scheduleAudit() { clearTimeout(auditT); auditT = setTimeout(runAudit, 700); }
  function lum(c) { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return { l: 0.2126 * r + 0.7152 * g + 0.0722 * b, a: m[3] !== undefined ? +m[3] : 1 }; }
  async function runAudit() {
    const box = $('#auditBox'), badge = $('#auditBadge');
    if (S.kind !== 'html' || !S.doc) { box.innerHTML = '<p class="note">Abrí una página .html para revisarla.</p>'; badge.classList.add('hidden'); return; }
    const d = S.doc, items = [];
    const add = (lvl, title, detail, el) => items.push({ lvl, title, detail, eid: el && el.getAttribute('data-eid') });
    const title = (d.title || '').trim(); const desc = d.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    if (!title) add('err', 'La página no tiene título', 'Es lo que muestra Google y la pestaña del navegador. Completalo en la pestaña Página.');
    else if (title.length > 60) add('warn', 'El título es largo', `Tiene ${title.length} caracteres; Google corta alrededor de 60.`);
    if (!desc) add('warn', 'Falta la descripción para buscadores', 'Completala en la pestaña Página (hasta 160 caracteres).');
    else if (desc.length > 160) add('warn', 'La descripción es larga', `Tiene ${desc.length} caracteres; Google corta alrededor de 160.`);
    if (!d.documentElement.getAttribute('lang')) add('warn', 'Falta el idioma de la página', 'Ayuda a los lectores de pantalla y a Google. Ponelo en la pestaña Página.');
    const h1 = d.body.querySelectorAll('h1');
    if (!h1.length) add('warn', 'No hay un Título 1', 'Cada página debería tener un título principal.');
    if (h1.length > 1) add('warn', `Hay ${h1.length} Títulos 1`, 'Lo recomendable es uno solo por página.', h1[1]);
    let last = 0; d.body.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { const lv = +h.tagName[1]; if (last && lv > last + 1) add('warn', `Salto de título: de Título ${last} a Título ${lv}`, '“' + h.textContent.trim().slice(0, 50) + '”', h); last = lv; });
    d.body.querySelectorAll('img').forEach(im => {
      if (!im.hasAttribute('alt')) add('err', 'Imagen sin descripción', (im.getAttribute('src') || '').split('/').pop(), im);
      if (!im.hasAttribute('width') || !im.hasAttribute('height')) add('warn', 'Imagen sin medidas', 'Sin ancho y alto la página “salta” al cargar. Reemplazala desde el editor y se completan solas.', im);
    });
    d.body.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href === '#') add('warn', 'Link sin destino', '“' + (a.textContent.trim().slice(0, 40) || 'sin texto') + '”', a);
      if (!a.textContent.trim() && !a.querySelector('img[alt]:not([alt=""])') && !a.getAttribute('aria-label')) add('err', 'Link sin texto', 'Los lectores de pantalla no saben a dónde lleva.', a);
      if (a.getAttribute('target') === '_blank' && !/noopener/.test(a.getAttribute('rel') || '')) add('warn', 'Link a otra pestaña sin protección', 'Conviene agregar rel="noopener" (el editor lo pone solo al tildar “Abrir en otra pestaña”).', a);
    });
    d.body.querySelectorAll('button').forEach(b => { if (!b.textContent.trim() && !b.getAttribute('aria-label')) add('err', 'Botón sin texto', 'Agregale texto o un aria-label.', b); });
    d.body.querySelectorAll('iframe').forEach(f => { if (!f.getAttribute('title')) add('warn', 'Contenido externo sin título', 'Agregale un título (por ejemplo “Video de YouTube”).', f); });
    const ids = {}; d.querySelectorAll('[id]').forEach(e => { ids[e.id] = (ids[e.id] || 0) + 1; }); Object.entries(ids).forEach(([k, v]) => { if (v > 1) add('err', `El ID “${k}” está repetido ${v} veces`, 'Cada ID tiene que ser único.', d.getElementById(k)); });
    // peso de las imágenes
    const seen = new Set();
    for (const im of d.body.querySelectorAll('img[src]')) {
      const src = im.getAttribute('src'); if (/^(data:|https?:)/.test(src) || seen.has(src)) continue; seen.add(src);
      const path = new URL(src, 'http://x/' + S.path).pathname.slice(1); const h = S.files.get(decodeURIComponent(path)); if (!h) { add('err', 'Imagen que no existe', src, im); continue; }
      const size = (await h.getFile()).size; if (size > 450 * 1024) add('warn', `Imagen pesada (${Math.round(size / 1024)} KB)`, src.split('/').pop() + ' — reemplazala desde el editor y se achica sola.', im);
    }
    // contraste (sobre la vista actual)
    if (S.live && S.mode === 'visual') {
      const W = S.live.defaultView; let n = 0;
      for (const el of S.live.body.querySelectorAll('[data-eid]')) {
        if (n > 500) break; if (!hasOwnText(el)) continue; n++;
        const cs = W.getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0 || !el.getClientRects().length) continue;
        const fg = lum(cs.color); let bg = null, p = el, img = false;
        while (p && p.nodeType === 1) { const pc = W.getComputedStyle(p); if (pc.backgroundImage !== 'none') { img = true; break; } const c = lum(pc.backgroundColor); if (c && c.a > 0.5) { bg = c; break; } p = p.parentElement; }
        if (img || !fg) continue; if (!bg) bg = { l: 1 };
        const ratio = (Math.max(fg.l, bg.l) + 0.05) / (Math.min(fg.l, bg.l) + 0.05);
        const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && +cs.fontWeight >= 700);
        if (ratio < (big ? 3 : 4.5)) add('warn', `Poco contraste (${ratio.toFixed(1)}:1)`, '“' + el.textContent.trim().slice(0, 40) + '” — puede costar leerse.', el);
      }
    }
    const errs = items.filter(i => i.lvl === 'err').length, warns = items.length - errs;
    badge.textContent = items.length; badge.classList.toggle('hidden', !items.length);
    box.innerHTML = `<p class="note">${items.length ? `${errs} problema${errs === 1 ? '' : 's'} y ${warns} sugerencia${warns === 1 ? '' : 's'}. Tocá uno para ir al elemento.` : ''}</p>` +
      (items.length ? items.map((it, i) => `<button class="audit-item ${it.lvl}" data-i="${i}">${esc(it.title)}<small>${esc(it.detail || '')}</small></button>`).join('') : '<div class="audit-item ok">Todo en orden<small>No encontramos problemas de accesibilidad ni de SEO en esta página.</small></div>') +
      '<div class="acts"><button class="btn sm" id="auditRun">Volver a revisar</button></div>';
    box.querySelectorAll('.audit-item[data-i]').forEach(b => b.onclick = () => {
      const it = items[+b.dataset.i]; if (!it.eid) { if (/título|descripción|idioma/i.test(it.title)) tab('right', 'page'); return; }
      if (S.mode !== 'visual') setMode('visual');
      const el = liveById(it.eid); if (!el) return;
      const panel = el.closest('[role=tabpanel][hidden]'); if (panel && frame.contentWindow.MC) frame.contentWindow.MC.show(panel.id);
      select(el); el.scrollIntoView({ block: 'center' }); tab('right', 'el');
    });
    $('#auditRun').onclick = runAudit;
  }

  /* ================================================================
     capas (con arrastrar para reordenar)
     ================================================================ */
  const openLayers = new Set();
  let layerDrag = null;
  function renderLayers() {
    const box = $('#layers'); if (!box) return; box.innerHTML = '';
    if (S.kind !== 'html' || !S.doc) { box.innerHTML = '<p class="note pad">Abrí una página .html.</p>'; return; }
    const skip = ['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META'];
    const row = (el, depth) => {
      const kids = [...el.children].filter(k => !skip.includes(k.tagName));
      const id = el.getAttribute('data-eid');
      const b = document.createElement('button'); b.className = 'layer'; b.dataset.eid = id; b.style.paddingLeft = (0.4 + depth * 0.75) + 'rem'; b.draggable = true;
      const txt = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').slice(0, 28);
      const cls = el.getAttribute('class') ? '.' + el.getAttribute('class').split(/\s+/).slice(0, 2).join('.') : '';
      const name = el.getAttribute('data-ed-name');
      b.innerHTML = `<span class="tw">${kids.length ? (openLayers.has(id) ? '▾' : '▸') : ''}</span><span class="tg">${esc(NAMES[el.tagName.toLowerCase()] || el.tagName.toLowerCase())}</span>${name ? `<span class="nm">${esc(name)}</span>` : `<span class="cl">${esc(cls)}</span>`}${txt ? `<span class="tx">${esc(txt)}</span>` : ''}${el.hasAttribute('hidden') ? '<span class="tx">(oculto)</span>' : ''}`;
      if (id === S.selEid) b.classList.add('on');
      b.onclick = e => {
        if (e.target.classList.contains('tw') && kids.length) { openLayers.has(id) ? openLayers.delete(id) : openLayers.add(id); renderLayers(); return; }
        const live = liveById(id);
        if (live && S.mode === 'visual') {
          const panel = live.closest('[role=tabpanel][hidden]'); if (panel && frame.contentWindow.MC) frame.contentWindow.MC.show(panel.id);
          select(live, true); live.scrollIntoView({ block: 'center', behavior: 'smooth' });
          if (kids.length && !openLayers.has(id)) { openLayers.add(id); renderLayers(); }
        }
      };
      b.ondblclick = () => { const n = prompt('Nombre para esta capa (se ve solo en el editor)', name || ''); if (n === null) return; snap(); const live = liveById(id); if (live) setAttr(live, 'data-ed-name', n || null); else { n ? el.setAttribute('data-ed-name', n) : el.removeAttribute('data-ed-name'); markDirty(); } renderLayers(); };
      b.ondragstart = e => { layerDrag = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); };
      b.ondragend = () => { layerDrag = null; $$('#layers .layer').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-inside')); };
      b.ondragover = e => {
        if (!layerDrag || layerDrag === id) return; e.preventDefault();
        const r = b.getBoundingClientRect(), y = e.clientY - r.top;
        b.classList.remove('drop-before', 'drop-after', 'drop-inside');
        b.classList.add(y < r.height * 0.3 ? 'drop-before' : y > r.height * 0.7 ? 'drop-after' : 'drop-inside');
      };
      b.ondragleave = () => b.classList.remove('drop-before', 'drop-after', 'drop-inside');
      b.ondrop = e => {
        e.preventDefault(); if (!layerDrag || layerDrag === id) return;
        const pos = b.classList.contains('drop-before') ? 'before' : b.classList.contains('drop-after') ? 'after' : 'inside';
        const moving = S.doc.querySelector(`[data-eid="${layerDrag}"]`), target = el;
        if (!moving || moving.contains(target)) { toast('No se puede meter un elemento adentro de sí mismo.'); return; }
        snap();
        if (pos === 'before') target.before(moving); else if (pos === 'after') target.after(moving); else { target.append(moving); openLayers.add(id); }
        S.selEid = layerDrag; markDirty(); reloadPreview(); renderLayers();
      };
      box.appendChild(b);
      if (openLayers.has(id)) kids.forEach(k => row(k, depth + 1));
    };
    [...S.doc.body.children].filter(k => !skip.includes(k.tagName)).forEach(k => row(k, 0));
  }
  function openLayerPath(el) {
    let changed = false, p = el.parentElement;
    while (p && p.getAttribute && p.getAttribute('data-eid')) { const id = p.getAttribute('data-eid'); if (!openLayers.has(id) && p.tagName !== 'BODY') { openLayers.add(id); changed = true; } p = p.parentElement; }
    if (changed) renderLayers();
  }

  /* ================================================================
     bloques para agregar
     ================================================================ */
  const IC = {
    h: '<path d="M6 4v14M16 4v14M6 11h10"/>', p: '<path d="M4 6h26M4 11h26M4 16h18"/>', btn: '<rect x="4" y="5" width="26" height="12" rx="3"/><path d="M11 11h12"/>',
    img: '<rect x="4" y="3" width="26" height="16"/><path d="M6 17l7-7 5 5 4-4 6 6"/>', cols: '<rect x="3" y="4" width="12" height="14"/><rect x="19" y="4" width="12" height="14"/>',
    cols3: '<rect x="2" y="4" width="8" height="14"/><rect x="13" y="4" width="8" height="14"/><rect x="24" y="4" width="8" height="14"/>',
    sec: '<rect x="3" y="3" width="28" height="16"/><path d="M8 8h18M8 13h12"/>', list: '<path d="M10 6h20M10 11h20M10 16h20"/><circle cx="5" cy="6" r="1"/><circle cx="5" cy="11" r="1"/><circle cx="5" cy="16" r="1"/>',
    quote: '<path d="M6 7h6v6H8l-2 4M18 7h6v6h-4l-2 4"/>', hr: '<path d="M3 11h28"/>', space: '<path d="M17 3v16M13 6l4-3 4 3M13 16l4 3 4-3"/>',
    video: '<rect x="3" y="3" width="28" height="16" rx="2"/><path d="M14 7l7 4-7 4z"/>', map: '<path d="M17 19s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z"/><circle cx="17" cy="8" r="2"/>',
    form: '<rect x="4" y="3" width="26" height="4"/><rect x="4" y="9" width="26" height="4"/><rect x="4" y="15" width="12" height="4"/>', wa: '<path d="M6 19l2-5a9 9 0 113 3z"/>',
    social: '<circle cx="7" cy="11" r="3"/><circle cx="17" cy="11" r="3"/><circle cx="27" cy="11" r="3"/>', code: '<path d="M11 5l-7 6 7 6M23 5l7 6-7 6"/>',
    gal: '<rect x="3" y="3" width="8" height="7"/><rect x="13" y="3" width="8" height="7"/><rect x="23" y="3" width="8" height="7"/><rect x="3" y="12" width="8" height="7"/><rect x="13" y="12" width="8" height="7"/><rect x="23" y="12" width="8" height="7"/>',
    imgtxt: '<rect x="3" y="4" width="13" height="14"/><path d="M20 7h11M20 11h11M20 15h7"/>', cta: '<rect x="3" y="3" width="28" height="16"/><path d="M9 8h16"/><rect x="12" y="12" width="10" height="4"/>',
    card: '<rect x="5" y="2" width="24" height="18"/><path d="M5 10h24M9 14h12"/>', table: '<rect x="3" y="3" width="28" height="16"/><path d="M3 9h28M3 14h28M13 3v16M23 3v16"/>'
  };
  const btnStyle = 'display:inline-block;padding:.85em 1.6em;border:2px solid currentColor;border-radius:999px;text-decoration:none;font-weight:600';
  const BLOCKS = [
    ['Texto', [
      { l: 'Título', i: 'h', html: () => '<h2>Un título nuevo</h2>' },
      { l: 'Subtítulo', i: 'h', html: () => '<h3>Un subtítulo</h3>' },
      { l: 'Párrafo', i: 'p', html: () => '<p>Escribí acá tu texto. Hacé clic sobre él para cambiarlo.</p>' },
      { l: 'Lista', i: 'list', html: () => '<ul><li>Primer punto</li><li>Segundo punto</li><li>Tercer punto</li></ul>' },
      { l: 'Cita', i: 'quote', html: () => '<blockquote style="margin:2rem 0;padding-left:1.25rem;border-left:4px solid currentColor;font-size:1.4em">“Una frase importante.”<br><cite style="font-size:.6em;opacity:.7">Nombre</cite></blockquote>' },
      { l: 'Botón', i: 'btn', html: () => `<p><a href="#" style="${btnStyle}">Un botón</a></p>`, tip: 'Botón agregado. En el panel Elemento elegí a dónde lleva.' },
      { l: 'Tabla', i: 'table', html: () => '<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:.6rem;border-bottom:2px solid currentColor">Columna</th><th style="text-align:left;padding:.6rem;border-bottom:2px solid currentColor">Columna</th></tr></thead><tbody><tr><td style="padding:.6rem;border-bottom:1px solid rgba(127,127,127,.4)">Dato</td><td style="padding:.6rem;border-bottom:1px solid rgba(127,127,127,.4)">Dato</td></tr><tr><td style="padding:.6rem">Dato</td><td style="padding:.6rem">Dato</td></tr></tbody></table>' }
    ]],
    ['Diseño', [
      { l: 'Sección', i: 'sec', html: () => '<section style="padding:5rem 0"><h2>Título de la sección</h2><p>Texto de la sección.</p></section>' },
      { l: '2 columnas', i: 'cols', html: () => '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2rem;margin:2rem 0"><div><h3>Columna uno</h3><p>Texto de la primera columna.</p></div><div><h3>Columna dos</h3><p>Texto de la segunda columna.</p></div></div>', tip: 'Columnas agregadas. En celular conviene pasarlas a 1 columna desde Estilo → Distribución.' },
      { l: '3 columnas', i: 'cols3', html: () => '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2rem;margin:2rem 0"><div><h3>Uno</h3><p>Texto.</p></div><div><h3>Dos</h3><p>Texto.</p></div><div><h3>Tres</h3><p>Texto.</p></div></div>' },
      { l: 'Imagen y texto', i: 'imgtxt', html: () => `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2.5rem;align-items:center;margin:3rem 0">${imageHTML()}<div><h3>Un título</h3><p>Contá algo sobre esta imagen.</p></div></div>` },
      { l: 'Tarjeta', i: 'card', html: () => `<div style="border:1px solid rgba(127,127,127,.35);border-radius:16px;overflow:hidden;max-width:420px;margin:2rem 0">${imageHTML().replace('margin:0 0 1.5rem', 'margin:0')}<div style="padding:1.25rem 1.5rem 1.5rem"><h3>Título de la tarjeta</h3><p>Una descripción corta.</p></div></div>` },
      { l: 'Llamado a la acción', i: 'cta', html: () => `<section style="padding:4rem 2rem;text-align:center;border-radius:20px;background:rgba(127,127,127,.12);margin:3rem 0"><h2>¿Hablamos?</h2><p>Escribime y armamos tu proyecto.</p><p><a href="mailto:" style="${btnStyle}">Escribime</a></p></section>` },
      { l: 'Separador', i: 'hr', html: () => '<hr style="border:0;border-top:1px solid currentColor;opacity:.3;margin:3rem 0">' },
      { l: 'Espacio', i: 'space', html: () => '<div aria-hidden="true" style="height:4rem"></div>' }
    ]],
    ['Imágenes y medios', [
      { l: 'Imagen', i: 'img', html: () => imageHTML(), tip: 'Imagen agregada. Hacé doble clic para elegirla, o tocá una en la pestaña Imágenes.' },
      { l: 'Galería', i: 'gal', html: () => `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:2rem 0">${[1, 2, 3, 4, 5, 6].map(() => imageHTML().replace('margin:0 0 1.5rem', 'margin:0')).join('')}</div>`, tip: 'Galería agregada. Doble clic en cada imagen para elegirla.' },
      { l: 'Video de YouTube', i: 'video', html: async () => {
          const u = prompt('Pegá el link del video de YouTube'); if (!u) return null;
          const m = u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); if (!m) { toast('No reconocí ese link de YouTube.'); return null; }
          return `<div style="aspect-ratio:16/9;margin:2rem 0"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="Video de YouTube" style="width:100%;height:100%;border:0" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`; } },
      { l: 'Mapa', i: 'map', html: async () => {
          const q = prompt('¿Qué dirección querés mostrar?', 'Córdoba, Argentina'); if (!q) return null;
          return `<div style="aspect-ratio:16/9;margin:2rem 0"><iframe src="https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed" title="Mapa: ${esc(q)}" style="width:100%;height:100%;border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>`; } }
    ]],
    ['Contacto', [
      { l: 'Botón WhatsApp', i: 'wa', html: async () => {
          const n = prompt('Número de WhatsApp con código de país, sin + (ej. 5493511234567)'); if (!n) return null;
          const t = prompt('Mensaje inicial', 'Hola! Vi tu web y quería consultarte.') || '';
          return `<p><a href="https://wa.me/${n.replace(/\D/g, '')}${t ? '?text=' + encodeURIComponent(t) : ''}" target="_blank" rel="noopener" style="${btnStyle};background:#25D366;border-color:#25D366;color:#fff">Escribime por WhatsApp</a></p>`; } },
      { l: 'Formulario', i: 'form', html: async () => {
          const m = prompt('¿A qué mail llegan los mensajes?'); if (!m) return null;
          const f = 'display:block;width:100%;padding:.75rem;margin:.35rem 0 1rem;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;font:inherit';
          return `<form action="mailto:${esc(m)}" method="post" enctype="text/plain" style="max-width:520px;margin:2rem 0"><label>Nombre<input name="nombre" required style="${f}"></label><label>Mail<input type="email" name="mail" required style="${f}"></label><label>Mensaje<textarea name="mensaje" rows="5" required style="${f}"></textarea></label><button type="submit" style="${btnStyle};background:none;color:inherit;cursor:pointer">Enviar</button></form>`; },
        tip: 'Formulario agregado. Abre el programa de mail del visitante; para recibir mensajes directo, después se puede conectar con un servicio como Formspree.' },
      { l: 'Redes', i: 'social', html: () => '<p style="display:flex;gap:1.5rem;flex-wrap:wrap"><a href="https://instagram.com/" target="_blank" rel="noopener">Instagram</a><a href="https://www.behance.net/" target="_blank" rel="noopener">Behance</a><a href="https://www.linkedin.com/" target="_blank" rel="noopener">LinkedIn</a></p>', tip: 'Links agregados. Elegí cada uno y poné tu dirección en el panel Elemento.' }
    ]],
    ['Avanzado', [
      { l: 'Código HTML', i: 'code', html: () => ask('Código HTML', '<p class="note">Pegá el código que te dieron (por ejemplo, un widget). Se inserta tal cual.</p><textarea class="inp mono" id="askCode" style="min-height:200px"></textarea>', 'Insertar', 'Cancelar').then(ok => ok ? (document.getElementById('askCode')?.value || '').trim() || null : null), getValue: true }
    ]]
  ];
  function renderBlocks() {
    const box = $('#blocks'); box.innerHTML = '';
    BLOCKS.forEach(([cat, list]) => {
      box.insertAdjacentHTML('beforeend', `<h4>${esc(cat)}</h4>`);
      const g = document.createElement('div'); g.className = 'blockgrid';
      list.forEach(bk => {
        const b = document.createElement('button'); b.className = 'blk'; b.draggable = true; b.title = 'Clic para insertar · Arrastrar a la página';
        b.innerHTML = `<svg viewBox="0 0 34 22" aria-hidden="true">${IC[bk.i]}</svg>${esc(bk.l)}`;
        b.onclick = async () => {
          if (S.kind !== 'html' || S.mode !== 'visual') { toast('Abrí una página en modo Visual para agregar elementos.'); return; }
          const html = await bk.html(); if (!html) return;
          insertHTML(html, S.sel ? srcOf(S.sel) : null, S.sel ? S.where : 'inside', bk);
        };
        b.ondragstart = e => { dragKind = 'block'; dragData = bk; e.dataTransfer.setData('text/plain', bk.l); e.dataTransfer.effectAllowed = 'copy'; };
        b.ondragend = () => { setTimeout(() => { if (dragKind === 'block') { dragKind = null; } }, 50); hideDrop(); };
        g.appendChild(b);
      });
      box.appendChild(g);
    });
  }
  renderBlocks();
  $$('#insertWhere button').forEach(b => b.onclick = () => { S.where = b.dataset.w; $$('#insertWhere button').forEach(x => x.setAttribute('aria-pressed', x === b)); });

  /* ================================================================
     editor de código
     ================================================================ */
  function openCode() {
    const { EditorView, EditorState, basicSetup, keymap, html, css, javascript, oneDark } = window.CM;
    const e = ext(S.path);
    const lang = (e === 'css') ? css() : (e === 'js' || e === 'mjs' || e === 'json') ? javascript() : html();
    const text = S.kind === 'html' ? serialize() : S.buffers.get(S.path).text;
    if (S.cm) S.cm.destroy();
    let t = null;
    S.cm = new EditorView({
      parent: $('#code'),
      state: EditorState.create({
        doc: text,
        extensions: [basicSetup, lang, oneDark, EditorView.lineWrapping,
          keymap.of([{ key: 'Mod-s', run: () => { save(); return true; } }]),
          EditorView.updateListener.of(u => {
            if (!u.docChanged) return;
            const v = u.state.doc.toString(), b = S.buffers.get(S.path);
            b.text = v; if (!b.dirty) { b.dirty = true; renderFiles(); } updateStatus();
            clearTimeout(t); t = setTimeout(() => { if (S.kind === 'html') parseDoc(v); if (S.kind === 'html' || previewable()) reloadPreview(); }, 500);
          })]
      })
    });
    S.cmPath = S.path;
  }

  /* ================================================================
     guardar, exportar, historial, buscar, páginas nuevas
     ================================================================ */
  async function save() {
    if (S.kind === 'html' && S.doc && S.mode !== 'code') { const b = S.buffers.get(S.path); if (b && b.dirty) b.text = serialize(); }
    const dirty = [...S.buffers.entries()].filter(([, b]) => b.dirty);
    if (!dirty.length) return;
    $('#save').disabled = true; $('#status').textContent = 'Guardando…';
    const st = stamp();
    try {
      for (const [path, b] of dirty) {
        try { if (S.files.has(path)) await writeFile('respaldos/' + st + '/' + path, await readBytes(path), false); } catch {}
        await writeFile(path, b.text); b.dirty = false;
      }
      $('#status').dataset.saved = '1'; updateStatus(); renderFiles();
      await kv(draftKey(), undefined, true);
      toast('Guardado. La versión anterior quedó en respaldos/' + st + '.');
    } catch (e) { updateStatus(); toast('No se pudo guardar: ' + e.message, 6000); }
  }
  $('#save').onclick = save;
  $('#viewSite').onclick = () => { if (S.kind === 'html' && S.mode !== 'code') commitHTML(); window.open('/site/' + (S.kind === 'html' ? S.path : 'index.html'), '_blank'); };

  async function exportZipBytes() {
    if (S.kind === 'html' && S.doc && S.mode !== 'code') commitHTML();
    const files = {}, enc = new TextEncoder();
    for (const p of S.files.keys()) {
      const b = S.buffers.get(p);
      files[p] = b ? enc.encode(p === S.path && S.kind === 'html' && S.doc && S.mode !== 'code' ? serialize() : b.text) : await readBytes(p);
    }
    return window.fflate.zipSync(files, { level: 6 });
  }
  async function exportZip() {
    if (!window.fflate) { toast('No se encontró el compresor.'); return; }
    toast('Armando el .zip…', 10000);
    if (S.kind === 'html' && S.doc && S.mode !== 'code') commitHTML();
    const files = {}, enc = new TextEncoder();
    for (const p of S.files.keys()) {
      const b = S.buffers.get(p);
      files[p] = b ? enc.encode(p === S.path && S.kind === 'html' && S.doc && S.mode !== 'code' ? serialize() : b.text) : await readBytes(p);
    }
    const zip = window.fflate.zipSync(files, { level: 6 });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    a.download = (S.root.name || 'sitio').replace(/\s+/g, '-') + '.zip'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Listo: la web está en un .zip (incluye cambios sin guardar). Lo podés subir, por ejemplo, arrastrándolo a app.netlify.com/drop.', 7000);
  }

  async function openHistory() {
    let html = '<p class="note">Cada vez que guardás se hace una copia de lo anterior. Restaurar trae esos archivos como cambios pendientes: revisalos y tocá Guardar.</p><div class="results">';
    const groups = [];
    try {
      const r = await S.root.getDirectoryHandle('respaldos');
      for await (const [name, h] of r.entries()) if (h.kind === 'directory' && /^\d{12}$/.test(name)) groups.push({ name, h, files: [] });
    } catch {}
    for (const g of groups) { const files = []; await (async function walk(d, pre) { for await (const [n, x] of d.entries()) x.kind === 'directory' ? await walk(x, pre + n + '/') : files.push(pre + n); })(g.h, ''); g.files = files; }
    groups.sort((a, b) => b.name.localeCompare(a.name));
    const fmt = n => `${n.slice(6, 8)}/${n.slice(4, 6)}/${n.slice(0, 4)} ${n.slice(8, 10)}:${n.slice(10, 12)}`;
    if (!groups.length) html += '<p class="note">Todavía no hay respaldos. Se crean al guardar.</p>';
    groups.forEach((g, i) => { html += `<div class="result"><b>${fmt(g.name)}</b><small>${g.files.map(esc).join(', ')}</small><div class="acts"><button class="btn sm" data-restore="${i}">Restaurar estos archivos</button></div></div>`; });
    html += '</div>';
    modal('Historial', html);
    $$('[data-restore]').forEach(b => b.onclick = async () => {
      const g = groups[+b.dataset.restore];
      for (const f of g.files) {
        const parts = f.split('/'); let d = g.h; for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p);
        const file = await (await d.getFileHandle(parts.at(-1))).getFile();
        if (TEXT_EXT.includes(ext(f))) S.buffers.set(f, { text: await file.text(), dirty: true });
        else await writeFile(f, await file.arrayBuffer());
      }
      closeModal(); updateStatus(); renderFiles();
      if (g.files.includes(S.path)) { const p = S.path; S.path = null; openFile(p); }
      toast('Versión restaurada como cambios pendientes. Tocá Guardar para dejarla.');
    });
  }

  function openSearch() {
    modal('Buscar y reemplazar', `
      <div class="row2"><label class="field"><span>Buscar</span><input class="inp" id="sQ"></label><label class="field"><span>Reemplazar por</span><input class="inp" id="sR"></label></div>
      <div class="checks" style="margin-top:.6rem"><label class="chk"><input type="checkbox" id="sText" checked> Solo en textos visibles</label><label class="chk"><input type="checkbox" id="sCase"> Distinguir mayúsculas</label></div>
      <div class="acts"><button class="btn primary sm" id="sGo">Buscar en todo el sitio</button><button class="btn sm" id="sAll" disabled>Reemplazar todo</button></div>
      <div class="results" id="sRes"></div>`);
    const q = $('#sQ'); q.focus();
    let found = [];
    const rx = () => new RegExp($('#sQ').value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $('#sCase').checked ? 'g' : 'gi');
    async function textOf(p) { if (p === S.path && S.kind === 'html' && S.doc && S.mode !== 'code') return serialize(); return S.buffers.has(p) ? S.buffers.get(p).text : readText(p); }
    async function search() {
      if (!q.value) return; found = []; const r = rx();
      const onlyText = $('#sText').checked;
      for (const p of S.files.keys()) {
        const e = ext(p); if (!TEXT_EXT.includes(e) || (onlyText && e !== 'html' && e !== 'htm')) continue;
        const t = await textOf(p);
        if (onlyText) {
          const d = new DOMParser().parseFromString(t, 'text/html');
          const w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT); let n;
          while ((n = w.nextNode())) { if (n.parentElement.closest('script,style')) continue; r.lastIndex = 0; if (r.test(n.textContent)) found.push({ p, snip: n.textContent.trim().slice(0, 120) }); }
        } else t.split('\n').forEach((line, i) => { r.lastIndex = 0; if (r.test(line)) found.push({ p, snip: line.trim().slice(0, 120), line: i + 1 }); });
      }
      const hl = s => esc(s).replace(new RegExp(esc($('#sQ').value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $('#sCase').checked ? 'g' : 'gi'), m => `<mark>${m}</mark>`);
      $('#sRes').innerHTML = found.length ? `<p class="note">${found.length} resultado${found.length > 1 ? 's' : ''}.</p>` + found.map((f, i) => `<button class="result" data-i="${i}">${hl(f.snip)}<small>${esc(f.p)}${f.line ? ' · línea ' + f.line : ''}</small></button>`).join('') : '<p class="note">No se encontró.</p>';
      $('#sAll').disabled = !found.length;
      $$('#sRes .result').forEach(b => b.onclick = () => { const f = found[+b.dataset.i]; closeModal(); if (ext(f.p) === 'html') { S.pendingFind = $('#sQ')?.value || q.value; if (S.path === f.p && S.mode === 'visual') { findInLive(q.value); S.pendingFind = null; } else { S.mode = 'visual'; openFile(f.p); } } else openFile(f.p); });
    }
    $('#sGo').onclick = search; q.onkeydown = e => { if (e.key === 'Enter') search(); };
    $('#sAll').onclick = async () => {
      if (!confirm(`¿Reemplazar todas las coincidencias por “${$('#sR').value}”?`)) return;
      const r = rx(), rep = $('#sR').value, onlyText = $('#sText').checked; let total = 0;
      if (S.kind === 'html' && S.doc && S.mode !== 'code') commitHTML();
      const files = [...new Set(found.map(f => f.p))];
      for (const p of files) {
        let t = S.buffers.has(p) ? S.buffers.get(p).text : await readText(p);
        if (p === S.path && S.kind === 'html' && S.doc && S.mode !== 'code') t = serialize();
        if (onlyText) {
          const d = new DOMParser().parseFromString(t, 'text/html');
          const w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT); let n;
          while ((n = w.nextNode())) { if (n.parentElement.closest('script,style')) continue; const before = n.textContent; n.textContent = before.replace(r, () => { total++; return rep; }); }
          const dt = /^\s*<!doctype[^>]*>/i.exec(t)?.[0] || '<!DOCTYPE html>';
          t = dt + '\n' + d.documentElement.outerHTML + '\n';
        } else t = t.replace(r, () => { total++; return rep; });
        S.buffers.set(p, { text: t, dirty: true });
        if (p === S.path && S.kind === 'html') { snap(); parseDoc(t); reloadPreview(); }
      }
      updateStatus(); renderFiles(); closeModal();
      toast(`${total} reemplazo${total === 1 ? '' : 's'} hecho${total === 1 ? '' : 's'}. Revisá y tocá Guardar.`);
    };
  }

  async function newPage(basePath) {
    const htmls = [...S.files.keys()].filter(p => ext(p) === 'html');
    const base = basePath || (S.kind === 'html' ? S.path : htmls[0]);
    modal('Nueva página', `
      <label class="field"><span>Nombre del archivo</span><input class="inp" id="npName" placeholder="contacto"></label>
      <div class="field"><span>Contenido</span>
        <label class="chk"><input type="radio" name="npKind" value="blank" checked> En blanco, con los estilos y tipografías del sitio</label>
        <label class="chk"><input type="radio" name="npKind" value="copy"> Copia completa de ${esc(base || '—')}</label></div>
      <div class="acts"><button class="btn primary" id="npGo">Crear página</button></div>`);
    $('#npName').focus();
    $('#npGo').onclick = async () => {
      let name = slug($('#npName').value || 'pagina-nueva'); const path = dirOf(base || '') + name + '.html';
      if (S.files.has(path)) { toast('Ya existe una página con ese nombre.'); return; }
      const kind = document.querySelector('input[name=npKind]:checked').value;
      let text;
      const src = base ? (S.buffers.has(base) ? S.buffers.get(base).text : await readText(base)) : '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title></title></head><body></body></html>';
      if (kind === 'copy') text = src;
      else {
        const d = new DOMParser().parseFromString(src, 'text/html');
        d.title = name.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
        d.body.innerHTML = '\n<main style="padding:8rem 2rem 4rem;max-width:1100px;margin:0 auto">\n  <h1>' + esc(d.title) + '</h1>\n  <p>Empezá a escribir acá. Agregá elementos desde la pestaña Agregar.</p>\n</main>\n';
        d.body.removeAttribute('class');
        text = '<!DOCTYPE html>\n' + d.documentElement.outerHTML + '\n';
      }
      await writeFile(path, text); closeModal(); renderFiles(); S.mode = 'visual'; openFile(path);
      toast('Página creada: ' + path + '. Para que se pueda llegar, agregá un link desde otra página.', 6000);
    };
  }
  $('#newPage').onclick = () => newPage();

  function showKeys() {
    const k = [['Ctrl + S', 'Guardar'], ['Ctrl + Z / Ctrl + Y', 'Deshacer / rehacer'], ['Ctrl + C / Ctrl + V', 'Copiar / pegar el elemento elegido'], ['Ctrl + X', 'Cortar el elemento'], ['Ctrl + D', 'Duplicar'], ['Supr', 'Borrar el elemento elegido'], ['Alt + ↑ / ↓', 'Subir / bajar el elemento'], ['Enter', 'Empezar a escribir en el texto elegido'], ['Shift + Enter', 'Salto de línea dentro de un texto'], ['Esc', 'Soltar la selección'], ['Doble clic en imagen', 'Reemplazarla'], ['Clic derecho', 'Más opciones'], ['Ctrl + Shift + F', 'Buscar y reemplazar en todo el sitio'], ['Ctrl + F (en Código)', 'Buscar dentro del archivo'], ['?', 'Ver esta lista']];
    modal('Atajos de teclado', `<div class="keys">${k.map(([a, b]) => `<kbd>${esc(a)}</kbd><span>${esc(b)}</span>`).join('')}</div>`);
  }

  /* ---------- ventanas ---------- */
  let modalResolve = null;
  function modal(title, html) { $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); }
  function closeModal() { if ($('#modal').classList.contains('hidden')) return; $('#modal').classList.add('hidden'); if (modalResolve) { const r = modalResolve; modalResolve = null; r(false); } }
  function ask(title, html, ok, cancel) {
    return new Promise(res => {
      modal(title, html + `<div class="acts"><button class="btn primary" id="askOk">${esc(ok)}</button><button class="btn" id="askNo">${esc(cancel)}</button></div>`);
      modalResolve = res;
      $('#askOk').onclick = () => { modalResolve = null; res(true); setTimeout(() => $('#modal').classList.add('hidden'), 0); };
      $('#askNo').onclick = () => { modalResolve = null; res(false); $('#modal').classList.add('hidden'); };
    });
  }
  $('#modalClose').onclick = closeModal;
  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });

  /* ---------- menú Más ---------- */
  const more = $('#moreMenu');
  function closeMore() { more.classList.add('hidden'); $('#moreBtn').setAttribute('aria-expanded', 'false'); }
  $('#moreBtn').onclick = () => { const open = more.classList.contains('hidden'); more.classList.toggle('hidden', !open); $('#moreBtn').setAttribute('aria-expanded', open); };
  const mi = (id, fn) => $(id).onclick = () => { closeMore(); if (!S.root) return; fn(); };
  mi('#mSearch', openSearch); mi('#mHistory', openHistory); mi('#mExport', exportZip); mi('#mNewPage', () => newPage()); mi('#mKeys', showKeys);
  mi('#mClose', () => { if ([...S.buffers.values()].some(b => b.dirty) && !confirm('Hay cambios sin guardar. ¿Cambiar de carpeta igual?')) return; S.buffers.clear(); location.reload(); });

  /* ---------- pestañas de los paneles ---------- */
  function tab(side, name) { const b = document.querySelector(`.${side} .tabs button[data-tab="${name}"]`); if (b) b.click(); }
  $$('.tabs').forEach(tabs => tabs.querySelectorAll('button').forEach(b => b.onclick = () => {
    tabs.querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', x === b));
    tabs.parentElement.querySelectorAll('.tabpane').forEach(p => p.classList.toggle('hidden', p.id !== 'pane-' + b.dataset.tab));
    if (b.dataset.tab === 'layers') renderLayers();
    if (b.dataset.tab === 'audit') runAudit();
    if (b.dataset.tab === 'assets') renderAssetsHint();
  }));
  applyFrameSize(); clearSel();

  /* ================================================================
     API para los módulos (imágenes, componentes, publicar, idioma)
     ================================================================ */
  window.ED = { S, $, $$, esc, ext, dirOf, stamp, uid, slug, toast, kv, snap, markDirty, updateStatus, writeEdCss, readEdCss, setStyle, ownStyle, edId, cloneEdIds,
    srcOf, liveById, select, clearSel, reselect, insertHTML, reloadPreview, renderStyle, renderElement, renderFiles, renderAssets, renderLayers, renderBlocks, openFile,
    readText, readBytes, writeFile, setAttr, frame: () => frame, removeFile, storeImage, setImage, relPath, imgFolder, pickFiles, optimize, imageHTML, showCtx, modal, closeModal, ask, tab,
    serialize, parseDoc, commitHTML, srcToPath, showImage, stripIds, renumber, BLOCKS, IC, DEV, DEVS, IMG_EXT, TEXT_EXT, scan, exportZipBytes, assetURLs, save };
  document.dispatchEvent(new Event('ed-ready'));



})();
