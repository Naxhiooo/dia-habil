// Construye el sitio en dist/: copia publico/, completa cabecera, pie y metadatos de cada página,
// genera las páginas de feriados, fines de semana largos y días hábiles, los calendarios .ics,
// el sitemap y el robots.txt. Uso: npm run construir
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FERIADOS, REGIONES, RANGO, REVISADO, feriadosDe } from '../publico/assets/js/feriados.js';
import {
  aNum, aISO, diaSemana, sumarDias, calcularPlazo, contarHabiles, motivoInhabil, construirDias, generarBloques, finesDeSemanaLargos, mejoresPuentes,
  describirBloque, proximosFinesLargos,
} from '../publico/assets/js/fechas.js';
import { fechaLarga, fechaCorta, MESES, DIAS, DIAS_CORTOS, plural, hoyEnChile } from '../publico/assets/js/formato.js';
import { crearICS } from '../publico/assets/js/ics.js';
import { NOTAS_FERIADO, FECHA_ORIGINAL } from './notas-feriados.mjs';

export const SITIO = 'https://diahabil.cl';
// Último cambio de contenido de las páginas, para el lastmod del sitemap. Se actualiza al publicar contenido nuevo.
const CONTENIDO_ACTUALIZADO = '2026-10-31';
const RAIZ = fileURLToPath(new URL('..', import.meta.url));

// AdSense. Cada espacio de anuncio del sitio es "lateral" (junto a una herramienta) u "horizontal"
// (entre secciones). Cuando AdSense entregue los bloques, se pega aquí su número "data-ad-slot".
// Un espacio sin bloque no se publica; en el servidor local se ve como marcador para revisar el diseño.
export const ADSENSE = {
  cliente: 'ca-pub-3399052794035568',
  bloques: { lateral: '', horizontal: '' },
};
let conMarcadores = false;
const ANIOS = [];
for (let a = +RANGO.desde.slice(0, 4); a <= +RANGO.hasta.slice(0, 4); a += 1) ANIOS.push(a);

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const SLUG_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ultimoDia = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
const iso = (anio, mes, dia) => `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

// "jueves 16 al domingo 19 de septiembre" o "jueves 31 de diciembre al domingo 3 de enero"
function rangoLargo(desde, hasta) {
  const [a, b] = [desde, hasta].map((f) => ({ dia: +f.slice(8), mes: MESES[+f.slice(5, 7) - 1], semana: DIAS[diaSemana(aNum(f))] }));
  if (desde === hasta) return `${a.semana} ${a.dia} de ${a.mes}`;
  if (a.mes === b.mes) return `${a.semana} ${a.dia} al ${b.semana} ${b.dia} de ${b.mes}`;
  return `${a.semana} ${a.dia} de ${a.mes} al ${b.semana} ${b.dia} de ${b.mes}`;
}
const lista = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items.at(-1)}` : items[0] || '');

// ---------- Datos por año y mes ----------
const nacionales = (anio) => FERIADOS.filter((f) => f.fecha.startsWith(String(anio)) && f.alcance === 'nacional');
const delAnio = (anio) => FERIADOS.filter((f) => f.fecha.startsWith(String(anio)));
const enSemana = (f) => { const d = diaSemana(aNum(f.fecha)); return d >= 1 && d <= 5; };

function largosDe(anio) {
  const dias = construirDias(`${anio}-01-01`, `${anio}-12-31`);
  return finesDeSemanaLargos(generarBloques(dias, 0)).map((b) => describirBloque(b, dias));
}
function puentesDe(anio) {
  const dias = construirDias(`${anio}-01-01`, `${anio}-12-31`);
  return mejoresPuentes(generarBloques(dias, 2), { maxCosto: 2, limite: 12 }).map((b) => describirBloque(b, dias));
}
function mesEnCifras(anio, mes) {
  const desde = iso(anio, mes, 1);
  const hasta = iso(anio, mes, ultimoDia(anio, mes));
  const lv = contarHabiles({ desde, hasta, incluirDesde: true });
  const ls = contarHabiles({ desde, hasta, modo: 'lun-sab', incluirDesde: true });
  const habilesLv = [];
  for (let n = aNum(desde); n <= aNum(hasta); n += 1) {
    const d = diaSemana(n);
    if (d >= 1 && d <= 5 && !lv.feriados.some((f) => f.fecha === aISO(n))) habilesLv.push(aISO(n));
  }
  const regionales = FERIADOS.filter((f) => f.alcance !== 'nacional' && f.fecha.slice(0, 7) === desde.slice(0, 7));
  return { desde, hasta, lunVie: lv.habiles, lunSab: ls.habiles, corridos: lv.corridos, feriados: lv.feriados, regionales, habiles: habilesLv, primero: habilesLv[0], ultimo: habilesLv.at(-1) };
}

// Cifras de un año, para textos e imágenes de vista previa.
export function resumenAnio(anio) {
  const meses = Array.from({ length: 12 }, (_, i) => mesEnCifras(anio, i + 1));
  return {
    feriados: nacionales(anio).length,
    enSemana: nacionales(anio).filter(enSemana).length,
    largos: largosDe(anio).length,
    habiles: meses.reduce((s, m) => s + m.lunVie, 0),
  };
}
export { ANIOS };

// ---------- Plantillas ----------
let plantillas;
async function cargarPlantillas() {
  const leer = (n) => readFile(join(RAIZ, 'plantillas', n), 'utf8');
  plantillas = { head: await leer('head.html'), cabecera: await leer('cabecera.html'), pie: await leer('pie.html') };
}

// Cloudflare guarda CSS y JS un día (ver _headers) y publicar no renueva su copia. Las páginas los piden
// con una versión que cambia con su contenido, así lo nuevo llega de inmediato a todos los visitantes.
let versionRecursos;
async function calcularVersionRecursos() {
  const huella = createHash('sha256');
  for (const carpeta of ['css', 'js']) {
    const dir = join(RAIZ, 'publico', 'assets', carpeta);
    for (const nombre of (await readdir(dir)).sort()) huella.update(await readFile(join(dir, nombre)));
  }
  return huella.digest('hex').slice(0, 10);
}

const OG_POR_RUTA = { '/': 'inicio', '/plazos/': 'plazos', '/vacaciones/': 'vacaciones' };
const seccionDe = (ruta) => {
  const primera = ruta.split('/')[1] || 'inicio';
  return ['fines-de-semana-largos', 'proximo-fin-de-semana-largo', 'manana-es-feriado'].includes(primera) ? 'feriados' : primera;
};

function aplicarPlantilla(html, ruta, { og } = {}) {
  const indexable = !/name="robots" content="noindex"/.test(html) && ruta !== '/404.html';
  const imagen = og || OG_POR_RUTA[ruta] || 'inicio';
  const metadatos = [
    indexable && `  <link rel="canonical" href="${SITIO}${ruta}">`,
    indexable && `  <meta property="og:url" content="${SITIO}${ruta}">`,
    '  <meta property="og:site_name" content="Día Hábil">',
    `  <meta property="og:image" content="${SITIO}/assets/img/og/${imagen}.png">`,
    '  <meta property="og:image:width" content="1200">',
    '  <meta property="og:image:height" content="630">',
    '  <meta name="twitter:card" content="summary_large_image">',
    // Sin anuncios en páginas de error ni internas (políticas de AdSense).
    indexable && `  <meta name="google-adsense-account" content="${ADSENSE.cliente}">`,
    indexable && `  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE.cliente}" crossorigin="anonymous"></script>`,
  ].filter(Boolean).join('\n');
  const seccion = seccionDe(ruta);
  const anioSiguiente = Math.min(ANIOS.at(-1), +hoyEnChile().slice(0, 4) + 1);
  const cabecera = plantillas.cabecera.replace(`data-seccion="${seccion}"`, `data-seccion="${seccion}" aria-current="page"`);
  const pie = plantillas.pie.replaceAll('{{revisado}}', fechaLarga(REVISADO).replace(/^\S+ /, '')).replaceAll('{{anioSiguiente}}', anioSiguiente);
  return html
    .replace('  <!-- @head -->', plantillas.head.replace('{{metadatos}}', metadatos))
    .replace('<!-- @head -->', plantillas.head.replace('{{metadatos}}', metadatos))
    .replace('  <!-- @cabecera -->', cabecera)
    .replace('  <!-- @pie -->', pie)
    .replace(/<aside class="anuncio( lateral)?" aria-label="Publicidad">Espacio reservado para un anuncio \(AdSense\)<\/aside>/g, (marcador, lateral) => {
      const bloque = ADSENSE.bloques[lateral ? 'lateral' : 'horizontal'];
      if (bloque && indexable) {
        return `<aside class="anuncio activo${lateral || ''}" aria-label="Publicidad"><ins class="adsbygoogle" style="display:block" data-ad-client="${ADSENSE.cliente}" data-ad-slot="${bloque}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({});</script></aside>`;
      }
      return conMarcadores ? marcador : '';
    })
    .replace(/((?:href|src)="\/assets\/(?:css|js)\/[^"?]+)"/g, `$1?v=${versionRecursos}"`);
}

function migasJsonLd(migas) {
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: migas.map(([nombre, ruta], i) => ({ '@type': 'ListItem', position: i + 1, name: nombre, item: `${SITIO}${ruta}` })),
  })}</script>`;
}

