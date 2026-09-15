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

  if (respuesta.status !== 404) return respuesta;

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
  return new Response(pagina.body, { status: 200, headers: pagina.headers });
}
