import { Component, inject, input, output, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import {
  NOMBRE_DEL_BIEN,
  NOMBRE_DEL_DOCUMENTO,
  NOMBRE_DEL_TIPO,
  Reclamo,
  ReclamoService,
  fechaEnLima,
  soles,
} from '../../core/services/reclamo.service';

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Medianoche del día que es en Lima, para contar días de calendario sin horas. */
function diaEnLima(fecha: Date): number {
  const [anio, mes, dia] = fecha
    .toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    .split('-')
    .map(Number);
  return Date.UTC(anio, mes - 1, dia);
}

/**
 * Las hojas del Libro de Reclamaciones, en el panel.
 *
 * Componente aparte y no una sección más dentro de `admin`: aquella hoja de
 * estilos ya roza el tope de tamaño que permite la compilación, y esto trae su
 * propia ventana. La lista la carga el panel —la necesita para el contador de
 * la barra lateral— y aquí solo se pinta y se responde.
 *
 * No hay editar ni borrar. Es un libro: la hoja y su respuesta se quedan como
 * se escribieron, y eso es lo que las hace valer.
 */
@Component({
  selector: 'app-reclamos-admin',
  templateUrl: './reclamos.html',
  styleUrl: './reclamos.css',
})
export class ReclamosAdmin {
  private readonly api = inject(ReclamoService);

  readonly reclamos = input.required<Reclamo[]>();
  /** Se respondió una. Lleva el mensaje para el aviso del panel, que recarga la lista. */
  readonly respondido = output<string>();

  readonly tipo = NOMBRE_DEL_TIPO;
  readonly bien = NOMBRE_DEL_BIEN;
  readonly documento = NOMBRE_DEL_DOCUMENTO;
  readonly fecha = fechaEnLima;
  readonly soles = soles;

  readonly abierto = signal<Reclamo | null>(null);
  readonly respuesta = signal('');
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);

  abrir(reclamo: Reclamo): void {
    this.abierto.set(reclamo);
    this.respuesta.set('');
    this.error.set(null);
  }

  cerrar(): void {
    this.abierto.set(null);
  }

  escribir(evento: Event): void {
    this.respuesta.set((evento.target as HTMLTextAreaElement).value);
  }

  /** Días de calendario hasta el límite, en Lima. 0 = vence hoy; negativo = ya pasó. */
  diasRestantes(reclamo: Reclamo): number {
    return Math.round((diaEnLima(new Date(reclamo.fechaLimite)) - diaEnLima(new Date())) / UN_DIA_MS);
  }

  estado(reclamo: Reclamo): string {
    if (reclamo.respondido) return 'Respondida';
    const dias = this.diasRestantes(reclamo);
    if (dias < 0) return 'Fuera de plazo';
    if (dias === 0) return 'Vence hoy';
    return dias === 1 ? 'Vence mañana' : `Vence en ${dias} días`;
  }

  vencida(reclamo: Reclamo): boolean {
    return !reclamo.respondido && this.diasRestantes(reclamo) < 0;
  }

  responder(): void {
    const reclamo = this.abierto();
    const texto = this.respuesta().trim();
    if (!reclamo || texto.length < 10 || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);

    this.api.responder(reclamo.numero, texto).subscribe({
      next: ({ correoEnviado }) => {
        this.enviando.set(false);
        this.cerrar();
        this.respondido.emit(
          correoEnviado
            ? `Hoja Nº ${reclamo.codigo} respondida. La respuesta salió por correo a ${reclamo.email}.`
            : `Hoja Nº ${reclamo.codigo} respondida, pero el correo no salió: avísale por otra vía.`,
        );
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }
}
