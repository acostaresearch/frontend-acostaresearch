import { computed, inject, signal, WritableSignal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { Comprobante } from '../../core/models/comprobante.model';
import { ComprobantesService, guardarArchivo } from '../../core/services/comprobantes.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { Acceso } from './accesos';

/** Un paso del seguimiento de un comprobante. */
export interface PasoSeguimiento {
  titulo: string;
  /** ISO, o null si aún no ocurrió. */
  fecha: string | null;
  detalle: string;
  tono: 'hecho' | 'espera' | 'mal';
}

const NOMBRE_DOCUMENTO: Record<string, string> = {
  '-': 'Sin documento',
  '0': 'No domiciliado',
  '1': 'DNI',
  '4': 'Carné de extranjería',
  '6': 'RUC',
  '7': 'Pasaporte',
};

/**
 * Las boletas y notas de crédito de una venta, dentro de su ficha en Accesos.
 *
 * Sustituye a la sección «Boletas» del panel (20-oct-2026): cada comprobante se
 * mira desde la venta a la que pertenece, con su PDF, XML, CDR, el reenvío del
 * correo y la anulación con nota de crédito.
 */
export class BoletasDeVenta {
  private readonly api = inject(ComprobantesService);
  private readonly dialogos = inject(DialogoService);

  constructor(
    private readonly error: WritableSignal<string | null>,
    private readonly aviso: WritableSignal<string | null>,
  ) {}

  readonly comprobantes = signal<Comprobante[]>([]);
  readonly correoDestinatario = signal<string | null>(null);
  readonly cargando = signal(false);
  readonly ocupado = signal(false);
  private readonly elegido = signal<string | null>(null);
  private venta: { canal: 'codigo' | 'pago'; id: string } | null = null;

  /** El que se enseña: el elegido, o la boleta vigente, o el último. */
  readonly actual = computed<Comprobante | null>(() => {
    const lista = this.comprobantes();
    const porId = lista.find((c) => c.id === this.elegido());
    if (porId) return porId;
    const vigente = [...lista].reverse().find((c) => c.tipo === '03' && !this.anuladaPor(c));
    return vigente ?? lista.at(-1) ?? null;
  });

  cargar(acceso: Acceso): void {
    this.venta = { canal: acceso.canal === 'codigo' ? 'codigo' : 'pago', id: acceso.id };
    this.comprobantes.set([]);
    this.correoDestinatario.set(null);
    this.elegido.set(null);
    this.recargar();
  }

  limpiar(): void {
    this.venta = null;
    this.comprobantes.set([]);
    this.elegido.set(null);
  }

  private recargar(): void {
    const venta = this.venta;
    if (!venta) return;
    this.cargando.set(true);
    this.api.deVenta(venta.canal, venta.id).subscribe({
      next: (r) => {
        if (this.venta !== venta) return;
        this.comprobantes.set(r.comprobantes);
        this.correoDestinatario.set(r.correoDestinatario);
        this.cargando.set(false);
      },
      error: (e) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  elegir(c: Comprobante): void {
    this.elegido.set(c.id);
  }

  numero(c: Comprobante): string {
    return `${c.serie}-${c.numero}`;
  }

  esNota(c: Comprobante): boolean {
    return c.tipo === '07';
  }

  titulo(c: Comprobante): string {
    return `${this.esNota(c) ? 'Nota de crédito' : 'Boleta'} ${this.numero(c)}`;
  }

  anuladaPor(c: Comprobante): string | null {
    return /\|ANULADA:(\S+)$/.exec(c.origenClave)?.[1] ?? null;
  }

  anula(c: Comprobante): string | null {
    return this.esNota(c) ? c.origenClave.replace(/^ANULA:/, '') : null;
  }

  documento(c: Comprobante): string {
    const tipo = NOMBRE_DOCUMENTO[c.clienteTipoDoc] ?? c.clienteTipoDoc;
    return c.clienteNumDoc && c.clienteNumDoc !== '-' ? `${tipo} ${c.clienteNumDoc}` : tipo;
  }

  aceptado(c: Comprobante): boolean {
    return c.estado === 'ACEPTADO' || c.estado === 'OBSERVADO';
  }

  estado(c: Comprobante): { texto: string; clase: 'buena' | 'mala' | 'espera' } {
    if (!this.esNota(c) && this.anuladaPor(c)) return { texto: `Anulada · ${this.anuladaPor(c)}`, clase: 'mala' };
    switch (c.estado) {
      case 'ACEPTADO':
        return { texto: 'SUNAT · Aceptada', clase: 'buena' };
      case 'OBSERVADO':
        return { texto: 'SUNAT · Con observaciones', clase: 'buena' };
      case 'PENDIENTE':
        return { texto: 'SUNAT · Pendiente', clase: 'espera' };
      case 'RECHAZADO':
        return { texto: 'SUNAT · Rechazada', clase: 'mala' };
      default:
        return { texto: 'Revisar en SOL', clase: 'espera' };
    }
  }

  /** Lo que la pastilla de cambio dice de cada uno: «B001-2 · anulada». */
  etiqueta(c: Comprobante): string {
    if (this.esNota(c)) return `${this.numero(c)} · nota`;
    return this.anuladaPor(c) ? `${this.numero(c)} · anulada` : this.numero(c);
  }

  seguimiento(c: Comprobante): PasoSeguimiento[] {
    const sunat: PasoSeguimiento =
      c.estado === 'ACEPTADO' || c.estado === 'OBSERVADO'
        ? { titulo: 'Aceptada por SUNAT', fecha: c.enviadoEn ?? null, detalle: 'Con su constancia (CDR)', tono: 'hecho' }
        : c.estado === 'RECHAZADO'
          ? { titulo: 'Rechazada por SUNAT', fecha: c.enviadoEn ?? null, detalle: c.mensaje ?? '', tono: 'mal' }
          : c.estado === 'PENDIENTE'
            ? {
                titulo: 'Esperando a SUNAT',
                fecha: null,
                detalle: c.intentos ? `${c.intentos} intentos; se reintenta sola` : 'Se envía en minutos',
                tono: 'espera',
              }
            : { titulo: 'Revisar en SOL', fecha: null, detalle: c.mensaje ?? '', tono: 'espera' };

    const correos: Record<string, PasoSeguimiento> = {
      ENVIADO: { titulo: 'Enviada por correo', fecha: c.correoEnviadoEn, detalle: this.correoDestinatario() ?? '', tono: 'hecho' },
      NO_APLICA: { titulo: 'No se envió por correo', fecha: null, detalle: 'Se anuló antes de enviarse', tono: 'espera' },
      SIN_DESTINATARIO: { titulo: 'Sin correo', fecha: null, detalle: 'La venta no tiene un correo conocido', tono: 'mal' },
    };
    const correo =
      (c.correo && correos[c.correo]) ||
      ({ titulo: 'Correo por enviar', fecha: null, detalle: 'Sale cuando SUNAT la acepta', tono: 'espera' } as PasoSeguimiento);

    return [{ titulo: 'Emitida', fecha: c.fechaEmision, detalle: this.titulo(c), tono: 'hecho' }, sunat, correo];
  }

  descargar(c: Comprobante, cual: 'pdf' | 'xml' | 'cdr'): void {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.api.archivo(c.id, cual).subscribe({
      next: (respuesta) => {
        guardarArchivo(respuesta, `${this.numero(c)}.${cual === 'cdr' ? 'zip' : cual}`);
        this.ocupado.set(false);
      },
      error: (e) => {
        this.ocupado.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  async reenviar(c: Comprobante): Promise<void> {
    const si = await this.dialogos.confirmar({
      titulo: `Reenviar ${this.titulo(c)}`,
      mensaje: `Se manda otra vez el PDF a ${this.correoDestinatario() ?? 'su correo'}.`,
      confirmar: 'Reenviar',
    });
    if (!si) return;
    this.ocupado.set(true);
    this.api.reenviar(c.id).subscribe({
      next: (estado) => {
        this.ocupado.set(false);
        if (estado === 'ENVIADO') this.aviso.set(`${this.titulo(c)} reenviada.`);
        else this.error.set('Esta venta no tiene un correo conocido.');
        this.recargar();
      },
      error: (e) => {
        this.ocupado.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  sePuedeAnular(c: Comprobante): boolean {
    return !this.esNota(c) && this.aceptado(c) && !this.anuladaPor(c);
  }

  async anular(c: Comprobante): Promise<void> {
    const motivo = await this.dialogos.pedirTexto({
      titulo: `Anular la boleta ${this.numero(c)}`,
      mensaje: 'Se emite una nota de crédito que la anula ante SUNAT. Una nota aceptada no se puede deshacer.',
      nota: 'El motivo va en la nota y en el correo al cliente.',
      campo: { etiqueta: 'Motivo', placeholder: 'Ej.: producto equivocado', obligatorio: true, maxlength: 200 },
      confirmar: 'Seguir',
      tono: 'peligro',
    });
    if (!motivo?.trim()) return;

    const refacturar = await this.dialogos.confirmar({
      titulo: '¿Hay que volver a facturar esta venta?',
      mensaje:
        'Sí, si la venta es buena pero la boleta salió mal (por ejemplo, el producto): se emite una ' +
        'boleta nueva en minutos.\nNo, si no fue una venta: entonces usa «Anular» del menú de la ' +
        'fila, que anula la venta y su boleta a la vez.',
      confirmar: 'Sí, volver a facturar',
      cancelar: 'No, solo anular',
    });

    this.ocupado.set(true);
    this.api.anular(c.id, motivo.trim(), refacturar).subscribe({
      next: (r) => {
        this.ocupado.set(false);
        this.aviso.set(
          r.estado === 'ACEPTADO' || r.estado === 'OBSERVADO'
            ? `${this.numero(c)} anulada con la nota ${r.nota}.`
            : `Nota ${r.nota} creada; SUNAT aún no la acepta (se reintenta sola).`,
        );
        this.recargar();
      },
      error: (e) => {
        this.ocupado.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }
}
