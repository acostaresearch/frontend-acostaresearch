import { WritableSignal, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { PagoPorRevisar, PagoRevisado } from '../../core/models/payment.model';
import { PaymentService } from '../../core/services/payment.service';

/** Bandeja de comprobantes manuales, revisión y capturas del historial. */
export class PagosManualesAdmin {
  private readonly payments = inject(PaymentService);

  constructor(
    private readonly error: WritableSignal<string | null>,
    private readonly aviso: WritableSignal<string | null>,
    private readonly recargar: () => void,
  ) {}

  // ── Comprobantes de Yape ─────────────────────────────────────────────────
  readonly porRevisar = signal<PagoPorRevisar[]>([]);
  /**
   * Imágenes ya descargadas, por pago.
   *
   * El <img> no puede mandar la cabecera de autorización, así que la imagen se
   * baja con el token y se enseña como object URL. Se guardan aquí para no
   * volver a pedir la misma captura cada vez que se repinta la lista.
   */
  readonly capturas = signal<Record<string, string>>({});
  /** Qué pago se está aprobando o rechazando, para bloquear solo esa fila. */
  readonly revisando = signal<string | null>(null);
  /** Motivo del rechazo, por pago: cada fila escribe el suyo. */
  readonly motivos = signal<Record<string, string>>({});

  // ── Historial de Yape ────────────────────────────────────────────────────
  /** Comprobantes ya resueltos. Llega la tanda entera y se busca aquí. */
  readonly historial = signal<PagoRevisado[]>([]);
  /** Qué captura se está bajando, para no dejar el botón mudo mientras tanto. */
  readonly abriendo = signal<string | null>(null);

  // ── Comprobantes de Yape ─────────────────────────────────────────────────

  /** Guarda los comprobantes pendientes y baja las miniaturas que falten. */
  aplicarPorRevisar(pagos: PagoPorRevisar[]): void {
    this.porRevisar.set(pagos);
    for (const pago of pagos) this.cargarCaptura(pago.id);
  }

  cargarPorRevisar(): void {
    this.payments.porRevisar().subscribe({
      next: (pagos) => this.aplicarPorRevisar(pagos),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /** Baja la captura con el token y la deja lista para el <img>. */
  private cargarCaptura(paymentId: string): void {
    if (this.capturas()[paymentId]) return;

    this.payments.comprobante(paymentId).subscribe({
      next: (blob) => {
        this.capturas.update((actual) => ({ ...actual, [paymentId]: URL.createObjectURL(blob) }));
      },
      // Que falte la miniatura no bloquea la revisión: el número de operación
      // sigue estando, que es lo que de verdad se coteja con el extracto.
      error: () => undefined,
    });
  }

  captura(paymentId: string): string | null {
    return this.capturas()[paymentId] ?? null;
  }

  motivo(paymentId: string): string {
    return this.motivos()[paymentId] ?? '';
  }

  escribirMotivo(paymentId: string, evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.motivos.update((actual) => ({ ...actual, [paymentId]: valor }));
  }

  /**
   * Da el pago por bueno y entrega lo comprado.
   *
   * Lo que llega de vuelta NO trae la URL del conector, y es deliberado: esa
   * URL es la credencial del comprador y la genera él desde su panel.
   */
  aprobarComprobante(pago: PagoPorRevisar): void {
    if (this.revisando()) return;

    this.revisando.set(pago.id);
    this.error.set(null);
    this.aviso.set(null);

    this.payments.aprobarComprobante(pago.id).subscribe({
      next: (resultado) => {
        this.aviso.set(
          resultado.alreadyProcessed
            ? 'Ese pago ya estaba aprobado.'
            : pago.carrito
              ? `Aprobado el carrito. ${pago.user.firstName} ya tiene sus ${pago.carrito.productos.length} productos y le hemos avisado por correo.`
              : `Aprobado. ${pago.user.firstName} ya tiene su acceso y le hemos avisado por correo.`,
        );
        this.olvidarPago(pago.id);
        this.revisando.set(null);
        // Las licencias y los movimientos cambian al entregar.
        this.recargar();
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.revisando.set(null);
      },
    });
  }

  rechazarComprobante(pago: PagoPorRevisar): void {
    const motivo = this.motivo(pago.id).trim();
    if (this.revisando()) return;

    if (motivo.length < 10) {
      this.error.set('Escribe por qué lo rechazas: el comprador solo va a leer eso.');
      return;
    }

    this.revisando.set(pago.id);
    this.error.set(null);
    this.aviso.set(null);

    this.payments.rechazarComprobante(pago.id, motivo).subscribe({
      next: () => {
        this.aviso.set(`Rechazado. Se lo hemos comunicado a ${pago.user.email}.`);
        this.olvidarPago(pago.id);
        this.revisando.set(null);
        // El pago no desaparece: se muda al historial, y allí tiene que verse.
        this.cargarHistorial();
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.revisando.set(null);
      },
    });
  }

  /**
   * Saca el pago de la bandeja y libera su miniatura. Un carrito sale entero:
   * el servidor lo aprueba o lo rechaza todo de una vez.
   */
  private olvidarPago(paymentId: string): void {
    const url = this.capturas()[paymentId];
    if (url) URL.revokeObjectURL(url);

    const pago = this.porRevisar().find((p) => p.id === paymentId);
    const fuera = new Set(pago?.carrito?.pagos ?? [paymentId]);
    this.porRevisar.update((pagos) => pagos.filter((p) => !fuera.has(p.id)));
    this.capturas.update(({ [paymentId]: _fuera, ...resto }) => resto);
    this.motivos.update(({ [paymentId]: _tambien, ...resto }) => resto);
  }

  // ── Historial de Yape ────────────────────────────────────────────────────

  cargarHistorial(): void {
    this.payments.historialManual().subscribe({
      next: (pagos) => this.historial.set(pagos),
      error: () => undefined,
    });
  }

  /**
   * Abre la captura de un pago del historial en otra pestaña.
   *
   * Las de la bandeja se bajan solas al entrar porque hay que mirarlas para
   * decidir; las del historial no, que serían doscientas descargas para una
   * pantalla que casi siempre se consulta de pasada. Esta se pide cuando se
   * pide, y se queda cacheada por si se vuelve a ella.
   */
  abrirComprobante(paymentId: string): void {
    const guardada = this.capturas()[paymentId];
    if (guardada) {
      window.open(guardada, '_blank', 'noopener');
      return;
    }

    if (this.abriendo()) return;
    this.abriendo.set(paymentId);

    this.payments.comprobante(paymentId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        this.capturas.update((actual) => ({ ...actual, [paymentId]: url }));
        this.abriendo.set(null);
        window.open(url, '_blank', 'noopener');
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.abriendo.set(null);
      },
    });
  }
}
