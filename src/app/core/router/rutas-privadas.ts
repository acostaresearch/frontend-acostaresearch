import { signal } from '@angular/core';
import { UrlMatcher, UrlSegment } from '@angular/router';

/**
 * Las direcciones de las páginas con sesión, cambiadas por cada ingreso.
 *
 * El perfil, «Preparar documento» y el panel de administración no se ven como
 * /perfil o /admin: cada vez que alguien entra se sortea una dirección nueva
 * para cada una —/k7Qx9mZp2LwA— y la de antes deja de llevar a ningún sitio.
 * Dentro del panel, también la sección va cifrada con la clave de esa sesión.
 *
 * Esto NO es la cerradura. Quien protege los datos sigue siendo el backend,
 * que mira la sesión y el rol en cada petición, y los guards de la web. Esto
 * solo quita de la vista qué páginas hay: /admin ya no existe y cae en la
 * portada como cualquier dirección inventada.
 *
 * `/perfil` y `/preparar-documento` se quedan como puertas: las skills, los
 * correos y el asistente mandan allí, y con sesión llevan a la dirección del
 * momento (sin quedarse en el historial); sin sesión, a iniciar sesión.
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

/**
 * Las de la sesión que se acaba de cerrar, solo en memoria. Hacen falta un
 * instante más: cuando la sesión caduca, primero se borra y después se manda
 * a iniciar sesión con la página en la que se estaba (ver `rutaLegible`).
 */
let anteriores: Claves | null = null;

/** Al cerrar sesión. */
export function olvidarRutas(): void {
  anteriores = claves() ?? anteriores;
  guardar(null);
  claves.set(null);
}

/** La puerta de cada página, la que se puede escribir y repartir. */
const PUERTAS: Record<Privada, string> = {
  perfil: '/perfil',
  preparar: '/preparar-documento',
  admin: '/',
};

/**
 * La dirección de una página privada, con lo que cuelgue detrás.
 * Sin claves —sin sesión— da la puerta, que manda a iniciar sesión.
 */
export function rutaPrivada(pagina: Privada, ...resto: string[]): string {
  const c = claves();
  if (!c) return PUERTAS[pagina];
  return ['', c[pagina], ...resto].join('/');
}

/**
 * La sección del panel, cifrada con la clave de esta sesión: «pagos» no se lee
 * en la barra y cambia con cada ingreso. No hace falta guardarla: sale siempre
 * igual de la misma clave (FNV-1a, sin pretensión criptográfica; el secreto,
 * si lo hubiera, es la clave de al lado).
 */
export function cifrarSeccion(nombre: string): string {
  const semilla = `${claves()?.admin ?? ''}:${nombre}`;
  let h = 0x811c9dc5;
  let tira = '';
  for (let vuelta = 0; tira.length < 8; vuelta++) {
    for (let i = 0; i < semilla.length; i++) {
      h ^= semilla.charCodeAt(i) + vuelta;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    tira += ALFABETO[h % ALFABETO.length];
  }
  return tira;
}

/** La dirección de una sección del panel. */
export function rutaDeSeccion(nombre: string): string {
  return rutaPrivada('admin', cifrarSeccion(nombre));
}

/**
 * Para las rutas: casa el primer tramo con la clave de esa página. Sin sesión
 * no casa nada y la dirección acaba en el comodín, igual que una inventada.
 */
export function casaPrivada(pagina: Privada, conHijos = false): UrlMatcher {
  return (segmentos: UrlSegment[]) => {
    const clave = claves()?.[pagina];
    if (!clave || segmentos[0]?.path !== clave) return null;
    if (!conHijos && segmentos.length > 1) return null;
    return { consumed: [segmentos[0]] };
  };
}

/**
 * Al revés: de la dirección cifrada a la puerta, para el `returnUrl` de
 * iniciar sesión. Al volver a entrar se sortean claves nuevas y la dirección
 * vieja ya no llevaría a ningún sitio; la puerta sí.
 *
 * El panel vuelve a la portada: no tiene puerta, y escribir /admin en la barra
 * sería justo lo que se quiere esconder.
 */
export function rutaLegible(url: string): string {
  const c = claves() ?? anteriores;
  if (!c) return url;
  const corte = url.search(/[?#]/);
  const camino = corte < 0 ? url : url.slice(0, corte);
  const cola = corte < 0 ? '' : url.slice(corte);
  const primero = camino.split('/').filter(Boolean)[0];
  if (primero === c.perfil) return PUERTAS.perfil + cola;
  if (primero === c.preparar) return PUERTAS.preparar + cola;
  if (primero === c.admin) return '/';
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
