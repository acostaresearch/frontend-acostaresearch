import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SiteFooter } from '../../../shared/layout/site-footer';
import { SiteHeader } from '../../../shared/layout/site-header';

/**
 * Marco visual compartido por las pantallas de autenticación.
 *
 * Lleva la cabecera y el pie del sitio como cualquier otra página. Antes no los
 * llevaba, y eso dejaba al visitante en un callejón sin salida: quien llegaba
 * al login desde un enlace y quería volver a mirar el precio o leer quién está
 * detrás, no tenía por dónde. Una pantalla de acceso es parte de la venta, no
 * un trámite aparte.
 */
@Component({
  selector: 'app-auth-card',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './auth-card.html',
  styleUrl: './auth-card.css',
})
export class AuthCard {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string>('');

  /**
   * Cuál de las dos pestañas de acceso está abierta, si es que hay pestañas.
   *
   * Manda dos cosas a la vez, y no por descuido: las pestañas y el panel
   * oscuro son la misma decisión. «Entrar» y «Crear cuenta» son dos caras de
   * lo mismo y se salta de una a otra; «confirmar el correo» no es una tercera
   * cara —se llega desde un enlace del correo, con la cuenta ya creada—, así
   * que no declara pestaña y se queda con la tarjeta sola y centrada: ni
   * pestañas que le mandarían a empezar de nuevo, ni panel.
   */
  readonly pestana = input<'entrar' | 'crear' | ''>('');
}
