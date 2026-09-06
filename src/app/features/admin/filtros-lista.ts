import { Component, input } from '@angular/core';

import { ListadoFiltrable } from './listado';

/**
 * Barra de búsqueda y pestañas de estado de una tabla del panel.
 *
 * Recibe el `Listado` y no sabe qué hay dentro: le pregunta por el texto, las
 * pestañas y sus cuentas. Así la de licencias y la de pagos son la misma barra,
 * y no dos que se parecen hasta que alguien toca una.
 */
@Component({
  selector: 'app-filtros-lista',
  template: `
    <div class="filtros">
      <div class="buscador">
        <input
          type="search"
          [value]="lista().busca()"
          (input)="lista().buscar($event)"
          [placeholder]="placeholder()"
          [attr.aria-label]="placeholder()"
        />
        @if (lista().busca()) {
          <button
            type="button"
            class="limpiar"
            aria-label="Limpiar la búsqueda"
            (click)="lista().limpiar()"
          >
            ✕
          </button>
        }
      </div>

      <div class="pestanas" role="group" aria-label="Filtrar">
        @for (opcion of lista().filtros; track opcion.valor) {
          <button
            type="button"
            [class.activa]="lista().filtro() === opcion.valor"
            (click)="lista().filtrar(opcion.valor)"
          >
            {{ opcion.etiqueta }}
            <span class="cuenta">{{ lista().conteo()[opcion.valor] }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    .filtros {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }

    .buscador {
      position: relative;
      flex: 1 1 260px;
      min-width: 0;
    }

    .buscador input {
      width: 100%;
      padding: 9px 34px 9px 12px;
      font: inherit;
      font-size: 13.5px;
      color: var(--color-texto);
      background: var(--color-superficie);
      border: 1px solid var(--color-borde-fuerte);
      border-radius: var(--radio-sm);
      transition:
        border-color var(--transicion),
        box-shadow var(--transicion);
    }

    .buscador input::placeholder {
      color: var(--color-texto-tenue);
    }

    .buscador input:focus {
      outline: none;
      border-color: var(--color-primario);
      box-shadow: 0 0 0 3px var(--color-primario-suave);
    }

    /* La cruz nativa del type="search" no se puede maquetar y no sale en todos
       los navegadores; esta sí, y solo cuando hay algo escrito. */
    .buscador input::-webkit-search-cancel-button {
      display: none;
    }

    .buscador .limpiar {
      position: absolute;
      top: 50%;
      right: 6px;
      transform: translateY(-50%);
      padding: 4px 6px;
      font-size: 12px;
      line-height: 1;
      color: var(--color-texto-tenue);
      background: none;
      border: none;
      border-radius: var(--radio-sm);
      cursor: pointer;
    }

    .buscador .limpiar:hover {
      color: var(--color-texto);
      background: var(--color-fondo);
    }

    /* Las pestañas son una barra de segmentos, no cuatro botones sueltos: así
       se leen como un mismo mando de un solo valor. */
    .pestanas {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 3px;
      background: var(--color-fondo);
      border: 1px solid var(--color-borde);
      border-radius: 999px;
    }

    .pestanas button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 13px;
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--color-texto-suave);
      background: none;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      transition:
        background var(--transicion),
        color var(--transicion);
    }

    .pestanas button:hover {
      color: var(--color-texto);
    }

    .pestanas button.activa {
      color: var(--color-primario);
      background: var(--color-superficie);
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
    }

    .pestanas .cuenta {
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      color: var(--color-texto-tenue);
    }

    .pestanas button.activa .cuenta {
      color: var(--color-primario);
    }

    @media (max-width: 640px) {
      .filtros {
        align-items: stretch;
      }

      .pestanas {
        justify-content: space-between;
      }
    }
  `,
})
export class FiltrosLista {
  readonly lista = input.required<ListadoFiltrable>();
  readonly placeholder = input('Buscar');
}
