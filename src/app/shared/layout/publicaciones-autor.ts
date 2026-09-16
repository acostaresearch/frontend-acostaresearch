import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PUBLICACIONES, REVISTAS_PUBLICADAS } from '../contenido/publicaciones';

/**
 * Los artículos del autor, en dos tamaños.
 *
 * Entero en «Quién soy», que es donde se va a comprobar quién firma el método.
 * Resumido en la página del artículo científico: ahí quien duda no quiere leer
 * cinco títulos en inglés, quiere saber si el autor publica de verdad, y eso lo
 * dicen los nombres de las revistas y un enlace a la lista.
 */
@Component({
  selector: 'app-publicaciones-autor',
  imports: [RouterLink],
  templateUrl: './publicaciones-autor.html',
  styleUrl: './publicaciones-autor.css',
})
export class PublicacionesAutor {
  readonly resumen = input(false);

  readonly publicaciones = PUBLICACIONES;
  readonly revistas = REVISTAS_PUBLICADAS;
}
