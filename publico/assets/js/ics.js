// Genera archivos de calendario (.ics) con eventos de día completo.
// Sirve en el navegador (descargar un plazo o un plan) y en Node (calendario de feriados suscribible).
import { sumarDias } from './fechas.js';

const escapar = (texto) =>
  String(texto).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Las líneas de un .ics no deben superar 75 octetos; se cortan con salto + espacio.
function plegar(linea) {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 75) return linea;
  const partes = [];
  let actual = '';
  let largo = 0;
  for (const caracter of linea) {
    const n = new TextEncoder().encode(caracter).length;
    if (largo + n > (partes.length ? 74 : 75)) {
      partes.push(actual);
      actual = '';
      largo = 0;
    }
    actual += caracter;
    largo += n;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

const compacta = (iso) => iso.replace(/-/g, '');

/**
 * eventos: [{ uid, desde: 'AAAA-MM-DD', hasta?: 'AAAA-MM-DD' (inclusive), titulo, descripcion?, alarmaDiasAntes? }]
 */
export function crearICS({ nombre, eventos, sello = new Date().toISOString() }) {
  const dtstamp = sello.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dia Habil//Calendario Chile//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(nombre)}`,
    'X-WR-TIMEZONE:America/Santiago',
    'REFRESH-INTERVAL;VALUE=DURATION:P7D',
    'X-PUBLISHED-TTL:P7D',
  ];
  for (const e of eventos) {
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compacta(e.desde)}`,
      `DTEND;VALUE=DATE:${compacta(sumarDias(e.hasta || e.desde, 1))}`,
      `SUMMARY:${escapar(e.titulo)}`,
      'TRANSP:TRANSPARENT',
    );
    if (e.descripcion) lineas.push(`DESCRIPTION:${escapar(e.descripcion)}`);
    if (e.alarmaDiasAntes) {
      // Aviso a las 9:00 del día indicado (el evento de día completo parte a las 0:00).
      const horas = e.alarmaDiasAntes * 24 - 9;
      lineas.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapar(e.titulo)}`, `TRIGGER:-PT${horas}H`, 'END:VALARM');
    }
    lineas.push('END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return lineas.map(plegar).join('\r\n') + '\r\n';
}

// Descarga un .ics desde el navegador.
export function descargarICS(nombreArchivo, contenido) {
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
