// Textos de fechas en español de Chile, sin depender de la zona horaria del navegador.
import { aNum, diaSemana } from './fechas.js';

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const partes = (iso) => ({
  anio: +iso.slice(0, 4),
  mes: +iso.slice(5, 7) - 1,
  dia: +iso.slice(8, 10),
  semana: diaSemana(aNum(iso)),
});

export const nombreDia = (iso) => DIAS[partes(iso).semana];

// "viernes 30 de octubre de 2026"
export function fechaLarga(iso, { conAnio = true } = {}) {
  const p = partes(iso);
  return `${DIAS[p.semana]} ${p.dia} de ${MESES[p.mes]}${conAnio ? ` de ${p.anio}` : ''}`;
}

// "vie 30 oct"
export function fechaCorta(iso) {
  const p = partes(iso);
  return `${DIAS_CORTOS[p.semana]} ${p.dia} ${MESES_CORTOS[p.mes]}`;
}

// "30 oct – 2 nov" (rango compacto)
export function rango(desde, hasta) {
  const a = partes(desde);
  const b = partes(hasta);
  if (desde === hasta) return `${a.dia} ${MESES_CORTOS[a.mes]}`;
  if (a.mes === b.mes && a.anio === b.anio) return `${a.dia}–${b.dia} ${MESES_CORTOS[a.mes]}`;
  return `${a.dia} ${MESES_CORTOS[a.mes]} – ${b.dia} ${MESES_CORTOS[b.mes]}`;
}

export const hojaCalendario = (iso) => {
  const p = partes(iso);
  return { dia: p.dia, mes: MESES[p.mes], anio: p.anio, semana: DIAS[p.semana] };
};

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Fecha de hoy en Chile continental, como AAAA-MM-DD.
export function hoyEnChile() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
