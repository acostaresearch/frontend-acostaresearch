import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { toApiError } from '../../core/http/api-error';
import {
  ComprobanteEnviado,
  DatosYape,
  Descuento,
  License,
  PaymentProvider,
} from '../../core/models/payment.model';
import { Balance, Plan, WordPack } from '../../core/models/rewrite.model';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { PaymentService } from '../../core/services/payment.service';
import { PaypalSdkService } from '../../core/services/paypal-sdk.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

@Component({
  selector: 'app-checkout',
  imports: [RouterLink, ReactiveFormsModule, DecimalPipe, DatePipe, SiteHeader, SiteFooter],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
})
export class Checkout implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly payments = inject(PaymentService);
  private readonly paypal = inject(PaypalSdkService);
  private readonly ruta = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);

  readonly whatsappUrl = environment.whatsappUrl;

  readonly planes = signal<Plan[]>([]);
  readonly pasarelas = signal<PaymentProvider[]>([]);
  readonly saldo = signal<Balance | null>(null);
  readonly seleccionado = signal<Plan | null>(null);

  // ── Código promocional ─────────────────────────────────────────────────
  readonly codigoPromo = new FormControl('', { nonNullable: true });
  readonly descuento = signal<Descuento | null>(null);
  readonly errorPromo = signal<string | null>(null);
  readonly comprobandoPromo = signal(false);

  readonly cargando = signal(true);
  readonly procesando = signal(false);
  readonly error = signal<string | null>(null);

  // ── Pago por Yape ──────────────────────────────────────────────────────
  // Aquí no hay pasarela: el comprador paga con el QR, sube la captura y espera
  // a que un administrador la mire. Hasta que la apruebe no existe licencia.
  readonly datosYape = signal<DatosYape | null>(null);
  readonly numeroOperacion = new FormControl('', { nonNullable: true });
  readonly capturaElegida = signal<File | null>(null);
  /** Miniatura local del archivo. Es un object URL: hay que revocarlo. */
  readonly capturaPrevia = signal<string | null>(null);
  readonly enviandoComprobante = signal(false);
  readonly comprobanteEnviado = signal<ComprobanteEnviado | null>(null);
  readonly errorComprobante = signal<string | null>(null);

  /** Lo que el navegador acepta subir; el servidor lo vuelve a comprobar. */
  private readonly FORMATOS = ['image/png', 'image/jpeg', 'image/webp'];
  /** Mismo techo que el servidor, para avisar antes de subir 6 MB en balde. */
  private readonly MAX_BYTES = 6 * 1024 * 1024;

  /** Resultado de una compra recién confirmada. */
  readonly bolsaComprada = signal<WordPack | null>(null);
  readonly licenciaComprada = signal<License | null>(null);
  readonly urlConector = signal<string | null>(null);
  readonly copiada = signal(false);

  private readonly hostBoton = viewChild<ElementRef<HTMLDivElement>>('paypalHost');
  private botonMontado = false;

  readonly metodo = computed(() => this.planes().filter((p) => p.kind === 'LICENSE'));
  readonly bolsas = computed(() => this.planes().filter((p) => p.kind === 'WORDS'));
  readonly esLicencia = computed(() => this.seleccionado()?.kind === 'LICENSE');
  readonly comprado = computed(() => this.bolsaComprada() !== null || this.licenciaComprada() !== null);

  readonly pasarelaPaypal = computed(
    () => this.pasarelas().find((p) => p.code === 'PAYPAL') ?? null,
  );

  /** El botón necesita las tres cosas: pasarela, client id y sesión. */
  readonly pagoEnLinea = computed(
    () => Boolean(this.pasarelaPaypal()) && this.paypal.configurado && this.auth.isAuthenticated(),
  );

  constructor() {
    effect(() => {
      const host = this.hostBoton();
      if (host && !this.botonMontado) {
        this.botonMontado = true;
        void this.montarBoton(host.nativeElement);
      }
    });
  }

  ngOnInit(): void {
    // El saldo solo existe si hay sesión; sin ella la página sigue siendo útil
    // como escaparate de precios.
    if (this.auth.isAuthenticated()) {
      this.billing.balance().subscribe({ next: (saldo) => this.saldo.set(saldo) });
    }

    this.payments.providers().subscribe({
      next: (pasarelas) => this.pasarelas.set(pasarelas),
      error: () => this.pasarelas.set([]),
    });

    // El titular y el número son opcionales: si no están configurados, el QR
    // se enseña solo y la página sigue funcionando igual.
    this.payments.datosYape().subscribe({
      next: (datos) => this.datosYape.set(datos),
      error: () => this.datosYape.set(null),
    });

    this.billing.plans().subscribe({
      next: (planes) => {
        const vendibles = planes.filter((plan) => plan.priceCents > 0);
        this.planes.set(vendibles);

        // Nada queda seleccionado por defecto.
        //
        // Antes se elegía el método automáticamente y la página abría con todo
        // desplegado: resumen, descuento, PayPal, el QR de Yape y el formulario
        // del comprobante. Quien solo venía a mirar el precio se encontraba un
        // formulario de pago encima, y el precio —que es lo que buscaba— quedaba
        // sepultado. Ahora se elige primero y los medios de pago aparecen
        // después.
        //
        // La excepción es ?plan=CODIGO: quien llega por ese enlace ya decidió,
        // y hacerle pulsar otra vez sería un paso de más.
        const pedido = this.ruta.snapshot.queryParamMap.get('plan');
        const directo = pedido ? (vendibles.find((p) => p.code === pedido) ?? null) : null;
        if (directo) this.seleccionado.set(directo);

        this.cargando.set(false);
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error).message);
        this.cargando.set(false);
      },
    });
  }

  /** Deshace la elección y vuelve a esconder los medios de pago. */
  cambiarPlan(): void {
    if (this.procesando() || this.enviandoComprobante()) return;

    this.seleccionado.set(null);
    this.quitarDescuento();
    this.quitarCaptura();
    this.comprobanteEnviado.set(null);
    this.errorComprobante.set(null);
    this.error.set(null);
  }

  elegir(plan: Plan): void {
    if (this.procesando() || this.enviandoComprobante()) return;
    this.error.set(null);
    this.seleccionado.set(plan);

    // En móvil los medios de pago quedan bajo la tarjeta, fuera de pantalla:
    // sin esto, pulsar «Comprar» no parece hacer nada. Se espera un cuadro
    // para que el panel ya exista en el DOM cuando se busque.
    requestAnimationFrame(() => {
      document.getElementById('medios-de-pago')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
    // Un código puede valer solo para un plan, así que al cambiar se suelta.
    this.quitarDescuento();
    // Y la captura también: es el comprobante de OTRO importe.
    this.quitarCaptura();
    this.comprobanteEnviado.set(null);
    this.errorComprobante.set(null);
  }

  // ── Pago por Yape ────────────────────────────────────────────────────────

  /**
   * Guarda el archivo elegido y prepara la miniatura.
   *
   * Se comprueba tipo y tamaño aquí para no hacerle subir seis megabytes a
   * alguien que va a recibir un error de vuelta. La comprobación que cuenta
   * sigue siendo la del servidor, que además mira los bytes de la imagen.
   */
  elegirCaptura(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;

    this.errorComprobante.set(null);
    this.quitarCaptura();
    // El input se vacía para que elegir dos veces el mismo archivo dispare el
    // evento otra vez.
    input.value = '';

    if (!archivo) return;

    if (!this.FORMATOS.includes(archivo.type)) {
      this.errorComprobante.set('Sube una captura en PNG, JPG o WebP.');
      return;
    }

    if (archivo.size > this.MAX_BYTES) {
      this.errorComprobante.set('La imagen pesa más de 6 MB. Hazle una captura en vez de una foto.');
      return;
    }

    this.capturaElegida.set(archivo);
    this.capturaPrevia.set(URL.createObjectURL(archivo));
  }

  /** Suelta el archivo y libera la miniatura. */
  quitarCaptura(): void {
    const previa = this.capturaPrevia();
    if (previa) URL.revokeObjectURL(previa);
    this.capturaPrevia.set(null);
    this.capturaElegida.set(null);
  }

  enviarComprobante(): void {
    const plan = this.seleccionado();
    const archivo = this.capturaElegida();
    if (!plan || !archivo || this.enviandoComprobante()) return;

    this.enviandoComprobante.set(true);
    this.errorComprobante.set(null);

    this.payments
      .enviarComprobante(plan.code, archivo, {
        operationCode: this.numeroOperacion.value.trim() || undefined,
        discountCode: this.descuento()?.code,
      })
      .subscribe({
        next: (enviado) => {
          this.comprobanteEnviado.set(enviado);
          this.quitarCaptura();
          this.numeroOperacion.reset();
          this.enviandoComprobante.set(false);
        },
        error: (error: unknown) => {
          this.errorComprobante.set(toApiError(error).message);
          this.enviandoComprobante.set(false);
        },
      });
  }

  aplicarDescuento(): void {
    const codigo = this.codigoPromo.value.trim();
    const plan = this.seleccionado();
    if (!codigo || !plan || this.comprobandoPromo()) return;

    this.comprobandoPromo.set(true);
    this.errorPromo.set(null);

    this.billing.validarDescuento(codigo, plan.code).subscribe({
      next: (descuento) => {
        this.descuento.set(descuento);
        this.comprobandoPromo.set(false);
        // No hace falta remontar el botón de PayPal: su `createOrder` lee el
        // descuento en el momento del clic, así que siempre usa el vigente.
      },
      error: (error: unknown) => {
        this.descuento.set(null);
        this.errorPromo.set(toApiError(error).message);
        this.comprobandoPromo.set(false);
      },
    });
  }

  quitarDescuento(): void {
    if (!this.descuento() && !this.errorPromo()) return;
    this.descuento.set(null);
    this.errorPromo.set(null);
    this.codigoPromo.reset();
  }

  /** Precio a pagar, ya con la rebaja si la hay. */
  precioFinal(plan: Plan): string {
    const rebajado = this.descuento()?.finalPriceCents;
    return `S/ ${((rebajado ?? plan.priceCents) / 100).toFixed(2)}`;
  }

  precioFinalDolares(plan: Plan): string | null {
    const rebajado = this.descuento()?.finalPriceUsdCents;
    if (rebajado != null) return `$ ${(rebajado / 100).toFixed(2)}`;
    return this.precioDolares(plan);
  }

  /** «30 días» o «permanente», según el plan. */
  vigencia(plan: Plan): string {
    return plan.durationDays > 0 ? `${plan.durationDays} días` : 'Acceso permanente';
  }

  precio(plan: Plan): string {
    return `S/ ${(plan.priceCents / 100).toFixed(2)}`;
  }

  precioDolares(plan: Plan): string | null {
    return plan.priceUsdCents ? `$ ${(plan.priceUsdCents / 100).toFixed(2)}` : null;
  }

  porMil(plan: Plan): string {
    return plan.words > 0 ? `S/ ${((plan.priceCents / 100 / plan.words) * 1000).toFixed(2)}` : '';
  }

  async copiarUrl(): Promise<void> {
    const url = this.urlConector();
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      this.copiada.set(true);
      setTimeout(() => this.copiada.set(false), 2500);
    } catch {
      this.error.set('No pudimos copiar. Selecciona la URL y cópiala a mano.');
    }
  }

  private async montarBoton(contenedor: HTMLElement): Promise<void> {
    try {
      const sdk = await this.paypal.load(this.pasarelaPaypal()?.currency ?? 'USD');

      await sdk
        .Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay', height: 44 },

          createOrder: async () => {
            this.error.set(null);
            this.procesando.set(true);
            try {
              const orden = await firstValueFrom(
                this.payments.createOrder(
                  this.seleccionado()!.code,
                  this.descuento()?.code,
                ),
              );
              return orden.orderId;
            } catch (error: unknown) {
              this.procesando.set(false);
              this.error.set(toApiError(error).message);
              throw error;
            }
          },

          onApprove: async (data) => {
            try {
              const resultado = await firstValueFrom(this.payments.capture(data.orderID));
              this.saldo.set(resultado.balance);
              this.bolsaComprada.set(resultado.pack ?? null);
              this.licenciaComprada.set(resultado.license ?? null);
              this.urlConector.set(resultado.connectorUrl ?? null);

              if (resultado.alreadyProcessed && !resultado.connectorUrl) {
                this.error.set(
                  'Este pago ya estaba confirmado. Si compraste el método y perdiste tu URL, ' +
                    'genera una nueva desde tu panel.',
                );
              }
            } catch (error: unknown) {
              this.error.set(toApiError(error).message);
            } finally {
              this.procesando.set(false);
            }
          },

          onCancel: (data) => {
            this.procesando.set(false);
            if (data.orderID) {
              this.payments.cancel(data.orderID).subscribe({ error: () => undefined });
            }
          },

          onError: () => {
            this.procesando.set(false);
            this.error.set('PayPal devolvió un error. Vuelve a intentarlo o págalo por Yape.');
          },
        })
        .render(contenedor);
    } catch {
      this.botonMontado = false;
      this.error.set('No pudimos cargar el pago con PayPal. Escríbenos y lo activamos a mano.');
    }
  }
}
