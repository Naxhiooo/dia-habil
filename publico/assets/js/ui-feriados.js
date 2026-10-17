// Mejoras en las páginas de feriados, que ya vienen escritas en el HTML:
// marca los feriados pasados y el próximo, actualiza la lista de próximos y arma los enlaces de suscripción.
import { FERIADOS } from './feriados.js';
import { aNum } from './fechas.js';
import { fechaLarga, hoyEnChile } from './formato.js';
import { $, $$, escaparHTML } from './ui-comun.js';

const hoy = hoyEnChile();

// Tablas de feriados: lo que ya pasó se atenúa y el próximo feriado nacional se destaca.
let marcado = false;
for (const fila of $$('tr[data-fecha]')) {
  const fecha = fila.dataset.fecha;
  if (fecha < hoy) fila.classList.add('pasado');
  else if (!marcado && fila.dataset.alcance === 'nacional') {
    fila.classList.add('siguiente');
    marcado = true;
  }
}

// Próximo feriado y lista de próximos: el HTML se generó en una fecha; aquí se pone al día.
const siguiente = FERIADOS.find((f) => f.alcance === 'nacional' && f.fecha >= hoy);
const destacado = $('#proximo-feriado');
if (destacado && siguiente && destacado.dataset.fecha !== siguiente.fecha) {
  destacado.innerHTML = `Próximo feriado: <strong>${fechaLarga(siguiente.fecha)}</strong>, ${escaparHTML(siguiente.nombre)}.`;
}
for (const item of $$('#proximos li[data-fecha]')) {
  const fecha = item.dataset.fecha;
  if (fecha < hoy) { item.remove(); continue; }
  const n = aNum(fecha) - aNum(hoy);
  item.querySelector('.etq').textContent = n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`;
}

// Suscripción: los enlaces apuntan al calendario publicado en este mismo sitio.
const region = $('#region');
function pintarEnlaces() {
  const archivo = region.value === 'nacional' ? 'feriados-chile.ics' : `feriados-chile-${region.value}.ics`;
  const url = `${location.host}/calendarios/${archivo}`;
  $('#btn-webcal').href = `webcal://${url}`;
  $('#btn-google').href = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`webcal://${url}`)}`;
  $('#btn-descargar').href = `/calendarios/${archivo}`;
}
if (region) {
  region.addEventListener('change', pintarEnlaces);
  pintarEnlaces();
}
