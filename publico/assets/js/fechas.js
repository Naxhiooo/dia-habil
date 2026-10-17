// Motor de fechas: plazos en días hábiles y optimizador de vacaciones.
// Las fechas se manejan como texto ISO (AAAA-MM-DD) y como número de día desde 1970-01-01 (UTC),
// así ningún cálculo depende de la zona horaria del navegador.

import { feriadosDe, RANGO } from './feriados.js';

const MS_DIA = 86400000;

export const aNum = (iso) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_DIA;
export const aISO = (n) => new Date(n * MS_DIA).toISOString().slice(0, 10);
// 0 = domingo … 6 = sábado (el 1970-01-01 fue jueves)
export const diaSemana = (n) => (((n + 4) % 7) + 7) % 7;
export const sumarDias = (iso, dias) => aISO(aNum(iso) + dias);
export const esISO = (texto) => /^\d{4}-\d{2}-\d{2}$/.test(texto) && aISO(aNum(texto)) === texto;

const RANGO_NUM = { desde: aNum(RANGO.desde), hasta: aNum(RANGO.hasta) };
export const dentroDeRango = (n) => n >= RANGO_NUM.desde && n <= RANGO_NUM.hasta;

export const MODOS = {
  'lun-vie': {
    nombre: 'Hábiles de lunes a viernes',
    detalle: 'No cuentan sábados, domingos ni feriados. Es la regla de los trámites ante organismos públicos (Ley 19.880, art. 25).',
  },
  'lun-sab': {
    nombre: 'Hábiles de lunes a sábado',
    detalle: 'No cuentan domingos ni feriados; el sábado sí cuenta. Es la regla habitual de los plazos judiciales civiles.',
  },
  corridos: {
    nombre: 'Días corridos',
    detalle: 'Cuentan todos los días, incluidos fines de semana y feriados (Código Civil, art. 50).',
  },
};

// Devuelve por qué un día no es hábil ('feriado' | 'sabado' | 'domingo'), o null si es hábil.
export function motivoInhabil(n, modo, mapa) {
  if (modo === 'corridos') return null;
  if (mapa.has(aISO(n))) return 'feriado';
  const d = diaSemana(n);
  if (d === 0) return 'domingo';
  if (d === 6 && modo === 'lun-vie') return 'sabado';
  return null;
}

/**
 * Calcula el último día de un plazo.
 * inicio: fecha de la notificación o del hecho; desdeSiguiente: el conteo parte al día siguiente.
 * prorrogar: solo para días corridos; si el último día es sábado, domingo o feriado, pasa al siguiente hábil.
 */
export function calcularPlazo({ inicio, dias, modo = 'lun-vie', region = 'nacional', desdeSiguiente = true, prorrogar = false }) {
  if (!esISO(inicio)) throw new Error('Fecha de inicio no válida');
  if (!Number.isInteger(dias) || dias < 1 || dias > 730) throw new Error('La cantidad de días debe estar entre 1 y 730');

  const mapa = feriadosDe(region);
  const recorrido = [];
  let n = aNum(inicio) - (desdeSiguiente ? 0 : 1);
  let cuenta = 0;

  while (cuenta < dias) {
    n += 1;
    const iso = aISO(n);
    const motivo = motivoInhabil(n, modo, mapa);
    if (!motivo) cuenta += 1;
    recorrido.push({ iso, cuenta: motivo ? null : cuenta, motivo, feriado: mapa.get(iso) || null });
  }

  let vencimiento = n;
  let prorrogadoDesde = null;
  if (modo === 'corridos' && prorrogar && motivoInhabil(n, 'lun-vie', mapa)) {
    prorrogadoDesde = aISO(n);
    while (motivoInhabil(vencimiento, 'lun-vie', mapa)) {
      vencimiento += 1;
      const iso = aISO(vencimiento);
      recorrido.push({ iso, cuenta: null, motivo: motivoInhabil(vencimiento, 'lun-vie', mapa) || 'prorroga', feriado: mapa.get(iso) || null });
    }
  }

  const primer = aNum(inicio);
  return {
    inicio,
    vencimiento: aISO(vencimiento),
    dias,
    modo,
    prorrogadoDesde,
    corridos: vencimiento - primer,
    recorrido,
    feriados: recorrido.filter((d) => d.feriado).map((d) => d.feriado),
    fueraDeRango: !dentroDeRango(primer) || !dentroDeRango(vencimiento),
  };
}

// Cuenta los días hábiles entre dos fechas. Por defecto no cuenta el día de inicio y sí el de término.
export function contarHabiles({ desde, hasta, modo = 'lun-vie', region = 'nacional', incluirDesde = false }) {
  if (!esISO(desde) || !esISO(hasta)) throw new Error('Fechas no válidas');
  let a = aNum(desde);
  const b = aNum(hasta);
  if (b < a) throw new Error('La fecha final debe ser posterior a la inicial');
  const mapa = feriadosDe(region);
  if (!incluirDesde) a += 1;

  let habiles = 0;
  let sabados = 0;
  let domingos = 0;
  const feriados = [];
  for (let n = a; n <= b; n += 1) {
    const motivo = motivoInhabil(n, modo, mapa);
    if (!motivo) habiles += 1;
    else if (motivo === 'sabado') sabados += 1;
    else if (motivo === 'domingo') domingos += 1;
    const fer = mapa.get(aISO(n));
    if (fer) feriados.push(fer);
  }
  return {
    habiles,
    corridos: Math.max(0, b - a + 1),
    sabados,
    domingos,
    feriados,
    fueraDeRango: !dentroDeRango(aNum(desde)) || !dentroDeRango(b),
  };
}

