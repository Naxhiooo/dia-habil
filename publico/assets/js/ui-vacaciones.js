import { planificar, aNum, aISO, diaSemana, MINIMO_CONTINUO } from './fechas.js';
import { fechaCorta, rango, MESES, DIAS_CORTOS, plural, hoyEnChile } from './formato.js';
import { RANGO, REGIONES } from './feriados.js';
import { crearICS, descargarICS } from './ics.js';
import {
  $, $$, leerParametros, escribirParametros, enlaceWhatsApp, conectarCantidad, escaparHTML, marcarListo, alIniciar,
} from './ui-comun.js';

const form = $('#formulario');
const campo = (nombre) => form.elements.namedItem(nombre);
const ANIO_MIN = +RANGO.desde.slice(0, 4);
const ANIO_MAX = +RANGO.hasta.slice(0, 4);

const hoy = hoyEnChile();
const anioHoy = +hoy.slice(0, 4);
const quedan = aNum(`${anioHoy}-12-31`) - aNum(hoy);
// En el último trimestre la mayoría ya planifica el año siguiente.
const anioDefecto = Math.min(ANIO_MAX, Math.max(ANIO_MIN, quedan < 92 ? anioHoy + 1 : anioHoy));
let plan = null;

// Años disponibles: los pasados se deshabilitan y el actual parte desde hoy.
for (const input of $$('input[name="anio"]', form)) {
  const anio = +input.value;
  input.disabled = anio < anioHoy;
  input.closest('label').querySelector('small').textContent = anio === anioHoy ? 'desde hoy' : anio < anioHoy ? 'ya pasó' : 'año completo';
  input.closest('label').style.opacity = input.disabled ? 0.45 : '';
}

// ---------- Estado inicial ----------
const p = leerParametros();
const anioInicial = /^\d{4}$/.test(p.anio || '') && +p.anio >= Math.max(ANIO_MIN, anioHoy) && +p.anio <= ANIO_MAX ? +p.anio : anioDefecto;
form.querySelector(`input[name="anio"][value="${anioInicial}"]`).checked = true;
if (/^\d+$/.test(p.dias || '')) campo('dias').value = Math.min(30, Math.max(1, +p.dias));
if (['ley', 'largo', 'sueltos'].includes(p.estilo)) form.querySelector(`input[name="estilo"][value="${p.estilo}"]`).checked = true;
if (/^\d{1,2}$/.test(p.mes || '') && +p.mes <= 12) campo('mes').value = p.mes;
if (p.region in REGIONES) campo('region').value = p.region;

conectarCantidad($('[data-cantidad]', form), calcular);
form.addEventListener('input', calcular);
form.addEventListener('change', calcular);
form.addEventListener('submit', (e) => e.preventDefault());

function ventana(anio) {
  const desde = anio === anioHoy ? hoy : `${anio}-01-01`;
  // Se incluye la primera semana de enero siguiente para aprovechar Navidad y Año Nuevo.
  const hasta = anio < ANIO_MAX ? `${anio + 1}-01-06` : RANGO.hasta;
  return { desde: desde < RANGO.desde ? RANGO.desde : desde, hasta };
}

function calcular() {
  const anio = +form.querySelector('input[name="anio"]:checked').value;
  const dias = Math.min(30, Math.max(1, parseInt(campo('dias').value, 10) || 15));
  const estilo = form.querySelector('input[name="estilo"]:checked').value;
  const mes = +campo('mes').value;
  const region = campo('region').value;
  campo('mes').closest('.campo').style.opacity = estilo === 'sueltos' ? 0.5 : '';
  campo('mes').disabled = estilo === 'sueltos';

  const { desde, hasta } = ventana(anio);
  plan = { anio, dias, estilo, desde, hasta, ...planificar({ desde, hasta, presupuesto: dias, region, estilo, mes: estilo === 'sueltos' ? 0 : mes }) };
  escribirParametros({ anio, dias, estilo: estilo === 'ley' ? '' : estilo, mes: mes || '', region: region === 'nacional' ? '' : region });
  pintarResumen();
  pintarMeses();
  pintarListas();
  marcarListo($('#resultado'), $('#seccion-anio'), $('#listas'));
}

