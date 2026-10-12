import { Injectable, signal } from '@angular/core';

/** Lo que manda el panel en `?pais=` para ver solo lo que no tiene etiqueta. */
export const SIN_ETIQUETA = 'ninguno';

/**
 * El país por el que el dueño está mirando el panel.
 *
 * Vacío = todo, que es el total de la casa y de todos los países. Un código
 * (`EC`) = solo lo de ese país. `ninguno` = solo lo de la casa. Lo añade a las
 * peticiones del panel `paisInterceptor`; al administrador de país no le hace
 * falta, porque el servidor ya le aplica el suyo.
 */
@Injectable({ providedIn: 'root' })
export class FiltroDePais {
  readonly valor = signal('');
}
