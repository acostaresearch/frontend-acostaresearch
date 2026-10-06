import { Component, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DIFERENCIAS_ARTICULOS } from '../contenido/skills-del-articulo';

/**
 * «¿En qué se diferencian?»: un botón que despliega la comparación de los dos
 * productos de artículos, el empírico y el de revisión.
 *
 * Va en /articulo y en /planes. Se parecen tanto —mismo humanizador, mismos
 * nombres de fase— que quien llega no sabe cuál le toca, y la respuesta cabe
 * en una tabla de siete filas. Plegada por defecto: a quien ya lo sabe no le
 * estorba.
 */
@Component({
  selector: 'app-diferencias-articulos',
  imports: [RouterLink],
  templateUrl: './diferencias-articulos.html',
  styleUrl: './diferencias-articulos.css',
})
export class DiferenciasArticulos {
  /** El producto que se está mirando, para resaltar su columna. */
  readonly actual = input<'empirico' | 'revision' | null>(null);

  readonly abierto = signal(false);
  readonly filas = DIFERENCIAS_ARTICULOS;
}
