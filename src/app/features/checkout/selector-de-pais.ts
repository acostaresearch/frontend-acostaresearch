import { Component, ElementRef, HostListener, computed, inject, model, signal } from '@angular/core';

import { PAISES_DE_PAGO, PaisDePago } from './pais-de-pago';

const OPCIONES = PAISES_DE_PAGO;

/**
 * «Pagas desde»: el país del comprador, con su bandera.
 *
 * Viene puesto en el país detectado por la conexión y se puede cambiar: los
 * medios de pago de debajo salen según él (ver `PaisDePago`). Aquí solo se
 * elige; qué se enseña con cada país lo decide el checkout.
 *
 * Las banderas son imágenes de `public/banderas/` y no emojis: en Windows los
 * emojis de bandera no se pintan, salen las letras «PE», «EC».
 */
@Component({
  selector: 'app-selector-de-pais',
  template: `
    <div class="selector">
      <span class="rotulo" id="rotulo-pais">Pagas desde</span>
      <button
        type="button"
        class="elegido"
        aria-haspopup="listbox"
        aria-labelledby="rotulo-pais"
        [attr.aria-expanded]="abierto()"
        (click)="abierto.set(!abierto())"
      >
        @if (elegido(); as pais) {
          <img [src]="bandera(pais.codigo)" alt="" width="24" height="18" />
          <span>{{ pais.nombre }}</span>
        } @else {
          <span class="mundo" aria-hidden="true"></span>
          <span>{{ codigo() === null ? 'Elige tu país' : 'Otro país' }}</span>
        }
        <svg class="flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      <!-- La lista solo existe abierta: así las banderas no se piden hasta
           que alguien las quiere ver. -->
      @if (abierto()) {
        <ul class="lista" role="listbox" aria-labelledby="rotulo-pais">
          @for (pais of opciones; track pais.codigo) {
            <li
              role="option"
              tabindex="0"
              [attr.aria-selected]="codigo() === pais.codigo"
              [class.activa]="codigo() === pais.codigo"
              (click)="elegir(pais.codigo)"
              (keydown.enter)="elegir(pais.codigo)"
            >
              <img [src]="bandera(pais.codigo)" alt="" width="24" height="18" loading="lazy" />
              {{ pais.nombre }}
            </li>
          }
          <li
            role="option"
            tabindex="0"
            [attr.aria-selected]="codigo() === ''"
            [class.activa]="codigo() === ''"
            (click)="elegir('')"
            (keydown.enter)="elegir('')"
          >
            <span class="mundo" aria-hidden="true"></span>
            Otro país
          </li>
        </ul>
      }
    </div>
  `,
  styles: `
    .selector {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .rotulo {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-texto-suave);
    }

    .elegido {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      font: inherit;
      font-size: 13.5px;
      font-weight: 600;
      color: var(--color-texto);
      cursor: pointer;
      background: var(--color-superficie);
      border: 1px solid var(--color-borde);
      border-radius: 10px;
      transition:
        border-color var(--transicion),
        box-shadow var(--transicion);
    }

    .elegido:hover,
    .elegido[aria-expanded='true'] {
      border-color: var(--color-primario);
    }

    .elegido:focus-visible {
      outline: none;
      border-color: var(--color-primario);
      box-shadow: 0 0 0 3px var(--color-primario-suave);
    }

    /* El borde fino es para las banderas con blanco, que se pierden en el fondo. */
    img,
    .mundo {
      flex: none;
      width: 24px;
      height: 18px;
      border-radius: 3px;
      box-shadow: 0 0 0 1px var(--color-borde);
    }

    img {
      object-fit: cover;
    }

    /* «Otro país»: sin bandera, un hueco del mismo tamaño. */
    .mundo {
      background: var(--color-fondo);
    }

    .flecha {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: var(--color-texto-tenue);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .lista {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 50;
      width: min(260px, 100%);
      max-height: 280px;
      margin: 0;
      padding: 4px;
      overflow-y: auto;
      list-style: none;
      background: var(--color-superficie);
      border: 1px solid var(--color-borde);
      border-radius: 10px;
      box-shadow: var(--sombra);
    }

    .lista li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      font-size: 13.5px;
      color: var(--color-texto);
      cursor: pointer;
      border-radius: 8px;
    }

    .lista li:hover,
    .lista li:focus-visible {
      outline: none;
      background: var(--color-fondo);
    }

    .lista li.activa {
      font-weight: 600;
      color: var(--color-primario);
      background: var(--color-primario-suave);
    }
  `,
})
export class SelectorDePais {
  private readonly raiz = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly opciones = OPCIONES;
  /** El país elegido, por su código. Vacío = «Otro país»; `null` = sin elegir. */
  readonly codigo = model<PaisDePago>(null);
  readonly abierto = signal(false);

  readonly elegido = computed(() => OPCIONES.find((pais) => pais.codigo === this.codigo()) ?? null);

  bandera(codigo: string): string {
    return `/banderas/${codigo.toLowerCase()}.svg`;
  }

  elegir(codigo: string): void {
    this.codigo.set(codigo);
    this.abierto.set(false);
  }

  /** Un clic fuera, o Escape, la cierra. */
  @HostListener('document:click', ['$event'])
  alPulsarFuera(evento: Event): void {
    if (this.abierto() && !this.raiz.nativeElement.contains(evento.target as Node)) {
      this.abierto.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    this.abierto.set(false);
  }
}
