import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FERIADOS } from '../publico/assets/js/feriados.js';
import {
  aNum, aISO, diaSemana, calcularPlazo, contarHabiles,
  construirDias, generarBloques, viajesMasLargos, planMaximo, mejoresPuentes, finesDeSemanaLargos, planificar,
  diasLibresAlrededor, proximosFinesLargos, mejorPuente,
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

test('cada feriado de la lista sale de la regla de su ley', () => {
  const dia = (anio, mes, numero) => `${anio}-${String(mes).padStart(2, '0')}-${String(numero).padStart(2, '0')}`;
  // Domingo de Pascua en el calendario gregoriano (algoritmo de Meeus, Jones y Butcher).
  const pascua = (anio) => {
    const a = anio % 19;
    const b = Math.floor(anio / 100);
    const c = anio % 100;
    const g = Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3);
    const h = (19 * a + b - Math.floor(b / 4) - g + 15) % 30;
    const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const n = h + l - 7 * m + 114;
    return aNum(dia(anio, Math.floor(n / 31), n % 31 + 1));
  };
  // Ley 21.357: solsticio de junio en hora de Chile, según el Observatorio Naval de Estados Unidos.
  const SOLSTICIO = { 2026: '2026-06-21', 2027: '2027-06-21', 2028: '2028-06-20' };
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
  const esperados = (anio) => {
    const lista = [
      [dia(anio, 1, 1), 'Año Nuevo'],
      [aISO(pascua(anio) - 2), 'Viernes Santo'],
      [aISO(pascua(anio) - 1), 'Sábado Santo'],
      [dia(anio, 5, 1), 'Día Nacional del Trabajo'],
      [dia(anio, 5, 21), 'Día de las Glorias Navales'],
      [dia(anio, 6, 7), 'Asalto y Toma del Morro de Arica'],
      [SOLSTICIO[anio], 'Día Nacional de los Pueblos Indígenas'],
      [traslado19668(dia(anio, 6, 29)), 'San Pedro y San Pablo'],
      [dia(anio, 7, 16), 'Día de la Virgen del Carmen'],
      [dia(anio, 8, 15), 'Asunción de la Virgen'],
      [dia(anio, 8, 20), 'Nacimiento del Prócer de la Independencia'],
      [dia(anio, 9, 18), 'Independencia Nacional'],
      [dia(anio, 9, 19), 'Día de las Glorias del Ejército'],
      [traslado19668(dia(anio, 10, 12)), 'Encuentro de Dos Mundos'],
      [traslado20299(dia(anio, 10, 31)), 'Día de las Iglesias Evangélicas y Protestantes'],
      [dia(anio, 11, 1), 'Día de Todos los Santos'],
      [dia(anio, 12, 8), 'Inmaculada Concepción'],
      [dia(anio, 12, 25), 'Navidad'],
    ];
    const dia18 = dow(dia(anio, 9, 18));
    // Ley 20.983: viernes 17 si el 18 y el 19 caen en fin de semana; lunes 2 si el 1 de enero cae domingo.
    if (dia18 === 6) lista.push([dia(anio, 9, 17), 'Feriado adicional de Fiestas Patrias']);
    if (dow(dia(anio, 1, 1)) === 0) lista.push([dia(anio, 1, 2), 'Feriado adicional de Año Nuevo']);
    // Código del Trabajo, art. 35 ter: lunes 17 si el 18 cae martes; viernes 20 si cae miércoles.
    if (dia18 === 2) lista.push([dia(anio, 9, 17), 'Feriado adicional de Fiestas Patrias']);
    if (dia18 === 3) lista.push([dia(anio, 9, 20), 'Feriado adicional de Fiestas Patrias']);
    // Ley 18.695, art. 106: elección el último domingo de octubre. Ley 20.640, art. 3: primarias el vigésimo domingo anterior.
    if (anio % 4 === 0) {
      const eleccion = aNum(dia(anio, 10, 31)) - dow(dia(anio, 10, 31));
      lista.push([aISO(eleccion), 'Elecciones de gobernadores, consejeros, alcaldes y concejales']);
      lista.push([aISO(eleccion - 20 * 7), 'Elecciones primarias (gobernadores y alcaldes)']);
    }
    return lista.sort();
  };
  for (const anio of new Set(FERIADOS.map((f) => +f.fecha.slice(0, 4)))) {
    const lista = FERIADOS.filter((f) => f.fecha.startsWith(String(anio))).map((f) => [f.fecha, f.nombre]);
    assert.deepEqual(lista.sort(), esperados(anio), `Feriados de ${anio}`);
  }
  // Ley 19.973, art. 2, y Ley 20.629.
  const IRRENUNCIABLES = ['Año Nuevo', 'Día Nacional del Trabajo', 'Independencia Nacional', 'Día de las Glorias del Ejército', 'Navidad'];
  // Ley 20.663 y Ley 20.768.
  const REGIONALES = { 'Asalto y Toma del Morro de Arica': 'arica', 'Nacimiento del Prócer de la Independencia': 'chillan' };
  for (const f of FERIADOS) {
    assert.equal(f.irrenunciable, IRRENUNCIABLES.includes(f.nombre), `Irrenunciable: ${f.nombre}`);
    assert.equal(f.alcance, REGIONALES[f.nombre] ?? 'nacional', `Alcance: ${f.nombre}`);
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

test('días libres alrededor de una fecha', () => {
  const fiestas = diasLibresAlrededor('2027-09-18');
  assert.deepEqual([fiestas.desde, fiestas.hasta, fiestas.largo], ['2027-09-17', '2027-09-19', 3]);
  assert.equal(diasLibresAlrededor('2026-10-21').largo, 0); // miércoles laboral
  assert.equal(diasLibresAlrededor('2027-06-06', 'arica').hasta, '2027-06-07'); // lunes 7 de junio solo en Arica
});

test('próximos fines de semana largos y su mejor puente', () => {
  const [primero, segundo] = proximosFinesLargos('2026-10-21');
  assert.deepEqual([primero.desde, primero.hasta], ['2026-12-25', '2026-12-27']); // 31 oct + 1 nov son solo sábado y domingo
  assert.equal(segundo.desde, '2027-01-01');
  assert.equal(proximosFinesLargos('2026-12-26')[0].desde, '2026-12-25'); // uno en curso sigue apareciendo
  const puente = mejorPuente('2026-12-25', '2026-12-27');
  assert.deepEqual([puente.pedir, puente.largo], [['2026-12-24'], 4]);
  assert.deepEqual(proximosFinesLargos('2030-01-01'), []);
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
