import { calcularPlazo, contarHabiles, aNum, aISO, diaSemana, esISO, sumarDias } from './fechas.js';
import { fechaLarga, fechaCorta, MESES_CORTOS, DIAS_CORTOS, plural, hoyEnChile } from './formato.js';
import { RANGO } from './feriados.js';
import { crearICS, descargarICS } from './ics.js';
import {
  $, pintarHoja, leerParametros, escribirParametros, enlaceWhatsApp, copiarTexto,
  conectarCantidad, conectarPestanas, escaparHTML, marcarListo, alIniciar,
} from './ui-comun.js';

const form = $('#formulario');
const campo = (nombre) => form.elements.namedItem(nombre);
const MAX_TIRA = 120; // días que se dibujan en el calendario del resultado

const acotar = (iso) => (iso < RANGO.desde ? RANGO.desde : iso > RANGO.hasta ? RANGO.hasta : iso);
const hoy = acotar(hoyEnChile());

let pestana = 'vence';
let ultimo = null;

// ---------- Estado inicial (desde la URL, si viene) ----------
const p = leerParametros();
campo('inicio').value = esISO(p.inicio || '') ? p.inicio : hoy;
campo('dias').value = /^\d+$/.test(p.dias || '') ? p.dias : '10';
campo('desde').value = esISO(p.desde || '') ? p.desde : hoy;
campo('hasta').value = esISO(p.hasta || '') ? p.hasta : sumarDias(hoy, 30);
if (['lun-vie', 'lun-sab', 'corridos'].includes(p.modo)) form.querySelector(`input[name="modo"][value="${p.modo}"]`).checked = true;
if (['nacional', 'arica', 'chillan'].includes(p.region)) campo('region').value = p.region;
if (p.siguiente === '0') campo('siguiente').checked = false;
if (p.prorroga === '1') campo('prorroga').checked = true;

const activarPestana = conectarPestanas($('[role="tablist"]', form), (valor) => {
  pestana = valor;
  calcular();
});
if (p.tipo === 'contar') activarPestana($('#tab-contar'));

conectarCantidad($('[data-cantidad]', form), calcular);
form.querySelectorAll('[data-dias]').forEach((b) => b.addEventListener('click', () => {
  campo('dias').value = b.dataset.dias;
  calcular();
}));
form.addEventListener('input', calcular);
form.addEventListener('change', calcular);
form.addEventListener('submit', (e) => { e.preventDefault(); calcular(); });

// ---------- Cálculo ----------
function leer() {
  return {
    modo: form.querySelector('input[name="modo"]:checked').value,
    region: campo('region').value,
    siguiente: campo('siguiente').checked,
    prorroga: campo('prorroga').checked,
  };
}

function calcular() {
  const opciones = leer();
  $('#caja-prorroga').classList.toggle('oculto', !(pestana === 'vence' && opciones.modo === 'corridos'));
  try {
    if (pestana === 'vence') {
      const dias = parseInt(campo('dias').value, 10);
      const r = calcularPlazo({
        inicio: campo('inicio').value, dias, modo: opciones.modo, region: opciones.region,
        desdeSiguiente: opciones.siguiente, prorrogar: opciones.prorroga,
      });
      escribirParametros({
        inicio: r.inicio, dias, modo: opciones.modo, region: opciones.region === 'nacional' ? '' : opciones.region,
        siguiente: opciones.siguiente ? '' : '0', prorroga: opciones.prorroga && opciones.modo === 'corridos' ? '1' : '',
      });
      mostrarVencimiento(r, opciones);
    } else {
      const r = contarHabiles({
        desde: campo('desde').value, hasta: campo('hasta').value, modo: opciones.modo,
        region: opciones.region, incluirDesde: !opciones.siguiente,
      });
      escribirParametros({
        tipo: 'contar', desde: campo('desde').value, hasta: campo('hasta').value, modo: opciones.modo,
        region: opciones.region === 'nacional' ? '' : opciones.region, siguiente: opciones.siguiente ? '' : '0',
      });
      mostrarConteo(r, opciones);
    }
  } catch (error) {
    mostrarError(error.message);
  }
  marcarListo($('#resultado'));
}

// ¿Este feriado cambió el conteo? (un feriado en domingo no cambia nada)
function feriadoInfluye(iso, modo) {
  const d = diaSemana(aNum(iso));
  if (modo === 'corridos' || d === 0) return false;
  return !(modo === 'lun-vie' && d === 6);
}

function textoModo(n, modo) {
  if (modo === 'corridos') return plural(n, 'día corrido', 'días corridos');
  return plural(n, 'día hábil', 'días hábiles');
}

