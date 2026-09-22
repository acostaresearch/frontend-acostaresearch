'use strict';

/**
 * Proxy de `ng serve`: lo mismo que hace el Worker en producción.
 *
 * En producción la web nunca llama a `api.acostaresearch.com` desde el
 * navegador: el Worker reenvía `/api/*` al backend y para el navegador todo es
 * el mismo origen (ver `worker/index.js`). Aquí se replica esa topología, y no
 * por comodidad — es lo que hace que en local pase exactamente lo mismo que en
 * producción:
 *
 *   · Sin CORS *del navegador*. El navegador solo habla con localhost:4200;
 *     quien cruza a internet es el servidor de desarrollo. Del backend sí hay
 *     que ocuparse: ver EL ORIGEN, aquí abajo.
 *   · Con la cookie de sesión. El refresh token viaja en una cookie httpOnly
 *     que el backend marca `SameSite=None; Secure`. Llamando directamente a la
 *     API desde otro origen, esa cookie es justo lo que se rompe, y se rompe
 *     callando: sesiones que caducan sin explicación. Pasando por el proxy, la
 *     cookie es de localhost y viaja como en producción.
 *
 * A QUÉ BACKEND APUNTA
 * --------------------
 * A `API_PROXY_TARGET`, del `.env` o del entorno. Sin configurar, al backend
 * local de siempre. Para trabajar contra el backend desplegado basta con:
 *
 *   API_PROXY_TARGET=https://api.acostaresearch.com
 *
 * y reiniciar `npm start`. Nada más cambia: la web sigue pidiendo `/api/v1`.
 *
 * Ojo con lo que eso significa: los datos son los REALES. Registrarse, aprobar
 * un Yape o revocar una licencia desde ahí afecta a clientes de verdad.
 *
 * EL ORIGEN, CUANDO EL DESTINO ES EL BACKEND DESPLEGADO
 * -----------------------------------------------------
 * El proxy reenvía la cabecera `Origin` del navegador tal cual, y esa dice
 * `http://localhost:4200`. El backend la mira SIEMPRE —su lista de orígenes no
 * distingue si quien llama es un navegador o un servidor— y contesta
 * «Origen no permitido por CORS: http://localhost:4200» con un 403. Entrar con
 * Google era lo primero que se rompía.
 *
 * Así que a partir de aquí el proxy se presenta con el origen del SITIO, que es
 * lo que de verdad está pasando: estas peticiones salen del servidor de
 * desarrollo haciendo de web, no de una página ajena en el navegador de nadie.
 * La alternativa era añadir `localhost` a la lista de orígenes de producción,
 * que es abrirle la API pública a cualquier página servida desde el localhost
 * de cualquiera, y para siempre. Esto se queda en este equipo.
 *
 * Con el backend local NO se toca nada: su lista ya tiene `localhost:4200`, y
 * mentirle le haría rechazar justo lo que sí debe aceptar.
 *
 * Y la cookie de sesión viene marcada para `acostaresearch.com`, que el
 * navegador tiraría estando en localhost —la sesión se caería en cuanto
 * caducara el token de acceso—: `cookieDomainRewrite` le quita el dominio y así
 * se guarda como cookie de localhost.
 */

const { v } = require('./scripts/leer-env');

const destino = v('API_PROXY_TARGET', 'http://localhost:3000');

/** El sitio público, que es como se presenta el proxy ante el backend desplegado. */
const SITIO = 'https://acostaresearch.com';

/** ¿Va contra el backend de esta máquina? Entonces no hay nada que disimular. */
const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(destino);

// Se anuncia al arrancar. Trabajar contra producción creyendo que es local es
// un error caro, y la única defensa barata es que esté escrito en pantalla.
console.log(`[proxy] /api → ${destino}${esLocal ? '' : `  (presentándose como ${SITIO})`}`);

module.exports = {
  '/api': {
    target: destino,
    // El backend está detrás de Caddy, que reparte por nombre de host: sin
    // reescribir la cabecera `Host` no sabría a qué sitio va la petición.
    changeOrigin: true,
    // Se verifica el certificado del destino. Solo se desactivaría para un
    // servidor con certificado propio, y no es el caso.
    secure: true,
    // Ver EL ORIGEN, arriba. Solo contra el backend desplegado.
    ...(esLocal
      ? {}
      : {
          headers: { Origin: SITIO, Referer: `${SITIO}/` },
          // La cookie llega con `Domain=acostaresearch.com`; sin dominio, el
          // navegador la guarda para localhost y la sesión aguanta.
          cookieDomainRewrite: '',
        }),
  },
};
