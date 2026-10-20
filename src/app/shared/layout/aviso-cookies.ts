import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AnaliticaService } from '../../core/services/analitica.service';
import { TourService } from '../../core/services/tour.service';

/**
 * El aviso de cookies de Google Analytics, montado una sola vez en la raíz.
 *
 * Sale hasta que la persona elige, y los dos botones pesan lo mismo: rechazar
 * tiene que ser tan fácil como aceptar. Se esconde mientras corre el recorrido
 * guiado, que es otra capa encima de la página y se taparían. Ver
 * `AnaliticaService`.
 */
@Component({
  selector: 'app-aviso-cookies',
  imports: [RouterLink],
  template: `
    @if (analitica.pendiente() && !tour.activo()) {
      <section class="ac-aviso" role="region" aria-label="Aviso de cookies">
        <p>
          Usamos cookies de Google Analytics para saber cómo se usa la web y mejorarla. Solo se
          activan si aceptas.
          <a routerLink="/privacidad" fragment="cookies">Más información</a>
        </p>
        <div class="ac-botones">
          <button type="button" class="ac-boton" (click)="analitica.rechazar()">Rechazar</button>
          <button type="button" class="ac-boton" (click)="analitica.aceptar()">Aceptar</button>
        </div>
      </section>
    }
  `,
  styleUrl: './aviso-cookies.css',
})
export class AvisoCookies {
  protected readonly analitica = inject(AnaliticaService);
  protected readonly tour = inject(TourService);
}
