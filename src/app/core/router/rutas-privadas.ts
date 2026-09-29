import { signal } from '@angular/core';
import { UrlMatcher, UrlSegment } from '@angular/router';

/**
 * Las direcciones de las páginas con sesión, cambiadas por cada ingreso.
 *
 * El perfil, «Preparar documento» y el panel de administración llevan detrás
 * de su nombre una clave que se sortea en cada ingreso —/perfil/fDvxinjld3Wv—,
 * y la de antes deja de llevar a ningún sitio. En el panel cada sección tiene
 * su propio código —/admin/Qa81LmZr0pXe—, sacado de la clave de esa sesión.
 *
 * Esto NO es la cerradura. Quien protege los datos sigue siendo el backend,
 * que mira la sesión y el rol en cada petición, y los guards de la web. Esto
 * solo impide adivinar o reutilizar las direcciones de dentro.
 *
 * /perfil, /preparar-documento y /admin a secas son las puertas: las skills,
 * los correos y el asistente mandan allí, y con sesión llevan a la dirección
 * del momento (sin quedarse en el historial). /admin solo abre al
 * administrador; a cualquier otro lo deja en la portada.
 *
 * Las claves se guardan en `localStorage` para que recargar o abrir otra
 * pestaña siga funcionando. No son un secreto que dé acceso a nada —la sesión
 * va en la cookie httpOnly—, así que no pasa nada por que estén ahí.
 */

export type Privada = 'perfil' | 'preparar' | 'admin';

type Claves = Record<Privada, string>;

const GUARDADO = 'ar.rutas';
const LARGO = 12;
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Una tira al azar, criptográfico: `Math.random` se puede adivinar. */
function sortear(largo = LARGO): string {
  const bytes = crypto.getRandomValues(new Uint8Array(largo));
  // 248 es el mayor múltiplo de 62 que cabe en un byte: por encima se descarta
  // para no favorecer las primeras letras. Rara vez hace falta repetir.
  let tira = '';
  for (const b of bytes) if (b < 248) tira += ALFABETO[b % ALFABETO.length];
  return tira.length === largo ? tira : tira + sortear(largo - tira.length);
}

function nuevas(): Claves {
  return { perfil: sortear(), preparar: sortear(), admin: sortear() };
}

function leer(): Claves | null {
  try {
    const crudo = localStorage.getItem(GUARDADO);
    if (!crudo) return null;
    const c = JSON.parse(crudo) as Partial<Claves>;
    const valida = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9]{12}$/.test(v);
    return valida(c.perfil) && valida(c.preparar) && valida(c.admin) ? (c as Claves) : null;
  } catch {
    return null;
  }
}

function guardar(c: Claves | null): void {
  try {
    if (c) localStorage.setItem(GUARDADO, JSON.stringify(c));
    else localStorage.removeItem(GUARDADO);
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): valen solo en memoria y
    // una recarga sortea otras. La puerta /perfil sigue llevando a la buena.
  }
}

/** En una signal para que los enlaces de la cabecera cambien solos al entrar. */
const claves = signal<Claves | null>(null);

/** Al iniciar sesión: direcciones nuevas, y las de antes dejan de valer. */
export function rotarRutas(): void {
  const c = nuevas();
  guardar(c);
  claves.set(c);
}

/** Al restaurar la sesión: las que ya había, o unas nuevas si no hay. */
export function asegurarRutas(): void {
  if (claves()) return;
  const c = leer() ?? nuevas();
  guardar(c);
  claves.set(c);
}

/** Al cerrar sesión. */
export function olvidarRutas(): void {
  guardar(null);
  claves.set(null);
}

/**
 * El nombre de cada página, que sí se ve: /perfil/<clave>. Sin clave detrás es
 * la puerta, la que se puede escribir y repartir.
 */
const PUERTAS: Record<Privada, string> = {
  perfil: '/perfil',
  preparar: '/preparar-documento',
  admin: '/admin',
};

