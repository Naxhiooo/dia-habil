import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { construir, SITIO } from '../scripts/construir.mjs';

const destino = await mkdtemp(join(tmpdir(), 'diahabil-'));
const resultado = await construir({ destino, hoy: '2026-10-17' });
const leer = (ruta) => readFile(join(destino, ...ruta.split('/').filter(Boolean)), 'utf8');

async function archivos(dir) {
  const salida = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...(await archivos(ruta)));
    else salida.push(ruta);
  }
  return salida;
}
const htmls = (await archivos(destino)).filter((f) => f.endsWith('.html'));

test.after(() => rm(destino, { recursive: true, force: true }));

test('genera las páginas por año y por mes', () => {
  assert.equal(resultado.generadas, 50);
  assert.ok(resultado.paginas >= 55);
});

test('no quedan marcas de plantilla sin reemplazar', async () => {
  for (const f of htmls) {
    const html = await readFile(f, 'utf8');
    assert.ok(!/<!-- @(head|cabecera|pie) -->|\{\{\w+\}\}/.test(html), relative(destino, f));
  }
});

test('todos los enlaces y recursos internos existen', async () => {
  const rotos = [];
  for (const f of htmls) {
    const html = await readFile(f, 'utf8');
    for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      const ruta = join(destino, ...url.split('/').filter(Boolean));
      const existe = await stat(url.endsWith('/') ? join(ruta, 'index.html') : ruta).then(() => true, () => false);
      if (!existe) rotos.push(`${relative(destino, f).split(sep).join('/')} → ${url}`);
    }
  }
  assert.deepEqual(rotos, []);
});

test('cada página indexable tiene canonical y está en el sitemap', async () => {
  const sitemap = await leer('/sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.equal(urls.length, resultado.paginas);
  for (const f of htmls) {
    const html = await readFile(f, 'utf8');
    if (/content="noindex"/.test(html) || f.endsWith('404.html')) continue;
    const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
    assert.ok(canonical?.startsWith(SITIO), relative(destino, f));
    assert.ok(urls.includes(canonical), canonical);
  }
});

test('cifras clave de las páginas generadas', async () => {
  const noviembre = await leer('/dias-habiles/2026/noviembre/index.html');
  assert.match(noviembre, /tiene <strong>21 días hábiles de lunes a viernes<\/strong>/);
  const feriados2027 = await leer('/feriados/2027/index.html');
  assert.equal([...feriados2027.matchAll(/data-alcance="nacional"/g)].length, 17);
  assert.equal([...feriados2027.matchAll(/data-alcance="(arica|chillan)"/g)].length, 2);
  assert.match(feriados2027, /<h1>Feriados 2027 en Chile<\/h1>/);
  const dic = await leer('/dias-habiles/2026/diciembre/index.html');
  assert.match(dic, /tiene <strong>21 días hábiles de lunes a viernes<\/strong>/);
});

test('AdSense: verificación, ads.txt y sin marcadores en producción', async () => {
  assert.equal(await leer('/ads.txt'), 'google.com, pub-3399052794035568, DIRECT, f08c47fec0942fa0\n');
  const inicio = await leer('/index.html');
  assert.match(inicio, /<meta name="google-adsense-account" content="ca-pub-3399052794035568">/);
  assert.match(inicio, /adsbygoogle\.js\?client=ca-pub-3399052794035568/);
  assert.doesNotMatch(await leer('/404.html'), /adsbygoogle/);
  assert.doesNotMatch(await leer('/estilos/index.html'), /adsbygoogle/);
  for (const f of htmls) assert.doesNotMatch(await readFile(f, 'utf8'), /Espacio reservado para un anuncio/, relative(destino, f));
});

test('los correos quedan fuera de la ofuscación de Cloudflare (evita 404 en /cdn-cgi)', async () => {
  for (const f of htmls) {
    const html = await readFile(f, 'utf8');
    for (const [enlace] of html.matchAll(/<a href="mailto:[^>]*>[^<]*<\/a>/g)) {
      assert.ok(html.includes(`<!--email_off-->${enlace}<!--/email_off-->`), `${relative(destino, f)}: ${enlace}`);
    }
  }
});

test('las guías tienen contenido propio y están enlazadas desde el inicio', async () => {
  const sitemap = await leer('/sitemap.xml');
  const inicio = await leer('/index.html');
  for (const guia of ['dias-habiles', 'vacaciones-legales', 'feriados-irrenunciables', 'feriados-que-se-mueven']) {
    const html = await leer(`/guias/${guia}/index.html`);
    const texto = html.match(/<main[\s\S]*?<\/main>/)[0].replace(/<[^>]+>/g, ' ');
    const palabras = texto.split(/\s+/).filter((p) => /\p{L}/u.test(p)).length;
    assert.ok(palabras >= 800, `${guia}: ${palabras} palabras`);
    assert.ok(sitemap.includes(`<loc>${SITIO}/guias/${guia}/</loc>`), guia);
    assert.ok(inicio.includes(`href="/guias/${guia}/"`), guia);
  }
  assert.match(await leer('/quienes-somos/index.html'), /<h1>Quiénes somos<\/h1>/);
  assert.match(await leer('/index.html'), /<a href="\/guias\/" data-seccion="guias">Guías<\/a>/);
});

test('CSS y JS se piden con la versión de su contenido (Cloudflare no renueva su copia al publicar)', async () => {
  const [, version] = (await leer('/index.html')).match(/href="\/assets\/css\/site\.css\?v=([0-9a-f]{10})"/);
  for (const f of htmls) {
    const html = await readFile(f, 'utf8');
    for (const [, url] of html.matchAll(/(?:href|src)="(\/assets\/(?:css|js)\/[^"]+)"/g)) {
      assert.ok(url.endsWith(`?v=${version}`), `${relative(destino, f)}: ${url}`);
    }
  }
  for (const nombre of await readdir(join(destino, 'assets', 'js'))) {
    const codigo = await leer(`/assets/js/${nombre}`);
    for (const [, modulo] of codigo.matchAll(/from '([^']+)'/g)) {
      assert.ok(modulo.endsWith(`.js?v=${version}`), `${nombre}: ${modulo}`);
    }
  }
});

test('robots y calendarios', async () => {
  assert.match(await leer('/robots.txt'), /Sitemap: https:\/\/diahabil\.cl\/sitemap\.xml/);
  const ics = await leer('/calendarios/feriados-chile.ics');
  assert.equal([...ics.matchAll(/BEGIN:VEVENT/g)].length, 51);
});