// ---------- Optimizador de vacaciones ----------
// Para el feriado legal, el sábado siempre es inhábil (Código del Trabajo, art. 69):
// un día "libre" es sábado, domingo o feriado; los demás cuestan un día de vacaciones.

export function construirDias(desde, hasta, region = 'nacional') {
  const mapa = feriadosDe(region);
  const dias = [];
  for (let n = aNum(desde); n <= aNum(hasta); n += 1) {
    const iso = aISO(n);
    const feriado = mapa.get(iso) || null;
    const d = diaSemana(n);
    dias.push({ iso, feriado, libre: Boolean(feriado) || d === 0 || d === 6 });
  }
  return dias;
}

const primeroNoMenor = (lista, valor) => {
  let lo = 0;
  let hi = lista.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lista[mid] < valor) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

// Bloques maximales: cada uno empieza justo después de un día laboral y termina justo antes de otro,
// así incluye todos los días libres pegados a sus extremos. costo = días de vacaciones que hay que pedir.
export function generarBloques(dias, maxCosto) {
  const laborales = [];
  dias.forEach((d, i) => { if (!d.libre) laborales.push(i); });
  const inicios = [0, ...laborales.map((w) => w + 1).filter((i) => i < dias.length)];
  const bloques = [];

  for (const ini of inicios) {
    const k = primeroNoMenor(laborales, ini);
    for (let costo = 0; costo <= maxCosto; costo += 1) {
      if (costo > 0 && k + costo - 1 >= laborales.length) break;
      const fin = k + costo < laborales.length ? laborales[k + costo] - 1 : dias.length - 1;
      if (fin < ini) continue; // sin días libres al inicio y costo 0
      const tramo = dias.slice(ini, fin + 1);
      bloques.push({
        ini,
        fin,
        costo,
        largo: fin - ini + 1,
        conFeriado: tramo.some((d) => d.feriado),
      });
    }
  }
  return bloques;
}

export function describirBloque(b, dias) {
  const tramo = dias.slice(b.ini, b.fin + 1);
  return {
    desde: dias[b.ini].iso,
    hasta: dias[b.fin].iso,
    costo: b.costo,
    largo: b.largo,
    pedir: tramo.filter((d) => !d.libre).map((d) => d.iso),
    feriados: tramo.filter((d) => d.feriado).map((d) => d.feriado),
  };
}

const seTraslapan = (a, b) => a.ini <= b.fin && b.ini <= a.fin;

// Fines de semana largos que no requieren pedir días (3 o más días libres seguidos).
export function finesDeSemanaLargos(bloques) {
  return bloques
    .filter((b) => b.costo === 0 && b.largo >= 3)
    .sort((a, b) => a.ini - b.ini);
}

// Puentes con mejor rendimiento: pocos días pedidos, muchos días libres, siempre con un feriado de por medio.
export function mejoresPuentes(bloques, { maxCosto = 4, limite = 8 } = {}) {
  const candidatos = bloques
    .filter((b) => b.costo >= 1 && b.costo <= maxCosto && b.conFeriado && b.largo >= b.costo + 3)
    .sort((a, b) => b.largo / b.costo - a.largo / a.costo || b.largo - a.largo || a.ini - b.ini);
  const elegidos = [];
  for (const b of candidatos) {
    if (elegidos.length >= limite) break;
    if (!elegidos.some((e) => seTraslapan(e, b))) elegidos.push(b);
  }
  return elegidos.sort((a, b) => a.ini - b.ini);
}

// El viaje más largo posible con el presupuesto, y alternativas que no se traslapan.
export function viajesMasLargos(bloques, presupuesto, limite = 3) {
  const candidatos = bloques
    .filter((b) => b.costo >= 1 && b.costo <= presupuesto)
    .sort((a, b) => b.largo - a.largo || a.costo - b.costo || a.ini - b.ini);
  const elegidos = [];
  for (const b of candidatos) {
    if (elegidos.length >= limite) break;
    if (!elegidos.some((e) => seTraslapan(e, b))) elegidos.push(b);
  }
  return elegidos;
}

