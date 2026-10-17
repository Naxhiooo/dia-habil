// Utilidades compartidas por las páginas.
import { hojaCalendario } from './formato.js';

export const $ = (selector, raiz = document) => raiz.querySelector(selector);
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

export const escaparHTML = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Esqueletos de carga ----------
// Cada zona que se dibuja con JavaScript parte con aria-busy="true" y esqueletos en el HTML,
// así la página tiene su forma final antes de que cargue el script (sin saltos de diseño).
// Los contenedores que se reutilizan llevan data-esq con las clases de esqueleto a quitar.
export function marcarListo(...zonas) {
  for (const zona of zonas) {
    if (!zona || zona.getAttribute('aria-busy') !== 'true') continue;
    for (const el of [zona, ...zona.querySelectorAll('[data-esq]')]) {
      if (!el.dataset.esq) continue;
      el.classList.remove(...el.dataset.esq.split(' '));
      delete el.dataset.esq;
    }
    zona.querySelectorAll('[data-carga]').forEach((el) => el.remove());
    zona.setAttribute('aria-busy', 'false');
    zona.classList.add('aparece');
  }
}

// Para revisar los esqueletos: ?demora=1500 retrasa el primer dibujo (máximo 5 segundos).
export function alIniciar(fn) {
  const ms = Math.min(5000, Number(new URLSearchParams(location.search).get('demora')) || 0);
  if (ms > 0) setTimeout(fn, ms);
  else fn();
}

// Pinta una hoja de calendario arrancable y la anima si cambió de fecha.
export function pintarHoja(contenedor, iso) {
  const h = hojaCalendario(iso);
  const anterior = contenedor.dataset.fecha;
  contenedor.dataset.fecha = iso;
  contenedor.innerHTML = `
    <div class="mes">${h.mes}</div>
    <div class="numero">${h.dia}</div>
    <div class="semana">${h.semana}</div>
    <div class="anio">${h.anio}</div>`;
  if (anterior && anterior !== iso) {
    contenedor.classList.remove('cambia');
    void contenedor.offsetWidth; // reinicia la animación
    contenedor.classList.add('cambia');
  }
}

// Parámetros de la URL, para que cada resultado se pueda compartir con un enlace.
export function leerParametros() {
  return Object.fromEntries(new URLSearchParams(location.search));
}
export function escribirParametros(valores) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(valores)) if (v !== undefined && v !== null && v !== '') params.set(k, v);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

export function enlaceWhatsApp(texto) {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

export async function copiarTexto(texto, boton) {
  try {
    await navigator.clipboard.writeText(texto);
    if (boton) {
      const original = boton.innerHTML;
      boton.textContent = '¡Copiado!';
      setTimeout(() => { boton.innerHTML = original; }, 1600);
    }
  } catch {
    window.prompt('Copia este texto:', texto);
  }
}

// Campo numérico con botones − y +.
export function conectarCantidad(contenedor, alCambiar) {
  const input = $('input', contenedor);
  const ajustar = (delta) => {
    const min = Number(input.min) || 1;
    const max = Number(input.max) || 999;
    const valor = Math.min(max, Math.max(min, (parseInt(input.value, 10) || 0) + delta));
    input.value = valor;
    alCambiar();
  };
  $('[data-menos]', contenedor).addEventListener('click', () => ajustar(-1));
  $('[data-mas]', contenedor).addEventListener('click', () => ajustar(1));
}

// Pestañas accesibles (role=tablist).
export function conectarPestanas(lista, alCambiar) {
  const botones = $$('[role="tab"]', lista);
  const activar = (boton) => {
    for (const b of botones) {
      const activo = b === boton;
      b.setAttribute('aria-selected', String(activo));
      b.tabIndex = activo ? 0 : -1;
    }
    // Varias pestañas pueden compartir un mismo panel (por ejemplo, un año por pestaña).
    const visible = boton.getAttribute('aria-controls');
    for (const id of new Set(botones.map((b) => b.getAttribute('aria-controls')))) {
      const panel = document.getElementById(id);
      if (panel) panel.hidden = id !== visible;
    }
    alCambiar?.(boton.dataset.valor);
  };
  botones.forEach((b, i) => {
    b.addEventListener('click', () => activar(b));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const siguiente = botones[(i + (e.key === 'ArrowRight' ? 1 : botones.length - 1)) % botones.length];
      siguiente.focus();
      activar(siguiente);
    });
  });
  return activar;
}
