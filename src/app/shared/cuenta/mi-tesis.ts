import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { toApiError } from '../../core/http/api-error';
import { Proyecto, ProyectoService } from '../../core/services/proyecto.service';

/**
 * Por dónde va su tesis.
 *
 * Esto lo escribe el conector, no esta pantalla: según el tesista va cerrando
 * cosas con Claude, el servidor las anota. Aquí solo se leen. Es a propósito —
 * lo que se decide se decide trabajando, y una pantalla donde marcar casillas a
 * mano acabaría diciendo una cosa distinta de la que sabe el asistente.
 *
 * Mientras no haya nada guardado no se enseña nada. Un panel con diez capítulos
 * en gris no informa de nada y da la impresión de que algo va mal.
 */
@Component({
  selector: 'app-mi-tesis',
  imports: [DatePipe],
  templateUrl: './mi-tesis.html',
  styleUrl: './mi-tesis.css',
})
export class MiTesis implements OnInit {
  private readonly proyectos = inject(ProyectoService);

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly lista = signal<Proyecto[]>([]);

  /** Qué capítulos se ven desplegados. Empiezan todos cerrados. */
  private readonly abiertos = signal<ReadonlySet<string>>(new Set());

  readonly hayAlgo = computed(() => this.lista().length > 0);

  ngOnInit(): void {
    this.proyectos.mios().subscribe({
      next: (datos) => {
        this.lista.set(datos);
        this.cargando.set(false);
      },
      error: (e) => {
        // Que esto falle no puede estropear el panel entero: es información de
        // apoyo, y el conector sigue funcionando sin ella.
        this.error.set(toApiError(e).message);
        this.cargando.set(false);
      },
    });
  }

  porcentaje(p: Proyecto): number {
    if (p.avance.total === 0) return 0;
    return Math.round((p.avance.listos / p.avance.total) * 100);
  }

  estaAbierto(code: string): boolean {
    return this.abiertos().has(code);
  }

  alternar(code: string): void {
    const copia = new Set(this.abiertos());
    if (copia.has(code)) copia.delete(code);
    else copia.add(code);
    this.abiertos.set(copia);
  }

  /** La marca que se pinta al lado del capítulo. */
  marca(estado: string): string {
    if (estado === 'LISTO') return 'listo';
    if (estado === 'EN_CURSO') return 'en-curso';
    return 'pendiente';
  }

  etiqueta(estado: string): string {
    if (estado === 'LISTO') return 'Dado por bueno';
    if (estado === 'EN_CURSO') return 'En curso';
    return 'Sin empezar';
  }
}
