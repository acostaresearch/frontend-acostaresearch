import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Pie de una página pública: adónde ir después.
 *
 * Al partir la portada en varias páginas se pierde algo que el desplazamiento
 * daba gratis: el orden en que hay que leerlas. Esto lo devuelve — cada página
 * termina señalando la siguiente, de modo que se pueden recorrer todas sin
 * volver al menú ni una sola vez.
 */
@Component({
  selector: 'app-paso-siguiente',
  imports: [RouterLink],
  template: `
    <nav class="salto">
      <div>
        <p class="salto-marca">Siguiente</p>
        <p class="salto-titulo">{{ titulo() }}</p>
        <p class="salto-texto">{{ texto() }}</p>
      </div>
      <a class="boton" [routerLink]="enlace()">{{ etiqueta() }}</a>
    </nav>
  `,
  styles: `
    .salto {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
      align-items: center;
      justify-content: space-between;
      margin: 8px 0 64px;
      padding: 26px 28px;
      background: var(--color-superficie);
      border: 1px solid var(--color-borde);
      border-radius: var(--radio);
    }

    .salto-marca {
      margin: 0 0 4px;
      font-size: 11.5px;
      font-weight: 650;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      color: var(--color-primario);
    }

    .salto-titulo {
      margin: 0 0 4px;
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--color-texto);
    }

    .salto-texto {
      max-width: 52ch;
      margin: 0;
      font-size: 14px;
      line-height: 1.55;
      color: var(--color-texto-suave);
    }
  `,
})
export class PasoSiguiente {
  readonly titulo = input.required<string>();
  readonly texto = input.required<string>();
  readonly enlace = input.required<string>();
  readonly etiqueta = input('Continuar');
}
