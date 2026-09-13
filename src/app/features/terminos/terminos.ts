import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * Términos y condiciones, con la política de reembolsos.
 *
 * Como la política de privacidad, el texto va literal en la plantilla: es un
 * documento legal y tiene que poder leerse seguido. Comparte con ella la hoja de
 * estilos, para que las dos páginas legales no dejen de parecerse.
 *
 * Lo que dice aquí tiene que ser cierto en el código: el registro de uso sin el
 * texto de las consultas, el aviso antes de desactivar una licencia, los topes
 * de uso de cada plan. Si algo de eso cambia, este texto cambia con ello.
 */
@Component({
  selector: 'app-terminos',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './terminos.html',
  styleUrl: '../privacidad/privacidad.css',
})
export class Terminos {
  /** Mismo enlace de contacto que declara la política de privacidad. */
  readonly whatsappLegal = 'https://wa.link/457qlm';
}
