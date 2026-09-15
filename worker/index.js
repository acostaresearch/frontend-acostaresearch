/**
 * Lo que en Netlify eran tres líneas de `netlify.toml`.
 *
 * Cloudflare no sabe reenviar a un origen externo con una simple regla de
 * redirección, así que el proxy de la API y el enrutado de Angular se hacen
 * aquí.
 *
 * CUÁNDO SE EJECUTA ESTO
 * ----------------------
 * Solo cuando la petición NO coincide con un archivo del build. Los estáticos
 * —el JavaScript, las imágenes, el PDF de la guía— los sirve Cloudflare
 * directamente desde su borde sin pasar por aquí, que es lo que hace que la web
 * cargue rápido desde Lima. A este código solo llegan `/api/*` y las rutas de
 * Angular, que son las dos cosas que hay que resolver.
 *
 * Vive fuera de `public/` a propósito: ahí dentro acabaría dentro del propio
 * build y Cloudflare lo serviría como un archivo estático más.
 *
 * POR QUÉ HAY QUE HACER DE PROXY Y NO LLAMAR A LA API DIRECTAMENTE
 * ----------------------------------------------------------------
 * El refresh token viaja en una cookie `httpOnly`. Si el navegador llamara a
 * `api.acostaresearch.com` desde `acostaresearch.com`, serían orígenes distintos
 * y haría falta `SameSite=None` más CORS con credenciales, que es justo donde
 * estas cosas se rompen —y donde se rompen callando, con sesiones que caducan
 * sin explicación—. Pasando por aquí, para el navegador todo es el mismo
 * origen.
 */

/** El backend, en el servidor propio. */
const API = 'https://api.acostaresearch.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return proxiarALaApi(request, url, env);
    }

    return servirLaWeb(request, env);
  },
};

/**
 * Reenvía la petición al backend tal cual y devuelve su respuesta tal cual.
 *
 * Se reconstruye la petición en vez de reenviar el objeto original porque hay
 * que cambiarle el destino. Cabeceras y cuerpo se copian sin tocar: entre ellas
 * viajan la cookie de sesión y el `Authorization`, y cualquier «limpieza» aquí
 * sería una sesión que deja de funcionar.
 */
async function proxiarALaApi(request, url, env) {
  const destino = new URL(url.pathname + url.search, API);

  const peticion = new Request(destino, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'manual',
    // Sin esto, un cuerpo en streaming (la subida del comprobante de Yape) no
    // se reenvía en runtimes que lo exigen explícitamente.
    duplex: 'half',
  });

  // La IP del visitante, para los límites por IP del backend. Sin ella, todos
  // los visitantes que salen por el mismo borde de Cloudflare comparten cubo, y
  // el trigésimo que intenta entrar recibe un 429 siendo el primero en probarlo.
  //
  // No va en X-Forwarded-For: Caddy no se fía de esa cabecera y pone la IP que
  // ve, que es la de Cloudflare. Va aparte, con un secreto que solo tienen este
  // Worker y el backend (`wrangler secret put PROXY_SECRET`). Las que traiga el
  // visitante se borran antes: no puede ponerlas él.
  peticion.headers.delete('X-Cliente-IP');
  peticion.headers.delete('X-Acosta-Proxy');
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip && env.PROXY_SECRET) {
    peticion.headers.set('X-Cliente-IP', ip);
    peticion.headers.set('X-Acosta-Proxy', env.PROXY_SECRET);
  }

  let respuesta;
  try {
    respuesta = await fetch(peticion);
  } catch {
    // El servidor no contesta en absoluto. Sin esto el Worker revienta y
    // Cloudflare enseña su propia página de error; así la web recibe el mismo
    // 503 que da la API con la base caída y saca la pantalla de mantenimiento.
    return Response.json(
      {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'El servicio no está disponible en este momento. Inténtalo de nuevo en unos minutos.',
        },
      },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }

  // Se devuelve una copia mutable: la respuesta de `fetch` trae las cabeceras
  // inmutables y `Set-Cookie` tiene que llegar al navegador intacta.
  return new Response(respuesta.body, {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: respuesta.headers,
  });
}

/**
 * Sirve el archivo pedido y, si no existe, el index.html.
 *
 * Es el equivalente del `try_files` de Caddy y del último redirect de Netlify:
 * sin esto, entrar directo a /metodo o recargar con F5 devuelve un 404, porque
 * esas carpetas no existen en el servidor —las resuelve el router de Angular ya
 * en el navegador—.
 *
 * La condición mira que el navegador esté pidiendo una página: a un .js o a una
 * imagen que falten hay que responderles 404 de verdad, no un HTML disfrazado
 * que rompería de forma mucho más confusa.
 */