function documento({ ruta, titulo, descripcion, og, migas, cuerpo, scripts = '' }) {
  const html = `<!doctype html>
<html lang="es-CL">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(titulo)}</title>
  <meta name="description" content="${esc(descripcion)}">
  <meta property="og:title" content="${esc(titulo.replace(/ \| Día Hábil$/, ''))}">
  <meta property="og:description" content="${esc(descripcion)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="es_CL">
  ${migas ? migasJsonLd(migas) : ''}
  <!-- @head -->
</head>
<body>
  <!-- @cabecera -->

  <main id="principal" class="envoltura">
${migas ? `    <nav class="migas" aria-label="Estás en">${migas.map(([n, r], i) => (i < migas.length - 1 ? `<a href="${r}">${esc(n)}</a>` : `<span aria-current="page">${esc(n)}</span>`)).join('<span aria-hidden="true">/</span>')}</nav>\n` : ''}${cuerpo}
  </main>

  <!-- @pie -->
${scripts}
</body>
</html>
`;
  return aplicarPlantilla(html, ruta, { og });
}

// ---------- Piezas reutilizables ----------
const anuncio = (clase = '') => `<aside class="anuncio${clase ? ` ${clase}` : ''}" aria-label="Publicidad">Espacio reservado para un anuncio (AdSense)</aside>`;

function selectorAnios(base, actual) {
  return `<nav class="segmentos enlaces" aria-label="Año">${ANIOS.map((a) => `<a href="${base}${a}/"${a === actual ? ' aria-current="page"' : ''}>${a}</a>`).join('')}</nav>`;
}

function chipsFeriado(f) {
  return `${f.irrenunciable ? '<span class="chip">Irrenunciable</span>' : ''}${f.alcance !== 'nacional' ? `<span class="chip regional">${esc(REGIONES[f.alcance])}</span>` : ''}`;
}

function tablaFeriados(lista) {
  return `<div class="tabla-envoltura"><table>
      <thead><tr><th scope="col">Fecha</th><th scope="col">Feriado</th><th scope="col">Ley</th></tr></thead>
      <tbody>
${lista.map((f) => `        <tr data-fecha="${f.fecha}" data-alcance="${f.alcance}"><td class="fecha">${+f.fecha.slice(8)} de ${MESES[+f.fecha.slice(5, 7) - 1]}<small>${DIAS[diaSemana(aNum(f.fecha))]}</small></td><td>${esc(f.nombre)}${chipsFeriado(f)}</td><td class="ley">${esc(f.ley)}</td></tr>`).join('\n')}
      </tbody>
    </table></div>`;
}

const tarjetaSuscripcion = `<div class="tarjeta">
          <h2 style="font-size:var(--texto-xl)">Tenlos siempre en tu calendario</h2>
          <p class="detalle">Suscríbete una vez y los feriados aparecen solos en tu teléfono. Si cambia algo, se actualiza.</p>
          <div class="campo" style="margin-top:14px">
            <label for="region">Incluir feriado regional</label>
            <select id="region">
              <option value="nacional">Solo nacionales</option>
              <option value="arica">Arica y Parinacota</option>
              <option value="chillan">Chillán y Chillán Viejo</option>
            </select>
          </div>
          <div class="acciones" style="flex-direction:column;align-items:stretch">
            <a class="boton" id="btn-google" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent('webcal://diahabil.cl/calendarios/feriados-chile.ics')}" target="_blank" rel="noopener">Agregar a Google Calendar</a>
            <a class="boton secundario" id="btn-webcal" href="webcal://diahabil.cl/calendarios/feriados-chile.ics">Agregar en iPhone o Mac</a>
            <a class="boton secundario" id="btn-descargar" href="/calendarios/feriados-chile.ics" download>Descargar archivo .ics</a>
          </div>
          <p class="ayuda" style="margin-top:12px">En Outlook: Agregar calendario → Desde Internet, y pega el enlace del archivo.</p>
        </div>`;

function grillaMes(anio, mes, mapa) {
  const primero = aNum(iso(anio, mes, 1));
  const blancos = (diaSemana(primero) + 6) % 7;
  const celdas = Array.from({ length: blancos }, () => '<span></span>');
  for (let d = 1; d <= ultimoDia(anio, mes); d += 1) {
    const f = iso(anio, mes, d);
    const dow = diaSemana(aNum(f));
    const fer = mapa.get(f);
    const clases = ['d', dow === 0 || dow === 6 ? 'finde' : '', fer ? 'feriado' : ''].filter(Boolean).join(' ');
    celdas.push(`<span class="${clases}"${fer ? ` title="${esc(fer.nombre)}"` : ''}>${d}</span>`);
  }
  const cab = [1, 2, 3, 4, 5, 6, 0].map((d) => `<span class="cab">${DIAS_CORTOS[d].slice(0, 2)}</span>`).join('');
  return `<div class="grilla grande" role="img" aria-label="Calendario de ${MESES[mes - 1]} ${anio}">${cab}${celdas.join('')}</div>`;
}

