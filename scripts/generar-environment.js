'use strict';

/**
 * Genera `src/environments/*.ts` a partir de variables de entorno.
 *
 * Angular no lee archivos .env: al compilar inlinea el contenido de
 * `environment.ts` en el paquete. Este script es el puente — se ejecuta antes
 * de `ng build` y de `ng serve`, y escribe esos archivos con lo que haya en el
 * entorno.
 *
 * De dónde salen los valores, por orden de prioridad:
 *
 *   1. `process.env` — lo que define el panel de Netlify. Gana siempre, que es
 *      lo que permite cambiar la URL de la API sin tocar el repositorio.
 *   2. `.env` en la raíz del proyecto, para trabajar en local.
 *   3. Los valores por defecto de aquí abajo, para que un clon recién bajado
 *      arranque sin configurar nada.
 *
 * NADA DE ESTO ES SECRETO. Los identificadores de cliente de Google y PayPal
 * son públicos por diseño: viajan en el HTML de cualquier visitante y lo que
 * los protege es el origen registrado en cada consola, no su ocultamiento. El
 * .env aquí sirve para tener una configuración por entorno, no para esconder
 * nada. Un secreto de verdad no puede vivir en un frontend, y ninguno vive.
 */

const fs = require('node:fs');
const path = require('node:path');

const { RAIZ, v, vDev } = require('./leer-env');

const DESTINO = path.join(RAIZ, 'src', 'environments');

const REDES = {
  whatsapp: v('WHATSAPP_URL', 'https://wa.me/51923095940'),
  tiktok: v('TIKTOK_URL', 'https://www.tiktok.com/@benicio.acosta.re'),
  youtube: v('YOUTUBE_URL', 'https://www.youtube.com/@costaIAResearch'),
  instagram: v('INSTAGRAM_URL', 'https://www.instagram.com/acostaresearch/'),
  facebook: v('FACEBOOK_URL', 'https://www.facebook.com/bridgeacademicexperts/?locale=es_LA'),
  scholar: v('SCHOLAR_URL', 'https://scholar.google.com/citations?hl=es&user=F3r4v0gAAAAJ'),
  ctivitae: v(
    'CTIVITAE_URL',
    'https://ctivitae.concytec.gob.pe/appDirectorioCTI/VerDatosInvestigador.do?id_investigador=0316353',
  ),
};

/**
 * La guía de instalación en PDF.
 *
 * Se detecta sola: si el archivo está en `public/guias/`, el enlace aparece en
 * la web; si no está, no aparece. No hay nada que configurar — se suelta el PDF
 * en su carpeta y en el siguiente build ya se ofrece.
 *
 * Es así y no un enlace fijo por una razón concreta: Netlify devuelve el
 * index.html para cualquier ruta que no exista, así que un enlace a un PDF que
 * todavía no está no da un 404 honesto, sino que le descarga al comprador la
 * portada de la web con extensión .pdf. Mejor que no haya botón a que haya uno
 * que entrega basura, y menos en la pantalla en la que acaba de pagar.
 *
 * GUIA_URL en el entorno gana: sirve para apuntar a un Drive o a un CDN sin
 * meter el archivo en el repositorio.
 */
const GUIA_LOCAL = 'guias/guia-instalacion.pdf';

function rutaGuia() {
  const configurada = v('GUIA_URL');
  if (configurada) return configurada;

  return fs.existsSync(path.join(RAIZ, 'public', GUIA_LOCAL)) ? `/${GUIA_LOCAL}` : '';
}

const GUIA = rutaGuia();

/** `JSON.stringify` escapa comillas y acentos sin que haya que pensarlo. */
const s = (valor) => JSON.stringify(valor);

function contenido({ produccion, apiUrl, googleClientId, paypalClientId }) {
  const cabecera = produccion
    ? '/** Configuración de producción. La reemplaza `environment.development.ts` al servir en local. */'
    : '/** Configuración de desarrollo. */';

  return `${cabecera}
//
// ARCHIVO GENERADO por scripts/generar-environment.js. No lo edites a mano:
// se reescribe en cada build. Los valores se cambian en .env o en el panel
// de Netlify.

export const environment = {
  production: ${produccion},
  apiUrl: ${s(apiUrl)},
  /** Enlace de contacto para el pago manual por Yape. */
  whatsappUrl: ${s(REDES.whatsapp)},
  /** Perfiles públicos, en un solo sitio para no buscarlos por las plantillas. */
  redes: {
    whatsapp: ${s(REDES.whatsapp)},
    tiktok: ${s(REDES.tiktok)},
    youtube: ${s(REDES.youtube)},
    instagram: ${s(REDES.instagram)},
    facebook: ${s(REDES.facebook)},
    scholar: ${s(REDES.scholar)},
    ctivitae: ${s(REDES.ctivitae)},
  },
  /** Client ID de Google. Vacío = no se muestra el botón de «Continuar con Google». */
  googleClientId: ${s(googleClientId)},
  /** Client ID de PayPal. Vacío = no se muestra el botón y la venta sigue siendo manual. */
  paypalClientId: ${s(paypalClientId)},
  /** Guía de instalación en PDF. Vacío = no se ofrece la descarga. */
  guiaUrl: ${s(GUIA)},
};
`;
}

fs.mkdirSync(DESTINO, { recursive: true });

fs.writeFileSync(
  path.join(DESTINO, 'environment.ts'),
  contenido({
    produccion: true,
    // Relativa a propósito: el Worker reenvía /api al backend (ver
    // `worker/index.js`), así el navegador y la API comparten origen y la
    // cookie de sesión viaja sin necesitar SameSite=None ni CORS con
    // credenciales.
    apiUrl: v('API_URL', '/api/v1'),
    googleClientId: v('GOOGLE_CLIENT_ID'),
    paypalClientId: v('PAYPAL_CLIENT_ID'),
  }),
);

fs.writeFileSync(
  path.join(DESTINO, 'environment.development.ts'),
  contenido({
    produccion: false,
    // Relativa, igual que en producción: `ng serve` reenvía /api al backend
    // (ver `proxy.conf.js`), así que en local no hay CORS ni cookie cruzada y a
    // qué backend se apunta se decide en un solo sitio, con API_PROXY_TARGET.
    // Poner aquí una URL absoluta sigue funcionando, pero se salta el proxy y
    // con él la sesión: es lo que había antes y es lo que se dejó de hacer.
    apiUrl: vDev('API_URL', '/api/v1'),
    googleClientId: vDev('GOOGLE_CLIENT_ID'),
    // Con PAYPAL_CLIENT_ID en producción apuntando a la cuenta real, trabajar
    // en local con ese mismo identificador significaría enseñar botones que
    // cobran de verdad. La variante _DEV mantiene el sandbox separado.
    paypalClientId: vDev('PAYPAL_CLIENT_ID'),
  }),
);

const origen = process.env.NETLIFY
  ? 'panel de Netlify'
  : fs.existsSync(path.join(RAIZ, '.env'))
    ? '.env'
    : 'valores por defecto';
console.log(`environments generados desde ${origen}`);
console.log(`  api           ${v('API_URL', '/api/v1')}`);
console.log(`  google        ${v('GOOGLE_CLIENT_ID') || '(sin configurar)'}`);
console.log(`  paypal        ${v('PAYPAL_CLIENT_ID') ? 'configurado' : '(sin configurar)'}`);
console.log(`  guía PDF      ${GUIA || '(no encontrada en public/' + GUIA_LOCAL + ')'}`);
