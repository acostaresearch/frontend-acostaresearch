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
        Avísame si me atraso o mi acceso está por vencer
        <small>· máximo uno cada 3 días</small>
      </span>
    </label>
    @if (error(); as e) {
      <p class="error">{{ e }}</p>
    }
  `,
  styles: `
    h2 { margin: 0 0 8px; }
    .interruptor { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.5; cursor: pointer; }
    .interruptor small { font-size: 13px; color: var(--color-texto-suave); }
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
