import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  inject,
  input,
  signal,
} from '@angular/core';

/**
 * El «…» de una fila del panel, con las acciones que no son la principal.
 *
 * Cada fila enseña UNA acción a la vista —la que se viene a hacer— y el resto
 * va aquí. Así «Revocar» o «Eliminar», que no tienen vuelta atrás, dejan de
 * estar en rojo en cada fila, a un clic despistado de la que se quería.
 *
 * Las acciones se pasan como botones dentro de la etiqueta:
 *
 *   <app-menu-fila>
 *     <button type="button" (click)="…">Editar</button>
 *     <button type="button" class="peligro" (click)="…">Eliminar</button>
 *   </app-menu-fila>
 *
 * La lista se coloca con `position: fixed` junto al botón: las tablas van en
 * una caja con desplazamiento lateral y cualquier otra cosa quedaría recortada
 * por ella. Por lo mismo se cierra al desplazar cualquier cosa de la página.
 *
 * Sin encapsulación de estilos: los botones los pone quien lo usa, y los
 * estilos de un componente no llegan a lo proyectado. Todas las clases llevan
 * el prefijo `menu-fila` para no pisar nada.
 */
@Component({
  selector: 'app-menu-fila',
  encapsulation: ViewEncapsulation.None,
  template: `
    <button
      type="button"
      class="menu-fila-boton"
      aria-haspopup="menu"
      [attr.aria-expanded]="abierto()"
      [attr.aria-label]="etiqueta()"
      [title]="etiqueta()"
      (click)="alternar($event)"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </svg>
    </button>
    <div
      class="menu-fila-lista"
      role="menu"
      [hidden]="!abierto()"
      [style.top.px]="arriba()"
      [style.bottom.px]="abajo()"
      [style.right.px]="derecha()"
      (click)="cerrar()"
    >
      <ng-content />
    </div>
  `,
  styles: `
    app-menu-fila {
      display: inline-flex;
      vertical-align: middle;
    }

    .menu-fila-boton {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      padding: 0;
      color: var(--color-texto);
      background: var(--color-superficie);
      border: 1px solid var(--color-borde);
      border-radius: 9px;
      cursor: pointer;
      transition: background var(--transicion);
    }

    .menu-fila-boton:hover,
    .menu-fila-boton[aria-expanded='true'] {
      background: var(--color-fondo);
    }

    .menu-fila-boton svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }

    .menu-fila-lista {
      position: fixed;
      z-index: 60;
      display: grid;
      min-width: 190px;
      padding: 5px;
      background: var(--color-superficie);
      border: 1px solid var(--color-borde);
      border-radius: 10px;
      box-shadow: var(--sombra);
    }

    .menu-fila-lista[hidden] {
      display: none;
    }

    .menu-fila-lista > button,
    .menu-fila-lista > a {
      display: block;
      width: 100%;
      padding: 8px 11px;
      font: inherit;
      font-size: 13.5px;
      text-align: left;
      color: var(--color-texto);
      background: none;
      border: 0;
      border-radius: 7px;
      text-decoration: none;
      white-space: nowrap;
      cursor: pointer;
    }

    .menu-fila-lista > button:hover:not(:disabled),
    .menu-fila-lista > a:hover {
      background: var(--color-fondo);
    }

    .menu-fila-lista > button:disabled {
      color: var(--color-texto-tenue);
      cursor: not-allowed;
    }

    .menu-fila-lista > .peligro {
      color: var(--color-error);
    }

    .menu-fila-lista > hr {
      margin: 4px 2px;
      border: 0;
      border-top: 1px solid var(--color-borde);
    }
  `,
})
export class MenuFila {
  /** Lo que lee un lector de pantalla en el botón. */
  readonly etiqueta = input('Más acciones');

  readonly abierto = signal(false);
  readonly arriba = signal<number | null>(null);
  readonly abajo = signal<number | null>(null);
  readonly derecha = signal(0);

  private readonly anfitrion = inject(ElementRef<HTMLElement>);
  private quitarEscuchas: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cerrar());
  }

  alternar(evento: MouseEvent): void {
    evento.stopPropagation();
    if (this.abierto()) {
      this.cerrar();
      return;
    }
    this.colocar(evento.currentTarget as HTMLElement);
    this.abierto.set(true);
    this.escuchar();
  }

  cerrar(): void {
    this.abierto.set(false);
    this.quitarEscuchas?.();
    this.quitarEscuchas = null;
  }

  /**
   * Debajo del botón y alineada a su borde derecho; encima si abajo no cabe.
   * 220 px es lo que ocupa una lista de cinco acciones.
   */
  private colocar(boton: HTMLElement): void {
    const caja = boton.getBoundingClientRect();
    this.derecha.set(Math.max(8, window.innerWidth - caja.right));
    if (caja.bottom + 220 > window.innerHeight && caja.top > 220) {
      this.arriba.set(null);
      this.abajo.set(window.innerHeight - caja.top + 4);
    } else {
      this.abajo.set(null);
      this.arriba.set(caja.bottom + 4);
    }
  }

  /** Clic fuera, Escape, desplazar o cambiar el tamaño cierran la lista. */
  private escuchar(): void {
    const fuera = (evento: Event) => {
      if (!this.anfitrion.nativeElement.contains(evento.target as Node)) this.cerrar();
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') this.cerrar();
    };
    const cerrar = () => this.cerrar();

    document.addEventListener('click', fuera, true);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);

    this.quitarEscuchas = () => {
      document.removeEventListener('click', fuera, true);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }
}
