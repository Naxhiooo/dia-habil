// Feriados de Chile 2026–2028.
// Fuente: feriados.cl (que a su vez cita a la Biblioteca del Congreso Nacional), revisado el 17-10-2026.
// Los domingos no se listan: el motor de fechas los trata siempre como inhábiles.
// alcance: 'nacional' | 'arica' (Región de Arica y Parinacota) | 'chillan' (Chillán y Chillán Viejo)

export const REVISADO = '2026-10-17';
export const RANGO = { desde: '2026-01-01', hasta: '2028-12-31' };

export const REGIONES = {
  nacional: 'Todo Chile',
  arica: 'Región de Arica y Parinacota',
  chillan: 'Chillán y Chillán Viejo',
};

const f = (fecha, nombre, tipo, ley, extra = {}) => ({
  fecha, nombre, tipo, ley, irrenunciable: false, alcance: 'nacional', ...extra,
});
const irr = { irrenunciable: true };

export const FERIADOS = [
  // 2026
  f('2026-01-01', 'Año Nuevo', 'civil', 'Ley 2.977, Ley 19.973', irr),
  f('2026-04-03', 'Viernes Santo', 'religioso', 'Ley 2.977'),
  f('2026-04-04', 'Sábado Santo', 'religioso', 'Ley 2.977'),
  f('2026-05-01', 'Día Nacional del Trabajo', 'civil', 'Código del Trabajo, Ley 19.973', irr),
  f('2026-05-21', 'Día de las Glorias Navales', 'civil', 'Ley 2.977'),
  f('2026-06-07', 'Asalto y Toma del Morro de Arica', 'civil', 'Ley 20.663', { alcance: 'arica' }),
  f('2026-06-21', 'Día Nacional de los Pueblos Indígenas', 'civil', 'Ley 21.357'),
  f('2026-06-29', 'San Pedro y San Pablo', 'religioso', 'Ley 2.977, Ley 18.432, Ley 19.668'),
  f('2026-07-16', 'Día de la Virgen del Carmen', 'religioso', 'Ley 20.148'),
  f('2026-08-15', 'Asunción de la Virgen', 'religioso', 'Ley 2.977'),
  f('2026-08-20', 'Nacimiento del Prócer de la Independencia', 'civil', 'Ley 16.535, Ley 20.768', { alcance: 'chillan' }),
  f('2026-09-18', 'Independencia Nacional', 'civil', 'Ley 2.977, Ley 19.973', irr),
  f('2026-09-19', 'Día de las Glorias del Ejército', 'civil', 'Ley 2.977, Ley 20.629', irr),
  f('2026-10-12', 'Encuentro de Dos Mundos', 'civil', 'Ley 3.810, Ley 19.668'),
  f('2026-10-31', 'Día de las Iglesias Evangélicas y Protestantes', 'religioso', 'Ley 20.299'),
  f('2026-11-01', 'Día de Todos los Santos', 'religioso', 'Ley 2.977'),
  f('2026-12-08', 'Inmaculada Concepción', 'religioso', 'Ley 2.977'),
  f('2026-12-25', 'Navidad', 'religioso', 'Ley 2.977, Ley 19.973', irr),

  // 2027
  f('2027-01-01', 'Año Nuevo', 'civil', 'Ley 2.977, Ley 19.973', irr),
  f('2027-03-26', 'Viernes Santo', 'religioso', 'Ley 2.977'),
  f('2027-03-27', 'Sábado Santo', 'religioso', 'Ley 2.977'),
  f('2027-05-01', 'Día Nacional del Trabajo', 'civil', 'Código del Trabajo, Ley 19.973', irr),
  f('2027-05-21', 'Día de las Glorias Navales', 'civil', 'Ley 2.977'),
  f('2027-06-07', 'Asalto y Toma del Morro de Arica', 'civil', 'Ley 20.663', { alcance: 'arica' }),
  f('2027-06-21', 'Día Nacional de los Pueblos Indígenas', 'civil', 'Ley 21.357'),
  f('2027-06-28', 'San Pedro y San Pablo', 'religioso', 'Ley 2.977, Ley 18.432, Ley 19.668'),
  f('2027-07-16', 'Día de la Virgen del Carmen', 'religioso', 'Ley 20.148'),
  f('2027-08-15', 'Asunción de la Virgen', 'religioso', 'Ley 2.977'),
  f('2027-08-20', 'Nacimiento del Prócer de la Independencia', 'civil', 'Ley 16.535, Ley 20.768', { alcance: 'chillan' }),
  f('2027-09-17', 'Feriado adicional de Fiestas Patrias', 'civil', 'Ley 20.983'),
  f('2027-09-18', 'Independencia Nacional', 'civil', 'Ley 2.977, Ley 19.973', irr),
  f('2027-09-19', 'Día de las Glorias del Ejército', 'civil', 'Ley 2.977, Ley 20.629', irr),
  f('2027-10-11', 'Encuentro de Dos Mundos', 'civil', 'Ley 3.810, Ley 19.668'),
  f('2027-10-31', 'Día de las Iglesias Evangélicas y Protestantes', 'religioso', 'Ley 20.299'),
  f('2027-11-01', 'Día de Todos los Santos', 'religioso', 'Ley 2.977'),
  f('2027-12-08', 'Inmaculada Concepción', 'religioso', 'Ley 2.977'),
  f('2027-12-25', 'Navidad', 'religioso', 'Ley 2.977, Ley 19.973', irr),

  // 2028
  f('2028-01-01', 'Año Nuevo', 'civil', 'Ley 2.977, Ley 19.973', irr),
  f('2028-04-14', 'Viernes Santo', 'religioso', 'Ley 2.977'),
  f('2028-04-15', 'Sábado Santo', 'religioso', 'Ley 2.977'),
  f('2028-05-01', 'Día Nacional del Trabajo', 'civil', 'Código del Trabajo, Ley 19.973', irr),
  f('2028-05-21', 'Día de las Glorias Navales', 'civil', 'Ley 2.977'),
  f('2028-06-07', 'Asalto y Toma del Morro de Arica', 'civil', 'Ley 20.663', { alcance: 'arica' }),
  f('2028-06-20', 'Día Nacional de los Pueblos Indígenas', 'civil', 'Ley 21.357'),
  f('2028-06-26', 'San Pedro y San Pablo', 'religioso', 'Ley 2.977, Ley 18.432, Ley 19.668'),
  f('2028-07-09', 'Elecciones primarias (gobernadores, alcaldes y concejales)', 'civil', 'Ley 18.700, Ley 20.640'),
  f('2028-07-16', 'Día de la Virgen del Carmen', 'religioso', 'Ley 20.148'),
  f('2028-08-15', 'Asunción de la Virgen', 'religioso', 'Ley 2.977'),
  f('2028-08-20', 'Nacimiento del Prócer de la Independencia', 'civil', 'Ley 16.535, Ley 20.768', { alcance: 'chillan' }),
  f('2028-09-18', 'Independencia Nacional', 'civil', 'Ley 2.977, Ley 19.973', irr),
  f('2028-09-19', 'Día de las Glorias del Ejército', 'civil', 'Ley 2.977, Ley 20.629', irr),
  f('2028-10-09', 'Encuentro de Dos Mundos', 'civil', 'Ley 3.810, Ley 19.668'),
  f('2028-10-27', 'Día de las Iglesias Evangélicas y Protestantes', 'religioso', 'Ley 20.299'),
  f('2028-10-29', 'Elecciones de gobernadores, consejeros, alcaldes y concejales', 'civil', 'Ley 18.700'),
  f('2028-11-01', 'Día de Todos los Santos', 'religioso', 'Ley 2.977'),
  f('2028-12-08', 'Inmaculada Concepción', 'religioso', 'Ley 2.977'),
  f('2028-12-25', 'Navidad', 'religioso', 'Ley 2.977, Ley 19.973', irr),
];

// Mapa fecha → feriado para una región ('nacional' excluye los feriados regionales).
export function feriadosDe(region = 'nacional') {
  const mapa = new Map();
  for (const fer of FERIADOS) {
    if (fer.alcance === 'nacional' || fer.alcance === region) mapa.set(fer.fecha, fer);
  }
  return mapa;
}
