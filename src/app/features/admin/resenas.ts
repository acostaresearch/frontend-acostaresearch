import { Component, computed, inject, input, output, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import {
  EstadoDeResena,
  NOMBRE_DEL_ESTADO,
  ResenaDelPanel,
  ResenaService,
  estrellas,
} from '../../core/services/resena.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/** Las pestañas de la lista. `TODAS` al final: es el cajón, no lo habitual. */
const FILTROS: { clave: EstadoDeResena | 'TODAS'; nombre: string }[] = [
  { clave: 'PENDIENTE', nombre: 'Esperando' },
  { clave: 'APROBADA', nombre: 'Publicadas' },
  { clave: 'RECHAZADA', nombre: 'No publicadas' },
  { clave: 'TODAS', nombre: 'Todas' },
];

/**
 * Las reseñas del servicio, en el panel.
 *
 * Componente aparte y no una sección más dentro de `admin`, por lo mismo que
 * `ReclamosAdmin`: aquella hoja de estilos ya roza el tope de tamaño que
 * permite la compilación, y esto trae su propia ventana.
 *
 * SON DOS DECISIONES, NO UNA
 * --------------------------
 * Aprobar quiere decir «se puede leer en /resenas». Destacar, «además sale en
 * la portada», donde hay sitio para tres o cuatro. Por eso son dos botones y
 * no una casilla: se aprueban muchas y se destacan pocas.
 *
 * EL MOTIVO DE UN RECHAZO LO LEE SU AUTOR
 * ---------------------------------------
 * Sale en su perfil tal y como se escriba aquí. No es una nota interna: es una
 * respuesta a una persona que dedicó un rato a escribir algo, así que el campo
 * lo dice antes de que se escriba.
 */
@Component({
  imports: [AvisoFlotante],
  selector: 'app-resenas-admin',
  templateUrl: './resenas.html',
  styleUrl: './resenas.css',
})
export class ResenasAdmin {
  private readonly api = inject(ResenaService);

  readonly resenas = input.required<ResenaDelPanel[]>();
  /** Se cambió algo. Lleva el mensaje para el aviso del panel, que recarga. */
  readonly cambiada = output<string>();

  readonly filtros = FILTROS;
  readonly nombreDelEstado = NOMBRE_DEL_ESTADO;
  readonly estrellas = estrellas;

  readonly filtro = signal<EstadoDeResena | 'TODAS'>('PENDIENTE');

  readonly abierta = signal<ResenaDelPanel | null>(null);
  readonly motivo = signal('');
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);

  /** Lo que se está mirando. El filtrado es aquí: la lista viene entera. */
  readonly visibles = computed(() => {
    const filtro = this.filtro();
    return filtro === 'TODAS' ? this.resenas() : this.resenas().filter((r) => r.estado === filtro);
  });

  /** Cuántas hay de cada estado, para los números de las pestañas. */
  readonly cuantas = computed(() => {
    const todas = this.resenas();
    return {
      PENDIENTE: todas.filter((r) => r.estado === 'PENDIENTE').length,
      APROBADA: todas.filter((r) => r.estado === 'APROBADA').length,
      RECHAZADA: todas.filter((r) => r.estado === 'RECHAZADA').length,
      TODAS: todas.length,
    };
  });

  readonly destacadas = computed(() => this.resenas().filter((r) => r.destacada).length);

  abrir(resena: ResenaDelPanel): void {
    this.abierta.set(resena);
    this.motivo.set(resena.motivo);
    this.error.set(null);
  }

  cerrar(): void {
    this.abierta.set(null);
  }

  escribirMotivo(evento: Event): void {
    this.motivo.set((evento.target as HTMLTextAreaElement).value);
  }

  /** Aprobar, y de paso destacarla si se pidió así. */
  aprobar(resena: ResenaDelPanel, destacada = false): void {
    this.aplicar(resena, { estado: 'APROBADA', destacada }, (r) =>
      destacada
        ? `Publicada la reseña de ${r.nombre}, y sale en la portada.`
        : `Publicada la reseña de ${r.nombre}.`,
    );
  }

  /** Subir o bajar de la portada una que ya está publicada. */
  destacar(resena: ResenaDelPanel, destacada: boolean): void {
    this.aplicar(resena, { destacada }, (r) =>
      destacada
        ? `La reseña de ${r.nombre} ya sale en la portada.`
        : `La reseña de ${r.nombre} sale en /resenas, pero ya no en la portada.`,
    );
  }

  /** Rechazar, con el motivo que va a leer su autor. */
  rechazar(resena: ResenaDelPanel): void {
    this.aplicar(
      resena,
      { estado: 'RECHAZADA', motivo: this.motivo().trim() },
      (r) => `No se publicó la reseña de ${r.nombre}. Puede cambiarla y volver a enviarla.`,
    );
  }

  /** Retirar de la web una que ya estaba publicada. Vuelve a la cola. */
  retirar(resena: ResenaDelPanel): void {
    this.aplicar(
      resena,
      { estado: 'PENDIENTE' },
      (r) => `La reseña de ${r.nombre} ya no se ve en la web.`,
    );
  }

  private aplicar(
    resena: ResenaDelPanel,
    cambios: { estado?: EstadoDeResena; destacada?: boolean; motivo?: string },
    mensaje: (r: ResenaDelPanel) => string,
  ): void {
    if (this.guardando()) return;

    this.guardando.set(true);
    this.error.set(null);

    this.api.revisar(resena.id, cambios).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrar();
        this.cambiada.emit(mensaje(resena));
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  fecha(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-PE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Lima',
      });
    } catch {
      return iso.slice(0, 10);
    }
  }
}
