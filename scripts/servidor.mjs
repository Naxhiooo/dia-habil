// Servidor local: construye el sitio en dist/, lo sirve y lo reconstruye al guardar cambios
// en publico/ o plantillas/. Sin dependencias. Uso: npm run dev
import { createServer } from 'node:http';
import { watch } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { construir } from './construir.mjs';

const proyecto = resolve(fileURLToPath(new URL('..', import.meta.url)));
const raiz = join(proyecto, 'dist');
const puerto = Number(process.env.PORT) || 4173;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ics': 'text/calendar; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function reconstruir(motivo) {
  const inicio = Date.now();
  try {
    const r = await construir({ marcadores: true });
    console.log(`${motivo}: ${r.paginas} páginas en ${Date.now() - inicio} ms`);
  } catch (error) {
    console.error(`Error al construir: ${error.message}`);
  }
}

await reconstruir('Construido');
let espera;
for (const carpeta of ['publico', 'plantillas']) {
  watch(join(proyecto, carpeta), { recursive: true }, () => {
    clearTimeout(espera);
    espera = setTimeout(() => reconstruir('Reconstruido'), 150);
  });
}

createServer(async (req, res) => {
  try {
    const ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let archivo = normalize(join(raiz, ruta));
    if (archivo !== raiz && !archivo.startsWith(raiz + sep)) throw new Error('fuera de la raíz');
    if ((await stat(archivo)).isDirectory()) archivo = join(archivo, 'index.html');
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(cuerpo);
  } catch {
    const pagina = await readFile(join(raiz, '404.html')).catch(() => 'No encontrado');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pagina);
  }
}).listen(puerto, () => console.log(`Día Hábil en http://localhost:${puerto}`));
