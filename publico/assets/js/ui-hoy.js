// Respuestas que dependen del día: "¿Mañana es feriado?" y "¿Cuándo es el próximo fin de semana largo?".
// Se calculan en el navegador con la fecha de Chile, así nunca quedan desactualizadas.
import { REGIONES, feriadosDe } from './feriados.js';
import { aNum, diaSemana, sumarDias, esISO, dentroDeRango, diasLibresAlrededor, proximosFinesLargos, mejorPuente } from './fechas.js';
import { fechaLarga, DIAS, MESES, hoyEnChile } from './formato.js';
import { $, $$, escaparHTML, pintarHoja, marcarListo, alIniciar, leerParametros, escribirParametros } from './ui-comun.js';

const zona = $('#respuesta');
const tipo = zona.dataset.tipo;
const selector = $('#region');
const p = leerParametros();
// ?fecha=AAAA-MM-DD simula otro día (para revisar cómo responde la página en un feriado).
const hoy = esISO(p.fecha || '') ? p.fecha : hoyEnChile();

const faltan = (fecha) => aNum(fecha) - aNum(hoy);
const enDias = (n) => (n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`);
const listaNombres = (feriados) => {
  const nombres = [...new Set(feriados.map((f) => f.nombre))];
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}` : nombres[0] || '';
};

// "viernes 25 al domingo 27 de diciembre"
function rangoLargo(desde, hasta) {
  const [a, b] = [desde, hasta].map((f) => ({ dia: +f.slice(8), mes: MESES[+f.slice(5, 7) - 1], semana: DIAS[diaSemana(aNum(f))] }));
  if (a.mes === b.mes) return `${a.semana} ${a.dia} al ${b.semana} ${b.dia} de ${b.mes}`;
  return `${a.semana} ${a.dia} de ${a.mes} al ${b.semana} ${b.dia} de ${b.mes}`;
}
const conAnio = (fecha) => (fecha.slice(0, 4) === hoy.slice(0, 4) ? '' : ` de ${fecha.slice(0, 4)}`);

function sinDatos() {
  $('#veredicto').textContent = '—';
  $('#titular').textContent = 'No tenemos feriados cargados para estas fechas.';
  $('#datos').innerHTML = '<li>Revisa la lista de feriados para los años disponibles.</li>';
}

function responderManana(region) {
  const mapa = feriadosDe(region);
  const manana = sumarDias(hoy, 1);
  if (!dentroDeRango(aNum(manana))) return sinDatos();

  const feriado = mapa.get(manana);
  const dow = diaSemana(aNum(manana));
  const hoja = $('#hoja');
  hoja.classList.toggle('es-feriado', Boolean(feriado));
  pintarHoja(hoja, manana);

  const veredicto = $('#veredicto');
  veredicto.textContent = feriado ? 'Sí' : 'No';
  veredicto.className = `veredicto ${feriado ? 'si' : 'no'}`;
  $('#titular').innerHTML = feriado
    ? `Mañana, <em>${fechaLarga(manana, { conAnio: false })}</em>, es feriado: ${escaparHTML(feriado.nombre)}.`
    : `Mañana, ${fechaLarga(manana, { conAnio: false })}, no es feriado.`;

  const datos = [];
  if (feriado?.irrenunciable) datos.push('Es <strong>irrenunciable</strong>: el comercio no puede obligar a trabajar, salvo excepciones de la ley.');
  if (feriado && feriado.alcance !== 'nacional') datos.push(`Es feriado solo en ${escaparHTML(REGIONES[feriado.alcance])}.`);
  if (!feriado && (dow === 0 || dow === 6)) datos.push(`Igual es ${DIAS[dow]}, así que para la mayoría es día libre.`);
  const libres = diasLibresAlrededor(manana, region);
  if (libres.largo >= 3) datos.push(`Es parte de un <strong>fin de semana largo de ${libres.largo} días</strong>: del ${rangoLargo(libres.desde, libres.hasta)}.`);

  const feriadoHoy = mapa.get(hoy);
  datos.push(`Hoy, ${fechaLarga(hoy, { conAnio: false })}, ${feriadoHoy ? `es feriado: ${escaparHTML(feriadoHoy.nombre)}` : 'no es feriado'}.`);

  const siguiente = [...mapa.values()].filter((f) => f.fecha > manana).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  if (siguiente) {
    datos.push(`El siguiente feriado es el <strong>${fechaLarga(siguiente.fecha, { conAnio: false })}${conAnio(siguiente.fecha)}</strong> (${escaparHTML(siguiente.nombre)}), ${enDias(faltan(siguiente.fecha))}. <a href="/feriados/${siguiente.fecha.slice(0, 4)}/">Ver feriados ${siguiente.fecha.slice(0, 4)}</a>`);
  }
  $('#datos').innerHTML = datos.map((d) => `<li>${d}</li>`).join('');
}

function responderLargo(region) {
  const [proximo, siguiente] = proximosFinesLargos(hoy, region, 2);
  if (!proximo) return sinDatos();

  const hoja = $('#hoja');
  hoja.classList.add('es-feriado');
  pintarHoja(hoja, proximo.desde);

  const n = faltan(proximo.desde);
  const enCurso = n <= 0;
  const veredicto = $('#veredicto');
  veredicto.className = 'veredicto si';
  veredicto.textContent = enCurso ? '¡Ahora!' : n === 1 ? 'Mañana' : `En ${n} días`;
  $('#titular').innerHTML = `${enCurso ? 'Estás en un fin de semana largo:' : 'El próximo es del'} <em>${rangoLargo(proximo.desde, proximo.hasta)}${conAnio(proximo.desde)}</em>: ${proximo.largo} días por ${escaparHTML(listaNombres(proximo.feriados))}.`;

  const datos = [];
  const puente = mejorPuente(proximo.desde, proximo.hasta, region);
  if (puente && !enCurso) {
    const pedir = puente.pedir.map((p) => `${DIAS[diaSemana(aNum(p))]} ${+p.slice(8)}`).join(' y ');
    datos.push(`Si pides el <strong>${pedir}</strong>, descansas <strong>${puente.largo} días</strong> seguidos: del ${rangoLargo(puente.desde, puente.hasta)}.`);
  }
  if (enCurso) datos.push(`Termina el ${fechaLarga(proximo.hasta, { conAnio: false })}.`);
  if (siguiente) datos.push(`Después viene el del ${rangoLargo(siguiente.desde, siguiente.hasta)}${conAnio(siguiente.desde)} (${siguiente.largo} días), ${enDias(faltan(siguiente.desde))}.`);
  datos.push(`<a href="/vacaciones/?anio=${proximo.desde.slice(0, 4)}">Combina tus vacaciones con los feriados de ${proximo.desde.slice(0, 4)}</a>`);
  $('#datos').innerHTML = datos.map((d) => `<li>${d}</li>`).join('');
}

// Las listas del HTML se generaron en otra fecha: se quitan las que ya pasaron.
function limpiarListas() {
  $$('#proximos li[data-fecha]').forEach((li) => { if (li.dataset.fecha <= hoy) li.remove(); });
  $$('#lista-largos li[data-hasta]').forEach((li) => { if (li.dataset.hasta < hoy) li.remove(); });
}

function responder() {
  const region = selector.value;
  if (tipo === 'manana') responderManana(region);
  else responderLargo(region);
  escribirParametros({ region: region === 'nacional' ? '' : region, fecha: p.fecha && hoy === p.fecha ? p.fecha : '' });
  marcarListo(zona);
}

if (p.region in REGIONES) selector.value = p.region;
selector.addEventListener('change', responder);
limpiarListas();
alIniciar(responder);
