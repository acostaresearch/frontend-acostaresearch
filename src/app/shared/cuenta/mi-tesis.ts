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

  /** Mientras se arma el Word, para no pedirlo dos veces de un doble clic. */
  readonly bajando = signal<string | null>(null);
  readonly errorDescarga = signal<string | null>(null);

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

  /** Palabras escritas en todo el proyecto. Cero = no hay nada que descargar. */
  palabrasTotales(p: Proyecto): number {
    return p.etapas.reduce((suma, e) => suma + (e.palabras ?? 0), 0);
  }

  /**
   * Baja el Word.
   *
   * El archivo llega como datos, no como un enlace: la ruta va autenticada y un
   * `<a href>` normal no lleva la sesión. Se crea una dirección temporal en el
   * navegador, se pulsa sola y se suelta enseguida — si no se suelta, el archivo
   * se queda en memoria hasta que el tesista recargue la página.
   */
  descargar(p: Proyecto): void {
    if (this.bajando()) return;

    this.bajando.set(p.productCode);
    this.errorDescarga.set(null);

    this.proyectos.word(p.productCode).subscribe({
      next: ({ archivo, nombre }) => {
        const url = URL.createObjectURL(archivo);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombre;
        enlace.click();
        URL.revokeObjectURL(url);
        this.bajando.set(null);
      },
      error: (e) => {
        this.bajando.set(null);
        void this.explicar(e).then((mensaje) => this.errorDescarga.set(mensaje));
      },
    });
  }

  /**
   * Saca el mensaje de un error de descarga.
   *
   * Al pedir el archivo en crudo, el cuerpo de un error también llega en crudo:
   * el «todavía no hay ningún capítulo escrito» del servidor viene envuelto como
   * datos binarios, y leerlo con el camino de siempre daría un mensaje genérico
   * justo en el caso más probable.
   */
  private async explicar(error: unknown): Promise<string> {
    const cuerpo = (error as { error?: unknown })?.error;

    if (cuerpo instanceof Blob) {
      try {
        const { message } = JSON.parse(await cuerpo.text());
        if (message) return message;
      } catch {
        // Cuerpo que no era JSON: se cae al mensaje de abajo.
      }
    }

    return (
      toApiError(error).message ||
      'No se pudo armar el documento. Inténtalo otra vez en un momento.'
    );
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
