import { FERIADOS, RANGO } from './feriados.js';
import { aNum, calcularPlazo, diasLibresAlrededor, planificar } from './fechas.js';
import { fechaLarga, fechaCorta, rango, plural, hoyEnChile } from './formato.js';
import { $, $$, pintarHoja, escaparHTML, marcarListo, alIniciar } from './ui-comun.js';

const hoy = hoyEnChile();
const nacionales = FERIADOS.filter((f) => f.alcance === 'nacional');
const proximos = nacionales.filter((f) => f.fecha >= hoy);

function dibujar() {
  const siguiente = proximos[0];
  if (siguiente) {
    marcarListo($('#proximo'));
    pintarHoja($('#hoja'), siguiente.fecha);
    const faltan = aNum(siguiente.fecha) - aNum(hoy);
    if (faltan === 0) $('#proximo-etiqueta').textContent = 'Hoy es feriado';
    $('#faltan').textContent = faltan === 0 ? siguiente.nombre : faltan === 1 ? 'Es mañana' : `Faltan ${faltan} días`;
    const largo = diasLibresAlrededor(siguiente.fecha);
    const extra = largo.largo >= 3 ? ` Fin de semana largo de ${largo.largo} días: ${rango(largo.desde, largo.hasta)}.` : '';
    $('#proximo-detalle').textContent = `${faltan === 0 ? '' : `${siguiente.nombre}.`}${extra}`.trim();

    $('#proximos').innerHTML = proximos.slice(0, 5).map((f) => {
      const n = aNum(f.fecha) - aNum(hoy);
      return `<li><span><strong>${fechaCorta(f.fecha)}</strong> · ${escaparHTML(f.nombre)}</span><span class="etq">${n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`}</span></li>`;
    }).join('');
  } else {
    marcarListo($('#proximo'));
    $('#hoja').classList.add('oculto');
    $('#faltan').textContent = 'Sin datos para estas fechas';
    $('#proximo-detalle').textContent = '';
    $('#proximos').innerHTML = '<li>No hay feriados cargados para estas fechas.</li>';
  }

  // Ejemplos vivos en las tarjetas.
  if (hoy >= RANGO.desde && hoy <= RANGO.hasta) {
    const plazo = calcularPlazo({ inicio: hoy, dias: 10 });
    $('#ejemplo-plazo').textContent = `10 días hábiles desde hoy vencen el ${fechaLarga(plazo.vencimiento, { conAnio: false })}.`;
  } else {
    $('#ejemplo-plazo').textContent = 'Calcula el último día de tu plazo.';
  }
  const anio = Math.min(+RANGO.hasta.slice(0, 4), +hoy.slice(0, 4) + 1);
  const plan = planificar({ desde: `${anio}-01-01`, hasta: `${anio}-12-31`, presupuesto: 15 });
  $('#ejemplo-vacaciones').textContent = `Con 15 días de vacaciones en ${anio} puedes tener ${plan.descanso} días libres.`;
  const quedanAnio = proximos.filter((f) => f.fecha.startsWith(hoy.slice(0, 4))).length;
  $('#ejemplo-feriados').textContent = quedanAnio
    ? `Quedan ${plural(quedanAnio, 'feriado', 'feriados')} en ${hoy.slice(0, 4)}.`
    : `Revisa los feriados de ${anio}.`;

  marcarListo(...$$('.ejemplo[aria-busy="true"]'), $('#tarjeta-proximos'));
}

alIniciar(dibujar);