/**
 * La dirección de una página privada en esta sesión: /perfil/fDvxinjld3Wv.
 * Sin claves —sin sesión— da la puerta, que manda a iniciar sesión. El panel
 * no tiene una sola dirección, sino una por sección: ver `rutaDeSeccion`.
 */
export function rutaPrivada(pagina: Privada): string {
  const c = claves();
  if (!c || pagina === 'admin') return PUERTAS[pagina];
  return `${PUERTAS[pagina]}/${c[pagina]}`;
}

/**
 * El código de una sección del panel en esta sesión: 12 caracteres sacados de
 * la clave del admin y del nombre, así que «pagos» no se lee en la barra y
 * cambia con cada ingreso. No hace falta guardarlo: sale siempre igual de la
 * misma clave (FNV-1a, sin pretensión criptográfica; lo que no se adivina es
 * la clave).
 */
export function cifrarSeccion(nombre: string): string {
  const semilla = `${claves()?.admin ?? ''}:${nombre}`;
  let h = 0x811c9dc5;
  let tira = '';
  for (let vuelta = 0; tira.length < LARGO; vuelta++) {
    for (let i = 0; i < semilla.length; i++) {
      h ^= semilla.charCodeAt(i) + vuelta;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    tira += ALFABETO[h % ALFABETO.length];
  }
  return tira;
}

/** La dirección de una sección del panel: /admin/<código>. */
export function rutaDeSeccion(nombre: string): string {
  return `${PUERTAS.admin}/${cifrarSeccion(nombre)}`;
}

/**
 * Para las rutas: casa /<página>/<clave de esta sesión>, y nada más. Sin
 * sesión, o con una clave vieja, no casa y la dirección acaba en el comodín,
 * igual que una inventada.
 *
 * En el panel el segundo tramo es el código de la sección, que se entrega como
 * el parámetro `seccion`; el propio componente corrige uno que no existe.
 */
export function casaPrivada(pagina: Privada): UrlMatcher {
  const nombre = PUERTAS[pagina].slice(1);
  return (segmentos: UrlSegment[]) => {
    const c = claves();
    if (!c || segmentos.length !== 2 || segmentos[0].path !== nombre) return null;
    const segundo = segmentos[1];
    if (pagina === 'admin') {
      return /^[A-Za-z0-9]{12}$/.test(segundo.path)
        ? { consumed: segmentos, posParams: { seccion: segundo } }
        : null;
    }
    return segundo.path === c[pagina] ? { consumed: segmentos } : null;
  };
}

/**
 * Al revés: de la dirección con clave a la puerta, para el `returnUrl` de
 * iniciar sesión. Al volver a entrar se sortean claves nuevas y la dirección
 * vieja ya no llevaría a ningún sitio; la puerta sí. El panel vuelve a su
 * resumen: el código de la sección tampoco valdrá.
 */
export function rutaLegible(url: string): string {
  const corte = url.search(/[?#]/);
  const camino = corte < 0 ? url : url.slice(0, corte);
  const cola = corte < 0 ? '' : url.slice(corte);
  const [primero, segundo] = camino.split('/').filter(Boolean);
  if (!segundo) return url;
  for (const puerta of Object.values(PUERTAS)) {
    if (`/${primero}` === puerta) return puerta === PUERTAS.admin ? puerta : puerta + cola;
  }
  return url;
}

/**
 * De una ruta con nombre legible a la de verdad. La usa el recorrido guiado,
 * que tiene sus pasos escritos con `/perfil` y `/admin/resumen`.
 */
export function rutaReal(ruta: string): string {
  if (ruta === '/perfil') return rutaPrivada('perfil');
  if (ruta === '/preparar-documento') return rutaPrivada('preparar');
  const admin = /^\/admin\/([^/?#]+)$/.exec(ruta);
  if (admin) return rutaDeSeccion(admin[1]);
  return ruta;
}