// ---------- Páginas generadas ----------
function paginasFeriados(hoy) {
  const paginas = [];
  const proximos = FERIADOS.filter((f) => f.alcance === 'nacional' && f.fecha >= hoy).slice(0, 8);
  const siguiente = proximos[0];

  paginas.push({
    ruta: '/feriados/',
    html: documento({
      ruta: '/feriados/',
      titulo: `Feriados de Chile ${ANIOS[0]}, ${ANIOS[1]} y ${ANIOS[2]}: lista completa y calendario | Día Hábil`,
      descripcion: `Todos los feriados de Chile ${ANIOS.join(', ')}, con su día, si son irrenunciables y la ley que los establece. Agrega los feriados a tu calendario.`,
      og: `feriados-${ANIOS[1]}`,
      migas: [['Inicio', '/'], ['Feriados', '/feriados/']],
      cuerpo: `
    <section class="portada">
      <div class="antetitulo">Feriados legales · Chile</div>
      <h1>Feriados de Chile</h1>
      <p class="bajada">Todos los feriados de ${lista(ANIOS.map(String))}, con su ley. Elige un año o suscríbete para tenerlos en tu calendario.</p>
      ${siguiente ? `<p class="destacado" id="proximo-feriado" data-fecha="${siguiente.fecha}">Próximo feriado: <strong>${fechaLarga(siguiente.fecha)}</strong>, ${esc(siguiente.nombre)}.</p>` : ''}
    </section>

    <section class="herramientas" aria-label="Feriados por año">
${ANIOS.map((a) => {
    const nac = nacionales(a);
    return `      <a class="acceso" href="/feriados/${a}/">
        <div class="antetitulo" style="margin:0">${a}</div>
        <h2>Feriados ${a}</h2>
        <p>${nac.length} feriados nacionales, ${nac.filter(enSemana).length} de lunes a viernes y ${largosDe(a).length} fines de semana largos.</p>
        <span class="ir">Ver feriados ${a} →</span>
      </a>`;
  }).join('\n')}
    </section>

    <section class="herramienta" style="margin-top:var(--espacio-seccion)">
      <div class="tarjeta">
        <h2 style="font-size:var(--texto-xl)">Próximos feriados</h2>
        <ul class="lista-simple" id="proximos">
${proximos.map((f) => `          <li data-fecha="${f.fecha}"><span><strong>${fechaCorta(f.fecha)}</strong> · ${esc(f.nombre)}</span><span class="etq">${f.fecha.slice(0, 4)}</span></li>`).join('\n')}
        </ul>
        <p style="margin:14px 0 0;display:flex;flex-wrap:wrap;gap:var(--espacio-2) var(--espacio-5)"><a href="/manana-es-feriado/">¿Mañana es feriado? →</a><a href="/fines-de-semana-largos/">Fines de semana largos →</a></p>
      </div>
      <div class="resultado">
        ${tarjetaSuscripcion}
        ${anuncio('lateral')}
      </div>
    </section>

    <article class="contenido" style="margin-top:var(--espacio-seccion)">
      <h2>¿Qué es un feriado irrenunciable?</h2>
      <p>En los feriados irrenunciables (1 de enero, 1 de mayo, 18 y 19 de septiembre y 25 de diciembre) los trabajadores del comercio no pueden trabajar, ni aunque quieran, salvo en los rubros que exceptúa la propia ley (Ley 19.973). <a href="/guias/feriados-irrenunciables/">Guía de feriados irrenunciables →</a></p>
      <h2>Feriados que se mueven al lunes</h2>
      <p>San Pedro y San Pablo (29 de junio) y el Encuentro de Dos Mundos (12 de octubre) se trasladan al lunes de esa semana si caen martes, miércoles o jueves, y al lunes siguiente si caen viernes (Ley 19.668). El Día de las Iglesias Evangélicas y Protestantes (31 de octubre) pasa al viernes anterior si cae martes y al viernes siguiente si cae miércoles (Ley 20.299). <a href="/guias/feriados-que-se-mueven/">Guía de feriados que se mueven →</a></p>
      <h2>Feriados regionales</h2>
      <p>El 7 de junio es feriado en la Región de Arica y Parinacota (Asalto y Toma del Morro de Arica, Ley 20.663) y el 20 de agosto en las comunas de Chillán y Chillán Viejo (Nacimiento del Prócer de la Independencia, Ley 20.768).</p>
    </article>

    ${anuncio()}`,
      scripts: '  <script type="module" src="/assets/js/ui-feriados.js"></script>',
    }),
  });

  for (const anio of ANIOS) {
    const nac = nacionales(anio);
    const semana = nac.filter(enSemana);
    const largos = largosDe(anio);
    const finde = nac.filter((f) => !enSemana(f));
    const ruta = `/feriados/${anio}/`;
    paginas.push({
      ruta,
      html: documento({
        ruta,
        titulo: `Feriados ${anio} en Chile: los ${nac.length} feriados del año, con su ley | Día Hábil`,
        descripcion: `En ${anio} Chile tiene ${nac.length} feriados nacionales: ${semana.length} caen de lunes a viernes y hay ${largos.length} fines de semana largos. Lista completa con fechas, irrenunciables y feriados regionales.`,
        og: `feriados-${anio}`,
        migas: [['Inicio', '/'], ['Feriados', '/feriados/'], [String(anio), ruta]],
        cuerpo: `
    <section class="portada">
      <div class="antetitulo">Feriados legales · Chile</div>
      <h1>Feriados ${anio} en Chile</h1>
      <p class="bajada">En ${anio} hay <strong>${nac.length} feriados nacionales</strong>: ${semana.length} caen de lunes a viernes y hay ${largos.length} fines de semana largos. Los domingos también son feriado y no se listan.</p>
      ${selectorAnios('/feriados/', anio)}
    </section>

    <section class="herramienta" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
      <div class="tarjeta">
        ${tablaFeriados(delAnio(anio))}
      </div>
      <div class="resultado">
        ${tarjetaSuscripcion}
        ${anuncio('lateral')}
      </div>
    </section>

    <section class="dos-columnas">
      <div class="tarjeta">
        <h2 style="font-size:var(--texto-xl)">Fines de semana largos ${anio}</h2>
        <ul class="lista-simple">
${largos.slice(0, 6).map((v) => `          <li><span>${esc(mayuscula(rangoLargo(v.desde, v.hasta)))}</span><span class="etq">${v.largo} días</span></li>`).join('\n')}
        </ul>
        <p style="margin:14px 0 0"><a href="/fines-de-semana-largos/${anio}/">Ver los ${largos.length} fines de semana largos y los puentes →</a></p>
      </div>
      <div class="tarjeta contenido">
        <h2 style="font-size:var(--texto-xl);margin-top:0">Preguntas sobre ${anio}</h2>
        <p><strong>¿Cuántos feriados tiene ${anio}?</strong> ${nac.length} feriados nacionales, sin contar los domingos. ${finde.length ? `De ellos, ${lista(finde.map((f) => `${f.nombre} (${DIAS[diaSemana(aNum(f.fecha))]})`))} ${finde.length === 1 ? 'cae' : 'caen'} en fin de semana.` : ''}</p>
        <p><strong>¿Hay feriados regionales?</strong> Sí: el ${fechaLarga(delAnio(anio).find((f) => f.alcance === 'arica').fecha, { conAnio: false })} en Arica y Parinacota, y el ${fechaLarga(delAnio(anio).find((f) => f.alcance === 'chillan').fecha, { conAnio: false })} en Chillán y Chillán Viejo.</p>
        <p><a href="/guias/feriados-que-se-mueven/">Por qué algunos feriados cambian de día →</a></p>
        <p style="margin:0"><a href="/dias-habiles/${anio}/">Días hábiles de ${anio}, mes a mes →</a></p>
      </div>
    </section>

    ${anuncio()}`,
        scripts: '  <script type="module" src="/assets/js/ui-feriados.js"></script>',
      }),
    });
  }
  return paginas;
}

function paginasFinesLargos(hoy) {
  const paginas = [];
  const todos = ANIOS.flatMap((a) => largosDe(a));
  const siguiente = todos.find((v) => v.hasta >= hoy);
  paginas.push({
    ruta: '/fines-de-semana-largos/',
    html: documento({
      ruta: '/fines-de-semana-largos/',
      titulo: 'Fines de semana largos en Chile: cuándo es el próximo | Día Hábil',
      descripcion: `Todos los fines de semana largos de Chile ${lista(ANIOS.map(String))}, con los feriados que los forman y los puentes que convienen.`,
      og: `fines-${ANIOS[1]}`,
      migas: [['Inicio', '/'], ['Fines de semana largos', '/fines-de-semana-largos/']],
      cuerpo: `
    <section class="portada">
      <div class="antetitulo">Feriados · Chile</div>
      <h1>Fines de semana largos</h1>
      ${siguiente ? `<p class="bajada">El próximo es del <strong>${esc(rangoLargo(siguiente.desde, siguiente.hasta))} de ${siguiente.hasta.slice(0, 4)}</strong>: ${siguiente.largo} días por ${esc(lista([...new Set(siguiente.feriados.map((f) => f.nombre))]))}. <a href="/proximo-fin-de-semana-largo/">¿Cuántos días faltan?</a></p>` : ''}
    </section>
    <section class="herramientas" aria-label="Fines de semana largos por año">
${ANIOS.map((a) => `      <a class="acceso" href="/fines-de-semana-largos/${a}/">
        <div class="antetitulo" style="margin:0">${a}</div>
        <h2>Fines de semana largos ${a}</h2>
        <p>${largosDe(a).length} fines de semana de 3 días o más, sin pedir vacaciones.</p>
        <span class="ir">Ver ${a} →</span>
      </a>`).join('\n')}
    </section>
    ${anuncio()}`,
    }),
  });

  for (const anio of ANIOS) {
    const largos = largosDe(anio);
    const puentes = puentesDe(anio);
    const ruta = `/fines-de-semana-largos/${anio}/`;
    paginas.push({
      ruta,
      html: documento({
        ruta,
        titulo: `Fines de semana largos ${anio} en Chile: las ${largos.length} fechas y los puentes | Día Hábil`,
        descripcion: `En ${anio} hay ${largos.length} fines de semana largos en Chile. Fechas, feriados que los forman y qué día pedir para alargar el descanso.`,
        og: `fines-${anio}`,
        migas: [['Inicio', '/'], ['Fines de semana largos', '/fines-de-semana-largos/'], [String(anio), ruta]],
        cuerpo: `
    <section class="portada">
      <div class="antetitulo">Feriados · Chile</div>
      <h1>Fines de semana largos ${anio}</h1>
      <p class="bajada">En ${anio} hay <strong>${largos.length} fines de semana largos</strong> de 3 días o más, sin pedir vacaciones. Además, ${plural(puentes.length, 'puente te da', 'puentes te dan')} 4 días libres o más pidiendo uno o dos días.</p>
      ${selectorAnios('/fines-de-semana-largos/', anio)}
    </section>

    <section class="dos-columnas" style="margin-top:0">
      <div class="tarjeta">
        <h2 style="font-size:var(--texto-xl)">Sin pedir días</h2>
        <div class="tabla-envoltura"><table>
          <thead><tr><th scope="col">Fechas</th><th scope="col">Días</th><th scope="col">Por</th></tr></thead>
          <tbody>
${largos.map((v) => `            <tr data-fecha="${v.desde}"><td class="fecha">${esc(mayuscula(rangoLargo(v.desde, v.hasta)))}</td><td>${v.largo}</td><td>${esc(lista([...new Set(v.feriados.map((f) => f.nombre))]))}</td></tr>`).join('\n')}
          </tbody>
        </table></div>
      </div>
      <div class="tarjeta">
        <h2 style="font-size:var(--texto-xl)">Puentes: pide un día y alarga el descanso</h2>
        <div class="tabla-envoltura"><table>
          <thead><tr><th scope="col">Pide</th><th scope="col">Descansas</th><th scope="col">Días</th></tr></thead>
          <tbody>
${puentes.map((v) => `            <tr data-fecha="${v.desde}"><td>${esc(lista(v.pedir.map((p) => `${DIAS[diaSemana(aNum(p))]} ${+p.slice(8)}`)))} de ${MESES[+v.pedir[0].slice(5, 7) - 1]}</td><td>${esc(rangoLargo(v.desde, v.hasta))}</td><td><strong>${v.largo}</strong></td></tr>`).join('\n')}
          </tbody>
        </table></div>
        <p style="margin:14px 0 0"><a class="boton" href="/vacaciones/?anio=${anio}">Planifica tus vacaciones ${anio}</a></p>
      </div>
    </section>
    ${anuncio()}`,
        scripts: '  <script type="module" src="/assets/js/ui-feriados.js"></script>',
      }),
    });
  }
  return paginas;
}

