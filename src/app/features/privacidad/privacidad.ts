import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';
import { environment } from '../../../environments/environment';

/**
 * Política de privacidad.
 *
 * Es un documento legal, así que el texto va literal en la plantilla y no
 * troceado en listas del componente: quien lo revise tiene que poder leerlo
 * seguido, y una coma movida por comodidad de maquetación aquí sí importa.
 */
@Component({
  selector: 'app-privacidad',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './privacidad.html',
  styleUrl: './privacidad.css',
})
export class Privacidad {
  /** Enlace declarado en la propia política como vía de contacto. */
  readonly whatsappLegal = 'https://wa.link/457qlm';
  readonly redes = environment.redes;
}
