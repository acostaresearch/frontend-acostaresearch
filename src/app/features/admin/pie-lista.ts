import { Component, input } from '@angular/core';

import { ListadoDesplegable } from './listado';

/**
 * Pie de una tabla del panel: cuántas se ven y el botón de desplegar.
 *
 * El recuento va aunque no haya nada que desplegar. Sin él, «10 filas» y «10 de
 * 340» se ven exactamente igual, que es la forma silenciosa de que alguien dé
 * por cerrada una búsqueda a la que le faltaban trescientas.
 */
@Component({
  selector: 'app-pie-lista',
  template: `
    <div class="pie">
      <span class="cuenta">
        {{ lista().visible().length }} de {{ lista().filtrado().length }} {{ nombre() }}
      </span>

      @if (lista().restan(); as restan) {
        <button type="button" class="boton secundario" (click)="lista().verMas()">
          Ver {{ restan < lista().porTanda ? restan : lista().porTanda }} más
        </button>
      } @else if (lista().visible().length > lista().porTanda) {
        <button type="button" class="boton secundario" (click)="lista().plegar()">Plegar</button>
      }
    </div>
  `,
  styles: `
    .pie {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-top: 14px;
      margin-top: 4px;
      border-top: 1px solid var(--color-borde);
    }

    .cuenta {
      font-size: 12.5px;
      color: var(--color-texto-tenue);
    }

    .boton {
      width: auto;
      padding: 8px 16px;
      font-size: 13px;
    }
  `,
})
export class PieLista {
  readonly lista = input.required<ListadoDesplegable>();
  /** Qué se está contando: «licencias», «pagos»… Va detrás del recuento. */
  readonly nombre = input('');
}