// ---------- Contenido propio de cada mes ----------
const MAPA_NACIONAL = feriadosDe('nacional');
const sinAnio = (f) => fechaLarga(f, { conAnio: false });
const diaDe = (f) => DIAS[diaSemana(aNum(f))];
const motivoLunVie = (f) => motivoInhabil(aNum(f), 'lun-vie', MAPA_NACIONAL);
const razonInhabil = (f) => ({ feriado: 'es feriado', sabado: 'cae sábado', domingo: 'cae domingo' })[motivoLunVie(f)];

function siguienteHabil(fecha, mapa = MAPA_NACIONAL) {
  let n = aNum(fecha);
  while (motivoInhabil(n, 'lun-vie', mapa)) n += 1;
  return aISO(n);
}

// Vencimientos generales de un mes. Reglas revisadas el 30-10-2026:
// - IVA (SII, Código Tributario, art. 36): días 12 y 20; en sábado, domingo o feriado pasan al siguiente día hábil.
//   Las fechas de 2026 coinciden con el calendario oficial del SII; en agosto, Chillán y Chillán Viejo tienen su propia fecha.
// - Cotizaciones (D.L. 3.500, art. 19): día 10 con la misma prórroga; día 13 por internet, sin prórroga.
// - Contribuciones, permiso de circulación y renta (ChileAtiende; Ley de la Renta, art. 69).
export function vencimientosDelMes(anio, mes) {
  const periodo = MESES[(mes + 10) % 12];
  const conProrroga = (dia, que, aviso = '') => {
    const original = iso(anio, mes, dia);
    const fecha = siguienteHabil(original);
    return { fecha, que, detalle: [fecha !== original ? `El ${dia} ${razonInhabil(original)}, así que pasa al siguiente día hábil.` : '', aviso].filter(Boolean).join(' ') };
  };
  const enChillan = siguienteHabil(iso(anio, mes, 20), feriadosDe('chillan'));
  const dia13 = iso(anio, mes, 13);
  const motivo13 = motivoLunVie(dia13);
  const salida = [
    conProrroga(10, `Cotizaciones previsionales de los sueldos de ${periodo}, si no las pagas por internet`),
    conProrroga(12, `IVA de ${periodo} (Formulario 29), plazo general`),
    {
      fecha: dia13,
      que: `Cotizaciones previsionales de los sueldos de ${periodo}, si las declaras y pagas por internet`,
      detalle: motivo13 ? `No se corre al día siguiente, aunque el 13 sea ${{ feriado: 'feriado', sabado: 'sábado', domingo: 'domingo' }[motivo13]}.` : '',
    },
    conProrroga(20, `IVA de ${periodo} (Formulario 29), si declaras y pagas en sii.cl y emites facturas o boletas de honorarios electrónicas`,
      enChillan !== siguienteHabil(iso(anio, mes, 20)) ? `En Chillán y Chillán Viejo, donde el 20 es feriado, vence el ${sinAnio(enChillan)}.` : ''),
    { fecha: iso(anio, mes, 28), que: 'Formulario 29 sin movimiento y sin pago, por internet' },
  ];
  [4, 6, 9, 11].forEach((mesCuota, i) => {
    const original = iso(anio, mesCuota, 30);
    const fecha = siguienteHabil(original);
    if (+fecha.slice(5, 7) !== mes) return;
    salida.push({
      fecha,
      ficha: 'contribuciones',
      que: `Contribuciones de bienes raíces, cuota ${i + 1} de 4`,
      detalle: fecha !== original ? `El 30 de ${MESES[mesCuota - 1]} ${razonInhabil(original)}, así que pasa al siguiente día hábil.` : '',
    });
  });
  if (mes === 3) salida.push({ fecha: iso(anio, 3, 31), ficha: 'permiso', que: 'Permiso de circulación de autos y motos (primera cuota) y seguro obligatorio SOAP' });
  if (mes === 8) salida.push({ fecha: iso(anio, 8, 31), ficha: 'permiso', que: 'Permiso de circulación de autos y motos, segunda cuota' });
  if (mes === 4) salida.push({ plazo: 'Todo abril', ficha: 'renta', que: 'Declaración anual de renta (Formulario 22)', detalle: 'El SII publica cada año las fechas exactas.' });
  if (mes === 5) salida.push({ plazo: 'Todo mayo', ficha: 'permiso', que: 'Permiso de circulación de taxis y buses' });
  if (mes === 9) salida.push({ plazo: 'Todo septiembre', ficha: 'permiso', que: 'Permiso de circulación de vehículos de carga' });
  return salida.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
}
const FICHAS_CHILEATIENDE = {
  contribuciones: ['contribuciones', 'https://www.chileatiende.gob.cl/fichas/12176-pagar-contribuciones-de-bienes-raices'],
  permiso: ['permiso de circulación', 'https://www.chileatiende.gob.cl/fichas/9611'],
  renta: ['renta', 'https://www.chileatiende.gob.cl/fichas/3178-declaracion-de-renta'],
};

// Cómo se reparten los días hábiles de lunes a viernes en cada semana del mes.
function semanasDelMes(m) {
  const semanas = [];
  let cuenta = 0;
  for (let n = aNum(m.desde); n <= aNum(m.hasta); n += 1) {
    const d = diaSemana(n);
    if (d === 0 || d === 6) continue;
    if (d === 1 || !semanas.length) semanas.push({ dias: [], orden: [], feriados: [] });
    const semana = semanas.at(-1);
    const fecha = aISO(n);
    semana.dias.push(fecha);
    if (MAPA_NACIONAL.has(fecha)) semana.feriados.push(MAPA_NACIONAL.get(fecha));
    else semana.orden.push(cuenta += 1);
  }
  return semanas;
}

function trasladoDelFeriado(f) {
  const origen = FECHA_ORIGINAL[f.nombre];
  if (!origen) return '';
  const anio = f.fecha.slice(0, 4);
  const original = `${anio}-${origen}`;
  const dia = `${+origen.slice(3)} de ${MESES[+origen.slice(0, 2) - 1]}`;
  return f.fecha === original
    ? `En ${anio}, el ${dia} cae ${diaDe(original)}, así que no se mueve.`
    : `En ${anio}, el ${dia} cae ${diaDe(original)}, por eso se celebra el ${diaDe(f.fecha)} ${+f.fecha.slice(8)}.`;
}

function efectoDelFeriado(f, m) {
  const d = diaSemana(aNum(f.fecha));
  if (f.alcance !== 'nacional') {
    if (!enSemana(f)) return `En ${f.fecha.slice(0, 4)} cae en fin de semana, así que no cambia los días hábiles de lunes a viernes.`;
    const local = contarHabiles({ desde: m.desde, hasta: m.hasta, region: f.alcance, incluirDesde: true }).habiles;
    return `Allí, ${MESES[+f.fecha.slice(5, 7) - 1]} de ${f.fecha.slice(0, 4)} tiene ${local} días hábiles de lunes a viernes, en vez de ${m.lunVie}.`;
  }
  if (d === 0) return 'Cae domingo, así que no descuenta días.';
  if (d === 6) return 'Cae sábado: no descuenta días de lunes a viernes, pero sí de lunes a sábado.';
  return `Cae ${DIAS[d]}, así que descuenta un día hábil.`;
}

