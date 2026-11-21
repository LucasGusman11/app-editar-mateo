# Editor web

Editor visual para páginas web estáticas, pensado para editar el portafolio de Mateo Carballo sin saber programar. Funciona en el navegador (Google Chrome o Microsoft Edge) y trabaja directo sobre la carpeta de la web.

## Cómo se usa

1. Doble clic en **`Abrir editor.bat`** (Windows). Levanta un servidor local con `npx serve` en el puerto 4000 y abre Chrome.
2. Tocá **Abrir una carpeta** y elegí la carpeta de la web (donde está el `index.html`).
3. Editá con el mouse y tocá **Guardar** (o Ctrl+S). Antes de cada guardado se hace una copia en `respaldos/`.

Requisitos: Node.js (para `npx`) y Chrome o Edge (usa la API de acceso a archivos).

## Qué se puede hacer

- **Visual:** textos editables sobre la página, barra de formato, mover arrastrando, tiradores de tamaño, selección múltiple, copiar/pegar/duplicar, menú con clic derecho, deshacer/rehacer.
- **Estilos por dispositivo:** escritorio, tablet y celular; tipografías, colores con la paleta del sitio, fondos, bordes, sombras, filas y grillas, filtros, posición, estados al pasar el mouse, ocultar por dispositivo.
- **Efectos:** más de 70 animaciones y efectos sin código (al aparecer, en loop, al pasar el mouse, con el scroll, de texto y de toda la página).
- **Bloques y secciones:** títulos, botones, columnas, galerías, carrusel, YouTube, mapas, WhatsApp, formularios (FormSubmit/Formspree), menú con hamburguesa, preguntas frecuentes, testimonios, precios, contador, íconos y secciones completas.
- **Componentes reutilizables** que se actualizan en todas las páginas.
- **Editor de imágenes:** recortar, rotar, enderezar, cambiar tamaño, ajustes, filtros, pincel, borrador, texto, formas, gotero, bote y varita para borrar fondos.
- **Código:** HTML, CSS y JS con resaltado (CodeMirror) y vista previa en vivo.
- **Sitio:** archivos, capas, páginas nuevas, buscar y reemplazar, revisión de accesibilidad y SEO, historial de respaldos, recuperación de cambios, exportar a .zip, publicar en Netlify, optimizar imágenes a WebP, sitemap y robots.txt.
- Tema claro/oscuro e interfaz en inglés.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html`, `app.css` | Interfaz |
| `app.js` | Núcleo: archivos, vista, selección, estilos, capas, bloques, código, guardar |
| `sw.js` | Service worker que sirve la carpeta abierta para la vista previa |
| `fx.js` | Biblioteca de efectos y controles del portafolio |
| `extras.js` | Componentes, bloques extra, publicar, optimizar imágenes, sitemap, tema |
| `imgedit.js` | Editor de imágenes |
| `i18n.js` | Interfaz en inglés |
| `vendor/` | CodeMirror (editor de código) y fflate (zip) |

Ver `LEEME.txt` para la guía completa en español.
