import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FERIADOS } from '../publico/assets/js/feriados.js';
import {
  aNum, aISO, diaSemana, calcularPlazo, contarHabiles,
  construirDias, generarBloques, viajesMasLargos, planMaximo, mejoresPuentes, finesDeSemanaLargos, planificar,
} from '../publico/assets/js/fechas.js';
import { fechaLarga, rango } from '../publico/assets/js/formato.js';
import { crearICS } from '../publico/assets/js/ics.js';

const dow = (iso) => diaSemana(aNum(iso));

test('conversión de fechas y día de la semana', () => {
  assert.equal(aISO(aNum('2026-10-17')), '2026-10-17');
  assert.equal(dow('2026-10-17'), 6); // sábado
  assert.equal(dow('2026-01-01'), 4); // jueves
  assert.equal(dow('2028-02-29'), 2); // martes, año bisiesto
});

test('los feriados trasladables cumplen la Ley 19.668 y la Ley 20.299', () => {
  // Ley 19.668: martes, miércoles o jueves → lunes de esa semana; viernes → lunes siguiente.
  const traslado19668 = (base) => {
    const n = aNum(base);
    const d = diaSemana(n);
    if (d >= 2 && d <= 4) return aISO(n - (d - 1));
    if (d === 5) return aISO(n + 3);
    return base;
  };
  // Ley 20.299: martes → viernes anterior; miércoles → viernes siguiente.
  const traslado20299 = (base) => {
    const n = aNum(base);
    const d = diaSemana(n);
    if (d === 2) return aISO(n - 4);
    if (d === 3) return aISO(n + 2);
    return base;
  };
  for (const anio of [2026, 2027, 2028]) {
    const fechas = FERIADOS.filter((f) => f.fecha.startsWith(String(anio)));
    const buscar = (nombre) => fechas.find((f) => f.nombre === nombre).fecha;
    assert.equal(buscar('San Pedro y San Pablo'), traslado19668(`${anio}-06-29`), `San Pedro ${anio}`);
    assert.equal(buscar('Encuentro de Dos Mundos'), traslado19668(`${anio}-10-12`), `Encuentro ${anio}`);
    assert.equal(buscar('Día de las Iglesias Evangélicas y Protestantes'), traslado20299(`${anio}-10-31`), `Iglesias ${anio}`);
  }
});

test('no hay feriados duplicados y todos son fechas válidas', () => {
  const claves = FERIADOS.map((f) => `${f.fecha}|${f.alcance}`);
  assert.equal(new Set(claves).size, claves.length);
  for (const f of FERIADOS) assert.equal(aISO(aNum(f.fecha)), f.fecha);
});

test('plazo administrativo de 10 días hábiles', () => {
  // Notificado el viernes 16-10-2026: cuenta del lunes 19 al viernes 30 (el sábado 31 es feriado, no influye).
  const r = calcularPlazo({ inicio: '2026-10-16', dias: 10 });
  assert.equal(r.vencimiento, '2026-10-30');
});

test('un feriado en lunes corre el plazo', () => {
  // Viernes 09-10-2026 + 5 hábiles; el lunes 12 es feriado.
  assert.equal(calcularPlazo({ inicio: '2026-10-09', dias: 5 }).vencimiento, '2026-10-19');
  // De lunes a sábado: el sábado 10 cuenta, el domingo 11 y el lunes 12 no.
  assert.equal(calcularPlazo({ inicio: '2026-10-09', dias: 5, modo: 'lun-sab' }).vencimiento, '2026-10-16');
});

test('días corridos con y sin prórroga', () => {
  const sin = calcularPlazo({ inicio: '2026-10-01', dias: 30, modo: 'corridos' });
  assert.equal(sin.vencimiento, '2026-10-31');
  const con = calcularPlazo({ inicio: '2026-10-01', dias: 30, modo: 'corridos', prorrogar: true });
  assert.equal(con.vencimiento, '2026-11-02');
  assert.equal(con.prorrogadoDesde, '2026-10-31');
});