// Lo que solo aplica a ciertos meses. Cada dato sale de las guías, donde están sus fuentes.
function notasDelMes(anio, mes, m) {
  const vacaciones = () => {
    let n = aNum(m.desde);
    while (diaSemana(n) !== 1 || MAPA_NACIONAL.has(aISO(n))) n += 1;
    const inicio = aISO(n);
    const fin = calcularPlazo({ inicio, dias: 15, desdeSiguiente: false }).vencimiento;
    return `<strong>Vacaciones.</strong> La ley da preferencia a la primavera y el verano para tomarlas (Código del Trabajo, art. 67). Con 15 días hábiles desde el ${sinAnio(inicio)}, tu último día de vacaciones es el ${sinAnio(fin)} y, si trabajas de lunes a viernes, vuelves el ${sinAnio(siguienteHabil(sumarDias(fin, 1)))}. <a href="/guias/vacaciones-legales/">Guía de vacaciones legales →</a>`;
  };
  if (mes === 1) return [vacaciones()];
  if (mes === 2) {
    const corrido = siguienteHabil(m.hasta);
    return [
      `<strong>Plazos de meses.</strong> Se cuentan de fecha a fecha y, si el día no existe en el mes de término, vencen el último día de ese mes (Ley 19.880, art. 25). Con esa ley, un plazo de un mes contado desde el 31 de enero de ${anio} termina el ${sinAnio(m.hasta)}${corrido !== m.hasta ? `; como ese día es inhábil, pasa al ${sinAnio(corrido)}` : ''}.${m.corridos === 29 ? ` ${anio} es bisiesto, por eso febrero tiene 29 días.` : ''}`,
      vacaciones(),
    ];
  }
  if (mes === 7) {
    return ['<strong>Vacaciones de invierno.</strong> Desde 2024, quien tiene el cuidado personal de un niño o niña menor de 14 años, o de un adolescente menor de 18 con discapacidad o dependencia severa o moderada, tiene preferencia para tomar sus vacaciones durante las vacaciones escolares. Debe pedirlo con al menos 30 días de anticipación y acreditarlo (Código del Trabajo, art. 67). <a href="/guias/vacaciones-legales/">Guía de vacaciones legales →</a>'];
  }
  if (mes === 9) {
    const extra = FERIADOS.find((f) => f.nombre === 'Feriado adicional de Fiestas Patrias' && f.fecha.startsWith(String(anio)));
    return [`<strong>Fiestas Patrias.</strong> El 18 y el 19 son fijos. Se suma un tercer feriado si caen martes y miércoles (el lunes 17), miércoles y jueves (el viernes 20) o sábado y domingo (el viernes 17). En ${anio} caen ${diaDe(iso(anio, 9, 18))} y ${diaDe(iso(anio, 9, 19))}, ${extra ? `por eso también es feriado el ${sinAnio(extra.fecha)}` : 'así que no hay día extra'}. <a href="/guias/feriados-que-se-mueven/">Guía de feriados que se mueven →</a>`];
  }
  if (mes === 12) {
    return [
      `<strong>El 24 y el 31 no son feriados.</strong> En ${anio} ambos caen ${diaDe(iso(anio, 12, 24))}. Aun así, esos días los trabajadores del comercio no pueden trabajar después de las 20:00, y en los quince días previos a Navidad la jornada se puede extender hasta dos horas durante un máximo de nueve días, nunca más allá de las 23:00 (Código del Trabajo, art. 24). <a href="/guias/feriados-irrenunciables/">Guía de feriados irrenunciables →</a>`,
      '<strong>Los bancos, el 31 de diciembre.</strong> No atienden presencialmente ese día, salvo autorización de la CMF (Ley General de Bancos, art. 38, modificado por la <a href="https://www.bcn.cl/leychile/navegar?idLey=21791" rel="noopener">Ley 21.791</a>). Aun así, la ley aclara que no es feriado para efectos legales, salvo en el pago y protesto de letras de cambio; por eso aquí no lo descontamos. Los impuestos que vencen ese día pasan al siguiente día hábil (Código Tributario, art. 36).',
    ];
  }
  return [];
}

function articuloDelMes({ r, m, mes, largos, puentes, todosLargos, resumenes }) {
  const { anio } = r;
  const nombre = MESES[mes - 1];
  const semanas = semanasDelMes(m);

  const plazo = (dias, modo) => calcularPlazo({ inicio: m.primero, dias, modo });
  const celda = (p) => (p.fueraDeRango ? '—' : fechaCorta(p.vencimiento));
  const ejemplos = [5, 10, 15, 20, 30].map((dias) => ({ dias, lunVie: plazo(dias, 'lun-vie'), lunSab: plazo(dias, 'lun-sab'), corridos: plazo(dias, 'corridos') }));
  const hayFuera = ejemplos.some((e) => [e.lunVie, e.lunSab, e.corridos].some((p) => p.fueraDeRango));
  const [cinco, diez, , veinte] = ejemplos.map((e) => e.lunVie);
  const saltados = diez.fueraDeRango ? [] : diez.feriados.filter(enSemana);

  const feriados = [...m.feriados, ...m.regionales].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const siguienteFeriado = FERIADOS.find((f) => f.alcance === 'nacional' && f.fecha > m.hasta);
  const porSemanaSanta = { 3: ': Semana Santa cae en abril', 4: ': Semana Santa cae en marzo' }[mes] || '';

  const notas = notasDelMes(anio, mes, m);
  const vencimientos = vencimientosDelMes(anio, mes);
  const fichas = [...new Set(vencimientos.flatMap((v) => v.ficha || []))].map((f) => `<a href="${FICHAS_CHILEATIENDE[f][1]}" rel="noopener">${FICHAS_CHILEATIENDE[f][0]}</a>`);

  const tocaElMes = (v) => v.desde <= m.hasta && v.hasta >= m.desde;
  const largosMes = largos.filter(tocaElMes);
  const puentesMes = puentes.filter(tocaElMes);
  const proximoLargo = todosLargos.find((v) => v.desde > m.hasta);
  const porQue = (v) => lista([...new Set(v.feriados.map((f) => f.nombre))]);

  const cifras = r.meses.map((x) => x.lunVie);
  const mas = Math.max(...cifras);
  const menos = Math.min(...cifras);
  const mesesCon = (n) => lista(r.meses.flatMap((x, i) => (x.lunVie === n ? [MESES[i]] : [])));

  return `
    <article class="contenido" style="margin-top:clamp(28px,5vw,48px)">
      <h2>Semana a semana</h2>
      <p>Si un contrato o un trámite habla de "los primeros cinco días hábiles del mes", en ${nombre} de ${anio} llegan hasta el ${diaDe(m.habiles[4])} ${+m.habiles[4].slice(8)}; los primeros diez, hasta el ${diaDe(m.habiles[9])} ${+m.habiles[9].slice(8)}.</p>
      <div class="tabla-envoltura"><table class="tabla-meses">
        <thead><tr><th scope="col">Semana</th><th scope="col">Días hábiles</th><th scope="col">Orden en el mes</th></tr></thead>
        <tbody>
${semanas.map((s) => {
    const [a, b] = [s.dias[0], s.dias.at(-1)];
    const rotulo = a === b ? `${mayuscula(diaDe(a))} ${+a.slice(8)}` : `${mayuscula(diaDe(a))} ${+a.slice(8)} a ${diaDe(b)} ${+b.slice(8)}`;
    const orden = !s.orden.length ? '—' : s.orden.length === 1 ? `${s.orden[0]}.°` : `${s.orden[0]}.° al ${s.orden.at(-1)}.°`;
    const sin = s.feriados.length ? `<small>Sin ${esc(lista(s.feriados.map((f) => `el ${diaDe(f.fecha)} ${+f.fecha.slice(8)} (${f.nombre})`)))}</small>` : '';
    return `          <tr><td>${rotulo}${sin}</td><td class="num">${s.orden.length}</td><td>${orden}</td></tr>`;
  }).join('\n')}
        </tbody>
      </table></div>

      <h2>Plazos que parten en ${nombre}</h2>
      <p>Si te notifican el <strong>${sinAnio(m.primero)}</strong>, primer día hábil del mes, el conteo parte al día siguiente y el plazo vence así:</p>
      <div class="tabla-envoltura"><table>
        <thead><tr><th scope="col">Plazo</th><th scope="col">Lunes a viernes</th><th scope="col">Lunes a sábado</th><th scope="col">Corridos</th></tr></thead>
        <tbody>
${ejemplos.map((e) => `          <tr><td>${e.dias} días</td><td>${celda(e.lunVie)}</td><td>${celda(e.lunSab)}</td><td>${celda(e.corridos)}</td></tr>`).join('\n')}
        </tbody>
      </table></div>
      ${hayFuera ? '<p class="ayuda">Los plazos que terminan en 2029 no aparecen porque aún no cargamos esos feriados.</p>' : ''}
      <p>Los trámites ante organismos públicos se cuentan de lunes a viernes (Ley 19.880, art. 25): un recurso de reposición, de 5 días hábiles, vencería el ${sinAnio(cinco.vencimiento)}.${veinte.fueraDeRango ? '' : ` Si ese mismo día pides información por transparencia, el organismo tiene 20 días hábiles para responder, hasta el ${fechaLarga(veinte.vencimiento, { conAnio: veinte.vencimiento.slice(0, 4) !== String(anio) })} (Ley 20.285, art. 14).`}${saltados.length ? ` El plazo de 10 días hábiles no cuenta ${esc(lista(saltados.map((f) => `el ${diaDe(f.fecha)} ${+f.fecha.slice(8)} (${f.nombre})`)))}.` : ''} En los juicios civiles, el sábado sí cuenta. Los días corridos lo cuentan todo y pueden vencer en sábado o feriado. <a href="/guias/dias-habiles/">Cómo saber qué regla te aplica →</a></p>
      <p>Para otra fecha u otra cantidad de días, usa la <a href="/plazos/?inicio=${m.primero}">calculadora de plazos</a>.</p>

      <h2>${feriados.length ? `Qué saber de los feriados de ${nombre}` : 'Un mes sin feriados'}</h2>
${feriados.length ? `      <ul>
${feriados.map((f) => `        <li><strong>${mayuscula(sinAnio(f.fecha))}, ${esc(f.nombre)}.</strong> ${[NOTAS_FERIADO[f.nombre], trasladoDelFeriado(f), efectoDelFeriado(f, m)].filter(Boolean).join(' ')}</li>`).join('\n')}
      </ul>` : `      <p>${mayuscula(nombre)} de ${anio} no tiene feriados nacionales${porSemanaSanta}.${siguienteFeriado ? ` El siguiente es el ${sinAnio(siguienteFeriado.fecha)}: ${esc(siguienteFeriado.nombre)}.` : ''}</p>`}
${notas.length ? `
      <h2>Para tener en cuenta en ${nombre}</h2>
${notas.map((n) => `      <p>${n}</p>`).join('\n')}
` : ''}
      <h2>Qué vence en ${nombre} de ${anio}</h2>
      <div class="tabla-envoltura"><table class="tabla-vencimientos">
        <thead><tr><th scope="col">Cuándo</th><th scope="col">Qué vence</th></tr></thead>
        <tbody>
${vencimientos.map((v) => `          <tr><td class="fecha">${v.fecha ? mayuscula(sinAnio(v.fecha)) : v.plazo}</td><td>${esc(v.que)}${v.detalle ? `<small>${esc(v.detalle)}</small>` : ''}</td></tr>`).join('\n')}
        </tbody>
      </table></div>
      <p class="ayuda">Fechas generales, calculadas con las reglas ${lista(['del <a href="https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_1060.htm" rel="noopener">SII</a>', 'de la <a href="https://www.spensiones.cl/portal/institucional/594/w3-article-17117.html" rel="noopener">Superintendencia de Pensiones</a>', ...(fichas.length ? [`de ChileAtiende (${lista(fichas)})`] : [])])}, revisadas el 30 de octubre de 2026. Si pagas el IVA con mandato bancario (PEC), el SII fija una fecha anterior. Para tu caso, confirma con el SII, tu AFP o tu contador.</p>

      <h2>Fines de semana largos y puentes</h2>
      <p>${largosMes.length ? `${largosMes.length === 1 ? 'Hay un fin de semana largo' : `Hay ${largosMes.length} fines de semana largos`} sin pedir días: ${esc(lista(largosMes.map((v) => `del ${rangoLargo(v.desde, v.hasta)} (${v.largo} días, por ${porQue(v)})`)))}.` : `${mayuscula(nombre)} de ${anio} no tiene fines de semana largos.${proximoLargo ? ` El siguiente es del ${esc(rangoLargo(proximoLargo.desde, proximoLargo.hasta))}${proximoLargo.desde.slice(0, 4) !== String(anio) ? ` de ${proximoLargo.desde.slice(0, 4)}` : ''}.` : ''}`}${puentesMes.length ? ` ${esc(puentesMes.map((v, i) => `${i ? 'pidiendo' : 'Pidiendo'} el ${lista(v.pedir.map((p) => `${diaDe(p)} ${+p.slice(8)}`))} de ${MESES[+v.pedir[0].slice(5, 7) - 1]} descansas ${v.largo} días seguidos, del ${rangoLargo(v.desde, v.hasta)}`).join('; '))}.` : ''}</p>
      <p><a href="/fines-de-semana-largos/${anio}/">Todos los de ${anio}</a> · <a href="/vacaciones/?anio=${anio}">Planifica tus vacaciones</a></p>

      <h2>${mayuscula(nombre)} en otros años</h2>
      <p>Días hábiles de lunes a viernes: ${lista(resumenes.map((x) => (x.anio === anio ? `<strong>${x.meses[mes - 1].lunVie} en ${x.anio}</strong>` : `<a href="/dias-habiles/${x.anio}/${SLUG_MES[mes - 1]}/">${x.meses[mes - 1].lunVie} en ${x.anio}</a>`)))}. En ${anio}, lo máximo son ${mas} días hábiles (${mesesCon(mas)}) y lo mínimo, ${menos} (${mesesCon(menos)}).</p>
    </article>`;
}

