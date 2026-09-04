import { Component } from '@angular/core';

import { FAQ } from '../../shared/contenido/metodo';
import { PasoSiguiente } from '../../shared/layout/paso-siguiente';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Preguntas frecuentes. Las respuestas van completas, no en una línea. */
@Component({
  selector: 'app-preguntas',
  imports: [SiteHeader, SiteFooter, PasoSiguiente],
  templateUrl: './preguntas.html',
  styleUrl: './preguntas.css',
})
export class Preguntas {
  readonly faq = FAQ;
}