function mostrarVencimiento(r, { modo }) {
  ultimo = { tipo: 'vence', r };
  pintarHoja($('#hoja'), r.vencimiento);
  $('#hoja').classList.remove('oculto');
  $('#titular').innerHTML = `Tu plazo vence el <em>${fechaLarga(r.vencimiento)}</em>`;

  const primero = r.recorrido.find((d) => d.cuenta).iso;
  const partes = [`${textoModo(r.dias, modo)}: el primero es el ${fechaLarga(primero, { conAnio: false })}.`];
  if (modo !== 'corridos') partes.push(`En total pasan ${plural(r.corridos, 'día corrido', 'días corridos')} desde la notificación.`);
  $('#detalle').textContent = partes.join(' ');

  const avisos = [];
  if (r.prorrogadoDesde) {
    avisos.push(`<p class="nota">El último día caía el ${fechaLarga(r.prorrogadoDesde, { conAnio: false })}, que no es hábil, así que pasa al ${fechaLarga(r.vencimiento, { conAnio: false })}.</p>`);
  }
  if (r.fueraDeRango) avisos.push(avisoRango());
  $('#avisos').innerHTML = avisos.join('');

  const influyen = r.recorrido.filter((d) => d.feriado && feriadoInfluye(d.iso, modo));
  pintarFeriados(influyen, modo === 'corridos'
    ? r.feriados
    : null);
  pintarTira({ desde: r.inicio, hasta: r.vencimiento, recorrido: r.recorrido, marcarInicio: true });

  $('#btn-calendario').classList.remove('oculto');
  const texto = `Mi plazo de ${textoModo(r.dias, modo)} vence el ${fechaLarga(r.vencimiento)}. Lo calculé en Día Hábil: ${location.href}`;
  $('#btn-whatsapp').href = enlaceWhatsApp(texto);
}

function mostrarConteo(r, { modo }) {
  ultimo = { tipo: 'contar', r };
  const hoja = $('#hoja');
  hoja.dataset.fecha = '';
  hoja.innerHTML = `<div class="mes">${modo === 'corridos' ? 'días' : 'hábiles'}</div><div class="numero">${r.habiles}</div><div class="semana">${modo === 'corridos' ? 'corridos' : 'días hábiles'}</div><div class="anio">en el período</div>`;

  const desde = campo('desde').value;
  const hasta = campo('hasta').value;
  $('#titular').innerHTML = `Hay <em>${textoModo(r.habiles, modo)}</em> entre el ${fechaLarga(desde, { conAnio: desde.slice(0, 4) !== hasta.slice(0, 4) })} y el ${fechaLarga(hasta)}`;

  const noCuentan = [];
  if (modo === 'lun-vie' && r.sabados) noCuentan.push(plural(r.sabados, 'sábado', 'sábados'));
  if (modo !== 'corridos' && r.domingos) noCuentan.push(plural(r.domingos, 'domingo', 'domingos'));
  const feriadosHabiles = r.feriados.filter((f) => feriadoInfluye(f.fecha, modo));
  if (feriadosHabiles.length) noCuentan.push(plural(feriadosHabiles.length, 'feriado', 'feriados'));
  $('#detalle').textContent = `${plural(r.corridos, 'día corrido', 'días corridos')}${noCuentan.length ? `; no se cuentan ${noCuentan.join(', ').replace(/, ([^,]*)$/, ' y $1')}` : ''}. ${campo('siguiente').checked ? 'El día de inicio no se cuenta.' : 'Se cuenta también el día de inicio.'}`;

  $('#avisos').innerHTML = r.fueraDeRango ? avisoRango() : '';
  pintarFeriados(feriadosHabiles.map((f) => ({ iso: f.fecha, feriado: f })), modo === 'corridos' ? r.feriados : null);

  // Recorrido equivalente para dibujar el calendario.
  const recorrido = [];
  let cuenta = 0;
  const inicio = aNum(desde) + (campo('siguiente').checked ? 1 : 0);
  for (let n = inicio; n <= aNum(hasta); n += 1) {
    const iso = aISO(n);
    const fer = r.feriados.find((f) => f.fecha === iso) || null;
    const d = diaSemana(n);
    const inhabil = modo !== 'corridos' && (fer || d === 0 || (d === 6 && modo === 'lun-vie'));
    if (!inhabil) cuenta += 1;
    recorrido.push({ iso, cuenta: inhabil ? null : cuenta, feriado: fer });
  }
  pintarTira({ desde, hasta, recorrido, marcarInicio: true, finEsVence: false });

  $('#btn-calendario').classList.add('oculto');
  $('#btn-whatsapp').href = enlaceWhatsApp(`Entre el ${fechaLarga(desde)} y el ${fechaLarga(hasta)} hay ${textoModo(r.habiles, modo)}. Calculado en Día Hábil: ${location.href}`);
}

function mostrarError(mensaje) {
  ultimo = null;
  $('#hoja').classList.add('oculto');
  $('#titular').textContent = 'Revisa los datos';
  $('#detalle').textContent = mensaje.includes('Fecha') ? 'Ingresa una fecha válida.' : mensaje;
  $('#avisos').innerHTML = '';
  $('#saltados').innerHTML = '';
  $('#tira').innerHTML = '';
}

