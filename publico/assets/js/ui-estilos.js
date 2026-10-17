// Dibuja las muestras de la guía de estilos leyendo los tokens directamente del CSS.
import { $ } from './ui-comun.js';

const SEMANTICOS = {
  'Superficies (de abajo hacia arriba)': ['fondo', 'superficie-1', 'superficie-2', 'superficie-3', 'superficie-invertida'],
  'Texto (de más a menos importante)': ['texto-1', 'texto-2', 'texto-3', 'texto-deshabilitado', 'texto-invertido'],
  Bordes: ['borde-sutil', 'borde', 'borde-fuerte', 'foco'],
  'Significado del sitio': ['marca', 'marca-fondo', 'marca-sobre', 'feriado', 'feriado-fondo', 'feriado-sobre', 'vacaciones', 'vacaciones-fondo', 'vacaciones-tinte', 'vacaciones-sobre'],
  Retroalimentación: ['info', 'info-fondo', 'aviso', 'aviso-fondo', 'exito', 'exito-fondo'],
  Carga: ['esqueleto', 'esqueleto-brillo'],
};
const COMPONENTES = [
  'boton-primario-fondo', 'boton-primario-texto', 'campo-fondo', 'campo-borde', 'tarjeta-fondo', 'tarjeta-borde',
  'hoja-cabecera', 'dia-cuenta-fondo', 'dia-vence-fondo', 'dia-pedir-fondo', 'dia-libre-fondo', 'anuncio-fondo',
];
const PRIMITIVOS = {
  'Arena (tema claro)': ['0', '50', '100', '150', '200', '300', '400', '500', '600', '700', '800', '900'].map((n) => `arena-${n}`),
  'Noche (tema oscuro)': ['50', '100', '200', '600', '700', '750', '800', '850', '900'].map((n) => `noche-${n}`),
  'Copihue (feriados)': ['50', '100', '300', '500', '600', '700', '800'].map((n) => `copihue-${n}`),
  'Lapislázuli (vacaciones)': ['50', '100', '300', '500', '600', '700', '800', '900'].map((n) => `lapislazuli-${n}`),
  'Cobre (marca)': ['50', '100', '300', '600', '700', '800'].map((n) => `cobre-${n}`),
  'Araucaria y Atacama': ['araucaria-100', 'araucaria-300', 'araucaria-600', 'araucaria-800', 'atacama-100', 'atacama-300', 'atacama-600', 'atacama-700', 'atacama-800'],
};

const temaOscuro = () => {
  const tema = document.documentElement.dataset.tema;
  return tema === 'oscuro' || (tema !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
};

// El texto de un token semántico es "var(--neutro-950)": de ahí sale a qué primitivo apunta en el tema activo.
const fuente = (nombre) => {
  const selectores = temaOscuro() ? [':root[data-tema="oscuro"]', ':root'] : [':root'];
  for (const selector of selectores) {
    for (const hoja of document.styleSheets) {
      try {
        for (const regla of hoja.cssRules) {
          const valor = regla.selectorText === selector && regla.style.getPropertyValue(nombre);
          if (valor) return valor.trim();
        }
      } catch { /* hoja de otro origen (fuentes) */ }
    }
  }
  return '';
};

const muestra = (variable) => `
  <div class="muestra">
    <div class="color" style="background:var(${variable})"></div>
    <div class="info"><code>${variable}</code><span class="valor" data-var="${variable}"></span></div>
  </div>`;

function pintar() {
  $('#semanticos').innerHTML = Object.entries(SEMANTICOS).map(([grupo, lista]) =>
    `<h3>${grupo}</h3><div class="muestras">${lista.map((n) => muestra(`--color-${n}`)).join('')}</div>`).join('');
  $('#componentes').innerHTML = COMPONENTES.map((n) => muestra(`--${n}`)).join('');
  $('#primitivos').innerHTML = Object.entries(PRIMITIVOS).map(([grupo, lista]) =>
    `<h3>${grupo}</h3><div class="muestras">${lista.map((n) => muestra(`--${n}`)).join('')}</div>`).join('');
  actualizarValores();
}

function actualizarValores() {
  const actual = getComputedStyle(document.documentElement);
  document.querySelectorAll('[data-var]').forEach((el) => {
    const v = el.dataset.var;
    const alias = fuente(v).match(/^var\((--[\w-]+)\)$/);
    el.textContent = `${actual.getPropertyValue(v).trim()}${alias ? ` · ${alias[1]}` : ''}`;
  });
}

pintar();
// Al cambiar de tema, los valores de los semánticos cambian; los primitivos no.
new MutationObserver(actualizarValores).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', actualizarValores);
