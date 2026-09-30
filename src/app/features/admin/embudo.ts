import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import {
  Embudo,
  NOMBRE_DEL_AVISO,
  ReferidoDelPanel,
  RetencionService,
  TipoDeAviso,
} from '../../core/services/retencion.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

const PERIODOS = [7, 30, 90] as const;

/**
 * El embudo de venta, en el panel: de ver /planes a terminar una fase.
 *
 * Componente aparte, como reclamos y reseñas: carga lo suyo al abrirse y no
 * engorda la hoja de estilos del panel, que ya roza el tope de la compilación.
 *
 * Debajo, lo que se hace para mover esas cifras: los correos de avance que
 * salieron en el periodo y los referidos (con el botón de anular uno que no
 * debió contar).
 */
@Component({
  selector: 'app-embudo-admin',
  imports: [AvisoFlotante, DatePipe],
  templateUrl: './embudo.html',
  styleUrl: './embudo.css',
})
export class EmbudoAdmin implements OnInit {
  private readonly api = inject(RetencionService);

  readonly periodos = PERIODOS;
  readonly dias = signal<number>(30);
  readonly embudo = signal<Embudo | null>(null);
  readonly referidos = signal<ReferidoDelPanel[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  /** El paso más alto marca el 100 % del ancho de las barras. */
  readonly maximo = computed(() => Math.max(1, ...(this.embudo()?.pasos.map((p) => p.valor) ?? [1])));

  readonly avisos = computed(() => {
    const cuenta = this.embudo()?.avisos ?? {};
    return (Object.keys(NOMBRE_DEL_AVISO) as TipoDeAviso[]).map((tipo) => ({
      tipo,
      nombre: NOMBRE_DEL_AVISO[tipo],
      valor: cuenta[tipo] ?? 0,
    }));
  });

  ngOnInit(): void {
    this.cargar();
    this.api.referidosDelPanel().subscribe({
      next: (lista) => this.referidos.set(lista),
      error: () => this.referidos.set([]),
    });
  }

  elegir(dias: number): void {
    if (dias === this.dias()) return;
    this.dias.set(dias);
    this.cargar();
  }

  ancho(valor: number): number {
    return Math.max(2, Math.round((valor / this.maximo()) * 100));
  }

  anular(referido: ReferidoDelPanel): void {
    this.api.anularReferido(referido.id).subscribe({
      next: () => {
        this.referidos.update((lista) =>
          lista.map((r) => (r.id === referido.id ? { ...r, estado: 'ANULADO' } : r)),
        );
        this.aviso.set(`Anulado: ${referido.invitado.email} ya no dará días a nadie.`);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.api.embudo(this.dias()).subscribe({
      next: (datos) => {
        this.embudo.set(datos);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }
}