// "14–18 jun, 21–25 jun y 28 jun"
function compactar(isos) {
  const grupos = [];
  for (const iso of isos) {
    const ultimo = grupos.at(-1);
    if (ultimo && aNum(iso) === aNum(ultimo.hasta) + 1) ultimo.hasta = iso;
    else grupos.push({ desde: iso, hasta: iso });
  }
  const textos = grupos.map((g) => rango(g.desde, g.hasta));
  return textos.length > 1 ? `${textos.slice(0, -1).join(', ')} y ${textos.at(-1)}` : textos[0] || '';
}

const formatoRinde = (v) => (Math.round((v.largo / v.costo) * 10) / 10).toString().replace('.', ',');

function itemViaje(v, i, { alternativa = false } = {}) {
  const rinde = v.largo / v.costo;
  const etiqueta = v.principal && plan.estilo === 'ley' ? '<span class="chip vacaciones">10+ días seguidos</span>' : '';
  const feriados = v.feriados.length ? ` · ${escaparHTML([...new Set(v.feriados.map((f) => f.nombre))].join(', '))}` : '';
  return `<li><button type="button" class="viaje${alternativa ? ' alternativa' : ''}" data-i="${i}" data-desde="${v.desde}" data-hasta="${v.hasta}">
    <span class="medidor" style="--p:${Math.min(100, (rinde / 4) * 100)}" title="Cada día que pides rinde ${formatoRinde(v)} días libres"><span>×${formatoRinde(v)}</span></span>
    <span><span class="fechas">${etiqueta}${rango(v.desde, v.hasta)}</span><span class="sub">Pide ${compactar(v.pedir)}${feriados}</span></span>
    <span class="rinde"><b>${v.largo}</b><small>${v.largo === 1 ? 'día libre' : 'días libres'}</small></span>
  </button></li>`;
}

function pintarResumen() {
  const { viajes, usados, descanso, dias, estilo, alternativas } = plan;
  const avisos = [];
  if (!viajes.length) {
    $('#cifra').textContent = '–';
    $('#cifra-texto').textContent = 'No encontramos fechas que cumplan con lo pedido. Prueba con otro mes o con "Donde rinda más".';
    $('#viajes').innerHTML = '';
    $('#avisos').innerHTML = '';
    return;
  }
  $('#cifra').textContent = descanso;
  $('#cifra-texto').textContent = `días libres en ${plural(viajes.length, 'viaje', 'viajes')}, pidiendo ${plural(usados, 'día', 'días')} de vacaciones.`;
  if (usados < dias) avisos.push(`<p class="nota">Te ${dias - usados === 1 ? 'sobra 1 día' : `sobran ${dias - usados} días`}: no quedan fechas en el período donde rindan más.</p>`);
  if (estilo === 'sueltos') avisos.push(`<p class="aviso">Ojo: el feriado legal debe tomarse con al menos ${MINIMO_CONTINUO} días hábiles seguidos. Usa esta opción para días administrativos o permisos acordados.</p>`);
  if (estilo === 'ley' && dias <= MINIMO_CONTINUO) avisos.push(`<p class="nota">Con ${dias} días o menos, la ley pide tomarlos todos seguidos, así que el plan es un solo viaje.</p>`);
  $('#avisos').innerHTML = avisos.join('');

  let html = viajes.map((v, i) => itemViaje(v, i)).join('');
  if (estilo === 'largo') {
    const otras = alternativas.filter((a) => a.desde !== viajes[0].desde).slice(0, 3);
    if (otras.length) {
      html += `<li><p class="detalle" style="margin:10px 0 2px">Otras opciones con los mismos días:</p></li>`;
      html += otras.map((v, i) => itemViaje(v, `a${i}`, { alternativa: true })).join('');
    }
  }
  $('#viajes').innerHTML = html;
  $('#btn-whatsapp').href = enlaceWhatsApp(`Con ${dias} días de vacaciones en ${plan.anio} puedo tener ${descanso} días libres. Mira el plan: ${location.href}`);
}

// Clasifica cada día según el plan elegido.
function estadoDias() {
  const estado = new Map();
  plan.viajes.forEach((v) => {
    for (let n = aNum(v.desde); n <= aNum(v.hasta); n += 1) estado.set(aISO(n), v.pedir.includes(aISO(n)) ? 'pedir' : 'libre');
  });
  return estado;
}

