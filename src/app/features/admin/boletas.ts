import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { Comprobante } from '../../core/models/comprobante.model';
import { ComprobantesService, guardarArchivo } from '../../core/services/comprobantes.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/** La nota que anuló una boleta (`…|ANULADA:BC01-1` → `BC01-1`). */
function anuladaPor(c: Comprobante): string | null {
  return /\|ANULADA:(\S+)$/.exec(c.origenClave)?.[1] ?? null;
}

/**
 * Las boletas y notas de crédito electrónicas (SUNAT) en el panel.
 *
 * Las emite el servidor solo, cada cinco minutos (ver `backend/src/modules/sunat`).
 * Aquí se ven con su estado y su correo, se descargan el PDF, el XML y la CDR,
 * se reenvía el correo al cliente y se anula una boleta con nota de crédito,
 * que es lo mismo que hace `scripts/sunat-anular.js` en el servidor.
 */
@Component({
  selector: 'app-boletas-admin',
  imports: [DatePipe, FormsModule, AvisoFlotante],
  templateUrl: './boletas.html',
  styleUrl: './boletas.css',
})
export class BoletasAdmin implements OnInit {
  private readonly api = inject(ComprobantesService);
  private readonly dialogo = inject(DialogoService);

  readonly comprobantes = signal<Comprobante[]>([]);
  readonly cargando = signal(true);
  /** El comprobante con una acción en curso, para no lanzarla dos veces. */
  readonly ocupado = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  buscar = '';
  readonly texto = signal('');

  readonly filtrados = computed(() => {
    const q = this.texto().trim().toLowerCase();
    if (!q) return this.comprobantes();
    return this.comprobantes().filter((c) =>
      [this.numero(c), c.clienteNombre, ...c.items.map((i) => i.descripcion)].some((t) => t.toLowerCase().includes(q)),
    );
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (lista) => {
        this.comprobantes.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  numero(c: Comprobante): string {
    return `${c.serie}-${c.numero}`;
  }

  esNota(c: Comprobante): boolean {
    return c.tipo === '07';
  }

  anuladaPor(c: Comprobante): string | null {
    return anuladaPor(c);
  }

  /** La boleta que anula una nota. */
  anula(c: Comprobante): string | null {
    return this.esNota(c) ? c.origenClave.replace(/^ANULA:/, '') : null;
  }

  soles(cents: number): string {
    return `S/ ${(cents / 100).toFixed(2)}`;
  }

  estado(c: Comprobante): { texto: string; clase: string } {
    if (!this.esNota(c) && anuladaPor(c)) return { texto: `Anulada (${anuladaPor(c)})`, clase: 'mala' };
    switch (c.estado) {
      case 'ACEPTADO':
        return { texto: 'Aceptada', clase: 'buena' };
      case 'OBSERVADO':
        return { texto: 'Aceptada con observaciones', clase: 'buena' };
      case 'PENDIENTE':
        return { texto: c.intentos > 0 ? `Pendiente (${c.intentos} intentos)` : 'Pendiente', clase: 'espera' };
      case 'RECHAZADO':
        return { texto: 'Rechazada', clase: 'mala' };
      default:
        return { texto: 'Revisar en SOL', clase: 'espera' };
    }
  }

  correo(c: Comprobante): string {
    switch (c.correo) {
      case 'ENVIADO':
        return 'Enviado';
      case 'NO_APLICA':
        return 'No se envía';
      case 'SIN_DESTINATARIO':
        return 'Sin correo';
      default:
        return c.estado === 'ACEPTADO' || c.estado === 'OBSERVADO' ? 'Por enviar' : '—';
    }
  }

  aceptado(c: Comprobante): boolean {
    return c.estado === 'ACEPTADO' || c.estado === 'OBSERVADO';
  }

  sePuedeAnular(c: Comprobante): boolean {
    return !this.esNota(c) && this.aceptado(c) && !anuladaPor(c);
  }

  descargar(c: Comprobante, cual: 'pdf' | 'xml' | 'cdr'): void {
    if (this.ocupado()) return;
    this.ocupado.set(c.id);
    this.api.archivo(c.id, cual).subscribe({
      next: (respuesta) => {
        guardarArchivo(respuesta, `${this.numero(c)}.${cual === 'cdr' ? 'zip' : cual}`);
        this.ocupado.set(null);
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.ocupado.set(null);
      },
    });
  }

  async reenviar(c: Comprobante): Promise<void> {
    const si = await this.dialogo.confirmar({
      titulo: `Reenviar ${this.numero(c)}`,
      mensaje: 'Se le manda otra vez al cliente el correo con el PDF.',
      confirmar: 'Reenviar',
    });
    if (!si) return;
    this.ocupado.set(c.id);
    this.api.reenviar(c.id).subscribe({
      next: (estado) => {
        this.ocupado.set(null);
        if (estado === 'ENVIADO') this.aviso.set(`Correo de ${this.numero(c)} enviado.`);
        else this.error.set('Esa venta no tiene un correo conocido.');
        this.cargar();
      },
      error: (e) => {
        this.ocupado.set(null);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  async anular(c: Comprobante): Promise<void> {
    const motivo = await this.dialogo.pedirTexto({
      titulo: `Anular la boleta ${this.numero(c)}`,
      mensaje:
        'Se emite una nota de crédito que la anula ante SUNAT. Una nota aceptada no se puede ' +
        'deshacer.',
      nota: 'El motivo va en la nota y en el correo al cliente.',
      campo: { etiqueta: 'Motivo', placeholder: 'Ej.: pago registrado por error', obligatorio: true, maxlength: 200 },
      confirmar: 'Seguir',
      tono: 'peligro',
    });
    if (!motivo?.trim()) return;

    const refacturar = await this.dialogo.confirmar({
      titulo: '¿Hay que volver a facturar esta venta?',
      mensaje:
        'Sí, si la venta es buena pero la boleta salió mal (por ejemplo, el producto): se emite ' +
        'una boleta nueva en la pasada siguiente.\nNo, si no fue una venta: entonces anula antes ' +
        'el código o rechaza el pago, o el servidor no dejará anular.',
      confirmar: 'Sí, volver a facturar',
      cancelar: 'No, solo anular',
    });

    this.ocupado.set(c.id);
    this.api.anular(c.id, motivo.trim(), refacturar).subscribe({
      next: (r) => {
        this.ocupado.set(null);
        this.aviso.set(
          r.estado === 'ACEPTADO' || r.estado === 'OBSERVADO'
            ? `${this.numero(c)} anulada con la nota ${r.nota}.`
            : `Nota ${r.nota} creada; SUNAT aún no la acepta (se reintenta sola).`,
        );
        this.cargar();
      },
      error: (e) => {
        this.ocupado.set(null);
        this.error.set(mensajeDeError(e));
      },
    });
  }
}