// Elige bloques que no se traslapan y que, en total, no superan el presupuesto,
// maximizando los días seguidos de descanso (programación dinámica sobre intervalos).
export function planMaximo(bloques, presupuesto, { excluir = [], maxCosto = presupuesto } = {}) {
  const usables = bloques
    .filter((b) => b.costo >= 1 && b.costo <= Math.min(presupuesto, maxCosto) && b.largo >= 3)
    .filter((b) => !excluir.some((e) => seTraslapan(e, b) || b.fin + 1 === e.ini || e.fin + 1 === b.ini))
    .sort((a, b) => a.fin - b.fin || a.ini - b.ini);
  const m = usables.length;
  const fines = usables.map((b) => b.fin);
  const previo = usables.map((b) => primeroNoMenor(fines, b.ini) - 1); // último bloque que termina antes
  const valor = (b) => b.largo * 100 + (b.conFeriado ? 10 : 0) - b.costo;

  const B = presupuesto;
  const dp = Array.from({ length: m + 1 }, () => new Float64Array(B + 1));
  for (let j = 1; j <= m; j += 1) {
    const b = usables[j - 1];
    const p = previo[j - 1] + 1;
    for (let k = 0; k <= B; k += 1) {
      let mejor = dp[j - 1][k];
      if (b.costo <= k) mejor = Math.max(mejor, dp[p][k - b.costo] + valor(b));
      dp[j][k] = mejor;
    }
  }

  const elegidos = [];
  let j = m;
  let k = B;
  while (j > 0) {
    const b = usables[j - 1];
    const p = previo[j - 1] + 1;
    if (b.costo <= k && dp[j][k] === dp[p][k - b.costo] + valor(b) && dp[j][k] !== dp[j - 1][k]) {
      elegidos.push(b);
      k -= b.costo;
      j = p;
    } else {
      j -= 1;
    }
  }
  return elegidos.reverse();
}

// Mínimo de días hábiles seguidos del feriado legal: solo el exceso sobre 10 se puede fraccionar
// (Código del Trabajo, art. 70; la DT, ORD. N° 54 de 2026, no permite fraccionar bajo ese límite).
export const MINIMO_CONTINUO = 10;

// Tres estilos de plan para el optimizador:
// 'ley'     → un bloque de al menos 10 días hábiles seguidos y el resto en puentes (feriado legal)
// 'largo'   → todos los días en un solo viaje
// 'sueltos' → todo en puentes (días administrativos o permisos acordados, no el feriado legal)
// mes: 0 = donde rinda más; 1–12 = el viaje largo debe tocar ese mes.
export function planificar({ desde, hasta, presupuesto, region = 'nacional', estilo = 'ley', mes = 0 }) {
  const dias = construirDias(desde, hasta, region);
  const bloques = generarBloques(dias, Math.min(presupuesto, 30));
  const tocaMes = (b) => {
    if (!mes) return true;
    const mi = +dias[b.ini].iso.slice(5, 7);
    const mf = +dias[b.fin].iso.slice(5, 7);
    return mi <= mf ? mi <= mes && mes <= mf : mes >= mi || mes <= mf;
  };
  const costoDe = (lista) => lista.reduce((s, b) => s + b.costo, 0);
  // Primero los bloques que suman al menos 3 días libres (un viernes cualquiera solo suma el fin de semana);
  // si sobran días, se completan con el resto.
  const fuertes = bloques.filter((b) => b.largo - b.costo >= 3);
  const rellenar = (base, presupuestoLibre) => {
    let lista = [...base, ...planMaximo(fuertes, presupuestoLibre, { excluir: base, maxCosto: 5 })];
    const resto = presupuestoLibre - costoDe(lista) + costoDe(base);
    if (resto > 0) lista = [...lista, ...planMaximo(bloques, resto, { excluir: lista, maxCosto: 5 })];
    return lista;
  };
  const largoDe = (lista) => lista.reduce((s, b) => s + b.largo, 0);
  let elegidos = [];
  let principal = null;

  if (estilo === 'sueltos') {
    elegidos = rellenar([], presupuesto);
  } else if (estilo === 'largo') {
    elegidos = viajesMasLargos(bloques.filter(tocaMes), presupuesto, 1);
    principal = elegidos[0] || null;
  } else {
    // Prueba bloques continuos de 10 a N días hábiles en sus mejores ubicaciones y completa con puentes.
    const minimo = Math.min(MINIMO_CONTINUO, presupuesto);
    let mejor = { total: -1, lista: [] };
    for (let c = minimo; c <= presupuesto; c += 1) {
      const exactos = bloques.filter((b) => b.costo === c && tocaMes(b));
      for (const candidato of viajesMasLargos(exactos, c, 3)) {
        const lista = c < presupuesto ? rellenar([candidato], presupuesto - c) : [candidato];
        const total = largoDe(lista) * 100 - costoDe(lista);
        if (total > mejor.total) mejor = { total, lista, candidato };
      }
    }
    elegidos = mejor.lista;
    principal = mejor.candidato || null;
  }
  elegidos.sort((a, b) => a.ini - b.ini);

  return {
    dias,
    viajes: elegidos.map((b) => ({ ...describirBloque(b, dias), principal: b === principal })),
    alternativas: viajesMasLargos(bloques.filter(tocaMes), presupuesto, 4).map((b) => describirBloque(b, dias)),
    usados: costoDe(elegidos),
    descanso: elegidos.reduce((s, b) => s + b.largo, 0),
    puentes: mejoresPuentes(bloques).map((b) => describirBloque(b, dias)),
    largos: finesDeSemanaLargos(bloques).map((b) => describirBloque(b, dias)),
  };
}
