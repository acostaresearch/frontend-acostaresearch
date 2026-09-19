import { Component, effect, model } from '@angular/core';

/** Lo que tarda en irse un aviso de que algo salió bien. */
const DURACION_EXITO_MS = 6000;

/**
 * El resultado de una acción, en una notificación que baja desde arriba.
 *
 * Antes era un recuadro fijo encima del panel: quien aprobaba un comprobante
 * con la lista bajada no lo veía, y al aparecer empujaba toda la página. Esto
 * flota sobre lo que haya, se ve esté donde esté el scroll y no mueve nada.
 *
 * Los avisos de éxito se van solos; los errores se quedan hasta que se cierran,
 * porque hay que leerlos. Se enlaza con las mismas señales de siempre:
 * `<app-aviso-flotante [(error)]="error" [(aviso)]="aviso" />`.
 */
@Component({
  selector: 'app-aviso-flotante',
  template: `
    <div class="af-pila">
      @if (error(); as mensaje) {
        <div class="af-aviso af-error" role="alert">
          <span class="af-icono" aria-hidden="true">!</span>
          <p>{{ mensaje }}</p>
          <button type="button" class="af-cerrar" aria-label="Cerrar" (click)="error.set(null)">✕</button>
        </div>
      }
      @if (aviso(); as mensaje) {
        <div class="af-aviso af-exito" role="status">
          <span class="af-icono" aria-hidden="true">✓</span>
          <p>{{ mensaje }}</p>
          <button type="button" class="af-cerrar" aria-label="Cerrar" (click)="aviso.set(null)">✕</button>
        </div>
      }
    </div>
  `,
  styleUrl: './aviso-flotante.css',
})
export class AvisoFlotante {
  readonly error = model<string | null>(null);
  readonly aviso = model<string | null>(null);

  constructor() {
    effect((alLimpiar) => {
      const mensaje = this.aviso();
      if (!mensaje) return;
      const reloj = setTimeout(() => {
        // Solo si sigue siendo el mismo: si llegó otro, ese tiene su propio reloj.
        if (this.aviso() === mensaje) this.aviso.set(null);
      }, DURACION_EXITO_MS);
      alLimpiar(() => clearTimeout(reloj));
    });
  }
}