async function servirLaWeb(request, env) {
  const respuesta = await env.ASSETS.fetch(request);

  // Las cabeceras de seguridad van también aquí, y no solo en el respaldo de
  // abajo: la PORTADA y cualquier archivo que sí existe se sirven por este
  // camino, así que sin esto la única página sin proteger era la primera.
  if (respuesta.status !== 404) return conCabecerasDeSeguridad(respuesta);

  const url = new URL(request.url);

  // Una ruta sin extensión es una página, lo pida quien lo pida.
  //
  // Antes solo contaba el `Accept: text/html`, y los robots que arman la vista
  // previa de un enlace —WhatsApp, Facebook— no siempre lo mandan: compartir
  // `acostaresearch.com/planes` les devolvía un 404 vacío y el enlace salía sin
  // título ni imagen. Lo que sí tiene extensión —un .js, una imagen que falta—
  // sigue recibiendo su 404 de verdad, también si lo pide un navegador: así un
  // PDF que falta no vuelve a servirse como la portada con extensión .pdf.
  const pareceArchivo = /\.[a-z0-9]{2,5}$/i.test(url.pathname);
  if (pareceArchivo) return respuesta;

  // Se pide la RAÍZ, no `/index.html`.
  //
  // Cloudflare redirige `/index.html` a `/` para tener una sola URL canónica de
  // cada página. Pedirlo por su nombre devuelve una redirección —un 301 con
  // `Location: /`— y no el contenido. Si a esa respuesta se le fuerza el estado
  // 200, como se hace abajo, sale un 200 con cabecera `Location` y sin cuerpo:
  // un híbrido que ningún navegador sabe interpretar, y la página queda en
  // blanco sin un solo error en la consola.
  const pagina = await env.ASSETS.fetch(new Request(new URL('/', request.url), request));

  // El 200 es a propósito: para el navegador y para Google, /metodo es una
  // página que existe, no un error al que le hemos puesto contenido.
  //
  // Aquí se añadían las cabeceras de aislamiento (COOP/COEP) que necesitaba R
  // en el navegador en `/analisis`. Esa página se retiró el 15 de septiembre de
  // 2026: el análisis lo hace Claude en el servidor, y ninguna página necesita
  // ya aislarse.
  return conCabecerasDeSeguridad(new Response(pagina.body, { status: 200, headers: pagina.headers }));
}

/**
 * De dónde puede cargar la web, y qué no puede hacer nadie con ella.
 *
 * `frame-ancestors 'none'` es lo que importa hoy: sin él, cualquier web podía
 * meter el panel en un iframe invisible y hacer que el tesista pulsara cosas
 * sin verlas. Lo demás es el cinturón para el día que aparezca un XSS.
 *
 * La lista sale de lo que la web usa de verdad: la tipografía de Google, el
 * botón de Google para entrar, el SDK de PayPal en el checkout, los videos de
 * YouTube sin cookies y sus miniaturas. El script en línea del tema (index.html)
 * va por su hash: si se toca ese script, hay que recalcularlo o la página se
 * queda en el tema claro.
 *
 * VA EN «Report-Only» A PROPÓSITO, DE MOMENTO. Una CSP estricta que se cuele
 * rompe el botón de entrar o el pago sin un solo error visible para el usuario.
 * En Report-Only el navegador solo se queja por consola. Cuando se compruebe a
 * mano que entrar con Google, pagar con PayPal y ver un video siguen yendo,
 * esta cabecera pasa a llamarse `Content-Security-Policy` a secas.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'sha256-iLMfOYw9eEM62gABbbgl+dbIfwNvx27jn1gpVTlnH7w=' https://accounts.google.com https://www.paypal.com https://www.sandbox.paypal.com https://*.paypalobjects.com",
  // Angular inyecta los estilos de cada componente como <style> en la página.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://i.ytimg.com https://*.paypal.com https://*.paypalobjects.com",
  "connect-src 'self' https://accounts.google.com https://*.paypal.com",
  "frame-src https://accounts.google.com https://*.paypal.com https://www.youtube-nocookie.com",
].join('; ');

const CABECERAS_DE_SEGURIDAD = {
  'Content-Security-Policy-Report-Only': CSP,
  // Por si la CSP no llega: ningún navegador la mete en un marco.
  'X-Frame-Options': 'DENY',
  // Nada de adivinar el tipo de un archivo por su contenido.
  'X-Content-Type-Options': 'nosniff',
  // A otros dominios solo les llega el dominio, nunca la ruta: las URL de
  // subida y de descarga llevan el token dentro.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Un año, subdominios incluidos. Cloudflare ya fuerza HTTPS; esto lo fija
  // también en el navegador.
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

function conCabecerasDeSeguridad(respuesta) {
  const cabeceras = new Headers(respuesta.headers);
  for (const [nombre, valor] of Object.entries(CABECERAS_DE_SEGURIDAD)) cabeceras.set(nombre, valor);
  return new Response(respuesta.body, {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: cabeceras,
  });
}
