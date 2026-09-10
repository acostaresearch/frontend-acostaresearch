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
    <nav class="seccion noche corta">
      <div class="salto">
        <div>
          <p class="salto-marca">Siguiente</p>
          <p class="salto-titulo">{{ titulo() }}</p>
          <p class="salto-texto">{{ texto() }}</p>
        </div>
        <a class="boton oro" [routerLink]="enlace()">{{ etiqueta() }}</a>
      </div>
    </nav>
  `,
  styles: `
    /* El anfitrion no pinta caja por defecto, y sin esto la banda no llega a
       los bordes de la pagina. */
    :host {
      display: block;
    }

    /* Es una banda de la página, no una tarjeta dentro de ella: la rejilla y el
       fondo los pone .seccion.noche de los estilos globales, para que sea la
       misma banda de cierre en las seis páginas. */
    .salto {
      display: flex;
      flex-wrap: wrap;
      gap: 24px 40px;
      align-items: center;
      justify-content: space-between;
    }

    .salto-marca {
      margin: 0 0 6px;
      font-size: 14.5px;
      font-weight: 700;
      color: var(--dorado);
    }

    .salto-titulo {
      margin: 0 0 6px;
      font-size: clamp(26px, 2.4vw, 34px);
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.015em;
      color: #fff;
    }

    .salto-texto {
      max-width: 56ch;
      margin: 0;
      font-size: 17px;
      line-height: 1.55;
      color: var(--gris-noche);
    }

    .boton {
      flex: 0 0 auto;
      width: auto;
      padding: 13px 26px;
      font-size: 15.5px;
    }
  `,
})
export class PasoSiguiente {
  readonly titulo = input.required<string>();
  readonly texto = input.required<string>();
  readonly enlace = input.required<string>();
  readonly etiqueta = input('Continuar');
}
