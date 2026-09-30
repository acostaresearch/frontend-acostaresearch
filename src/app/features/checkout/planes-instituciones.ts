import { Component } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * «Para universidades y asesores», debajo de los precios.
 *
 * No hay botón de compra: una venta por grupo se cotiza (cuántos alumnos,
 * cuánto tiempo, factura o no), así que la acción es escribir. Lo que se
 * compra está hecho: cupos que cada alumno usa con su cuenta y un panel del
 * coordinador con el avance de cada uno. El alta la hace el administrador
 * desde /admin → Universidades y asesores.
 */
@Component({
  selector: 'app-planes-instituciones',
  template: `
    <section class="instituciones" aria-labelledby="titulo-instituciones">
      <div class="texto">
        <p class="antetitulo">Universidades y asesores</p>
        <h2 id="titulo-instituciones">¿Acompañas a varios tesistas?</h2>
        <p>
          Compra cupos para tu grupo: una maestría, un taller de tesis o tus asesorados. Tú repartes un
          solo enlace, cada alumno entra con su cuenta y recibe su propio método, y tú ves desde tu
          perfil cómo va cada uno.
        </p>
        <ul>
          <li>Cada alumno con su conector, su tesis y su Word.</li>
          <li>Tu panel: quién ya conectó Claude, cuántas fases cerró y en cuál está.</li>
          <li>Tú ves el avance, nunca el texto de nadie.</li>
          <li>Precio por volumen y comprobante para tu institución.</li>
        </ul>
      </div>
      <a class="boton" [href]="contacto" target="_blank" rel="noopener">Pedir una cotización</a>
    </section>
  `,
  styles: `
    .instituciones {
      display: flex; flex-wrap: wrap; gap: 20px 32px; align-items: center; justify-content: space-between;
      margin: 36px 0 0; padding: 28px; background: var(--color-superficie);
      border: 1px solid var(--color-borde); border-radius: var(--radio);
    }
    .texto { flex: 1 1 420px; min-width: 0; }
    .antetitulo {
      margin: 0 0 6px; font-size: 12.5px; font-weight: 700; letter-spacing: 0.04em;
      text-transform: uppercase; color: var(--color-primario);
    }
    h2 { margin: 0 0 10px; font-size: 21px; color: var(--color-texto); }
    p { margin: 0 0 12px; font-size: 15px; line-height: 1.6; color: var(--color-texto-suave); }
    ul { margin: 0; padding-left: 20px; font-size: 14.5px; line-height: 1.7; color: var(--color-texto); }
    .boton { width: auto; flex: 0 0 auto; text-decoration: none; }
    @media (max-width: 600px) {
      .instituciones { padding: 20px 16px; }
      .boton { width: 100%; }
    }
  `,
})
export class PlanesInstituciones {
  readonly contacto = `${environment.whatsappUrl}?text=${encodeURIComponent(
    'Hola, quiero cupos del método para un grupo de tesistas. Somos: ',
  )}`;
}
