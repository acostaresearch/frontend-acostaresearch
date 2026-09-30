import { Component, OnInit, inject, signal } from '@angular/core';

import { toApiError } from '../../core/http/api-error';
import { RetencionService } from '../../core/services/retencion.service';

/**
 * El interruptor de los recordatorios de avance («llevas 7 días sin avanzar»,
 * «te falta el formato», «tu acceso termina en 5 días»). Va en «¿Necesitas
 * ayuda?», que es donde el enlace de baja del correo dice que está.
 */
@Component({
  selector: 'app-mis-recordatorios',
  template: `
    <h2>Recordatorios por correo</h2>
    <label class="interruptor">
      <input
        type="checkbox"
        [checked]="activos()"
        [disabled]="activos() === null || guardando()"
        (change)="cambiar($any($event.target).checked)"
      />
      <span>
        Avísame si llevo días sin avanzar, si me falta subir el formato de mi universidad o si mi
        acceso está por terminar.
      </span>
    </label>
    <p class="nota">Como mucho un correo cada tres días. Los de tus compras llegan siempre.</p>
    @if (error(); as e) {
      <p class="error">{{ e }}</p>
    }
  `,
  styles: `
    h2 { margin: 0 0 10px; }
    .interruptor { display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; line-height: 1.5; cursor: pointer; }
    .interruptor input { width: 18px; height: 18px; margin-top: 2px; flex: 0 0 auto; }
    .error { margin: 8px 0 0; font-size: 13.5px; color: var(--color-error); }
  `,
})
export class MisRecordatorios implements OnInit {
  private readonly api = inject(RetencionService);
  readonly activos = signal<boolean | null>(null);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.recordatorios().subscribe({
      next: (activos) => this.activos.set(activos),
      error: () => this.activos.set(null),
    });
  }

  cambiar(activos: boolean): void {
    this.guardando.set(true);
    this.error.set(null);
    this.api.cambiarRecordatorios(activos).subscribe({
      next: (valor) => {
        this.activos.set(valor);
        this.guardando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.guardando.set(false);
      },
    });
  }
}
