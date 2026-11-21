/* Pestaña Efectos: biblioteca de animaciones y efectos sin código, más controles
   especiales para webs como el portafolio (colores por sección, carrusel 3D, imágenes en atributos). */
(function () {
  'use strict';
  const E = window.ED; if (!E) return;
  const { S, $, $$, esc, toast } = E;

  /* ================================================================
     motor que se agrega a la página (CSS + JS chico, sin librerías)
     ================================================================ */
  const H = s => `:is(html.ed-fx-on [data-ed-anim="${s}"]:not(.ed-in),[data-ed-anim="${s}"].ed-pre)`;
  const ENTR = {
    'fade': '', 'fade-up': 'transform:translateY(50px)', 'fade-down': 'transform:translateY(-50px)', 'slide-left': 'transform:translateX(-90px)', 'slide-right': 'transform:translateX(90px)',
    'zoom-in': 'transform:scale(.8)', 'zoom-out': 'transform:scale(1.18)', 'flip-x': 'transform:perspective(900px) rotateX(75deg)', 'flip-y': 'transform:perspective(900px) rotateY(75deg)',
    'rotate-in': 'transform:rotate(-14deg) scale(.9)', 'blur': 'filter:blur(18px)', 'skew-in': 'transform:translateY(60px) skewY(7deg)', 'bounce-in': 'transform:scale(.5)',
    'fade-up-big': 'transform:translateY(140px)', 'zoom': 'transform:scale(.88)'
  };
  const FX_CSS = `/* Efectos del editor web */
[data-ed-anim]{--d:.9s;--dl:0s;--e:cubic-bezier(.2,.7,.2,1);transition:opacity var(--d) var(--e) var(--dl),transform var(--d) var(--e) var(--dl),filter var(--d) var(--e) var(--dl),clip-path var(--d) var(--e) var(--dl)}
${Object.keys(ENTR).map(k => H(k)).join(',')}{opacity:0}
${Object.entries(ENTR).filter(([, v]) => v).map(([k, v]) => `${H(k)}{${v}}`).join('\n')}
[data-ed-anim="bounce-in"]{--e:cubic-bezier(.34,1.56,.64,1)}
[data-ed-anim="clip-up"],[data-ed-anim="clip-left"],[data-ed-anim="clip-down"]{clip-path:inset(0 0 0 0)}
[data-ed-anim="clip-circle"]{clip-path:circle(75% at 50% 50%)}
${H('clip-up')}{clip-path:inset(100% 0 0 0)} ${H('clip-down')}{clip-path:inset(0 0 100% 0)} ${H('clip-left')}{clip-path:inset(0 100% 0 0)} ${H('clip-circle')}{clip-path:circle(0% at 50% 50%)}
.ed-ch{display:inline-block;transition:opacity var(--d,.8s) var(--e,cubic-bezier(.2,.7,.2,1)),transform var(--d,.8s) var(--e,cubic-bezier(.2,.7,.2,1));white-space:pre}
html.ed-fx-on [data-ed-anim="letters"]:not(.ed-in) .ed-ch,html.ed-fx-on [data-ed-anim="words"]:not(.ed-in) .ed-ch{opacity:0;transform:translateY(.7em) rotate(4deg)}
html.ed-fx-on [data-ed-anim="typewriter"]:not(.ed-in){opacity:0}
.ed-caret::after{content:"";display:inline-block;width:.06em;height:1em;margin-left:.06em;background:currentColor;vertical-align:-.12em;animation:ed-blink 1s steps(1) infinite}
/* en loop */
@keyframes ed-float{50%{translate:0 -12px}}@keyframes ed-pulse{50%{scale:1.06}}@keyframes ed-spin{to{rotate:360deg}}
@keyframes ed-wobble{15%{rotate:-6deg}30%{rotate:5deg}45%{rotate:-4deg}60%{rotate:3deg}75%{rotate:-1deg}}
@keyframes ed-shake{10%,90%{translate:-1px 0}20%,80%{translate:3px 0}30%,50%,70%{translate:-5px 0}40%,60%{translate:5px 0}}
@keyframes ed-swing{20%{rotate:10deg}40%{rotate:-8deg}60%{rotate:4deg}80%{rotate:-3deg}}
@keyframes ed-glow{50%{filter:drop-shadow(0 0 14px var(--g1,#E2541E))}}@keyframes ed-bounce{0%,100%{translate:0 0}40%{translate:0 -22px}60%{translate:0 -10px}}
@keyframes ed-heart{14%,42%{scale:1.12}28%,70%{scale:1}}@keyframes ed-blink{50%{opacity:0}}@keyframes ed-gradient{to{background-position:200% 50%}}
@keyframes ed-breathe{50%{opacity:.55}}@keyframes ed-tilt{25%{rotate:2deg}75%{rotate:-2deg}}
[data-ed-loop="float"]{animation:ed-float var(--ls,3s) ease-in-out infinite}[data-ed-loop="pulse"]{animation:ed-pulse var(--ls,2s) ease-in-out infinite}
[data-ed-loop="spin"]{animation:ed-spin var(--ls,8s) linear infinite}[data-ed-loop="wobble"]{animation:ed-wobble var(--ls,2.5s) ease-in-out infinite}
[data-ed-loop="shake"]{animation:ed-shake var(--ls,2.5s) ease-in-out infinite}[data-ed-loop="swing"]{animation:ed-swing var(--ls,2.5s) ease-in-out infinite;transform-origin:top center}
[data-ed-loop="glow"]{animation:ed-glow var(--ls,2.5s) ease-in-out infinite}[data-ed-loop="bounce"]{animation:ed-bounce var(--ls,1.8s) ease infinite}
[data-ed-loop="heartbeat"]{animation:ed-heart var(--ls,1.6s) ease-in-out infinite}[data-ed-loop="blink"]{animation:ed-blink var(--ls,1.2s) steps(1) infinite}
[data-ed-loop="breathe"]{animation:ed-breathe var(--ls,3s) ease-in-out infinite}[data-ed-loop="tilt"]{animation:ed-tilt var(--ls,4s) ease-in-out infinite}
[data-ed-loop="gradient-bg"]{background-image:linear-gradient(120deg,var(--g1,#E2541E),var(--g2,#F2D21B),var(--g1,#E2541E));background-size:200% 200%;animation:ed-gradient var(--ls,6s) linear infinite}
/* al pasar el mouse */
[data-ed-hfx]{transition:transform .35s cubic-bezier(.2,.7,.2,1),box-shadow .35s,filter .35s,color .3s,background-color .3s,background-size .35s,opacity .3s}
[data-ed-hfx="grow"]:hover{transform:scale(1.06)}[data-ed-hfx="shrink"]:hover{transform:scale(.95)}
[data-ed-hfx="lift"]:hover{transform:translateY(-8px);box-shadow:0 18px 40px rgba(0,0,0,.3)}[data-ed-hfx="rotate"]:hover{transform:rotate(3deg)}
[data-ed-hfx="skew"]:hover{transform:skewX(-6deg)}[data-ed-hfx="glow"]:hover{box-shadow:0 0 0 2px var(--g1,#E2541E),0 0 28px var(--g1,#E2541E)}
[data-ed-hfx="shadow"]:hover{box-shadow:0 22px 50px rgba(0,0,0,.4)}[data-ed-hfx="invert"]:hover{filter:invert(1)}
[data-ed-hfx="color"]{filter:grayscale(1)}[data-ed-hfx="color"]:hover{filter:none}
[data-ed-hfx="focus"]{filter:blur(3px)}[data-ed-hfx="focus"]:hover{filter:none}[data-ed-hfx="dim"]:hover{opacity:.6}
[data-ed-hfx="zoom"]{overflow:hidden}[data-ed-hfx="zoom"] img{transition:transform .7s cubic-bezier(.2,.7,.2,1)}[data-ed-hfx="zoom"]:hover img,img[data-ed-hfx="zoom"]:hover{transform:scale(1.08)}
[data-ed-hfx="underline"]{background-image:linear-gradient(currentColor,currentColor);background-size:0% 2px;background-repeat:no-repeat;background-position:left 100%;text-decoration:none}[data-ed-hfx="underline"]:hover{background-size:100% 2px}
[data-ed-hfx="shine"]{position:relative;overflow:hidden}[data-ed-hfx="shine"]::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.45) 50%,transparent 70%);transform:translateX(-120%);transition:transform .8s;pointer-events:none}[data-ed-hfx="shine"]:hover::after{transform:translateX(120%)}
[data-ed-hfx="tilt"],[data-ed-hfx="magnet"]{transition:transform .2s ease-out}[data-ed-hfx="tilt"]{transform:perspective(800px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg))}[data-ed-hfx="magnet"]{transform:translate(var(--mx,0px),var(--my,0px))}
/* con el scroll */
[data-ed-scroll="sticky"]{position:sticky;top:var(--st,0px)}
/* texto */
[data-ed-text="gradient"],[data-ed-text="gradient-move"]{background-image:linear-gradient(90deg,var(--g1,#E2541E),var(--g2,#F2D21B),var(--g1,#E2541E));-webkit-background-clip:text;background-clip:text;color:transparent!important}
[data-ed-text="gradient-move"]{background-size:200% auto;animation:ed-gradient 4s linear infinite}
[data-ed-text="outline"]{color:transparent!important;-webkit-text-stroke:1.5px var(--g1,currentColor)}
[data-ed-text="neon"]{text-shadow:0 0 6px var(--g1,#E2541E),0 0 18px var(--g1,#E2541E),0 0 42px var(--g1,#E2541E)}
[data-ed-text="shadow3d"]{text-shadow:1px 1px 0 var(--g1,#E2541E),2px 2px 0 var(--g1,#E2541E),3px 3px 0 var(--g1,#E2541E),4px 4px 0 var(--g1,#E2541E),5px 5px 0 var(--g1,#E2541E)}
[data-ed-text="marker"]{background-image:linear-gradient(var(--g1,#F2D21B),var(--g1,#F2D21B));background-repeat:no-repeat;background-position:0 88%;background-size:0% 38%;transition:background-size 1.1s cubic-bezier(.2,.7,.2,1) .2s}
[data-ed-text="marker"].ed-in,html:not(.ed-fx-on) [data-ed-text="marker"]{background-size:100% 38%}
[data-ed-text="glitch"]{position:relative;display:inline-block}
[data-ed-text="glitch"]::before,[data-ed-text="glitch"]::after{content:attr(data-text);position:absolute;inset:0;pointer-events:none}
[data-ed-text="glitch"]::before{color:#0ff;mix-blend-mode:screen;animation:ed-gl1 2.4s infinite steps(2)}[data-ed-text="glitch"]::after{color:#f0f;mix-blend-mode:screen;animation:ed-gl2 2.1s infinite steps(2)}
@keyframes ed-gl1{0%,86%,100%{clip-path:inset(0 0 100% 0);translate:0}88%{clip-path:inset(20% 0 50% 0);translate:-4px 0}92%{clip-path:inset(60% 0 10% 0);translate:4px 0}}
@keyframes ed-gl2{0%,84%,100%{clip-path:inset(0 0 100% 0);translate:0}86%{clip-path:inset(40% 0 30% 0);translate:4px 0}90%{clip-path:inset(10% 0 70% 0);translate:-3px 0}}
/* toda la página */
html:has(body[data-ed-smooth]){scroll-behavior:smooth}
body[data-ed-pagefade]{animation:ed-pagein .8s ease both}@keyframes ed-pagein{from{opacity:0}}
body[data-ed-grain]::after{content:"";position:fixed;inset:-50%;z-index:2147483000;pointer-events:none;opacity:var(--grain,.08);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");animation:ed-grain 1s steps(4) infinite}
@keyframes ed-grain{25%{transform:translate(-3%,2%)}50%{transform:translate(2%,-3%)}75%{transform:translate(-2%,-2%)}}
.ed-progress{position:fixed;left:0;top:0;height:3px;width:100%;transform-origin:left;transform:scaleX(0);z-index:2147483001;pointer-events:none}
.ed-totop{position:fixed;right:1.25rem;bottom:1.25rem;width:48px;height:48px;border-radius:50%;border:0;font-size:1.3rem;cursor:pointer;z-index:2147483001;opacity:0;transform:translateY(20px);transition:.3s;box-shadow:0 8px 24px rgba(0,0,0,.3)}
.ed-totop.on{opacity:1;transform:none}
.ed-cursor{position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;border:2px solid var(--cc,#E2541E);pointer-events:none;z-index:2147483002;transition:width .2s,height .2s,margin .2s,background .2s;mix-blend-mode:difference}
.ed-cursor.big{width:60px;height:60px;margin:-30px 0 0 -30px;background:var(--cc,#E2541E)}
@media (hover:none),(pointer:coarse){.ed-cursor{display:none}}
@media (prefers-reduced-motion:reduce){html.ed-fx-on [data-ed-anim],html.ed-fx-on [data-ed-anim] .ed-ch{opacity:1!important;transform:none!important;filter:none!important;clip-path:none!important;transition:none!important}[data-ed-loop],[data-ed-text="gradient-move"],[data-ed-text="glitch"]::before,[data-ed-text="glitch"]::after,body[data-ed-grain]::after{animation:none!important}}`;

  const FX_JS = `(function(){var ED=!!window.EDITOR_WEB,RM=matchMedia('(prefers-reduced-motion: reduce)').matches,d=document,io;
function split(el,words){if(el.dataset.edSplit)return;el.dataset.edSplit=1;var w=d.createTreeWalker(el,NodeFilter.SHOW_TEXT),ns=[],n;while(n=w.nextNode())ns.push(n);var i=0,st=parseFloat(el.dataset.edStep||(words?.08:.035));ns.forEach(function(t){var f=d.createDocumentFragment();(words?t.textContent.split(/(\\s+)/):Array.from(t.textContent)).forEach(function(p){if(!p)return;if(/^\\s+$/.test(p)){f.appendChild(d.createTextNode(p));return}var s=d.createElement('span');s.className='ed-ch';s.textContent=p;s.style.transitionDelay='calc(var(--dl,0s) + '+(i++*st).toFixed(3)+'s)';f.appendChild(s)});t.parentNode.replaceChild(f,t)})}
function type(el){var t=el.dataset.edFull||el.textContent;el.dataset.edFull=t;el.textContent='';el.classList.add('ed-caret');var i=0,sp=parseFloat(el.dataset.edStep||.045)*1000;(function go(){el.textContent=t.slice(0,++i);if(i<t.length)setTimeout(go,sp);else setTimeout(function(){el.classList.remove('ed-caret')},1500)})()}
function enter(el){el.classList.add('ed-in');if(el.getAttribute('data-ed-anim')==='typewriter'&&!ED)type(el)}
function init(){if(!ED&&!RM)d.documentElement.classList.add('ed-fx-on');
d.querySelectorAll('[data-ed-stagger]').forEach(function(p){var t=p.getAttribute('data-ed-anim')||'fade-up',s=parseFloat(p.getAttribute('data-ed-stagger'))||.12;if(!ED){p.removeAttribute('data-ed-anim');Array.prototype.forEach.call(p.children,function(c,i){c.setAttribute('data-ed-anim',t);c.style.setProperty('--dl',(i*s).toFixed(2)+'s')})}});
if(!ED)d.querySelectorAll('[data-ed-anim="letters"],[data-ed-anim="words"]').forEach(function(el){split(el,el.getAttribute('data-ed-anim')==='words')});
d.querySelectorAll('[data-ed-text="glitch"]').forEach(function(el){el.setAttribute('data-text',el.textContent.trim())});
if('IntersectionObserver' in window){io=new IntersectionObserver(function(es){es.forEach(function(e){var el=e.target,again=el.hasAttribute('data-ed-again');if(e.isIntersecting){enter(el);if(!again)io.unobserve(el)}else if(again&&e.boundingClientRect.top>0)el.classList.remove('ed-in')})},{threshold:.15,rootMargin:'0px 0px -5% 0px'});d.querySelectorAll('[data-ed-anim],[data-ed-text="marker"]').forEach(function(el){io.observe(el)})}else d.querySelectorAll('[data-ed-anim]').forEach(enter);
scroll();page();hover()}
var sc=[];function scroll(){sc=Array.prototype.slice.call(d.querySelectorAll('[data-ed-scroll]:not([data-ed-scroll="sticky"])'));if(RM)return;tick()}
function tick(){var vh=innerHeight;sc.forEach(function(el){var r=el.getBoundingClientRect(),p=(r.top+r.height/2-vh/2)/vh,s=parseFloat(el.getAttribute('data-ed-speed')||.5),k=el.getAttribute('data-ed-scroll');p=Math.max(-1.5,Math.min(1.5,p));
if(k==='parallax')el.style.translate='0 '+(p*s*-160).toFixed(1)+'px';else if(k==='drift')el.style.translate=(p*s*-220).toFixed(1)+'px 0';else if(k==='zoom')el.style.scale=(1+Math.max(0,1-Math.abs(p))*.18*s).toFixed(3);else if(k==='rotate')el.style.rotate=(p*s*-25).toFixed(2)+'deg';else if(k==='fade')el.style.opacity=Math.max(0,Math.min(1,1.3-Math.abs(p)*1.6)).toFixed(2);else if(k==='blur')el.style.filter='blur('+(Math.max(0,Math.abs(p)-.25)*14*s).toFixed(1)+'px)'});if(sc.length)requestAnimationFrame(tick)}
function page(){var b=d.body,c=b.getAttribute('data-ed-progress');if(c&&!d.querySelector('.ed-progress')){var bar=d.createElement('div');bar.className='ed-progress';bar.style.background=c;b.appendChild(bar);var u=function(){var h=d.documentElement.scrollHeight-innerHeight;bar.style.transform='scaleX('+(h>0?scrollY/h:0)+')'};addEventListener('scroll',u,{passive:true});u()}
if(b.hasAttribute('data-ed-totop')&&!d.querySelector('.ed-totop')){var t=d.createElement('button');t.className='ed-totop';t.type='button';t.setAttribute('aria-label','Volver arriba');t.textContent='↑';var tc=b.getAttribute('data-ed-totop')||'#E2541E';t.style.background=tc;t.style.color='#fff';t.onclick=function(){scrollTo({top:0,behavior:RM?'auto':'smooth'})};b.appendChild(t);addEventListener('scroll',function(){t.classList.toggle('on',scrollY>600)},{passive:true})}
var cc=b.getAttribute('data-ed-cursor');if(cc&&!ED&&matchMedia('(hover:hover) and (pointer:fine)').matches&&!d.querySelector('.ed-cursor')){var cu=d.createElement('div');cu.className='ed-cursor';cu.style.setProperty('--cc',cc);b.appendChild(cu);var x=0,y=0,cx=0,cy=0;addEventListener('pointermove',function(e){x=e.clientX;y=e.clientY;cu.classList.toggle('big',!!e.target.closest('a,button,[data-ed-hfx]'))});(function f(){cx+=(x-cx)*.2;cy+=(y-cy)*.2;cu.style.transform='translate('+cx+'px,'+cy+'px)';requestAnimationFrame(f)})()}}
function hover(){if(RM)return;d.querySelectorAll('[data-ed-hfx="tilt"],[data-ed-hfx="magnet"]').forEach(function(el){if(el.dataset.edH)return;el.dataset.edH=1;var m=el.getAttribute('data-ed-hfx')==='magnet';el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect(),px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5;if(m){el.style.setProperty('--mx',(px*18).toFixed(1)+'px');el.style.setProperty('--my',(py*18).toFixed(1)+'px')}else{el.style.setProperty('--ry',(px*14).toFixed(1)+'deg');el.style.setProperty('--rx',(-py*14).toFixed(1)+'deg')}});el.addEventListener('pointerleave',function(){['--mx','--my','--rx','--ry'].forEach(function(v){el.style.removeProperty(v)})})})}
window.__edfx={play:function(el){var a=el.getAttribute('data-ed-anim');if(!a)return;el.classList.remove('ed-in');el.classList.add('ed-pre');void el.offsetWidth;requestAnimationFrame(function(){el.classList.remove('ed-pre');el.classList.add('ed-in')})},refresh:function(){d.querySelectorAll('[data-ed-text="glitch"]').forEach(function(el){el.setAttribute('data-text',el.textContent.trim())});scroll();page();hover()}};
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init);else init()})();`;

  function ensureFx() {
    const d = S.doc; let added = false;
    ['editor-anim', 'editor-anim-js'].forEach(id => { const x = d.getElementById(id); if (x) x.remove(); });
    let st = d.getElementById('editor-fx');
    if (!st) { st = d.createElement('style'); st.id = 'editor-fx'; st.setAttribute('data-eid', ++S.eid); d.head.appendChild(st); added = true; }
    if (st.textContent.trim() !== FX_CSS.trim()) st.textContent = '\n' + FX_CSS + '\n';
    let sc = d.getElementById('editor-fx-js');
    if (!sc) { sc = d.createElement('script'); sc.id = 'editor-fx-js'; sc.setAttribute('data-eid', ++S.eid); d.head.appendChild(sc); added = true; }
    if (sc.textContent !== FX_JS) sc.textContent = FX_JS;
    return added;
  }
  const W = () => E.frame().contentWindow;
  function after(el, reload) {
    E.markDirty();
    if (reload) { E.reloadPreview(); return; }
    try { W().__edfx && W().__edfx.refresh(); } catch {}
  }
  function setA(el, name, val) {
    const installed = ensureFx();
    E.setAttr(el, name, val == null ? null : val);
    after(el, installed || !W().__edfx);
    return installed;
  }
  function setVar(el, prop, val) { const prev = S.dev; S.dev = 'desktop'; E.setStyle(el, prop, val); S.dev = prev; }
  const getVar = (el, prop) => { const id = el.getAttribute('data-ed'); return (id && S.css.desktop[id] && S.css.desktop[id][prop]) || ''; };

  /* ================================================================
     panel Efectos
     ================================================================ */
  const ENTRANCES = [['fade', 'Aparecer'], ['fade-up', 'Subir'], ['fade-down', 'Bajar'], ['slide-left', 'Desde la izquierda'], ['slide-right', 'Desde la derecha'], ['zoom-in', 'Agrandarse'], ['zoom-out', 'Achicarse'],
    ['flip-x', 'Voltear (X)'], ['flip-y', 'Voltear (Y)'], ['rotate-in', 'Girar'], ['blur', 'Enfocar'], ['skew-in', 'Inclinado'], ['bounce-in', 'Rebote'], ['fade-up-big', 'Subir lejos'],
    ['clip-up', 'Cortina hacia arriba'], ['clip-down', 'Cortina hacia abajo'], ['clip-left', 'Cortina lateral'], ['clip-circle', 'Círculo'], ['letters', 'Letra por letra'], ['words', 'Palabra por palabra'], ['typewriter', 'Máquina de escribir']];
  const LOOPS = [['float', 'Flotar'], ['pulse', 'Latir suave'], ['heartbeat', 'Corazón'], ['bounce', 'Saltar'], ['spin', 'Girar'], ['wobble', 'Tambalear'], ['shake', 'Sacudir'], ['swing', 'Hamacar'], ['tilt', 'Balancear'], ['glow', 'Brillar'], ['blink', 'Parpadear'], ['breathe', 'Respirar'], ['gradient-bg', 'Degradado animado']];
  const HOVERS = [['grow', 'Agrandar'], ['shrink', 'Achicar'], ['lift', 'Elevar con sombra'], ['shadow', 'Sombra'], ['glow', 'Brillo'], ['zoom', 'Zoom en la imagen'], ['color', 'De B&N a color'], ['focus', 'De borroso a nítido'], ['dim', 'Atenuar'], ['invert', 'Invertir colores'],
    ['rotate', 'Girar un poco'], ['skew', 'Inclinar'], ['shine', 'Destello'], ['underline', 'Subrayado que crece'], ['tilt', 'Inclinación 3D'], ['magnet', 'Imán (sigue al mouse)']];
  const SCROLLS = [['parallax', 'Parallax'], ['drift', 'Se desliza al costado'], ['zoom', 'Se agranda al pasar'], ['rotate', 'Gira al bajar'], ['fade', 'Aparece y desaparece'], ['blur', 'Se desenfoca al salir'], ['sticky', 'Queda pegado']];
  const TEXTS = [['gradient', 'Degradado'], ['gradient-move', 'Degradado animado'], ['outline', 'Solo contorno'], ['neon', 'Neón'], ['shadow3d', 'Sombra 3D'], ['marker', 'Resaltador'], ['glitch', 'Glitch']];
  const EASES = [['cubic-bezier(.2,.7,.2,1)', 'Suave'], ['cubic-bezier(.34,1.56,.64,1)', 'Con rebote'], ['cubic-bezier(.68,-0.6,.32,1.6)', 'Elástico'], ['ease-in-out', 'Parejo'], ['linear', 'Lineal'], ['cubic-bezier(.85,0,.15,1)', 'Dramático']];

  function chips(group, list, cur) { return `<div class="chips" data-g="${group}"><button type="button" data-v="" aria-pressed="${!cur}">Ninguno</button>${list.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`; }
  function color(id, label, val) { return `<label class="field"><span>${label}</span><div class="colorf"><input type="color" id="${id}" value="${/^#[0-9a-f]{6}$/i.test(val) ? val : '#E2541E'}"></div></label>`; }
  function num(v) { const n = parseFloat(v); return isNaN(n) ? '' : n; }

  function renderFx() {
    const box = $('#fxBox'); if (!box) return;
    if (S.kind !== 'html' || !S.doc) { box.innerHTML = '<p class="note">Abrí una página .html.</p>'; return; }
    const el = S.sel && S.sel !== S.live?.body ? S.sel : null;
    let h = '';
    if (!el) h += '<p class="note">Elegí un elemento de la página para darle efectos. Abajo tenés los efectos de toda la página.</p>';
    else {
      const a = el.getAttribute('data-ed-anim') || '', lp = el.getAttribute('data-ed-loop') || '', hv = el.getAttribute('data-ed-hfx') || '', sc = el.getAttribute('data-ed-scroll') || '', tx = el.getAttribute('data-ed-text') || '';
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      h += `<p class="tagname">${esc(el.getAttribute('data-ed-name') || el.tagName.toLowerCase())}</p>
      <div class="sec"><h3>Al aparecer en pantalla</h3>${chips('anim', ENTRANCES.filter(([v]) => hasText || !/letters|words|typewriter/.test(v)), a)}
        <div class="row2"><label class="field"><span>Duración (seg.)</span><input class="inp" type="number" step="0.1" min="0.1" id="fxDur" placeholder="0.9" value="${num(getVar(el, '--d'))}"></label>
        <label class="field"><span>Demora (seg.)</span><input class="inp" type="number" step="0.1" min="0" id="fxDel" placeholder="0" value="${num(getVar(el, '--dl'))}"></label></div>
        <label class="field"><span>Movimiento</span><select class="inp" id="fxEase"><option value="">Suave (predeterminado)</option>${EASES.slice(1).map(([v, l]) => `<option value="${v}" ${getVar(el, '--e') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="chk" style="margin-top:.5rem"><input type="checkbox" id="fxAgain" ${el.hasAttribute('data-ed-again') ? 'checked' : ''}> Repetir cada vez que aparece</label>
        ${el.children.length > 1 ? `<label class="chk" style="margin-top:.35rem"><input type="checkbox" id="fxStag" ${el.hasAttribute('data-ed-stagger') ? 'checked' : ''}> Que entren de a uno los ${el.children.length} elementos de adentro</label>` : ''}
        <div class="acts"><button class="btn sm" id="fxPlay">▶ Ver cómo entra</button></div></div>
      <div class="sec"><h3>En loop (siempre en movimiento)</h3>${chips('loop', LOOPS, lp)}
        <div class="rng-row field"><span>Velocidad (segundos por vuelta)</span><input class="inp" type="number" step="0.1" min="0.2" id="fxLs" placeholder="auto" value="${num(getVar(el, '--ls'))}"></div></div>
      <div class="sec"><h3>Al pasar el mouse</h3>${chips('hfx', HOVERS, hv)}<p class="note" style="margin-top:.4rem">Pasá el mouse por el elemento en la vista para probarlo. En Estilo → “Al pasar el mouse” podés armar uno a medida.</p></div>
      <div class="sec"><h3>Con el scroll</h3>${chips('scroll', SCROLLS, sc)}
        <div class="field"><span>Intensidad</span><div class="range"><input type="range" min="-1" max="1" step="0.1" id="fxSpeed" value="${el.getAttribute('data-ed-speed') || 0.5}" style="flex:1;accent-color:var(--brand)"><output>${el.getAttribute('data-ed-speed') || 0.5}</output></div></div>
        ${sc === 'sticky' ? `<label class="field"><span>Distancia al borde de arriba (px)</span><input class="inp" type="number" id="fxSt" value="${num(getVar(el, '--st'))}" placeholder="0"></label>` : ''}</div>
      ${hasText ? `<div class="sec"><h3>Efectos de texto</h3>${chips('text', TEXTS, tx)}` : '<div class="sec"><h3>Colores de los efectos</h3>'}
        <div class="row2">${color('fxG1', 'Color 1', getVar(el, '--g1'))}${color('fxG2', 'Color 2', getVar(el, '--g2'))}</div>
        <p class="note">Se usan en degradados, brillo, neón, sombra 3D y resaltador.</p></div>
      <div class="acts"><button class="btn sm danger" id="fxClear">Quitar todos los efectos de este elemento</button></div>`;
    }
    // toda la página
    const b = S.doc.body;
    h += `<div class="sec"><h3>Toda la página</h3>
      <label class="chk"><input type="checkbox" data-pg="data-ed-progress" ${b.hasAttribute('data-ed-progress') ? 'checked' : ''}> Barra de progreso de lectura arriba</label>
      <label class="chk"><input type="checkbox" data-pg="data-ed-totop" ${b.hasAttribute('data-ed-totop') ? 'checked' : ''}> Botón “volver arriba”</label>
      <label class="chk"><input type="checkbox" data-pg="data-ed-cursor" ${b.hasAttribute('data-ed-cursor') ? 'checked' : ''}> Cursor personalizado (círculo que sigue al mouse)</label>
      <label class="chk"><input type="checkbox" data-pg="data-ed-grain" ${b.hasAttribute('data-ed-grain') ? 'checked' : ''}> Textura de grano (efecto película)</label>
      <label class="chk"><input type="checkbox" data-pg="data-ed-pagefade" ${b.hasAttribute('data-ed-pagefade') ? 'checked' : ''}> La página aparece suave al cargar</label>
      <label class="chk"><input type="checkbox" data-pg="data-ed-smooth" ${b.hasAttribute('data-ed-smooth') ? 'checked' : ''}> Desplazamiento suave al ir a una parte (#links)</label>
      ${color('pgColor', 'Color de la barra, el botón y el cursor', b.getAttribute('data-ed-progress') || b.getAttribute('data-ed-totop') || b.getAttribute('data-ed-cursor') || '#E2541E')}
      <p class="note" style="margin-top:.4rem">Todos los efectos respetan a quien pidió reducir movimiento en su compu o celular. Para verlos completos usá “Probar” o “Ver la web”.</p></div>`;
    box.innerHTML = h;

    // eventos
    const once = (() => { let s = false; return () => { if (!s) { E.snap(); s = true; } }; })();
    box.querySelectorAll('.chips[data-g]').forEach(g => g.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      once(); const v = btn.dataset.v, grp = g.dataset.g;
      const attr = { anim: 'data-ed-anim', loop: 'data-ed-loop', hfx: 'data-ed-hfx', scroll: 'data-ed-scroll', text: 'data-ed-text' }[grp];
      E.edId(el); setA(el, attr, v || null);
      g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === btn));
      if (grp === 'anim' && v) setTimeout(() => play(el), 350);
      if (grp === 'scroll') renderFx();
      toast(v ? 'Efecto aplicado. Se ve completo en “Probar” o “Ver la web”.' : 'Efecto quitado.');
    }));
    const q = s => box.querySelector(s);
    if (el) {
      q('#fxDur').oninput = e => { once(); setVar(el, '--d', e.target.value ? e.target.value + 's' : ''); };
      q('#fxDel').oninput = e => { once(); setVar(el, '--dl', e.target.value ? e.target.value + 's' : ''); };
      q('#fxEase').onchange = e => { once(); setVar(el, '--e', e.target.value); };
      q('#fxAgain').onchange = e => { once(); setA(el, 'data-ed-again', e.target.checked ? '' : null); };
      q('#fxStag') && (q('#fxStag').onchange = e => { once(); if (!el.getAttribute('data-ed-anim')) setA(el, 'data-ed-anim', 'fade-up'); setA(el, 'data-ed-stagger', e.target.checked ? '0.12' : null); renderFx(); });
      q('#fxPlay').onclick = () => play(el);
      q('#fxLs').oninput = e => { once(); setVar(el, '--ls', e.target.value ? e.target.value + 's' : ''); };
      q('#fxSpeed').oninput = e => { once(); e.target.nextElementSibling.textContent = e.target.value; E.setAttr(el, 'data-ed-speed', e.target.value); after(el); };
      q('#fxSt') && (q('#fxSt').oninput = e => { once(); setVar(el, '--st', e.target.value ? e.target.value + 'px' : ''); });
      q('#fxG1').oninput = e => { once(); setVar(el, '--g1', e.target.value); };
      q('#fxG2').oninput = e => { once(); setVar(el, '--g2', e.target.value); };
      q('#fxClear').onclick = () => { once(); ['data-ed-anim', 'data-ed-loop', 'data-ed-hfx', 'data-ed-scroll', 'data-ed-text', 'data-ed-speed', 'data-ed-again', 'data-ed-stagger'].forEach(a => E.setAttr(el, a, null)); ['--d', '--dl', '--e', '--ls', '--g1', '--g2', '--st'].forEach(p => setVar(el, p, '')); ['translate', 'scale', 'rotate', 'opacity', 'filter'].forEach(p => el.style.removeProperty(p)); after(el, true); renderFx(); toast('Efectos quitados.'); };
    }
    box.querySelectorAll('[data-pg]').forEach(c => c.onchange = () => {
      once(); const col = q('#pgColor').value;
      const val = c.checked ? (/progress|totop|cursor/.test(c.dataset.pg) ? col : '') : null;
      ensureFx(); E.setAttr(E.liveById(b.getAttribute('data-eid')) || b, c.dataset.pg, val);
      if (!E.liveById(b.getAttribute('data-eid'))) { c.checked ? b.setAttribute(c.dataset.pg, val) : b.removeAttribute(c.dataset.pg); }
      after(b, true);
    });
    q('#pgColor').oninput = e => { once(); ['data-ed-progress', 'data-ed-totop', 'data-ed-cursor'].forEach(a => { if (b.hasAttribute(a)) { b.setAttribute(a, e.target.value); const lb = E.liveById(b.getAttribute('data-eid')); lb && lb.setAttribute(a, e.target.value); } }); E.markDirty(); };
  }
  function play(el) {
    try {
      const w = W(); if (!w.__edfx) { toast('Guardá o recargá la vista para ver la animación.'); return; }
      el.scrollIntoView({ block: 'center' });
      if (/letters|words|typewriter/.test(el.getAttribute('data-ed-anim'))) { el.animate([{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 800, easing: 'cubic-bezier(.2,.7,.2,1)' }); return; }
      setTimeout(() => w.__edfx.play(el), 250);
    } catch {}
  }

  document.addEventListener('ed-select', () => { if (!$('#pane-fx').classList.contains('hidden')) renderFx(); });
  $('.right .tabs button[data-tab="fx"]').addEventListener('click', renderFx);

  /* ================================================================
     extras para webs como el portafolio
     ================================================================ */
  const IMG_RX = /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i;
  const COLORS_RX = /^#[0-9a-f]{6}(\|#[0-9a-f]{6})+$/i;
  new MutationObserver(() => {
    const box = $('#elBox'); if (!box || !S.sel || box.querySelector('#siteSec') || !box.querySelector('.tagname')) return;
    const el = S.sel, src = E.srcOf(el); if (!src) return;
    const colorAttrs = [...src.attributes].filter(a => COLORS_RX.test(a.value));
    const imgAttrs = [...src.attributes].filter(a => a.name !== 'src' && IMG_RX.test(a.value));
    if (!colorAttrs.length && !imgAttrs.length) return;
    const sec = document.createElement('div'); sec.className = 'sec'; sec.id = 'siteSec';
    const names = ['Fondo', 'Texto', 'Acento', 'Secundario', 'Color 5', 'Color 6'];
    sec.innerHTML = colorAttrs.map(a => `<h3>Colores de esta sección</h3><div class="colors" data-ca="${esc(a.name)}" style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">${a.value.split('|').map((c, i) => `<label class="colorf"><input type="color" value="${c}" data-i="${i}"><span>${names[i]}</span></label>`).join('')}</div>`).join('')
      + imgAttrs.map(a => `<h3 style="margin-top:.8rem">Imagen asociada (${esc(a.name)})</h3><p class="note">${a.name === 'data-img' ? 'Es la imagen que aparece al pasar el mouse por este elemento.' : 'Imagen que usa la web para este elemento.'}</p><img class="thumb" alt="" data-ia="${esc(a.name)}"><div class="acts"><button class="btn sm" data-pick="${esc(a.name)}">Cambiar imagen…</button></div>`).join('');
    const first = box.querySelector('#elContent'); (first || box).after(sec);
    sec.querySelectorAll('[data-ca]').forEach(g => g.querySelectorAll('input').forEach(inp => {
      inp.onfocus = E.snap;
      inp.oninput = () => {
        const name = g.dataset.ca, parts = src.getAttribute(name).split('|'); parts[+inp.dataset.i] = inp.value.toUpperCase();
        E.setAttr(el, name, parts.join('|'));
        try { const w = W(); if (name === 'data-theme' && w.MC && el.id) w.MC.theme(el.id); } catch {}
      };
    }));
    sec.querySelectorAll('img[data-ia]').forEach(im => { const p = E.srcToPath(src.getAttribute(im.dataset.ia)); if (p && S.files.has(p)) S.files.get(p).getFile().then(f => im.src = URL.createObjectURL(f)); });
    sec.querySelectorAll('[data-pick]').forEach(btn => btn.onclick = () => {
      const imgs = [...S.files.keys()].filter(p => IMG_RX.test(p)); const r = btn.getBoundingClientRect();
      const set = p => { E.snap(); E.setAttr(el, btn.dataset.pick, E.relPath(E.dirOf(S.path), p)); E.renderElement(); toast('Imagen cambiada.'); };
      E.showCtx([['Subir una de mi compu…', async () => { const [f] = await E.pickFiles(false); if (!f) return; const st = await E.storeImage(f); E.renderFiles(); E.renderAssets(); set(st.path); }], '-', ...imgs.slice(0, 50).map(p => [p.split('/').pop(), () => set(p)])], r.left, r.bottom + 4);
    });
  }).observe($('#elBox'), { childList: true });

  // carrusel 3D del portafolio (js/textures.js con window.MC_TEX)
  let tex = null, texPath = null;
  async function loadTex() {
    texPath = [...S.files.keys()].find(p => /textures\.js$/i.test(p)); tex = null; if (!texPath) return;
    try { const t = S.buffers.has(texPath) ? S.buffers.get(texPath).text : await E.readText(texPath); const m = t.match(/window\.MC_TEX\s*=\s*(\[[\s\S]*\])\s*;?\s*$/); if (m) tex = JSON.parse(m[1]); } catch { tex = null; }
  }
  new MutationObserver(async () => {
    const box = $('#pageBox'); if (!box || box.querySelector('#texSec') || !box.querySelector('#pTitle')) return;
    await loadTex(); if (!tex || box.querySelector('#texSec')) return;
    const sec = document.createElement('div'); sec.className = 'sec'; sec.id = 'texSec';
    sec.innerHTML = `<h3>Imágenes del carrusel 3D</h3><p class="note">Son las ${tex.length} imágenes que giran en 3D en la portada. Tocá una para cambiarla.</p><div class="slots" style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;margin-top:.5rem">${tex.map((s, i) => `<button type="button" data-t="${i}" style="padding:0;border:1px solid #333;background:#000"><img alt="Imagen ${i + 1} del carrusel" src="${s}" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block"></button>`).join('')}</div>`;
    box.querySelector('.sec').after(sec);
    sec.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
      const r = b.getBoundingClientRect(); const imgs = [...S.files.keys()].filter(p => /\.(jpe?g|png|webp)$/i.test(p));
      const use = async blob => {
        const bmp = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = 640; c.height = 360;
        const k = Math.max(640 / bmp.width, 360 / bmp.height); c.getContext('2d').drawImage(bmp, (640 - bmp.width * k) / 2, (360 - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
        tex[+b.dataset.t] = c.toDataURL('image/jpeg', 0.72);
        S.buffers.set(texPath, { text: 'window.MC_TEX=' + JSON.stringify(tex) + ';', dirty: true });
        b.querySelector('img').src = tex[+b.dataset.t]; E.updateStatus(); E.renderFiles(); E.reloadPreview();
        toast('Imagen del carrusel cambiada. Tocá Guardar.');
      };
      E.showCtx([['Subir una de mi compu…', async () => { const [f] = await E.pickFiles(false); if (f) use(f); }], '-', ...imgs.slice(0, 50).map(p => [p.split('/').pop(), async () => use(await S.files.get(p).getFile())])], r.left, r.bottom + 4);
    });
  }).observe($('#pageBox'), { childList: true });
})();