const avisoRango = () =>
  `<p class="aviso">Parte de este período queda fuera de 2026–2028, los años con feriados verificados. Los feriados fuera de ese rango no están descontados.</p>`;

function pintarFeriados(influyen, informativos) {
  const lista = $('#saltados');
  if (informativos) {
    lista.innerHTML = informativos.length
      ? `<li><span>En días corridos los feriados también cuentan. En este período hay:</span></li>${informativos.map((f) => `<li><span class="punto"></span><time datetime="${f.fecha}">${fechaCorta(f.fecha)}</time><span>${escaparHTML(f.nombre)}</span></li>`).join('')}`
      : '';
    return;
  }
  lista.innerHTML = influyen.length
    ? `<li><span>No se contaron estos feriados:</span></li>${influyen.map((d) => `<li><span class="punto"></span><time datetime="${d.iso}">${fechaCorta(d.iso)}</time><span>${escaparHTML(d.feriado.nombre)}</span></li>`).join('')}`
    : '<li><span>No hay feriados en días que habrían contado.</span></li>';
}

// Calendario semanal (lunes a domingo) con cada día contado numerado.
function pintarTira({ desde, hasta, recorrido, marcarInicio, finEsVence = true }) {
  const tira = $('#tira');
  const a = aNum(desde);
  const b = aNum(hasta);
  if (b - a > MAX_TIRA) {
    tira.innerHTML = '<p class="detalle">El calendario día a día se muestra para períodos de hasta 4 meses.</p>';
    return;
  }
  const porFecha = new Map(recorrido.map((d) => [d.iso, d]));
  const lunes = a - ((diaSemana(a) + 6) % 7);
  const domingo = b + ((7 - diaSemana(b)) % 7);
  const filas = [];
  for (let s = lunes; s <= domingo; s += 7) {
    const celdas = [];
    let rotulo = s === lunes ? MESES_CORTOS[+desde.slice(5, 7) - 1] : '';
    for (let n = s; n < s + 7; n += 1) {
      const iso = aISO(n);
      if (iso.endsWith('-01')) rotulo = MESES_CORTOS[+iso.slice(5, 7) - 1];
      const dato = porFecha.get(iso);
      const clases = ['dia'];
      let marca = '';
      let titulo = fechaCorta(iso);
      if (n === a && marcarInicio) { clases.push('inicio'); titulo += ': día de inicio'; }
      if (dato) {
        if (dato.cuenta) { clases.push('habil'); marca = `<span class="c">${dato.cuenta}</span>`; titulo += `: día ${dato.cuenta}`; }
        else { clases.push('inhabil'); titulo += ': no se cuenta'; }
        if (dato.feriado) { clases.push('feriado'); titulo += ` (${dato.feriado.nombre})`; }
      } else if (n !== a) {
        clases.push('vacio');
      }
      if (n === b && finEsVence) { clases.push('vence'); titulo += ' · vence'; }
      celdas.push(`<div class="${clases.join(' ')}" title="${escaparHTML(titulo)}"><span class="n">${+iso.slice(8)}</span>${marca}</div>`);
    }
    filas.push(`<div class="semana-fila"><span class="mesrot">${rotulo}</span>${celdas.join('')}</div>`);
  }
  const cabecera = [1, 2, 3, 4, 5, 6, 0].map((d) => `<span>${DIAS_CORTOS[d]}</span>`).join('');
  tira.innerHTML = `
    <div class="tira-titulo"><h3>Día a día</h3></div>
    <div class="semana-encabezado" aria-hidden="true"><span></span>${cabecera}</div>
    <div role="img" aria-label="Calendario del período con los días contados">${filas.join('')}</div>
    <div class="leyenda">
      <span><i></i>Cuenta</span><span><i class="l-inhabil"></i>No cuenta</span>
      <span><i class="l-feriado"></i>Feriado</span>${finEsVence ? '<span><i class="l-vence"></i>Vencimiento</span>' : ''}
    </div>`;
}

// ---------- Acciones ----------
$('#btn-calendario').addEventListener('click', () => {
  if (!ultimo || ultimo.tipo !== 'vence') return;
  const { r } = ultimo;
  const ics = crearICS({
    nombre: 'Plazo',
    eventos: [{
      uid: `plazo-${r.inicio}-${r.vencimiento}-${Date.now()}@diahabil`,
      desde: r.vencimiento,
      titulo: `Vence mi plazo (${textoModo(r.dias, r.modo)})`,
      descripcion: `Notificación: ${fechaLarga(r.inicio)}. Calculado en ${location.href}`,
      alarmaDiasAntes: 1,
    }],
  });
  descargarICS(`plazo-${r.vencimiento}.ics`, ics);
});
$('#btn-copiar').addEventListener('click', (e) => copiarTexto(location.href, e.currentTarget));

alIniciar(calcular);
