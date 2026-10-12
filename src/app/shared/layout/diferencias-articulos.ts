import { Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DIFERENCIAS_ARTICULOS } from '../contenido/skills-del-articulo';

/**
 * «¿En qué se diferencian?»: un botón que abre, en una ventana emergente, la
 * comparación de los dos productos de artículos, el empírico y el de revisión.
 *
 * Va en /articulo y en /planes. Se parecen tanto —mismo humanizador, mismos
 * nombres de fase— que quien llega no sabe cuál le toca, y la respuesta cabe
 * en una tabla de siete filas. Cerrada por defecto: a quien ya lo sabe no le
 * estorba. Hasta el 12-oct se desplegaba en su sitio y empujaba las fases.
 */
@Component({
  selector: 'app-diferencias-articulos',
  imports: [RouterLink],
  templateUrl: './diferencias-articulos.html',
  styleUrl: './diferencias-articulos.css',
  host: { '(document:keydown.escape)': 'cerrar()' },
})
export class DiferenciasArticulos {
  /** El producto que se está mirando, para resaltar su columna. */
  readonly actual = input<'empirico' | 'revision' | null>(null);

  readonly abierto = signal(false);
  readonly filas = DIFERENCIAS_ARTICULOS;

  cerrar(): void {
    this.abierto.set(false);
  }
}