function paginasDiasHabiles(hoy) {
  const paginas = [];
  const todosLargos = ANIOS.flatMap((a) => largosDe(a));
  const filaAnio = (anio) => {
    const meses = Array.from({ length: 12 }, (_, i) => mesEnCifras(anio, i + 1));
    return { anio, meses, lunVie: meses.reduce((s, m) => s + m.lunVie, 0), lunSab: meses.reduce((s, m) => s + m.lunSab, 0) };
  };
  const resumenes = ANIOS.map(filaAnio);
  const mesActual = hoy.slice(0, 7);

  paginas.push({
    ruta: '/dias-habiles/',
    html: documento({
      ruta: '/dias-habiles/',
      titulo: `Días hábiles en Chile por mes: ${lista(ANIOS.map(String))} | Día Hábil`,
      descripcion: `Cuántos días hábiles tiene cada mes en Chile, de lunes a viernes y de lunes a sábado, descontando los feriados de ${lista(ANIOS.map(String))}.`,
      og: `dias-habiles-${ANIOS[1]}`,
      migas: [['Inicio', '/'], ['Días hábiles', '/dias-habiles/']],
      cuerpo: `
    <section class="portada">
      <div class="antetitulo">Días hábiles · Chile</div>
      <h1>Días hábiles por mes</h1>
      <p class="bajada">Cuántos días hábiles tiene cada mes, descontando sábados, domingos y feriados nacionales. Para contar un plazo desde una fecha, usa la <a href="/plazos/">calculadora de plazos</a>.</p>
    </section>
    <section class="herramientas" aria-label="Días hábiles por año">
${resumenes.map((r) => `      <a class="acceso" href="/dias-habiles/${r.anio}/">
        <div class="antetitulo" style="margin:0">${r.anio}</div>
        <h2>Días hábiles ${r.anio}</h2>
        <p>${r.lunVie} días hábiles de lunes a viernes y ${r.lunSab} de lunes a sábado.</p>
        <span class="ir">Ver mes a mes →</span>
      </a>`).join('\n')}
    </section>
    ${anuncio()}`,
    }),
  });

  for (const r of resumenes) {
    const ruta = `/dias-habiles/${r.anio}/`;
    paginas.push({
      ruta,
      html: documento({
        ruta,
        titulo: `Días hábiles ${r.anio} en Chile, mes a mes | Día Hábil`,
        descripcion: `${r.anio} tiene ${r.lunVie} días hábiles de lunes a viernes en Chile. Tabla mes a mes, de lunes a viernes y de lunes a sábado, con los feriados descontados.`,
        og: `dias-habiles-${r.anio}`,
        migas: [['Inicio', '/'], ['Días hábiles', '/dias-habiles/'], [String(r.anio), ruta]],
        cuerpo: `
    <section class="portada">
      <div class="antetitulo">Días hábiles · Chile</div>
      <h1>Días hábiles ${r.anio}</h1>
      <p class="bajada">${r.anio} tiene <strong>${r.lunVie} días hábiles de lunes a viernes</strong> y ${r.lunSab} de lunes a sábado, descontando los feriados nacionales.</p>
      ${selectorAnios('/dias-habiles/', r.anio)}
    </section>
    <section class="tarjeta">
      <div class="tabla-envoltura"><table class="tabla-meses">
        <thead><tr><th scope="col">Mes</th><th scope="col">Lunes a viernes</th><th scope="col">Lunes a sábado</th><th scope="col">Feriados</th></tr></thead>
        <tbody>
${r.meses.map((m, i) => `          <tr${m.desde.slice(0, 7) === mesActual ? ' class="actual"' : ''}><td class="fecha"><a href="/dias-habiles/${r.anio}/${SLUG_MES[i]}/">${mayuscula(MESES[i])}</a></td><td class="num">${m.lunVie}</td><td class="num">${m.lunSab}</td><td>${esc(m.feriados.map((f) => `${+f.fecha.slice(8)} ${f.nombre}`).join(' · ')) || '—'}</td></tr>`).join('\n')}
          <tr class="total"><td class="fecha">Total</td><td class="num">${r.lunVie}</td><td class="num">${r.lunSab}</td><td></td></tr>
        </tbody>
      </table></div>
      <p class="ayuda" style="margin-top:12px">En la Región de Arica y Parinacota, junio tiene un día hábil menos si el 7 de junio cae en día de semana; lo mismo en Chillán y Chillán Viejo con el 20 de agosto.</p>
    </section>
    ${anuncio()}`,
      }),
    });

    const largos = largosDe(r.anio);
    const puentes = puentesDe(r.anio);
    r.meses.forEach((m, i) => {
      const mes = i + 1;
      const nombre = MESES[i];
      const ruta = `/dias-habiles/${r.anio}/${SLUG_MES[i]}/`;
      const anterior = mes > 1 ? [r.anio, mes - 1] : r.anio > ANIOS[0] ? [r.anio - 1, 12] : null;
      const siguienteMes = mes < 12 ? [r.anio, mes + 1] : r.anio < ANIOS.at(-1) ? [r.anio + 1, 1] : null;
      const enlaceMes = ([a, mm]) => `/dias-habiles/${a}/${SLUG_MES[mm - 1]}/`;
      const habilesSemana = m.feriados.filter((f) => enSemana(f));
      const finde = m.feriados.filter((f) => !enSemana(f));
      const mapa = new Map([...m.feriados, ...m.regionales].map((f) => [f.fecha, f]));
      paginas.push({
        ruta,
        html: documento({
          ruta,
          titulo: `Días hábiles de ${nombre} ${r.anio} en Chile: ${m.lunVie} días | Día Hábil`,
          descripcion: `${mayuscula(nombre)} de ${r.anio} tiene ${m.lunVie} días hábiles de lunes a viernes en Chile y ${m.lunSab} de lunes a sábado. Feriados, plazos de ejemplo, puentes y vencimientos del IVA y las cotizaciones.`,
          og: `dias-habiles-${r.anio}`,
          migas: [['Inicio', '/'], ['Días hábiles', '/dias-habiles/'], [String(r.anio), `/dias-habiles/${r.anio}/`], [mayuscula(nombre), ruta]],
          cuerpo: `
    <section class="portada">
      <div class="antetitulo">Días hábiles · Chile</div>
      <h1>Días hábiles de ${nombre} ${r.anio}</h1>
      <p class="bajada">${mayuscula(nombre)} de ${r.anio} tiene <strong>${m.lunVie} días hábiles de lunes a viernes</strong>. El primero es el ${fechaLarga(m.primero, { conAnio: false })} y el último, el ${fechaLarga(m.ultimo, { conAnio: false })}.</p>
    </section>
    <section class="herramienta">
      <div class="tarjeta">
        <div class="cifras-mes">
          <div><span class="cifra">${m.lunVie}</span><span>de lunes a viernes</span></div>
          <div><span class="cifra">${m.lunSab}</span><span>de lunes a sábado</span></div>
          <div><span class="cifra">${m.corridos}</span><span>días corridos</span></div>
        </div>
        <h2 style="font-size:var(--texto-xl);margin-top:var(--espacio-6)">Feriados de ${nombre}</h2>
        <ul class="saltados">
${m.feriados.length ? m.feriados.map((f) => `          <li><span class="punto"></span><time datetime="${f.fecha}">${fechaCorta(f.fecha)}</time><span>${esc(f.nombre)}${enSemana(f) ? '' : diaSemana(aNum(f.fecha)) === 6 ? ' (cae sábado, solo descuenta de lunes a sábado)' : ' (cae domingo, no descuenta días)'}</span></li>`).join('\n') : '          <li><span>Este mes no tiene feriados nacionales.</span></li>'}
${m.regionales.map((f) => `          <li><span class="punto" style="background:var(--color-vacaciones)"></span><time datetime="${f.fecha}">${fechaCorta(f.fecha)}</time><span>${esc(f.nombre)}: solo en ${esc(REGIONES[f.alcance])}</span></li>`).join('\n')}
        </ul>
        <p class="detalle" style="margin-top:var(--espacio-4)">${habilesSemana.length ? `Se descuentan ${plural(habilesSemana.length, 'feriado', 'feriados')} en día de semana.` : 'Ningún feriado cae en día de semana este mes.'}${finde.length ? ` ${plural(finde.length, 'feriado cae', 'feriados caen')} en fin de semana.` : ''}</p>
      </div>
      <div class="resultado">
        <div class="tarjeta">
          <h2 style="font-size:var(--texto-xl)">${mayuscula(nombre)} ${r.anio}</h2>
          ${grillaMes(r.anio, mes, mapa)}
          <div class="leyenda"><span><i class="l-feriado"></i>Feriado</span></div>
          <div class="acciones">
            <a class="boton" href="/plazos/?inicio=${m.desde}">Calcular un plazo</a>
          </div>
        </div>
        ${anuncio('lateral')}
      </div>
    </section>
${articuloDelMes({ r, m, mes, largos, puentes, todosLargos, resumenes })}
    <nav class="paginacion" aria-label="Otros meses">
      ${anterior ? `<a href="${enlaceMes(anterior)}">← ${mayuscula(MESES[anterior[1] - 1])} ${anterior[0]}</a>` : '<span></span>'}
      <a href="/dias-habiles/${r.anio}/">Todo ${r.anio}</a>
      ${siguienteMes ? `<a href="${enlaceMes(siguienteMes)}">${mayuscula(MESES[siguienteMes[1] - 1])} ${siguienteMes[0]} →</a>` : '<span></span>'}
    </nav>
    ${anuncio()}`,
        }),
      });
    });
  }
  return paginas;
}

