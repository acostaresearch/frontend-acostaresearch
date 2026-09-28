import { Injectable, signal } from '@angular/core';

/** Las secciones de la barra lateral del perfil. */
export type SeccionDelPerfil = 'avance' | 'herramientas' | 'compras' | 'ayuda';

/**
 * Qué sección del perfil se está mirando.
 *
 * El perfil es un armazón con barra lateral: a la izquierda las secciones, a
 * la derecha solo la elegida. Lo comparten dos que no se conocen: el perfil,
 * que pinta la barra y «Mis compras», y `MiConector`, que pinta «Por dónde
 * vas», las herramientas y la ayuda. En el panel del administrador nadie lo
 * toca y todo sigue a la vista en la rejilla.
 */
@Injectable({ providedIn: 'root' })
export class VistaDelPerfil {
  readonly seccion = signal<SeccionDelPerfil>('avance');
  /** Si hay herramientas: sin ellas, la barra no ofrece la sección. */
  readonly hayHerramientas = signal(false);
}
