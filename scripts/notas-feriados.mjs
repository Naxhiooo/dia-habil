// Lo que conviene saber de cada feriado: lo que dispone la ley y no cambia de un año a otro.
// Lo propio de cada año (qué día cae, si se traslada, qué descuenta) lo calcula construir.mjs.
const IRRENUNCIABLE = 'Es <a href="/guias/feriados-irrenunciables/">irrenunciable</a>: los trabajadores del comercio no pueden trabajar ese día, salvo en los rubros que exceptúa la Ley 19.973.';
const FECHA_FIJA = 'Tiene fecha fija y no se traslada aunque caiga en fin de semana.';
const ELECCION = 'El día de votación es feriado legal (Ley 18.700, art. 180) e<a href="/guias/feriados-irrenunciables/">irrenunciable</a> para quienes trabajan en malls y otros centros comerciales administrados por una misma empresa, en las comunas donde se vota.';

export const NOTAS_FERIADO = {
  'Año Nuevo': `${IRRENUNCIABLE} Si cae domingo, el lunes 2 de enero también es feriado (Ley 20.983).`,
  'Viernes Santo': 'Su fecha cambia cada año porque depende de la Semana Santa. Junto al Sábado Santo, siempre deja un fin de semana de tres días.',
  'Sábado Santo': 'Su fecha también depende de la Semana Santa.',
  'Día Nacional del Trabajo': IRRENUNCIABLE,
  'Día de las Glorias Navales': `Recuerda el Combate Naval de Iquique, de 1879. ${FECHA_FIJA}`,
  'Asalto y Toma del Morro de Arica': 'Es feriado solo en la Región de Arica y Parinacota (Ley 20.663).',
  'Día Nacional de los Pueblos Indígenas': 'Es feriado desde 2021 y se celebra el día del solsticio de invierno, que cae el 20 o el 21 de junio (Ley 21.357).',
  'San Pedro y San Pablo': 'La Ley 19.668 lo pasa a lunes: si el 29 de junio cae de martes a jueves, se celebra el lunes de esa semana, y si cae viernes, el lunes siguiente.',
  'Día de la Virgen del Carmen': `Celebra a la patrona de Chile y es feriado por la Ley 20.148. ${FECHA_FIJA}`,
  'Elecciones primarias (gobernadores y alcaldes)': `${ELECCION} Las primarias se hacen solo si los partidos las convocan, el vigésimo domingo antes de la elección (Ley 20.640, art. 3).`,
  'Asunción de la Virgen': FECHA_FIJA,
  'Nacimiento del Prócer de la Independencia': "Es feriado solo en Chillán y Chillán Viejo, por el nacimiento de Bernardo O'Higgins (Ley 20.768).",
  'Feriado adicional de Fiestas Patrias': 'Es feriado porque el 18 y el 19 de septiembre caen sábado y domingo (Ley 20.983). No es irrenunciable, así que el comercio puede abrir.',
  'Independencia Nacional': `Recuerda la Primera Junta Nacional de Gobierno, de 1810. ${IRRENUNCIABLE}`,
  'Día de las Glorias del Ejército': 'También es <a href="/guias/feriados-irrenunciables/">irrenunciable</a>, desde 2012 (Ley 20.629).',
  'Encuentro de Dos Mundos': 'La Ley 19.668 lo pasa a lunes: si el 12 de octubre cae de martes a jueves, se celebra el lunes de esa semana, y si cae viernes, el lunes siguiente.',
  'Día de las Iglesias Evangélicas y Protestantes': 'Es feriado desde 2008 (Ley 20.299). Si el 31 de octubre cae miércoles, se celebra el viernes de esa semana; si cae martes, el viernes de la semana anterior.',
  'Elecciones de gobernadores, consejeros, alcaldes y concejales': ELECCION,
  'Día de Todos los Santos': FECHA_FIJA,
  'Inmaculada Concepción': FECHA_FIJA,
  Navidad: IRRENUNCIABLE,
};

// Feriados que la ley traslada, con su fecha de origen (mes-día).
export const FECHA_ORIGINAL = {
  'San Pedro y San Pablo': '06-29',
  'Encuentro de Dos Mundos': '10-12',
  'Día de las Iglesias Evangélicas y Protestantes': '10-31',
};
