// Construye el sitio en dist/: copia publico/, completa cabecera, pie y metadatos de cada página,
// genera las páginas de feriados, fines de semana largos y días hábiles, los calendarios .ics,
// el sitemap y el robots.txt. Uso: npm run construir
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FERIADOS, REGIONES, RANGO, REVISADO } from '../publico/assets/js/feriados.js';
import {
  aNum, aISO, diaSemana, contarHabiles, construirDias, generarBloques, finesDeSemanaLargos, mejoresPuentes, describirBloque,
} from '../publico/assets/js/fechas.js';
import { fechaLarga, fechaCorta, MESES, DIAS, DIAS_CORTOS, plural, hoyEnChile } from '../publico/assets/js/formato.js';
import { crearICS } from '../publico/assets/js/ics.js';

export const SITIO = 'https://diahabil.cl';
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
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
  return { desde, hasta, lunVie: lv.habiles, lunSab: ls.habiles, corridos: lv.corridos, feriados: lv.feriados, regionales, primero: habilesLv[0], ultimo: habilesLv.at(-1) };
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

const OG_POR_RUTA = { '/': 'inicio', '/plazos/': 'plazos', '/vacaciones/': 'vacaciones' };
const seccionDe = (ruta) => {
  const primera = ruta.split('/')[1] || 'inicio';
  return primera === 'fines-de-semana-largos' ? 'feriados' : primera;
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
  ].filter(Boolean).join('\n');
  const seccion = seccionDe(ruta);
  const anioSiguiente = Math.min(ANIOS.at(-1), +hoyEnChile().slice(0, 4) + 1);
  const cabecera = plantillas.cabecera.replace(`data-seccion="${seccion}"`, `data-seccion="${seccion}" aria-current="page"`);
  const pie = plantillas.pie.replaceAll('{{revisado}}', fechaLarga(REVISADO).replace(/^\S+ /, '')).replaceAll('{{anioSiguiente}}', anioSiguiente);
  return html
    .replace('  <!-- @head -->', plantillas.head.replace('{{metadatos}}', metadatos))
    .replace('<!-- @head -->', plantillas.head.replace('{{metadatos}}', metadatos))
    .replace('  <!-- @cabecera -->', cabecera)
    .replace('  <!-- @pie -->', pie);
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
        <p style="margin:14px 0 0"><a href="/fines-de-semana-largos/">Ver fines de semana largos →</a></p>
      </div>
      <div class="resultado">
        ${tarjetaSuscripcion}
        ${anuncio('lateral')}
      </div>
    </section>

    <article class="contenido" style="margin-top:var(--espacio-seccion)">
      <h2>¿Qué es un feriado irrenunciable?</h2>
      <p>En los feriados irrenunciables (1 de enero, 1 de mayo, 18 y 19 de septiembre y 25 de diciembre) los trabajadores del comercio no pueden ser obligados a trabajar, salvo las excepciones que fija la propia ley (Ley 19.973).</p>
      <h2>Feriados que se mueven al lunes</h2>
      <p>San Pedro y San Pablo (29 de junio) y el Encuentro de Dos Mundos (12 de octubre) se trasladan al lunes de esa semana si caen martes, miércoles o jueves, y al lunes siguiente si caen viernes (Ley 19.668). El Día de las Iglesias Evangélicas y Protestantes (31 de octubre) pasa al viernes anterior si cae martes y al viernes siguiente si cae miércoles (Ley 20.299).</p>
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
      ${siguiente ? `<p class="bajada">El próximo es del <strong>${esc(rangoLargo(siguiente.desde, siguiente.hasta))} de ${siguiente.hasta.slice(0, 4)}</strong>: ${siguiente.largo} días por ${esc(lista([...new Set(siguiente.feriados.map((f) => f.nombre))]))}.</p>` : ''}
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

function paginasDiasHabiles(hoy) {
  const paginas = [];
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
          descripcion: `${mayuscula(nombre)} de ${r.anio} tiene ${m.lunVie} días hábiles de lunes a viernes en Chile y ${m.lunSab} de lunes a sábado. Primer y último día hábil, feriados y calendario del mes.`,
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
${m.feriados.length ? m.feriados.map((f) => `          <li><span class="punto"></span><time datetime="${f.fecha}">${fechaCorta(f.fecha)}</time><span>${esc(f.nombre)}${enSemana(f) ? '' : ' (cae en fin de semana, no descuenta días)'}</span></li>`).join('\n') : '          <li><span>Este mes no tiene feriados nacionales.</span></li>'}
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

export async function construir({ destino = join(RAIZ, 'dist'), hoy = hoyEnChile() } = {}) {
  await cargarPlantillas();
  await rm(destino, { recursive: true, force: true });
  await cp(join(RAIZ, 'publico'), destino, { recursive: true });

  const indexables = [];
  for (const archivo of await archivosHtml(destino)) {
    const relativo = relative(destino, archivo).split(sep).join('/');
    const ruta = relativo === 'index.html' ? '/' : relativo.endsWith('/index.html') ? `/${relativo.slice(0, -'index.html'.length)}` : `/${relativo}`;
    const html = aplicarPlantilla(await readFile(archivo, 'utf8'), ruta);
    await writeFile(archivo, html);
    if (!/content="noindex"/.test(html) && ruta !== '/404.html') indexables.push(ruta);
  }

  const generadas = [...paginasFeriados(hoy), ...paginasFinesLargos(hoy), ...paginasDiasHabiles(hoy)];
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
${indexables.sort().map((r) => `  <url><loc>${SITIO}${r}</loc><lastmod>${REVISADO}</lastmod><priority>${prioridad(r)}</priority></url>`).join('\n')}
</urlset>
`;
  await writeFile(join(destino, 'sitemap.xml'), sitemap);
  await writeFile(join(destino, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITIO}/sitemap.xml\n`);
  return { destino, paginas: indexables.length, generadas: generadas.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inicio = Date.now();
  const r = await construir();
  console.log(`Sitio construido en ${relative(RAIZ, r.destino)}: ${r.paginas} páginas indexables (${r.generadas} generadas) en ${Date.now() - inicio} ms`);
}
