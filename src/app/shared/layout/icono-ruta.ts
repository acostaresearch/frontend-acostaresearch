import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Los iconos de línea de las dos rutas, en un solo sitio.
 *
 * Son dibujos, no contenido: van aquí y no en los archivos de contenido, que
 * guardan la clave («diana», «barras») y nada más. Antes estaban escritos a
 * mano dentro de cada plantilla y las dos páginas repetían los mismos veinte
 * trazados; añadir una fase obligaba a copiarlos otra vez.
 *
 * El tamaño y el color los pone quien lo usa: el `svg` hereda `currentColor` y
 * llena el hueco que le den.
 */
@Component({
  selector: 'app-icono-ruta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (clave()) {
        @case ('diana') {
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3.5" />
          <circle cx="12" cy="12" r="0.6" fill="currentColor" />
        }
        @case ('estrella') {
          <path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5L10 13l-5.5-2L10 9z" />
        }
        @case ('libro') {
          <path d="M5 4.5h6.5a2 2 0 0 1 2 2V20a2.4 2.4 0 0 0-2-1H5z" />
          <path d="M19 4.5h-5.5a2 2 0 0 0-2 2V20a2.4 2.4 0 0 1 2-1H19z" />
        }
        @case ('lineas') {
          <path d="M4 7h16M4 12h16M4 17h10" />
        }
        @case ('formulario') {
          <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
          <path d="M8.5 8h7M8.5 12h4" />
          <path d="m8.5 16.4 1.6 1.6 3-3.2" />
        }
        @case ('pin') {
          <path d="M12 21s6.5-5.6 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.4 12 21 12 21z" />
          <circle cx="12" cy="10.5" r="2.4" />
        }
        @case ('barras') {
          <path d="M5 19V11M10 19V6M15 19v-5M20 19v-9" />
        }
        @case ('chat') {
          <path
            d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v6A2.5 2.5 0 0 1 17 15H9l-4.5 4z"
          />
          <path d="M9 9h6" />
        }
        @case ('ciclo') {
          <path d="M4.5 9.5A7.5 7.5 0 0 1 18 7.2" />
          <path d="M19.5 14.5A7.5 7.5 0 0 1 6 16.8" />
          <path d="M18 3.5v4h-4M6 20.5v-4h4" />
        }
        @case ('check') {
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.3 12.2 2.5 2.5 4.9-5.4" />
        }
        @case ('escudo') {
          <path d="M12 3.5 5.5 6v6c0 4 2.8 7 6.5 8.5 3.7-1.5 6.5-4.5 6.5-8.5V6z" />
          <path d="m9 12.2 2.2 2.2 4-4.4" />
        }
        @case ('red') {
          <circle cx="6" cy="7" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <circle cx="12" cy="13" r="2.6" />
          <circle cx="7" cy="18.5" r="2" />
          <path d="M7.8 8.4 10 11.3M16.4 7.6 13.7 11M10.6 15 8.4 16.9" />
        }
        @case ('avion') {
          <path d="M20.5 3.5 3.5 10.2l6.4 2.6 2.4 6.4z" />
          <path d="m9.9 12.8 4.4-4.4" />
        }
        @case ('pulso') {
          <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
        }
        @case ('archivo') {
          <rect x="4" y="4" width="16" height="16" rx="2.5" />
          <path d="M8 9h8M8 13h8M8 17h4" />
        }
        @case ('buscar') {
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-3.6-3.6" />
        }
        @case ('marcador') {
          <path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z" />
        }
        @case ('documento') {
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h4" />
        }
        @default {
          <path d="M4.5 19.5h4L19 9a2.1 2.1 0 0 0-3-3L5.5 16.5z" />
          <path d="m14.5 6.5 3 3" />
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class IconoRuta {
  readonly clave = input.required<string>();
}