function pintarMeses() {
  const estado = estadoDias();
  const feriados = new Map(plan.dias.filter((d) => d.feriado).map((d) => [d.iso, d.feriado]));
  const meses = [];
  const primerMes = +plan.desde.slice(5, 7);
  for (let m = primerMes; m <= 12; m += 1) meses.push([plan.anio, m]);
  if (plan.viajes.some((v) => v.hasta.startsWith(String(plan.anio + 1)))) meses.push([plan.anio + 1, 1]);

  const cabecera = [1, 2, 3, 4, 5, 6, 0].map((d) => `<span class="cab">${DIAS_CORTOS[d].slice(0, 2)}</span>`).join('');
  $('#meses').innerHTML = meses.map(([anio, m]) => {
    const primero = aNum(`${anio}-${String(m).padStart(2, '0')}-01`);
    const total = new Date(Date.UTC(anio, m, 0)).getUTCDate();
    const blancos = (diaSemana(primero) + 6) % 7;
    let libres = 0;
    const celdas = Array.from({ length: blancos }, () => '<span></span>');
    for (let d = 0; d < total; d += 1) {
      const iso = aISO(primero + d);
      const clases = ['d'];
      const dow = diaSemana(primero + d);
      let titulo = fechaCorta(iso);
      if (dow === 0 || dow === 6) clases.push('finde');
      if (feriados.has(iso)) { clases.push('feriado'); titulo += ` · ${feriados.get(iso).nombre}`; }
      const e = estado.get(iso);
      if (e) { clases.push(e); libres += 1; titulo += e === 'pedir' ? ' · pides este día' : ' · libre'; }
      if (iso < plan.desde) clases.push('pasado');
      celdas.push(`<span class="${clases.join(' ')}" data-iso="${iso}" title="${escaparHTML(titulo)}">${d + 1}</span>`);
    }
    return `<div class="mes-mini" data-mes="${anio}-${m}"><h3>${MESES[m - 1]}${anio !== plan.anio ? ` ${anio}` : ''}${libres ? `<small>${plural(libres, 'día libre', 'días libres')}</small>` : ''}</h3><div class="grilla">${cabecera}${celdas.join('')}</div></div>`;
  }).join('');
}

function pintarListas() {
  const fila = (v, derecha) => `<li><span><strong>${rango(v.desde, v.hasta)}</strong>${v.pedir.length ? ` · pide ${compactar(v.pedir)}` : ''}<br><span class="detalle" style="font-size:.88rem">${escaparHTML([...new Set(v.feriados.map((f) => f.nombre))].join(', '))}</span></span><span class="etq">${derecha}</span></li>`;
  $('#puentes').innerHTML = plan.puentes.length
    ? plan.puentes.map((v) => fila(v, `${v.largo} libres<br>pidiendo ${v.costo}`)).join('')
    : '<li>No quedan puentes en este período.</li>';
  $('#largos').innerHTML = plan.largos.length
    ? plan.largos.map((v) => fila(v, `${v.largo} días`)).join('')
    : '<li>No quedan fines de semana largos en este período.</li>';
}

// Al elegir un viaje, se marca en el calendario.
$('#viajes').addEventListener('click', (e) => {
  const boton = e.target.closest('.viaje');
  if (!boton) return;
  const yaActivo = boton.classList.contains('activo');
  $$('.viaje.activo').forEach((b) => b.classList.remove('activo'));
  $$('.grilla .resalta').forEach((d) => d.classList.remove('resalta'));
  if (yaActivo) return;
  boton.classList.add('activo');
  const { desde, hasta } = boton.dataset;
  for (let n = aNum(desde); n <= aNum(hasta); n += 1) $(`.grilla [data-iso="${aISO(n)}"]`)?.classList.add('resalta');
  $(`.grilla [data-iso="${desde}"]`)?.closest('.mes-mini').scrollIntoView({ behavior: 'smooth', block: 'center' });
});

$('#btn-calendario').addEventListener('click', () => {
  if (!plan?.viajes.length) return;
  const ics = crearICS({
    nombre: `Vacaciones ${plan.anio}`,
    eventos: plan.viajes.map((v) => ({
      uid: `vacaciones-${v.desde}-${v.hasta}@diahabil`,
      desde: v.desde,
      hasta: v.hasta,
      titulo: `Vacaciones: ${v.largo} días libres`,
      descripcion: `Días a pedir: ${compactar(v.pedir)} (${plural(v.costo, 'día', 'días')}). Plan hecho en ${location.href}`,
      alarmaDiasAntes: 30,
    })),
  });
  descargarICS(`vacaciones-${plan.anio}.ics`, ics);
});

alIniciar(calcular);
