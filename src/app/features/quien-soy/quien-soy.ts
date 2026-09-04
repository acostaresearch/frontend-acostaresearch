import { Component } from '@angular/core';

import { PasoSiguiente } from '../../shared/layout/paso-siguiente';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';
import { environment } from '../../../environments/environment';

/** Quién firma el método. Es la página que sostiene todo lo demás. */
@Component({
  selector: 'app-quien-soy',
  imports: [SiteHeader, SiteFooter, PasoSiguiente],
  templateUrl: './quien-soy.html',
  styleUrl: './quien-soy.css',
})
export class QuienSoy {
  readonly redes = environment.redes;
}
