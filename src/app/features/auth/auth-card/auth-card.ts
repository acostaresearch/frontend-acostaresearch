import { Component, input } from '@angular/core';

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
  imports: [SiteHeader, SiteFooter],
  templateUrl: './auth-card.html',
  styleUrl: './auth-card.css',
})
export class AuthCard {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string>('');
  /** Si la pantalla trae columna de apoyo, la tarjeta se aparta a la izquierda. */
  readonly conLateral = input<boolean>(false);
}