// ---------- Respuestas del día: ¿mañana es feriado? y próximo fin de semana largo ----------
// La respuesta depende de la fecha, así que la calcula el navegador (ui-hoy.js). El HTML trae
// esqueletos de carga y listas con fechas absolutas, que siguen siendo útiles sin JavaScript.
const selectorRegion = `<div class="campo" style="margin:var(--espacio-5) 0 0">
          <label for="region">Incluir feriado regional</label>
          <select id="region">
            <option value="nacional">Solo feriados nacionales</option>
            <option value="arica">Región de Arica y Parinacota</option>
            <option value="chillan">Chillán y Chillán Viejo</option>
          </select>
        </div>`;

const respuestaEsqueleto = (tipo) => `<div class="tarjeta" aria-live="polite" aria-busy="true" id="respuesta" data-tipo="${tipo}">
        <span class="sr" data-carga>Revisando el calendario…</span>
        <div class="respuesta">
          <div class="hoja es-feriado esq esq-hoja" id="hoja" data-esq="esq esq-hoja"></div>
          <div>
            <p class="veredicto" id="veredicto"><span class="esq esq-cifra"></span></p>
            <p class="titular" id="titular"><span class="esq esq-titulo"></span><span class="esq esq-titulo" style="width:55%"></span></p>
          </div>
        </div>
        <ul class="datos-dia" id="datos">
          <li><span class="esq esq-linea larga"></span></li>
          <li><span class="esq esq-linea media"></span></li>
          <li><span class="esq esq-linea larga"></span></li>
        </ul>
        ${selectorRegion}
        <noscript><p class="aviso">Activa JavaScript para ver la respuesta de hoy. Mientras tanto, revisa la lista de esta página.</p></noscript>
      </div>`;

