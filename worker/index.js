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
      return proxiarALaApi(request, url);
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
async function proxiarALaApi(request, url) {
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

  // `X-Forwarded-For` importa: el backend confía en dos saltos para contar el
  // límite de peticiones por IP. Sin la IP real, todos los visitantes
  // compartirían un mismo cubo y el undécimo que intentara registrarse recibiría
  // un 429 siendo el primero en probarlo.
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) peticion.headers.set('X-Forwarded-For', ip);

  const respuesta = await fetch(peticion);

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

  const quierePagina = (request.headers.get('Accept') || '').includes('text/html');
  if (!quierePagina) return respuesta;

  const indice = new URL('/index.html', request.url);
  const pagina = await env.ASSETS.fetch(new Request(indice, request));

  // El 200 es a propósito: para el navegador y para Google, /metodo es una
  // página que existe, no un error al que le hemos puesto contenido.
  return new Response(pagina.body, {
    status: 200,
    headers: pagina.headers,
  });
}
