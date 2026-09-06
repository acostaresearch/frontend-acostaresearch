import { Injectable } from '@angular/core';

/**
 * Congela la página cuando hay una ventana abierta.
 *
 * Sin esto, la rueda del ratón sobre una ventana modal mueve lo que hay
 * DETRÁS: la ventana se queda quieta y el sitio se desliza bajo ella. Se veía
 * como si la barra del título de la ventana bajara sola por la pantalla.
 *
 * Lleva la cuenta de cuántas hay abiertas en vez de un simple sí/no porque se
 * apilan —un diálogo de confirmar encima de un formulario—, y la primera en
 * cerrarse devolvería el desplazamiento con la otra todavía puesta.
 */
@Injectable({ providedIn: 'root' })
export class FondoService {
  private readonly abiertas = new Set<string>();

  /** `abierta` en true bloquea; en false suelta lo que puso esa misma clave. */
  fijar(clave: string, abierta: boolean): void {
    if (abierta) this.abiertas.add(clave);
    else this.abiertas.delete(clave);

    document.body.classList.toggle('sin-scroll', this.abiertas.size > 0);
  }
}
