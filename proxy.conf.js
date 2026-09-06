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
 *   · Sin CORS. El navegador solo habla con localhost:4200; quien cruza a
 *     internet es el servidor de desarrollo, y a él no le aplica.
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
 */

const { v } = require('./scripts/leer-env');

const destino = v('API_PROXY_TARGET', 'http://localhost:3000');

// Se anuncia al arrancar. Trabajar contra producción creyendo que es local es
// un error caro, y la única defensa barata es que esté escrito en pantalla.
console.log(`[proxy] /api → ${destino}`);

module.exports = {
  '/api': {
    target: destino,
    // El backend está detrás de Caddy, que reparte por nombre de host: sin
    // reescribir la cabecera `Host` no sabría a qué sitio va la petición.
    changeOrigin: true,
    // Se verifica el certificado del destino. Solo se desactivaría para un
    // servidor con certificado propio, y no es el caso.
    secure: true,
  },
};