test('contar desde el mismo día', () => {
  assert.equal(calcularPlazo({ inicio: '2026-10-19', dias: 1, desdeSiguiente: false }).vencimiento, '2026-10-19');
});

test('feriado regional de Arica', () => {
  assert.equal(calcularPlazo({ inicio: '2027-06-04', dias: 1 }).vencimiento, '2027-06-07');
  assert.equal(calcularPlazo({ inicio: '2027-06-04', dias: 1, region: 'arica' }).vencimiento, '2027-06-08');
});

test('aviso fuera del rango de datos', () => {
  assert.equal(calcularPlazo({ inicio: '2026-03-02', dias: 5 }).fueraDeRango, false);
  assert.equal(calcularPlazo({ inicio: '2028-12-20', dias: 20 }).fueraDeRango, true);
});

test('contar días hábiles entre dos fechas', () => {
  const r = contarHabiles({ desde: '2026-12-01', hasta: '2026-12-31' });
  assert.equal(r.habiles, 20); // 22 días de semana menos el 8 y el 25 de diciembre
  assert.equal(r.feriados.length, 2);
});

test('bloques de vacaciones alrededor de Fiestas Patrias 2027', () => {
  const dias = construirDias('2027-09-01', '2027-09-30');
  const bloques = generarBloques(dias, 5);
  const largos = finesDeSemanaLargos(bloques);
  assert.ok(largos.some((b) => dias[b.ini].iso === '2027-09-17' && b.largo === 3));
  const [mejor] = viajesMasLargos(bloques, 1, 1);
  assert.equal(mejor.largo, 4);
});

test('plan máximo con 2 días a fines de 2026', () => {
  const dias = construirDias('2026-10-19', '2026-12-31');
  const bloques = generarBloques(dias, 2);
  const plan = planMaximo(bloques, 2);
  assert.equal(plan.reduce((s, b) => s + b.costo, 0), 2);
  assert.equal(plan.reduce((s, b) => s + b.largo, 0), 8); // dos puentes de 4 días
  const puentes = mejoresPuentes(bloques);
  assert.ok(puentes.every((b) => b.conFeriado));
});

test('el plan legal incluye al menos 10 días hábiles seguidos', () => {
  const r = planificar({ desde: '2027-01-01', hasta: '2027-12-31', presupuesto: 15, estilo: 'ley' });
  const principal = r.viajes.find((v) => v.principal);
  assert.ok(principal && principal.costo >= 10);
  assert.equal(r.usados, 15);
  const corto = planificar({ desde: '2027-01-01', hasta: '2027-12-31', presupuesto: 6, estilo: 'ley' });
  assert.equal(corto.viajes.length, 1);
  assert.equal(corto.viajes[0].costo, 6);
});

test('planificar respeta el presupuesto en los tres estilos', () => {
  for (const estilo of ['sueltos', 'ley', 'largo']) {
    const r = planificar({ desde: '2027-01-01', hasta: '2027-12-31', presupuesto: 15, estilo });
    assert.ok(r.usados <= 15, estilo);
    assert.ok(r.viajes.length >= 1, estilo);
    const rangos = r.viajes.map((v) => [aNum(v.desde), aNum(v.hasta)]);
    for (let i = 1; i < rangos.length; i += 1) assert.ok(rangos[i][0] > rangos[i - 1][1], `${estilo} sin traslapes`);
  }
});

test('textos en español', () => {
  assert.equal(fechaLarga('2026-10-30'), 'viernes 30 de octubre de 2026');
  assert.equal(rango('2026-10-30', '2026-11-02'), '30 oct – 2 nov');
});

test('archivo .ics válido', () => {
  const ics = crearICS({ nombre: 'Prueba', sello: '2026-10-17T00:00:00.000Z', eventos: [{ uid: 'a@b', desde: '2026-10-30', titulo: 'Vence plazo; reclamo', alarmaDiasAntes: 1 }] });
  assert.match(ics, /DTSTART;VALUE=DATE:20261030\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261031\r\n/);
  assert.match(ics, /SUMMARY:Vence plazo\\; reclamo/);
  assert.match(ics, /TRIGGER:-PT15H/);
});
