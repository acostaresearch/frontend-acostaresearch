import { Component, inject } from '@angular/core';

import { AvisosService } from '../../core/services/avisos.service';

/**
 * La pila de avisos del sitio, montada una sola vez en la raíz.
 *
 * Flota sobre lo que haya, se ve esté donde esté el scroll y no empuja la
 * página. No decide nada: enseña lo que `AvisosService` tiene en la lista.
 */
@Component({
  selector: 'app-avisos',
  template: `
    <div class="af-pila">
      @for (aviso of avisos(); track aviso.id) {
        <div
          class="af-aviso"
          [class.af-error]="aviso.tipo === 'error'"
          [class.af-exito]="aviso.tipo === 'exito'"
          [class.af-info]="aviso.tipo === 'info'"
          [attr.role]="aviso.tipo === 'error' ? 'alert' : 'status'"
        >
          <span class="af-icono" aria-hidden="true">{{
            aviso.tipo === 'error' ? '!' : aviso.tipo === 'exito' ? '✓' : 'i'
          }}</span>
          <p>{{ aviso.texto }}</p>
          <button type="button" class="af-cerrar" aria-label="Cerrar" (click)="cerrar(aviso.id)">
            ✕
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './avisos.css',
})
export class Avisos {
  private readonly servicio = inject(AvisosService);
  protected readonly avisos = this.servicio.avisos;

  protected cerrar(id: number): void {
    this.servicio.cerrar(id);
  }
}