function paginasDelDia(hoy) {
  const proximos = FERIADOS.filter((f) => f.alcance === 'nacional' && f.fecha > hoy).slice(0, 8);
  const largos = proximosFinesLargos(hoy, 'nacional', 8);

  const manana = documento({
    ruta: '/manana-es-feriado/',
    titulo: '¿Mañana es feriado en Chile? La respuesta del día | Día Hábil',
    descripcion: '¿Mañana es feriado en Chile? Te lo decimos al instante, con el próximo feriado, si es irrenunciable y si viene fin de semana largo. Incluye feriados regionales.',
    og: 'manana',
    migas: [['Inicio', '/'], ['Feriados', '/feriados/'], ['¿Mañana es feriado?', '/manana-es-feriado/']],
    cuerpo: `
    <section class="portada">
      <div class="antetitulo">Feriados · Chile</div>
      <h1>¿Mañana es feriado?</h1>
      <p class="bajada">La respuesta de hoy según los feriados legales de Chile, con el próximo feriado y si viene fin de semana largo.</p>
    </section>

    <section class="herramienta">
      ${respuestaEsqueleto('manana')}
      <div class="resultado">
        <div class="tarjeta">
          <h2 style="font-size:var(--texto-xl)">Próximos feriados</h2>
          <ul class="lista-simple" id="proximos">
${proximos.map((f) => `            <li data-fecha="${f.fecha}"><span><strong>${fechaCorta(f.fecha)} ${f.fecha.slice(0, 4)}</strong> · ${esc(f.nombre)}</span><span class="etq">${DIAS[diaSemana(aNum(f.fecha))]}</span></li>`).join('\n')}
          </ul>
          <p style="margin:14px 0 0"><a href="/proximo-fin-de-semana-largo/">¿Cuándo es el próximo fin de semana largo? →</a></p>
        </div>
        ${anuncio('lateral')}
      </div>
    </section>

    <article class="contenido" style="margin-top:var(--espacio-seccion)">
      <h2>¿Cómo saber si un día es feriado en Chile?</h2>
      <p>Los feriados legales los fija la ley. Esta página usa la lista de la Biblioteca del Congreso Nacional para ${lista(ANIOS.map(String))}, y te avisa si el día es irrenunciable o parte de un fin de semana largo. Los domingos también son feriado, aunque no se listan.</p>
      <h2>Preguntas frecuentes</h2>
      <div class="preguntas">
        <details><summary>¿Si un feriado cae en domingo se corre al lunes?</summary><p>No, por regla general se queda en su fecha. Solo se trasladan San Pedro y San Pablo y el Encuentro de Dos Mundos (Ley 19.668), y el Día de las Iglesias Evangélicas y Protestantes (Ley 20.299).</p></details>
        <details><summary>¿Abre el comercio en feriado?</summary><p>Depende del feriado. En los irrenunciables (1 de enero, 1 de mayo, 18 y 19 de septiembre y 25 de diciembre) los trabajadores del comercio no pueden ser obligados a trabajar, salvo las excepciones de la Ley 19.973. En los demás, cada local decide.</p></details>
        <details><summary>¿Hay feriados solo en algunas regiones?</summary><p>Sí: el 7 de junio en la Región de Arica y Parinacota y el 20 de agosto en Chillán y Chillán Viejo. Elígelos en "Incluir feriado regional".</p></details>
      </div>
      <p><a href="/feriados/">Ver todos los feriados →</a></p>
    </article>

    ${anuncio()}`,
    scripts: '  <script type="module" src="/assets/js/ui-hoy.js"></script>',
  });

  const largo = documento({
    ruta: '/proximo-fin-de-semana-largo/',
    titulo: '¿Cuándo es el próximo fin de semana largo en Chile? | Día Hábil',
    descripcion: 'El próximo fin de semana largo en Chile: fechas, cuántos días faltan, qué feriado lo forma y qué día pedir para alargarlo. Incluye feriados regionales.',
    og: 'proximo-largo',
    migas: [['Inicio', '/'], ['Fines de semana largos', '/fines-de-semana-largos/'], ['El próximo', '/proximo-fin-de-semana-largo/']],
    cuerpo: `
    <section class="portada">
      <div class="antetitulo">Feriados · Chile</div>
      <h1>¿Cuándo es el próximo fin de semana largo?</h1>
      <p class="bajada">Las fechas, cuántos días faltan y qué día pedir para descansar todavía más.</p>
    </section>

    <section class="herramienta">
      ${respuestaEsqueleto('largo')}
      <div class="resultado">
        <div class="tarjeta">
          <h2 style="font-size:var(--texto-xl)">Los que vienen</h2>
          <ul class="lista-simple" id="lista-largos">
${largos.map((v) => `            <li data-hasta="${v.hasta}"><span><strong>${esc(mayuscula(rangoLargo(v.desde, v.hasta)))} ${v.hasta.slice(0, 4)}</strong><br><span class="detalle" style="font-size:.88rem">${esc(lista([...new Set(v.feriados.map((f) => f.nombre))]))}</span></span><span class="etq">${v.largo} días</span></li>`).join('\n')}
          </ul>
          <p style="margin:14px 0 0"><a href="/fines-de-semana-largos/">Todos los fines de semana largos →</a></p>
        </div>
        ${anuncio('lateral')}
      </div>
    </section>

    <article class="contenido" style="margin-top:var(--espacio-seccion)">
      <h2>¿Qué cuenta como fin de semana largo?</h2>
      <p>Tres o más días libres seguidos sin pedir vacaciones: un feriado pegado a un sábado o a un domingo. Si el feriado cae martes o jueves, pedir el lunes o el viernes te deja cuatro días; esos "puentes" aparecen en la respuesta.</p>
      <p>Para combinar tus días de vacaciones con todos los feriados del año, usa el <a href="/vacaciones/">optimizador de vacaciones</a>.</p>
    </article>

    ${anuncio()}`,
    scripts: '  <script type="module" src="/assets/js/ui-hoy.js"></script>',
  });

  return [{ ruta: '/manana-es-feriado/', html: manana }, { ruta: '/proximo-fin-de-semana-largo/', html: largo }];
}

// ---------- Calendarios, sitemap y robots ----------
function calendarios() {
  const salida = {};
  for (const region of Object.keys(REGIONES)) {
    const eventos = FERIADOS
      .filter((f) => f.alcance === 'nacional' || f.alcance === region)
      .map((f) => ({
        uid: `${f.fecha}-${f.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}@diahabil.cl`,
        desde: f.fecha,
        titulo: `${f.nombre}${f.irrenunciable ? ' (irrenunciable)' : ''}`,
        descripcion: `Feriado en ${f.alcance === 'nacional' ? 'todo Chile' : REGIONES[f.alcance]}. Respaldo legal: ${f.ley}. Fuente: ${SITIO}/feriados/`,
      }));
    const archivo = region === 'nacional' ? 'feriados-chile.ics' : `feriados-chile-${region}.ics`;
    const nombre = region === 'nacional' ? 'Feriados de Chile' : `Feriados de Chile + ${REGIONES[region]}`;
    salida[archivo] = crearICS({ nombre, eventos, sello: `${REVISADO}T00:00:00.000Z` });
  }
  return salida;
}

async function archivosHtml(dir) {
  const salida = [];
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...(await archivosHtml(ruta)));
    else if (entrada.name.endsWith('.html')) salida.push(ruta);
  }
  return salida;
}

export async function construir({ destino = join(RAIZ, 'dist'), hoy = hoyEnChile(), marcadores = false } = {}) {
  conMarcadores = marcadores;
  await cargarPlantillas();
  versionRecursos = await calcularVersionRecursos();
  await rm(destino, { recursive: true, force: true });
  await cp(join(RAIZ, 'publico'), destino, { recursive: true });

  // Los módulos se importan entre sí con la misma versión; sin ella, un import traería la copia antigua.
  const modulos = join(destino, 'assets', 'js');
  for (const nombre of await readdir(modulos)) {
    const archivo = join(modulos, nombre);
    await writeFile(archivo, (await readFile(archivo, 'utf8')).replace(/from '(\.\/[^']+\.js)'/g, `from '$1?v=${versionRecursos}'`));
  }

  const indexables = [];
  for (const archivo of await archivosHtml(destino)) {
    const relativo = relative(destino, archivo).split(sep).join('/');
    const ruta = relativo === 'index.html' ? '/' : relativo.endsWith('/index.html') ? `/${relativo.slice(0, -'index.html'.length)}` : `/${relativo}`;
    const html = aplicarPlantilla(await readFile(archivo, 'utf8'), ruta);
    await writeFile(archivo, html);
    if (!/content="noindex"/.test(html) && ruta !== '/404.html') indexables.push(ruta);
  }

  const generadas = [...paginasFeriados(hoy), ...paginasFinesLargos(hoy), ...paginasDiasHabiles(hoy), ...paginasDelDia(hoy)];
  for (const p of generadas) {
    const archivo = join(destino, ...p.ruta.split('/').filter(Boolean), 'index.html');
    await mkdir(dirname(archivo), { recursive: true });
    await writeFile(archivo, p.html);
    indexables.push(p.ruta);
  }

  await mkdir(join(destino, 'calendarios'), { recursive: true });
  for (const [archivo, contenido] of Object.entries(calendarios())) await writeFile(join(destino, 'calendarios', archivo), contenido);

  const prioridad = (r) => (r === '/' ? '1.0' : ['/plazos/', '/vacaciones/', '/feriados/'].includes(r) ? '0.9' : r.split('/').length > 4 ? '0.5' : '0.7');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexables.sort().map((r) => `  <url><loc>${SITIO}${r}</loc><lastmod>${CONTENIDO_ACTUALIZADO > REVISADO ? CONTENIDO_ACTUALIZADO : REVISADO}</lastmod><priority>${prioridad(r)}</priority></url>`).join('\n')}
</urlset>
`;
  await writeFile(join(destino, 'sitemap.xml'), sitemap);
  await writeFile(join(destino, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITIO}/sitemap.xml\n`);
  // Autoriza a Google a vender anuncios en el sitio (https://support.google.com/adsense/answer/12171612).
  await writeFile(join(destino, 'ads.txt'), `google.com, ${ADSENSE.cliente.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
  return { destino, paginas: indexables.length, generadas: generadas.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inicio = Date.now();
  const r = await construir();
  console.log(`Sitio construido en ${relative(RAIZ, r.destino)}: ${r.paginas} páginas indexables (${r.generadas} generadas) en ${Date.now() - inicio} ms`);
}
