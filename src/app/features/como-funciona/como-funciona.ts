import { Component } from '@angular/core';

import { OBJECIONES, PASOS } from '../../shared/contenido/metodo';
import { PasoSiguiente } from '../../shared/layout/paso-siguiente';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * Cómo se empieza, y las dos objeciones de siempre.
 *
 * Van juntas a propósito: quien llega hasta aquí ya entendió qué es, y lo que
 * le frena es el «¿y esto me lo aceptarán?». Responderlo en la misma página en
 * que se explica el arranque evita que se vaya con la duda encima.
 */
@Component({
  selector: 'app-como-funciona',
  imports: [SiteHeader, SiteFooter, PasoSiguiente],
  templateUrl: './como-funciona.html',
  styleUrl: './como-funciona.css',
})
export class ComoFunciona {
  readonly pasos = PASOS;
  readonly objeciones = OBJECIONES;
}
