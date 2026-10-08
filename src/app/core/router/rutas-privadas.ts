import { UrlMatcher, UrlSegment } from '@angular/router';

/**
 * Las direcciones de las páginas con sesión, limpias:
 *
 *   /perfil/herramientas        una sección del perfil
 *   /preparar-documento
 *   /admin/licencias            una sección del panel
 *
 * Del 29-sep al 8-oct llevaron detrás una clave sorteada en cada ingreso
 * (/perfil/ayuda/kFZ5mTnQBH0j); el usuario pidió quitarla. Nunca fue la
 * cerradura: quien protege los datos es el backend, que mira la sesión y el rol
 * en cada petición, y los guards de la web. Las direcciones viejas con clave
 * redirigen a la limpia (ver `app.routes.ts`).
 *
 * /perfil a secas es la puerta: lleva a la sección de entrada. /admin a secas
 * lleva al resumen al administrador y a cualquier otro a la portada.
 */

export type Privada = 'perfil' | 'preparar' | 'admin';

const PUERTAS: Record<Privada, string> = {
  perfil: '/perfil',
  preparar: '/preparar-documento',
  admin: '/admin',
};

/** Las secciones de la barra lateral del perfil, como van en la dirección. */
export const SECCIONES_DEL_PERFIL = [
  'avance',
  'herramientas',
  'compras',
  // Solo salen en la barra a quien le tocan: «invitar» a quien tiene el método
  // y «grupos» a quien coordina alguno (una universidad o un asesor).
  'invitar',
  'grupos',
  'ayuda',
] as const;
export type SeccionDelPerfil = (typeof SECCIONES_DEL_PERFIL)[number];

/**
 * La dirección de una página privada. El perfil entra por el «Video curso paso
 * a paso» (desde el 8-oct; antes, «Por dónde vas»), y el panel por su puerta,
 * que lleva al resumen.
 */
export function rutaPrivada(pagina: Privada): string {
  if (pagina === 'perfil') return rutaDelPerfil('ayuda');
  return PUERTAS[pagina];
}

/** Una sección del perfil: /perfil/herramientas. */
export function rutaDelPerfil(seccion: SeccionDelPerfil): string {
  return `${PUERTAS.perfil}/${seccion}`;
}

/** La dirección de una sección del panel: /admin/<nombre>. */
export function rutaDeSeccion(nombre: string): string {
  return `${PUERTAS.admin}/${nombre}`;
}

/**
 * Para las rutas.
 *
 * - Perfil: /perfil/<sección>; la sección va en el parámetro `seccion`. Una que
 *   no existe no casa y acaba en el comodín.
 * - Panel: /admin/<nombre>; el nombre va en `seccion` y el propio componente
 *   corrige uno que no existe.
 */
export function casaPrivada(pagina: Exclude<Privada, 'preparar'>): UrlMatcher {
  const nombre = PUERTAS[pagina].slice(1);
  return (segmentos: UrlSegment[]) => {
    if (segmentos.length !== 2 || segmentos[0].path !== nombre) return null;
    const seccion = segmentos[1];
    const valida =
      pagina === 'perfil'
        ? (SECCIONES_DEL_PERFIL as readonly string[]).includes(seccion.path)
        : /^[a-z-]+$/.test(seccion.path);
    return valida ? { consumed: segmentos, posParams: { seccion } } : null;
  };
}

/** Si la dirección es una sección del perfil, sea cual sea. */
export function esDelPerfil(url: string): boolean {
  const camino = url.split(/[?#]/)[0];
  return casaPrivada('perfil')(
    camino.split('/').filter(Boolean).map((tramo) => new UrlSegment(tramo, {})),
    null as never,
    null as never,
  ) !== null;
}

/**
 * De una ruta escrita a mano a la de verdad. La usa el recorrido guiado, que
 * tiene sus pasos escritos con `/perfil`.
 */
export function rutaReal(ruta: string): string {
  if (ruta === '/perfil') return rutaPrivada('perfil');
  return ruta;
}
