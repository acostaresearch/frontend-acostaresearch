import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { SeccionDelPerfil, esDelPerfil, rutaDelPerfil } from '../../core/router/rutas-privadas';

export type { SeccionDelPerfil };

/**
 * Qué sección del perfil se está mirando.
 *
 * El perfil es un armazón con barra lateral: a la izquierda las secciones, a
 * la derecha solo la elegida. Lo comparten dos que no se conocen: el perfil,
 * que pinta la barra y «Mis compras», y `MiConector`, que pinta «Por dónde
 * vas», las herramientas y la ayuda. En el panel del administrador nadie lo
 * toca y todo sigue a la vista en la rejilla.
 *
 * Desde el 29-sep cada sección tiene su dirección —/perfil/herramientas/<código>—
 * y la que manda es la dirección: `ir` navega, y el perfil escribe `seccion`
 * al leer la ruta. Así recargar deja donde se estaba y «atrás» vuelve a la
 * sección de antes.
 */
@Injectable({ providedIn: 'root' })
export class VistaDelPerfil {
  private readonly router = inject(Router);

  readonly seccion = signal<SeccionDelPerfil>('ayuda');
  /** Si hay herramientas: sin ellas, la barra no ofrece la sección. */
  readonly hayHerramientas = signal(false);

  /**
   * Lleva a una sección. `reemplazar` es para las correcciones que no pidió
   * nadie —una sección vacía, la vuelta de Zotero—: no dejan rastro en el
   * historial y conservan lo que traiga la dirección.
   */
  ir(seccion: SeccionDelPerfil, reemplazar = false): void {
    if (!esDelPerfil(this.router.url)) {
      this.seccion.set(seccion);
      return;
    }
    void this.router.navigateByUrl(
      reemplazar
        ? this.router.createUrlTree([rutaDelPerfil(seccion)], {
            queryParams: this.router.parseUrl(this.router.url).queryParams,
          })
        : rutaDelPerfil(seccion),
      { replaceUrl: reemplazar },
    );
  }
}
