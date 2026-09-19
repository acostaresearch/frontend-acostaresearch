import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { CIFRAS_AUTOR } from '../../shared/contenido/metodo';
import { IconoRuta } from '../../shared/layout/icono-ruta';
import { LineasNoche } from '../../shared/layout/lineas-noche';
import { PublicacionesAutor } from '../../shared/layout/publicaciones-autor';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Quién firma el método. Es la página que sostiene todo lo demás. */
@Component({
  selector: 'app-quien-soy',
  imports: [RouterLink, SiteHeader, SiteFooter, PublicacionesAutor, IconoRuta, LineasNoche],
  templateUrl: './quien-soy.html',
  styleUrls: ['../../shared/estilos/ruta.css', './quien-soy.css'],
})
export class QuienSoy {
  readonly redes = environment.redes;
  readonly cifras = CIFRAS_AUTOR;
}
