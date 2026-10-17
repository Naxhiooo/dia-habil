// Genera las imágenes de vista previa (1200×630, para WhatsApp y redes) y los íconos PNG.
// Se corre a mano cuando cambian los textos o los años: npm run imagenes
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { ANIOS, resumenAnio } from './construir.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const IMG = join(RAIZ, 'publico/assets/img');
const TTF = join(RAIZ, 'recursos/fuentes-ttf');
const fuentes = ['Alegreya-Bold.ttf', 'Alegreya-variable.ttf', 'AlegreyaSans-Regular.ttf', 'AlegreyaSans-Bold.ttf'].map((f) => join(TTF, f));

// Colores del tema claro (tokens.css)
const C = { arena: '#f4ede2', papel: '#fffcf7', borde: '#d2c5ae', tinta: '#211d19', tinta2: '#4d453c', copihue: '#a3192f', lapis: '#1f4e96', cobre: '#9a4f24' };
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function render(svg, ancho) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: ancho },
    font: { fontFiles: fuentes, loadSystemFonts: false, defaultFontFamily: 'Alegreya Sans' },
  });
  return r.render().asPng();
}

function tarjeta({ color, mes, numero, pie, titulo, bajada }) {
  const tamNumero = String(numero).length > 2 ? 120 : 150;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${C.arena}"/>
  <rect x="24" y="24" width="1152" height="582" rx="28" fill="none" stroke="${C.borde}" stroke-width="2"/>
  <g transform="translate(96 118) rotate(-3 150 190)">
    <rect x="6" y="14" width="300" height="380" rx="22" fill="${C.tinta}" opacity="0.12"/>
    <rect width="300" height="380" rx="22" fill="${C.papel}" stroke="${C.borde}" stroke-width="2"/>
    <path d="M0 22a22 22 0 0 1 22-22h256a22 22 0 0 1 22 22v62H0z" fill="${color}"/>
    <circle cx="86" cy="22" r="9" fill="${C.arena}"/><circle cx="214" cy="22" r="9" fill="${C.arena}"/>
    <text x="150" y="68" text-anchor="middle" font-family="Alegreya Sans" font-weight="700" font-size="24" letter-spacing="3" fill="${C.papel}">${esc(mes.toUpperCase())}</text>
    <text x="150" y="${tamNumero > 130 ? 250 : 240}" text-anchor="middle" font-family="Alegreya" font-weight="700" font-size="${tamNumero}" fill="${C.tinta}">${esc(numero)}</text>
    <text x="150" y="330" text-anchor="middle" font-family="Alegreya Sans" font-weight="700" font-size="30" fill="${C.tinta2}">${esc(pie)}</text>
  </g>
  <text x="480" y="150" font-family="Alegreya" font-weight="700" font-size="34" fill="${C.tinta}">Día <tspan fill="${C.cobre}">Hábil</tspan></text>
  ${titulo.map((linea, i) => `<text x="480" y="${262 + i * 78}" font-family="Alegreya" font-weight="700" font-size="70" fill="${C.tinta}">${esc(linea)}</text>`).join('\n  ')}
  <text x="480" y="${262 + titulo.length * 78 + 22}" font-family="Alegreya Sans" font-size="34" fill="${C.tinta2}">${esc(bajada)}</text>
  <text x="480" y="548" font-family="Alegreya Sans" font-weight="700" font-size="28" fill="${C.cobre}">diahabil.cl</text>
</svg>`;
}

const tarjetas = {
  inicio: { color: C.cobre, mes: 'octubre', numero: 19, pie: 'lunes', titulo: ['Plazos, feriados y', 'vacaciones, sin vueltas.'], bajada: 'Con los feriados de Chile ya incluidos.' },
  plazos: { color: C.cobre, mes: 'vence el', numero: 19, pie: 'lunes', titulo: ['¿Hasta cuándo', 'tengo plazo?'], bajada: 'Calculadora de días hábiles para Chile.' },
  vacaciones: { color: C.lapis, mes: 'vacaciones', numero: 18, pie: 'días libres', titulo: ['Saca más días libres', 'con tus vacaciones'], bajada: 'Te decimos qué días pedir.' },
};
for (const anio of ANIOS) {
  const r = resumenAnio(anio);
  tarjetas[`feriados-${anio}`] = { color: C.copihue, mes: 'feriados', numero: r.feriados, pie: String(anio), titulo: [`Feriados ${anio}`, 'en Chile'], bajada: `${r.feriados} feriados y ${r.largos} fines de semana largos.` };
  tarjetas[`fines-${anio}`] = { color: C.copihue, mes: 'fines largos', numero: r.largos, pie: String(anio), titulo: ['Fines de semana', `largos ${anio}`], bajada: `${r.largos} fines de semana de 3 días o más.` };
  tarjetas[`dias-habiles-${anio}`] = { color: C.lapis, mes: 'días hábiles', numero: r.habiles, pie: String(anio), titulo: [`Días hábiles ${anio}`, 'mes a mes'], bajada: `${r.habiles} días hábiles de lunes a viernes.` };
}

await mkdir(join(IMG, 'og'), { recursive: true });
for (const [nombre, datos] of Object.entries(tarjetas)) {
  const png = render(tarjeta(datos), 1200);
  await writeFile(join(IMG, 'og', `${nombre}.png`), png);
  console.log(`og/${nombre}.png: ${(png.length / 1024).toFixed(0)} KB`);
}

// Íconos: el SVG del sitio, y sobre fondo arena para los que el sistema recorta (iPhone, Android).
const icono = await readFile(join(IMG, 'icono.svg'), 'utf8');
const conFondo = (tam) => `<svg xmlns="http://www.w3.org/2000/svg" width="${tam}" height="${tam}" viewBox="0 0 32 32"><rect width="32" height="32" fill="${C.arena}"/><g transform="translate(4 4) scale(0.75)">${icono.replace(/<\/?svg[^>]*>/g, '')}</g></svg>`;
await writeFile(join(IMG, 'icono-32.png'), render(icono, 32));
for (const tam of [180, 192, 512]) await writeFile(join(IMG, `icono-${tam}.png`), render(conFondo(tam), tam));
console.log('Íconos: 32, 180, 192 y 512 px');
