# Día Hábil: cómo publicar y mantener diahabil.cl

## Estructura

| Carpeta | Qué contiene |
| --- | --- |
| `publico/` | Páginas escritas a mano, CSS, JavaScript, fuentes e imágenes. Aquí se edita. |
| `plantillas/` | Cabecera, pie y bloque común del `<head>`. Las páginas llevan marcas `<!-- @head -->`, `<!-- @cabecera -->` y `<!-- @pie -->` que se completan al construir. |
| `scripts/construir.mjs` | Construye el sitio en `dist/`: aplica las plantillas y genera las páginas de feriados, fines de semana largos y días hábiles, los calendarios `.ics`, el `sitemap.xml` y el `robots.txt`. |
| `scripts/imagenes.mjs` | Genera las imágenes de vista previa (`assets/img/og/`) y los íconos PNG. Se corre a mano. |
| `recursos/` | Archivos de trabajo que no se publican (fuentes TTF para las imágenes). |
| `.github/workflows/` | Publicación diaria automática (ver paso 12). |
| `dist/` | Sitio listo para publicar. Se genera; no se edita ni se sube a Git. |

## Comandos

```bash
npm install          # solo la primera vez
npm run dev          # construye, sirve en http://localhost:4173 y reconstruye al guardar
npm test             # pruebas del motor de fechas y de la construcción (enlaces, sitemap, cifras)
npm run construir    # construye dist/
npm run imagenes     # regenera imágenes de vista previa e íconos
```

## Fase 1: publicar

1. **Dominio.** Compra `diahabil.cl` en [nic.cl](https://www.nic.cl/).
2. **GitHub.** Crea un repositorio privado vacío (por ejemplo `diahabil`) y pásame su dirección para subir el código.
3. **Cloudflare.** Crea una cuenta gratuita y agrega el sitio `diahabil.cl` con el plan Free. Cloudflare te dará dos servidores de nombres (DNS).
4. **NIC Chile.** En la administración del dominio, reemplaza los servidores DNS por los dos que entregó Cloudflare. El cambio puede tardar algunas horas.
5. **Cloudflare Pages.** Workers y Pages → Crear → Pages → Conectar con Git → elige el repositorio. Configuración de compilación:
   - Framework: ninguno
   - Comando de compilación: `npm run construir`
   - Directorio de salida: `dist`
   - Variable de entorno: `NODE_VERSION` = `22`
6. **Dominio propio.** En el proyecto de Pages → Dominios personalizados → agrega `diahabil.cl` y `www.diahabil.cl`.
7. **www → diahabil.cl.** Reglas → Reglas de redirección → plantilla "Redirigir de WWW a la raíz" (301).
8. **HTTPS.** SSL/TLS en modo "Completo" y "Usar siempre HTTPS" activado.
9. **Correo.** Correo electrónico → Enrutamiento: crea `contacto@diahabil.cl` y reenvíalo a tu correo personal.
10. **Estadísticas.** En el proyecto de Pages → Métricas → activa Web Analytics (sin cookies, ya declarado en la política de privacidad).
11. **IndexNow.** Almacenamiento en caché → Configuración → activa "Crawler Hints", que avisa a Bing de cada cambio.
12. **Publicación diaria.** Las listas de próximos feriados y fines de semana largos se escriben en el HTML al construir, así que el sitio se reconstruye cada madrugada (01:17 en verano, 00:17 en invierno):
    - En el proyecto de Pages → Settings → Builds → Add deploy hook: nombre `publicacion-diaria`, rama `main`. Copia la URL que aparece; quien la tenga puede publicar el sitio, así que no la compartas.
    - En GitHub, en el repositorio → Settings → Secrets and variables → Actions → New repository secret, con nombre `CLOUDFLARE_DEPLOY_HOOK` y la URL como valor.
    - Para probarlo: Actions → Publicación diaria → Run workflow. En Pages debe aparecer un despliegue nuevo.

Cada `git push` a la rama principal publica el sitio solo, y además se publica una vez al día.

## Fase 2: buscadores

1. **Google Search Console** ([search.google.com/search-console](https://search.google.com/search-console)): agrega una propiedad de tipo **Dominio** con `diahabil.cl`. Google te dará un registro TXT; agrégalo en el DNS de Cloudflare y verifica.
2. **Sitemap:** en Search Console → Sitemaps, envía `https://diahabil.cl/sitemap.xml`.
3. **Indexación:** en Inspección de URL, pide indexar `/`, `/feriados/2027/`, `/plazos/`, `/vacaciones/` y `/dias-habiles/`.
4. **Bing Webmaster Tools** ([bing.com/webmasters](https://www.bing.com/webmasters)): importa el sitio desde Search Console.

## Mantención

- **Cambia un feriado o se agrega uno:** edita `publico/assets/js/feriados.js`, actualiza `REVISADO`, corre `npm test` y publica. Los calendarios, páginas y sitemap se regeneran solos.
- **Agregar 2029:** suma sus feriados en `feriados.js`, extiende `RANGO.hasta` y corre `npm run imagenes`.
- **Publicación diaria:** la hace sola el flujo de GitHub Actions del paso 12. Si GitHub avisa por correo que lo desactivó (pasa tras 60 días sin cambios en el repositorio), reactívalo en Actions → Publicación diaria → Enable workflow.
- **Caché de CSS y JS:** Cloudflare los guarda un día y publicar no renueva esa copia. Por eso el build les agrega `?v=` con una huella de su contenido: cada cambio llega de inmediato y no hay que purgar nada. Las imágenes no llevan versión; si cambias una, puede tardar hasta un día en verse.

## Antes de pedir AdSense

- Reemplazar en las páginas el comentario de AdSense por el código real con tu ID de editor.
- Crear `publico/ads.txt` con la línea que entrega AdSense.
- Activar en AdSense el mensaje de consentimiento para visitas desde Europa.
