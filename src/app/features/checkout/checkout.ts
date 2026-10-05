import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { toApiError } from '../../core/http/api-error';
import { ERROR_CODE } from '../../core/models/api.model';
import {
  ComprobanteEnviado,
  DatosDelCobro,
  DatosYape,
  Descuento,
  DescuentoDelCarrito,
  License,
  LineaCarrito,
  MembresiaComprada,
  PaymentOrder,
  PaymentProvider,
  PaymentResult,
  ProductoEntregado,
} from '../../core/models/payment.model';
import { Balance, Plan, WordPack } from '../../core/models/rewrite.model';
import { AuthService } from '../../core/services/auth.service';
import { BillingService, Promo } from '../../core/services/billing.service';
import { CarritoService } from '../../core/services/carrito.service';
import { CulqiSdkService, ResultadoCheckout } from '../../core/services/culqi-sdk.service';
import { FondoService } from '../../core/services/fondo.service';
import { LicenseService } from '../../core/services/license.service';
import { PaymentService } from '../../core/services/payment.service';
import { PaypalSdkService } from '../../core/services/paypal-sdk.service';
import { FASES_ARTICULO, INCLUYE } from '../../shared/contenido/metodo';
import { SiteFooter } from '../../shared/layout/site-footer';
import { InvitacionPlanes } from './invitacion-planes';
// Oculto por ahora en la plantilla (1-oct).
// import { PlanesInstituciones } from './planes-instituciones';
import { SiteHeader } from '../../shared/layout/site-header';
import { CuentaAtras } from '../../shared/tiempo/cuenta-atras';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';
import { PrivadaPipe } from '../../core/router/privada.pipe';

/**
 * Cuántos acentos hay para las tarjetas de plan.
 *
 * Cuatro tonos —azul, fucsia, verde y naranja— comprobados con el verificador
 * de contraste: se distinguen entre sí incluso sin ver el rojo, y los cuatro
 * aguantan texto blanco encima (más de 4,5:1), que es lo que exige el botón.
 */
const ACENTOS = 4;

/**
 * Qué acento le toca a la tarjeta que ocupa esta posición.
 *
 * Se reparte por ORDEN del catálogo, no por un cálculo sobre el código del
 * plan. Lo probé al revés —un hash del código— y con los códigos reales dos
 * paquetes salían del mismo color, que es justo lo que no se quería.
 *
 * La contrapartida, dicha claramente: si mañana se retira un producto del
 * medio, los de detrás se corren un color. Es asumible porque el catálogo
 * cambia una vez cada varios meses y las tarjetas llevan su nombre encima; el
 * color agrupa, no identifica.
 */
function acentoDe(posicion: number): number {
  return posicion % ACENTOS;
}
/**
 * Importe en soles, con los céntimos solo cuando los hay.
 *
 * Los precios del catálogo son redondos —199, 250, 399— y escribirlos como
 * «S/ 199.00» mete tres caracteres de ruido en la cifra más grande de la
 * página. Si un día uno cuesta S/ 199.50, los céntimos aparecen solos.
 */
function soles(cents: number): string {
  const valor = cents / 100;
  return `S/ ${Number.isInteger(valor) ? valor : valor.toFixed(2)}`;
}

/**
 * Las etapas de la tesis con el nombre que se entiende en una ficha de precios.
 * `FASES_TESIS` es más corto («Tema», «Datos») porque va en fichas del inicio
 * donde caben dos palabras; aquí hay sitio para decir qué es cada una.
 */
const ETAPAS_TESIS = [
  'Tema y delimitación',
  'Problema y objetivos',
  'Marco teórico',
  'Metodología',
  'Instrumento',
  'Recolección de datos',
  'Análisis de datos',
  'Discusión',
  'Conclusiones y abstract',
] as const;

@Component({
  selector: 'app-checkout',
  imports: [PrivadaPipe, 
    AvisoFlotante,
    RouterLink,
    ReactiveFormsModule,
    DecimalPipe,
    DatePipe,
    NgTemplateOutlet,
    CuentaAtras,
    SiteHeader,
    SiteFooter,
    InvitacionPlanes,
    // PlanesInstituciones,
  ],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
  host: { '(document:keydown.escape)': 'cerrarCajon()' },
})
export class Checkout implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly fondo = inject(FondoService);
  private readonly payments = inject(PaymentService);
  private readonly paypal = inject(PaypalSdkService);
  private readonly culqi = inject(CulqiSdkService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly licencias = inject(LicenseService);
  private readonly carritoGuardado = inject(CarritoService);
  private readonly destruir = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  readonly whatsappUrl = environment.whatsappUrl;

  /** Lo que entra en el paquete del método. */
  readonly incluye = INCLUYE;

  /**
   * Medio de pago elegido.
   *
   * Antes se enseñaban los dos a la vez —PayPal y el QR de Yape con su
   * formulario de captura— y la página se convertía en una lista interminable.
   * Ahora se elige uno y solo se despliega ese.
   */
  readonly metodoPago = signal<'yape' | 'paypal' | 'culqi' | null>(null);

  readonly planes = signal<Plan[]>([]);

  /** Los códigos que se anuncian en las tarjetas. */
  readonly promos = signal<Promo[]>([]);
  readonly pasarelas = signal<PaymentProvider[]>([]);
  readonly saldo = signal<Balance | null>(null);

  /**
   * Las licencias de quien mira, para marcar en su tarjeta lo que ya compró.
   * Sin esto, quien ya tenía el método veía «Añadir al carrito» como cualquier
   * visitante y no sabía si le faltaba algo o si iba a pagar dos veces.
   */
  readonly misLicencias = signal<License[]>([]);

  /**
   * El carrito: lo que el comprador va juntando para pagarlo de una vez.
   *
   * Es distinto de lo que se está pagando (`enPago`): «Comprar» en una tarjeta
   * paga solo ese producto y deja el carrito como estaba, y cerrar la ventana
   * de pago no lo vacía. Los códigos los guarda `CarritoService`, que también
   * lee la cabecera; aquí se convierten en planes con el catálogo de HOY.
   */
  readonly carrito = computed(() => {
    const codigos = this.carritoGuardado.codigos();
    return this.planes().filter((plan) => codigos.includes(plan.code));
  });

  /**
   * Lo que se está pagando en la ventana: un producto, o todo el carrito.
   * Vacío = la ventana está cerrada.
   */
  readonly enPago = signal<Plan[]>([]);

  /** El producto, cuando se paga uno solo. Null con la ventana cerrada o con varios. */
  readonly seleccionado = computed(() => {
    const planes = this.enPago();
    return planes.length === 1 ? planes[0] : null;
  });

  readonly esCarrito = computed(() => this.enPago().length > 1);

  /** «A + B», para las líneas que no caben en una lista. */
  readonly nombresEnPago = computed(() => this.enPago().map((plan) => plan.name).join(' + '));

  /**
   * Cuánto vive la ventana de pago abierta sin tocarla.
   *
   * No reserva nada —no hay nada escaso que reservar: la licencia se emite
   * infinitas veces y el precio no cambia mientras espera—. Lo que hace es
   * cerrar la ventana y soltar el plan, el descuento y la captura.
   *
   * Y eso es lo que se anuncia, literalmente: «esta ventana se cierra». La
   * frase es verdad porque la cumple esta misma pantalla, no porque haya un
   * plazo en el servidor. Prometer una reserva que no existe sería otra cosa.
   */
  private readonly MINUTOS_DE_VENTANA = 5;

  /**
   * La fecha en que se cierra, en ISO. Null = no hay ventana abierta.
   *
   * Se guarda como FECHA y no como cuenta de segundos porque `CuentaAtras`
   * solo acepta fechas, a propósito: un contador al que se le da una duración
   * se reinicia en cada recarga. Aquí no hay recarga que valga —recargar cierra
   * la ventana— así que el reloj y lo que anuncia dicen lo mismo.
   */
  readonly cierraEn = signal<string | null>(null);

  /** Aviso de que se cerró sola, para que no parezca que se rompió algo. */
  readonly cerradaPorTiempo = signal(false);

  // ── Código promocional ─────────────────────────────────────────────────
  readonly codigoPromo = new FormControl('', { nonNullable: true });
  /**
   * Los códigos aplicados, uno por producto como mucho. Por producto porque los
   * códigos anunciados son de un plan concreto: en un carrito, el del método
   * rebaja el método y no lo demás.
   */
  readonly descuentos = signal<Record<string, Descuento>>({});
  /** El código del producto, cuando se paga uno solo. */
  readonly descuento = computed(() => {
    const plan = this.seleccionado();
    return plan ? (this.descuentos()[plan.code] ?? null) : null;
  });
  /** Los productos en pago que llevan un código aplicado, con el suyo. */
  readonly conCodigo = computed(() =>
    this.enPago()
      .map((plan) => ({ plan, promo: this.descuentos()[plan.code] ?? null }))
      .filter((linea): linea is { plan: Plan; promo: Descuento } => linea.promo !== null),
  );
  /**
   * El código del carrito, que rebaja el TOTAL una sola vez: «S/ 50» en un
   * carrito de tres productos son S/ 50, no S/ 150. Se calcula sobre lo que
   * ya se paga con los códigos de cada producto.
   */
  readonly descuentoTotal = signal<Descuento | null>(null);
  /** El código del total, para mandarlo al abrir la orden. */
  readonly codigoDelTotal = computed(() => this.descuentoTotal()?.code);
  /**
   * Si se ofrece el campo del código. En un carrito, mientras no haya uno
   * sobre el total; con un producto, mientras no lleve el suyo.
   */
  readonly faltaCodigo = computed(() =>
    this.esCarrito()
      ? !this.descuentoTotal()
      : this.enPago().some((plan) => !this.descuentos()[plan.code]),
  );
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
  readonly membresiaComprada = signal<MembresiaComprada | null>(null);
  readonly urlConector = signal<string | null>(null);
  readonly copiada = signal(false);
  /** Lo recibido por cada producto de un carrito recién pagado. */
  readonly carritoComprado = signal<ProductoEntregado[] | null>(null);
  /** El producto cuya URL se acaba de copiar, para el «¡Copiada!» de su botón. */
  readonly copiadaDe = signal<string | null>(null);

  private readonly hostBoton = viewChild<ElementRef<HTMLDivElement>>('paypalHost');

  /**
   * El hueco donde ya está pintado el botón de PayPal.
   *
   * Se guarda el ELEMENTO y no un «ya está montado», porque el hueco va y
   * viene: elegir Yape lo destruye y volver a PayPal crea otro. Con una
   * bandera, ese segundo hueco se quedaba vacío para siempre y el comprador
   * veía el bloque de PayPal sin botón con el que pagar.
   */
  private hostMontado: HTMLElement | null = null;

  readonly metodo = computed(() => this.planes().filter((p) => p.kind === 'LICENSE'));
  readonly bolsas = computed(() => this.planes().filter((p) => p.kind === 'WORDS'));
  /**
   * Las membresías de «Preparar documento».
   *
   * En su propio bloque y no mezcladas con el método: son otro producto. Quien
   * viene a por el conector de tesis no está eligiendo entre eso y una
   * traducción, y ponerlas en la misma fila convertiría la página en una lista
   * de cinco cosas que hay que comparar.
   */
  readonly membresias = computed(() => this.planes().filter((p) => p.kind === 'DOCUMENTO'));

  /**
   * Si «Preparar documento» se vende o no.
   *
   * APAGADO EL 22-SEP-2026, a propósito y de forma temporal. La clave de Gemini
   * está en el plan gratuito y se agota: un manuscrito de doce mil palabras no
   * cabe en veinte peticiones al día, y los clientes de esta tarde recibieron
   * «no lo terminamos» uno detrás de otro. Vender una membresía que no se puede
   * cumplir es cobrar por algo que no se entrega.
   *
   * PARA VOLVER A VENDERLO: activar la facturación de la clave en Google AI
   * Studio y poner esto en `true`. No hay nada más que deshacer; el producto
   * entero sigue en pie y quien ya tiene membresía lo sigue usando.
   *
   * No se comenta el bloque de la plantilla porque dentro lleva comentarios
   * HTML, y anidarlos deja la página rota sin avisar.
   */
  readonly seVendePreparar = false;
  readonly comprado = computed(
    () =>
      this.bolsaComprada() !== null ||
      this.licenciaComprada() !== null ||
      this.membresiaComprada() !== null ||
      this.carritoComprado() !== null,
  );

  // ── Totales de lo que se está pagando ──────────────────────────────────
  // Son la suma de cada producto con SU código, y valen igual para uno solo
  // que para un carrito. Las cifras son las que enseña la ventana; la que se
  // cobra la vuelve a calcular el servidor.

  /** Céntimos de sol a pagar, ya con los códigos aplicados. */
  readonly totalCents = computed(
    () =>
      this.enPago().reduce((suma, plan) => suma + this.finalCentsDe(plan), 0) -
      (this.descuentoTotal()?.amountCents ?? 0),
  );

  /** Lo que rebaja el código del total, en soles. Null sin código. */
  readonly ahorroDelTotal = computed(() => {
    const promo = this.descuentoTotal();
    return promo ? soles(promo.amountCents) : null;
  });

  /** Lo que se paga, en soles. */
  readonly total = computed(() => soles(this.totalCents()));

  /**
   * La cifra tachada del total, o null si no hay nada que tachar.
   *
   * La misma regla que en la tarjeta, sumada: con algún código se tacha el
   * precio de catálogo, y sin ninguno, el de antes de la oferta. Nunca las dos.
   */
  readonly totalTachado = computed(() => {
    const planes = this.enPago();
    const antes =
      this.conCodigo().length > 0 || this.descuentoTotal()
        ? planes.reduce((suma, plan) => suma + plan.priceCents, 0)
        : planes.reduce(
            (suma, plan) =>
              suma + Math.max(plan.priceCents, plan.listPriceCents ?? plan.priceCents),
            0,
          );
    return antes > this.totalCents() ? soles(antes) : null;
  });

  /** El total en dólares para PayPal, o null si algún producto no tiene precio en dólares. */
  readonly totalDolares = computed(() => {
    let suma = 0;
    for (const plan of this.enPago()) {
      const rebajado = this.descuentos()[plan.code]?.finalPriceUsdCents;
      const dolares = rebajado ?? plan.priceUsdCents;
      if (!dolares) return null;
      suma += dolares;
    }
    suma -= this.descuentoTotal()?.discountUsdCents ?? 0;
    return `$ ${(suma / 100).toFixed(2)}`;
  });

  /** Lo que viaja al servidor: códigos de plan y de descuento, nunca importes. */
  readonly lineas = computed<LineaCarrito[]>(() =>
    this.enPago().map((plan) => {
      const codigo = this.descuentos()[plan.code]?.code;
      return { planCode: plan.code, ...(codigo ? { discountCode: codigo } : {}) };
    }),
  );



  readonly pasarelaPaypal = computed(
    () => this.pasarelas().find((p) => p.code === 'PAYPAL') ?? null,
  );

  /** Culqi solo se ofrece si el servidor lo anuncia con su llave pública. */
  readonly pasarelaCulqi = computed(
    () => this.pasarelas().find((p) => p.code === 'CULQI' && p.publicKey) ?? null,
  );

  readonly pagoConCulqi = computed(
    () => Boolean(this.pasarelaCulqi()) && this.auth.isAuthenticated(),
  );

  // ── Pago con Culqi (tarjeta o Yape) ───────────────────────────────────
  readonly abriendoCulqi = signal(false);
  readonly errorCulqi = signal<string | null>(null);

  /** El botón necesita las tres cosas: pasarela, client id y sesión. */
  readonly pagoEnLinea = computed(
    () => Boolean(this.pasarelaPaypal()) && this.paypal.configurado && this.auth.isAuthenticated(),
  );

  /**
   * El código de activación de quien pagó por Yape o por transferencia.
   *
   * Se canjea AQUÍ, y es el único sitio: el perfil ya no tiene recuadro. Canjear
   * pide sesión —el acceso queda a nombre de alguien—, así que sin ella se pasa
   * por el acceso y se vuelve con el código ya escrito. La respuesta trae la URL
   * del conector, que solo puede verse en ese momento porque del token se guarda
   * el hash, y por eso se enseña en el mismo recuadro, con su botón de copiar.
   */
  readonly codigoCanje = new FormControl('', { nonNullable: true });
  readonly errorCanje = signal<string | null>(null);
  readonly canjeando = signal(false);
  /**
   * Lo canjeado: a qué producto da acceso y, si es una licencia, su URL, que no
   * se vuelve a enseñar.
   *
   * Sin URL cuando lo vendido es una membresía de «Preparar documento»: ahí no
   * hay nada que pegar en Claude, y lo que hace falta es el enlace a la
   * herramienta.
   */
  readonly canjeado = signal<{ producto: string; url: string | null; renovada: boolean } | null>(
    null,
  );
  readonly urlCopiada = signal(false);

  constructor() {
    effect(() => {
      const elemento = this.hostBoton()?.nativeElement ?? null;
      if (elemento && elemento !== this.hostMontado) {
        this.hostMontado = elemento;
        void this.montarBoton(elemento);
      }
    });

    // La ventana del pago congela la página de detrás mientras está abierta.
    effect(() => this.fondo.fijar('pago', this.enPago().length > 0));
    effect(() => this.fondo.fijar('carrito', this.cajonAbierto()));
    // Salir de /planes con el cajón abierto no puede dejar el resto del sitio congelado.
    this.destruir.onDestroy(() => this.fondo.fijar('carrito', false));

  }

  ngOnInit(): void {
    // El código que viene en la dirección: el del correo de activación, o el que
    // se escribió aquí antes de pasar por el acceso. Se rellena y nada más: el
    // botón lo pulsa quien mira. Canjear por abrir un enlace gastaría el código
    // con un enlace abierto por error o compartido.
    const traido = this.ruta.snapshot.queryParamMap.get('codigo')?.trim();
    if (traido) this.codigoCanje.setValue(traido);

    // El saldo solo existe si hay sesión; sin ella la página sigue siendo útil
    // como escaparate de precios.
    if (this.auth.isAuthenticated()) {
      this.billing.balance().subscribe({ next: (saldo) => this.saldo.set(saldo) });
      // Si falla, las tarjetas salen como para cualquiera: es una ayuda, no un requisito.
      this.licencias.mine().subscribe({
        next: ({ licencias }) => {
          this.misLicencias.set(licencias);
          // Lo que aún no se puede renovar sale del carrito: si se quedara,
          // se pagaría desde la cabecera sin pasar por la tarjeta que lo frena.
          const fuera = this.planes()
            .filter((plan) => this.miLicencia(plan)?.renovable === false)
            .map((plan) => plan.code);
          if (fuera.length > 0) this.carritoGuardado.quitar(fuera);
        },
        error: () => this.misLicencias.set([]),
      });
    }

    this.payments.providers().subscribe({
      next: (pasarelas) => this.pasarelas.set(pasarelas),
      error: () => this.pasarelas.set([]),
    });

    // Que esto falle no puede dejar la página sin precios: sin promos, las
    // tarjetas se pintan igual y quien tenga un código lo teclea a mano.
    this.billing.promos().subscribe({
      next: (promos) => this.promos.set(promos),
      error: () => this.promos.set([]),
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
        // Lo que dejó de venderse sale del carrito, también del número de la cabecera.
        this.carritoGuardado.conservar(vendibles.map((plan) => plan.code));

        this.cargando.set(false);

        const pedido = this.ruta.snapshot.queryParamMap.get('plan');
        const directo = pedido ? (vendibles.find((p) => p.code === pedido) ?? null) : null;
        if (directo) this.elegir(directo);

        // El icono del carrito de la cabecera trae aquí con `?carrito=ver`, que
        // abre el cajón. `pagar` era el de antes y se sigue aceptando.
        this.ruta.queryParamMap
          .pipe(takeUntilDestroyed(this.destruir))
          .subscribe((parametros) => {
            const pedido = parametros.get('carrito');
            if (pedido !== 'ver' && pedido !== 'pagar') return;
            this.abrirCajon();
            void this.router.navigate([], {
              relativeTo: this.ruta,
              queryParams: { carrito: null },
              queryParamsHandling: 'merge',
              replaceUrl: true,
            });
          });
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error).message);
        this.cargando.set(false);
      },
    });
  }

  /**
   * Cierra la ventana de pago y suelta lo elegido. El carrito se queda como
   * estaba: cerrar no es vaciarlo.
   */
  cambiarPlan(): void {
    if (this.procesando() || this.enviandoComprobante()) return;

    this.enPago.set([]);
    this.metodoPago.set(null);
    this.cierraEn.set(null);
    this.quitarDescuento();
    this.quitarCaptura();
    this.comprobanteEnviado.set(null);
    this.errorComprobante.set(null);
    this.errorCulqi.set(null);
    this.error.set(null);
  }

  /**
   * Se acabó el tiempo de la ventana.
   *
   * Hace exactamente lo que anuncia el cartel, ni mas ni menos: cerrar y soltar
   * lo elegido. Y deja dicho por qué, porque una ventana que desaparece sola
   * sin explicacion se lee como un fallo.
   *
   * NO se cierra a media subida. Si esta enviando el comprobante o procesando
   * el pago, `cambiarPlan` se niega, y aqui se respeta: cerrarle la ventana a
   * alguien que ya esta pagando seria el peor momento posible.
   */
  cerrarPorTiempo(): void {
    if (this.procesando() || this.enviandoComprobante()) return;
    this.cambiarPlan();
    this.cerradaPorTiempo.set(true);
  }

  /** «Comprar» en una tarjeta: se paga solo ese producto. */
  elegir(plan: Plan): void {
    this.abrirPago([plan]);
  }

  /** «Ir a pagar» en la barra del carrito: se paga todo lo que hay en él. */
  pagarCarrito(): void {
    if (this.carrito().length > 0) this.abrirPago(this.carrito());
  }

  // ── El carrito ───────────────────────────────────────────────────────────

  enCarrito(plan: Plan): boolean {
    return this.carritoGuardado.tiene(plan.code);
  }

  /** Lo mete o lo saca. Un producto va una vez: dos licencias iguales no suman nada. */
  alternarCarrito(plan: Plan): void {
    this.carritoGuardado.alternar(plan.code);
  }

  // ── El cajón «Tu carrito» ────────────────────────────────────────────────
  // Se abre desde la derecha con lo que lleva, sus precios y el total. «Comprar
  // ahora» también pasa por aquí: lo mete y abre el cajón, y el pago sale de
  // «Ir a pagar». Así hay un solo camino para pagar, se compre uno o varios.

  readonly cajonAbierto = signal(false);

  abrirCajon(): void {
    this.cajonAbierto.set(true);
  }

  cerrarCajon(): void {
    this.cajonAbierto.set(false);
  }

  /** «Comprar ahora»: al carrito (si no estaba) y el cajón abierto. */
  comprarAhora(plan: Plan): void {
    if (!this.enCarrito(plan)) this.carritoGuardado.alternar(plan.code);
    this.abrirCajon();
  }

  quitarDelCajon(plan: Plan): void {
    this.carritoGuardado.quitar([plan.code]);
  }

  /** «¿Tienes un código?» de la ventana de pago: despliega el de descuento y el de un compañero. */
  readonly verCodigos = signal(false);

  /** «+ Agregar número de operación»: el campo opcional, plegado hasta que se pide. */
  readonly verOperacion = signal(false);

  /** «Cambiar» en la ventana de pago: se cierra y vuelve al cajón, donde se quita o se añade. */
  volverAlCarrito(): void {
    if (this.procesando() || this.enviandoComprobante()) return;
    this.cambiarPlan();
    this.abrirCajon();
  }

  /** «Ir a pagar» del cajón: se cierra y se abre la ventana de pago con todo. */
  irAPagarDesdeCajon(): void {
    this.cerrarCajon();
    this.pagarCarrito();
  }

  /**
   * El precio de cada línea, igual que lo cobrará la ventana de pago: con un
   * solo producto vale su código anunciado, sea suyo o general; con varios,
   * solo el suyo, porque el general rebaja el total una vez (`descuentoGeneralCajon`).
   */
  precioEnCajonCents(plan: Plan): number {
    if (this.carrito().length === 1 || this.promoDe(plan)?.planCode) {
      return this.centimosAPagar(plan);
    }
    return plan.priceCents;
  }

  precioEnCajon(plan: Plan): string {
    return soles(this.precioEnCajonCents(plan));
  }

  private readonly descuentoGeneralCajon = computed(() => {
    const planes = this.carrito();
    if (planes.length < 2) return 0;
    const general = this.promos().find((p) => p.planCode === null);
    if (!general) return 0;
    const suma = planes.reduce((s, plan) => s + this.precioEnCajonCents(plan), 0);
    return Math.max(0, Math.min(general.amountCents, suma - 100));
  });

  /** Lo que costaría sin ofertas ni códigos: el tachado de cada tarjeta. */
  readonly subtotalCajonCents = computed(() =>
    this.carrito().reduce((suma, plan) => {
      const lista = plan.listPriceCents ?? 0;
      const antes = this.promoDe(plan) ? plan.priceCents : Math.max(lista, plan.priceCents);
      return suma + antes;
    }, 0),
  );

  readonly totalCajonCents = computed(
    () =>
      this.carrito().reduce((suma, plan) => suma + this.precioEnCajonCents(plan), 0) -
      this.descuentoGeneralCajon(),
  );

  readonly subtotalCajon = computed(() => soles(this.subtotalCajonCents()));
  readonly totalCajon = computed(() => soles(this.totalCajonCents()));
  readonly descuentosCajon = computed(() => {
    const rebaja = this.subtotalCajonCents() - this.totalCajonCents();
    return rebaja > 0 ? soles(rebaja) : null;
  });

  /** Saca del carrito lo que se acaba de pagar, se haya pagado junto o suelto. */
  private sacarDelCarrito(codigos: string[]): void {
    this.carritoGuardado.quitar(codigos);
  }

  /** Quita un producto desde la propia ventana de pago del carrito. */
  quitarDelPago(plan: Plan): void {
    if (this.procesando() || this.enviandoComprobante()) return;
    this.carritoGuardado.quitar([plan.code]);
    const quedan = this.enPago().filter((p) => p.code !== plan.code);
    if (quedan.length === 0) {
      this.cambiarPlan();
      return;
    }
    // Lo pagado cambia de importe: la captura elegida ya no vale, y el código
    // del que sale tampoco.
    this.enPago.set(quedan);
    this.quitarDescuentoDe(plan);
    this.quitarCaptura();
    // La rebaja del total se calculó sobre otra suma: se vuelve a comprobar.
    // Si queda un solo producto, el mismo código pasa a ser el suyo.
    const delTotal = this.descuentoTotal();
    if (delTotal) {
      this.descuentoTotal.set(null);
      void this.aplicarCodigo(delTotal.code, quedan);
    }
  }

  /** Abre la ventana de pago con estos productos. */
  private abrirPago(planes: Plan[]): void {
    if (this.procesando() || this.enviandoComprobante()) return;
    this.error.set(null);
    this.enPago.set([...planes]);
    // Abre ya en Yape: con PayPal oculto es el medio de siempre, y Culqi, si
    // está activo, queda a una pestaña.
    this.metodoPago.set('yape');
    this.verCodigos.set(false);
    this.verOperacion.set(false);
    this.cerradaPorTiempo.set(false);
    this.cierraEn.set(new Date(Date.now() + this.MINUTOS_DE_VENTANA * 60_000).toISOString());

    // Un código puede valer solo para un plan, así que al cambiar se suelta.
    this.quitarDescuento();
    // Y la captura también: es el comprobante de OTRO importe.
    this.quitarCaptura();
    this.comprobanteEnviado.set(null);
    this.errorComprobante.set(null);

    /**
     * El código anunciado de cada producto se aplica solo.
     *
     * Porque la tarjeta ya enseña el precio CON él puesto. Si hubiera que
     * teclearlo, quien pulsara el botón principal vería 159 en la tarjeta y 199
     * en la ventana de pago, y eso no es un detalle de interfaz: es anunciar un
     * precio y cobrar otro.
     *
     * Se valida contra el servidor como cualquier otro código —el importe lo
     * decide el backend, nunca esta pantalla—, así que si dejó de valer entre
     * que se pintó la página y el clic, el descuento no se aplica y la ventana
     * enseña el precio de catálogo. Es la única forma de que las dos cifras no
     * puedan discrepar.
     */
    //
    // En un carrito, el anunciado para «cualquier producto» rebaja el total una
    // sola vez, no cada producto: se aplica después de los de cada uno, porque
    // se calcula sobre lo que queda.
    void this.aplicarPromosAnunciadas(planes);
  }

  private async aplicarPromosAnunciadas(planes: Plan[]): Promise<void> {
    if (planes.length === 1) {
      const promo = this.promoDe(planes[0]);
      if (promo) await this.aplicarCodigo(promo.code, planes);
      return;
    }

    await Promise.all(
      planes.map((plan) => {
        const promo = this.promoDe(plan);
        return promo && promo.planCode ? this.aplicarCodigo(promo.code, [plan]) : null;
      }),
    );

    const general = this.promos().find((p) => p.planCode === null);
    if (general && this.enPago().length > 1) await this.aplicarCodigo(general.code, this.enPago());
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
      this.errorComprobante.set(
        'La imagen pesa más de 6 MB. Hazle una captura en vez de una foto.',
      );
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
    const lineas = this.lineas();
    const archivo = this.capturaElegida();
    if (lineas.length === 0 || !archivo || this.enviandoComprobante()) return;

    this.enviandoComprobante.set(true);
    this.errorComprobante.set(null);

    this.payments
      .enviarComprobante(lineas, archivo, {
        operationCode: this.numeroOperacion.value.trim() || undefined,
        codigoDelTotal: this.codigoDelTotal(),
      })
      .subscribe({
        next: (enviado) => {
          this.comprobanteEnviado.set(enviado);
          // Ya está pagado y en revisión: dejarlo en el carrito invitaría a
          // pagarlo otra vez.
          this.sacarDelCarrito(lineas.map((linea) => linea.planCode));
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

  /**
   * El código que escribió a mano. Con un producto, es el suyo; en un carrito,
   * el servidor dice si rebaja el total o solo uno de los productos.
   */
  aplicarDescuento(): void {
    const codigo = this.codigoPromo.value.trim();
    if (!codigo || !this.faltaCodigo() || this.comprobandoPromo()) return;
    void this.aplicarCodigo(codigo, this.enPago());
  }

  /**
   * Valida un código contra cada producto y lo deja puesto en los que lo
   * aceptan. Solo da error si no vale para ninguno: en un carrito, que el
   * código del método no rebaje el humanizador es lo esperado, no un fallo.
   *
   * El servidor decide si vale y cuánto rebaja; esta pantalla solo lo enseña.
   * No hace falta remontar el botón de PayPal: su `createOrder` lee los
   * códigos en el momento del clic, así que siempre usa los vigentes.
   */
  private async aplicarCodigo(codigo: string, planes: Plan[]): Promise<void> {
    if (planes.length > 1) return this.aplicarCodigoAlCarrito(codigo);

    this.comprobandoPromo.set(true);
    this.errorPromo.set(null);

    const resultados = await Promise.all(
      planes.map((plan) =>
        firstValueFrom(this.billing.validarDescuento(codigo, plan.code)).then(
          (promo) => ({ plan, promo, error: null }),
          (error: unknown) => ({ plan, promo: null, error: toApiError(error).message }),
        ),
      ),
    );

    // Se cerró la ventana o cambió lo que se paga mientras se comprobaba.
    const siguen = new Set(this.enPago().map((plan) => plan.code));
    const validos = resultados.filter((r) => r.promo && siguen.has(r.plan.code));

    if (validos.length > 0) {
      this.descuentos.update((actuales) => {
        const nuevos = { ...actuales };
        for (const { plan, promo } of validos) nuevos[plan.code] = promo!;
        return nuevos;
      });
      this.codigoPromo.reset();
    } else if (resultados.some((r) => siguen.has(r.plan.code))) {
      this.codigoPromo.setValue(codigo);
      this.errorPromo.set(resultados.find((r) => r.error)?.error ?? 'Ese código no es válido.');
    }

    this.comprobandoPromo.set(false);
  }

  /**
   * Comprueba el código escrito en un carrito contra todo lo que lleva.
   *
   * El servidor dice a qué se aplica: un código de un producto rebaja ese
   * producto, y uno general rebaja el total una sola vez.
   */
  private async aplicarCodigoAlCarrito(codigo: string): Promise<void> {
    this.comprobandoPromo.set(true);
    this.errorPromo.set(null);
    const lineas = this.lineas();

    let resultado: DescuentoDelCarrito | null = null;
    try {
      resultado = await firstValueFrom(this.billing.validarDescuentoCarrito(codigo, lineas));
    } catch (error: unknown) {
      if (this.esCarrito()) {
        this.codigoPromo.setValue(codigo);
        this.errorPromo.set(toApiError(error).message);
      }
    }

    // Se cerró la ventana o cambió lo que se paga mientras se comprobaba.
    const sigue =
      this.lineas().length === lineas.length &&
      this.lineas().every((l, i) => l.planCode === lineas[i].planCode);

    if (resultado && sigue) {
      if (resultado.alcance === 'TOTAL') {
        this.descuentoTotal.set(resultado.discount);
      } else if (resultado.planCode) {
        const planCode = resultado.planCode;
        this.descuentos.update((actuales) => ({ ...actuales, [planCode]: resultado!.discount }));
      }
      this.codigoPromo.reset();
    }

    this.comprobandoPromo.set(false);
  }

  /** El código del total venció con el modal abierto. */
  descuentoTotalVencido(): void {
    const promo = this.descuentoTotal();
    if (!promo) return;

    this.descuentoTotal.set(null);
    this.errorPromo.set(
      `El código ${promo.code} venció mientras decidías. El total vuelve a ser sin él.`,
    );
  }

  /** Quita el código del total. */
  quitarDescuentoTotal(): void {
    this.descuentoTotal.set(null);
  }

  /**
   * El código de este producto venció con el modal abierto.
   *
   * Se quita la rebaja y se dice por qué. La alternativa —dejar el precio
   * rebajado en pantalla— convierte un plazo cumplido en un cobro que falla al
   * pulsar pagar, y ahí el comprador no entiende que se le acabó el plazo:
   * entiende que la web está rota.
   */
  descuentoVencido(plan: Plan): void {
    const promo = this.descuentos()[plan.code];
    if (!promo) return;

    this.quitarDescuentoDe(plan);
    this.errorPromo.set(
      `El código ${promo.code} venció mientras decidías. El precio vuelve a ser el de catálogo.`,
    );
  }

  /** Quita el código de un producto. */
  quitarDescuentoDe(plan: Plan): void {
    this.descuentos.update(({ [plan.code]: _fuera, ...resto }) => resto);
    // El del total se calculó contando esa rebaja: se vuelve a comprobar.
    const delTotal = this.descuentoTotal();
    if (delTotal && this.esCarrito()) {
      this.descuentoTotal.set(null);
      void this.aplicarCodigoAlCarrito(delTotal.code);
    }
  }

  /** Quita todos los códigos y el error que hubiera. */
  quitarDescuento(): void {
    this.descuentos.set({});
    this.descuentoTotal.set(null);
    this.errorPromo.set(null);
    this.codigoPromo.reset();
  }

  /** Lo que se paga por este producto en la ventana, con su código si lo hay. */
  private finalCentsDe(plan: Plan): number {
    return this.descuentos()[plan.code]?.finalPriceCents ?? plan.priceCents;
  }

  /** El precio de este producto en la ventana de pago. */
  precioFinal(plan: Plan): string {
    return soles(this.finalCentsDe(plan));
  }

  /**
   * Lo que le quita al precio el código YA APLICADO. Null si no rebaja nada.
   *
   * Se resta del precio de catálogo el importe final que devolvió el servidor,
   * no `amountCents`: la rebaja anunciada puede venir topada —nunca deja el
   * precio en cero— y enseñar el tope sin aplicar sería prometer un ahorro
   * mayor que el que se hace en el cobro.
   */
  ahorroAplicado(plan: Plan): string | null {
    const promo = this.descuentos()[plan.code];
    if (!promo) return null;

    const rebaja = plan.priceCents - promo.finalPriceCents;
    return rebaja > 0 ? soles(rebaja) : null;
  }

  /** «30 días» o «permanente», según el plan. */
  /**
   * Qué se lleva quien compra este paquete.
   *
   * El método de tesis tiene su lista escrita —las Skills, el panel, la
   * duración—. Un grupo creado desde el panel no puede tenerla: nadie la ha
   * escrito. Para esos se arma con lo que el servidor sí sabe con certeza, que
   * es poco pero cierto. Inventarles viñetas sería prometer en su nombre.
   */
  loQueIncluye(plan: Plan): string[] {
    const duracion =
      plan.durationDays > 0
        ? `${this.vigencia(plan)} de acceso, renovables`
        : 'Acceso permanente, sin suscripción';

    // La duración va tercera en las listas escritas: con las dos primeras son
    // las tres que se destacan. Sale del plan y no del texto, así que si la
    // vigencia cambia desde el panel, la tarjeta cambia con ella.
    const escrita = this.incluye[plan.code];
    if (escrita) return [...escrita.slice(0, 2), duracion, ...escrita.slice(2)];

    // Sin lista escrita: el producto y su duración primero, que son las dos
    // que se destacan, y detrás lo que vale para cualquier paquete.
    return [
      `El ${plan.name}`,
      duracion,
      'Se conecta a tu cuenta de Claude.ai',
      'Funciona también con el plan gratuito de Claude',
    ];
  }

  /**
   * Qué trozo de una ventaja destacada va en negrita: [negrita, resto].
   *
   * «Las 12 Skills: las 9 fases…» se lee por su arranque, hasta los dos
   * puntos; una frase larga sin ellos, hasta la primera coma. Las cortas —«12
   * meses de acceso, renovables»— van enteras: partidas, la negrita se queda
   * en dos palabras sueltas.
   */
  partirVentaja(item: string): [string, string] {
    const dosPuntos = item.indexOf(':');
    if (dosPuntos > 0) return [item.slice(0, dosPuntos + 1), item.slice(dosPuntos + 1)];

    const coma = item.indexOf(',');
    if (item.length > 45 && coma > 0) return [item.slice(0, coma + 1), item.slice(coma + 1)];

    return [item, ''];
  }

  /**
   * La caja del producto que va en la cabecera de la tarjeta.
   *
   * POR QUÉ UNA IMAGEN Y NO UN ICONO
   * --------------------------------
   * Tres tarjetas de texto seguidas se leen como tres párrafos y hay que
   * leerlas enteras para saber cuál es cuál. La caja arriba las separa de un
   * vistazo y, además, repite en su portada lo que la tarjeta cuenta debajo:
   * el nombre, lo que incluye y la duración. Es la misma promesa que la lista
   * de «Qué incluye», dicha sin palabras.
   *
   * POR PREFIJO DEL CÓDIGO, no por una lista de códigos exactos: igual que
   * `producto.perfil.js` en el servidor. Un grupo que se cree mañana desde el
   * panel con un código que empiece por ARTICULO nace con su caja, sin tocar
   * esto.
   *
   * Devuelve `null` —y no una caja cualquiera— cuando el código no encaja en
   * ninguno: la tarjeta cae entonces en el dibujo genérico de la plantilla,
   * que es un documento a secas. Enseñar la caja de «Artículos Científicos»
   * sobre un producto que no lo es sería una promesa escrita en la portada.
   */
  imagenDe(plan: Plan): string | null {
    // Las membresías de documentos se distinguen entre sí por la duración, que
    // va rotulada en la propia caja: «1 mes» y «3 meses».
    if (plan.kind === 'DOCUMENTO') {
      return plan.durationDays > 30
        ? '/productos/05-preparar-documento-trimestral-caja.svg'
        : '/productos/04-preparar-documento-mensual-caja.svg';
    }

    const codigo = plan.code.toUpperCase();
    if (codigo.startsWith('ARTICULO')) return '/productos/02-articulos-cientificos-caja.svg';
    if (codigo.startsWith('HUMANIZ')) return '/productos/03-humanizador-academico-caja.svg';
    if (codigo.startsWith('METODO')) return '/productos/01-metodo-de-tesis-caja.svg';
    return null;
  }

  /**
   * Cuántas viñetas van destacadas: las tres primeras de la lista escrita.
   *
   * Son las que deciden la compra —las Skills, el panel y la duración— y en
   * una lista de seis todas iguales se leían como requisitos
   * técnicos. Un paquete sin lista escrita destaca dos: el producto y su
   * duración. Las genéricas de detrás no, que sería subrayar «se conecta a tu
   * cuenta» como si fuera el argumento de venta.
   */
  clavesDe(plan: Plan): number {
    return this.incluye[plan.code] ? 3 : 2;
  }

  // ── «Qué incluye cada paquete» ─────────────────────────────────────────

  /** La pestaña elegida. Sin elegir, la del primer paquete. */
  readonly pestana = signal<string | null>(null);

  readonly pestanaActiva = computed(() => {
    const planes = this.metodo();
    return planes.find((plan) => plan.code === this.pestana()) ?? planes[0] ?? null;
  });

  /** «Ver qué incluye» de una tarjeta: abre su pestaña y baja hasta el panel. */
  verQueIncluye(plan: Plan): void {
    this.pestana.set(plan.code);
    document.getElementById('que-incluye')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** El nombre de la pestaña: el de venta no cabe en tres pestañas seguidas. */
  nombreCorto(plan: Plan): string {
    const codigo = plan.code.toUpperCase();
    if (codigo.startsWith('METODO')) return 'Método de Tesis';
    if (codigo.startsWith('ARTICULO')) return 'Artículos Científicos';
    if (codigo.startsWith('HUMANIZ')) return 'Humanizador';
    return plan.name;
  }

  /**
   * Las fases de la ruta, si el paquete la tiene. Por prefijo, como `imagenDe`.
   * El Humanizador no sigue ninguna ruta: su pestaña va sin esta columna.
   */
  fasesDe(plan: Plan): { titulo: string; lista: readonly string[] } | null {
    const codigo = plan.code.toUpperCase();
    if (codigo.startsWith('METODO')) {
      return { titulo: `Las ${ETAPAS_TESIS.length} etapas del método`, lista: ETAPAS_TESIS };
    }
    if (codigo.startsWith('ARTICULO')) {
      return { titulo: `Las ${FASES_ARTICULO.length} fases de la ruta`, lista: FASES_ARTICULO };
    }
    return null;
  }

  /** Días antes del fin desde los que se puede renovar. */
  private readonly DIAS_PARA_RENOVAR = 30;

  /**
   * La licencia que ya tiene de este producto, si la tiene.
   *
   * Solo cuentan las activas: una revocada o suspendida no es «ya lo tienes».
   * La vencida sí se devuelve, porque lo que toca entonces es renovarla y la
   * tarjeta lo dice así. Si hay varias, la que dura más.
   *
   * `renovable` se abre un mes antes del fin: antes, el botón de compra queda
   * apagado y dice desde cuándo podrá renovar, para que nadie pague por error
   * lo que ya tiene vigente para meses.
   */
  miLicencia(
    plan: Plan,
  ): { licencia: License; vencida: boolean; renovable: boolean; renovarDesde: Date | null } | null {
    if (!plan.productCode) return null;
    const mias = this.misLicencias()
      .filter((l) => l.productCode === plan.productCode && l.status === 'ACTIVE')
      .sort((a, b) => this.finDe(b) - this.finDe(a));
    const licencia = mias[0];
    if (!licencia) return null;
    const fin = this.finDe(licencia);
    const desde = fin - this.DIAS_PARA_RENOVAR * 24 * 60 * 60 * 1000;
    return {
      licencia,
      vencida: fin < Date.now(),
      renovable: desde <= Date.now(),
      renovarDesde: Number.isFinite(desde) ? new Date(desde) : null,
    };
  }

  /** Sin fecha de fin es para siempre. */
  private finDe(licencia: License): number {
    return licencia.expiresAt ? new Date(licencia.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  }

  /**
   * La tarjeta que lleva la cinta de «El más elegido».
   *
   * Es el método de tesis, que es por donde entra la mayoría. Solo se marca
   * cuando hay más de una tarjeta: con una sola en pantalla, decirle que es la
   * más elegida de una es una etiqueta sin comparación posible.
   */
  esElMasElegido(plan: Plan): boolean {
    // `METODO_9_SKILLS` se retiró de la venta: el método de tesis que se vende
    // hoy es el que trae el Humanizador y Bajar similitud.
    return plan.code === 'METODO_DE_TESIS_HUMANIZADOR' && this.metodo().length > 1;
  }

  /**
   * Canjea el código aquí mismo. Sin sesión, pasa antes por el acceso y vuelve
   * a esta página con el código escrito, para pulsar Canjear otra vez.
   */
  canjear(): void {
    if (this.canjeando()) return;
    const codigo = this.codigoCanje.value.trim();

    // Los códigos son del tipo ACR-XXXX-XXXX-XXXX; con menos de seis
    // caracteres no hay nada que comprobar.
    if (codigo.length < 6) {
      this.errorCanje.set('Escribe el código completo, tal como te llegó en el correo.');
      return;
    }
    this.errorCanje.set(null);

    if (!this.auth.isAuthenticated()) {
      const vuelta = `/planes?codigo=${encodeURIComponent(codigo)}`;
      void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: vuelta } });
      return;
    }

    // Los códigos los genera el administrador: canjearse uno a sí mismo
    // apuntaría una venta que no existió.
    if (this.auth.hasRole('ADMIN')) {
      this.errorCanje.set('Con la cuenta de administrador no se canjean códigos.');
      return;
    }

    this.canjeando.set(true);
    this.licencias.redeem(codigo).subscribe({
      next: ({ license, connectorUrl, membresia, renovada }) => {
        this.canjeando.set(false);
        this.codigoCanje.reset();
        // Una membresía de documentos o una licencia del conector: el código
        // puede vender las dos cosas, y solo llega una.
        this.canjeado.set(
          membresia
            ? { producto: membresia.plan.name, url: null, renovada: Boolean(renovada) }
            : {
                producto: license?.productName ?? license?.productCode ?? 'tu acceso',
                url: connectorUrl ?? null,
                renovada: false,
              },
        );
        // Quita el código de la dirección: ya está gastado, y recargar la
        // página no debe volver a ponerlo en el campo.
        void this.router.navigate([], {
          relativeTo: this.ruta,
          queryParams: { codigo: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      },
      error: (error: unknown) => {
        this.canjeando.set(false);
        this.errorCanje.set(toApiError(error).message);
      },
    });
  }

  async copiarUrlCanjeada(): Promise<void> {
    const url = this.canjeado()?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.urlCopiada.set(true);
      setTimeout(() => this.urlCopiada.set(false), 2500);
    } catch {
      this.errorCanje.set('No pudimos copiar. Selecciona la URL y cópiala a mano.');
    }
  }

  /**
   * Cuánto dura lo que se compra.
   *
   * En meses cuando cuadran justos: «3 meses» se entiende de un vistazo y
   * «90 días» hay que traducirlo mentalmente. Los que no cuadran se quedan en
   * días, que es como los piensa quien los configuró.
   */
  vigencia(plan: Plan): string {
    if (plan.durationDays <= 0) return 'Acceso permanente';
    if (plan.durationDays % 30 !== 0) return `${plan.durationDays} días`;

    const meses = plan.durationDays / 30;
    return meses === 1 ? '1 mes' : `${meses} meses`;
  }

  /**
   * El precio, sin céntimos cuando no los hay.
   *
   * «S/ 199.00» son tres caracteres de ruido en la cifra más grande de la
   * página, y el «.00» solo sirve para que parezca una factura. Si algún plan
   * llega a costar S/ 199.50, los céntimos vuelven a salir.
   */
  /** La clase del acento de la tarjeta: acento-0 … acento-3. */
  acento(posicion: number): string {
    return `acento-${acentoDe(posicion)}`;
  }

  precio(plan: Plan): string {
    return soles(plan.priceCents);
  }

  /**
   * El código que se anuncia en la tarjeta de este plan, si hay alguno.
   *
   * Gana el que está atado a ESE plan sobre el que vale para todos: un código
   * hecho para el método de tesis es más pertinente en su tarjeta que uno
   * general, aunque el general rebaje más. Y solo se enseña uno: dos códigos en
   * la misma tarjeta obligan a comparar cuál conviene, que es trabajo que no le
   * toca al comprador.
   */
  promoDe(plan: Plan): Promo | null {
    const suyas = this.promos().filter((p) => p.planCode === plan.code);
    if (suyas.length > 0) return suyas[0];
    return this.promos().find((p) => p.planCode === null) ?? null;
  }

  /**
   * El precio de antes, para tacharlo. Null = este plan no está de oferta.
   *
   * Sale del catálogo, no de una cifra escrita en la plantilla: el día que
   * alguien cambie el precio desde el panel, el tachado cambia con él o deja
   * de salir. Un «antes» escrito a mano se queda ahí para siempre y acaba
   * anunciando una rebaja sobre un precio que ya no existió nunca.
   *
   * Se comprueba que de verdad sea mayor. El servidor ya descarta los que no
   * lo son, pero esta pantalla no puede permitirse pintar un tachado por
   * debajo del precio que cobra.
   */
  precioAntes(plan: Plan): string | null {
    const antes = plan.listPriceCents;
    return antes && antes > plan.priceCents ? soles(antes) : null;
  }

  /**
   * Lo que de verdad va a pagar por este plan, en céntimos.
   *
   * Si el plan tiene un código anunciado, ese código YA VA APLICADO al elegirlo
   * —lo hace `elegir`—, así que la cifra grande de la tarjeta es la rebajada. Y
   * tiene que serlo: anunciar S/159 y cobrar S/199 a quien pulse el botón
   * principal en vez del cupón sería mentir con la cifra más visible de la
   * página.
   */
  private centimosAPagar(plan: Plan): number {
    const promo = this.promoDe(plan);
    if (!promo) return plan.priceCents;

    // El mismo tope que aplica el servidor: la rebaja no deja el precio en cero.
    return plan.priceCents - Math.min(promo.amountCents, plan.priceCents - 100);
  }

  /** La cifra grande: lo que se paga. */
  precioTarjeta(plan: Plan): string {
    return soles(this.centimosAPagar(plan));
  }

  /**
   * La cifra tachada, o null si no hay nada que tachar.
   *
   * Con código anunciado se tacha el precio de catálogo, que es exactamente lo
   * que pagaría quien no lo usara. Sin código, el precio de lista de la oferta.
   * Nunca las dos: dos cifras tachadas seguidas no se leen, se calculan.
   */
  precioTachado(plan: Plan): string | null {
    if (this.promoDe(plan)) return soles(plan.priceCents);
    return this.precioAntes(plan);
  }

  /** Cuánto se ahorra, en soles enteros. Null si no hay oferta. */
  ahorro(plan: Plan): string | null {
    const pagando = this.centimosAPagar(plan);
    const antes = this.promoDe(plan) ? plan.priceCents : (plan.listPriceCents ?? 0);
    if (!antes || antes <= pagando) return null;
    return soles(antes - pagando);
  }

  precioDolares(plan: Plan): string | null {
    return plan.priceUsdCents ? `$ ${(plan.priceUsdCents / 100).toFixed(2)}` : null;
  }

  porMil(plan: Plan): string {
    return plan.words > 0 ? `S/ ${((plan.priceCents / 100 / plan.words) * 1000).toFixed(2)}` : '';
  }

  /** Copia la URL de un producto del carrito recién comprado. */
  async copiarUrlDe(entregado: ProductoEntregado): Promise<void> {
    if (!entregado.connectorUrl) return;
    try {
      await navigator.clipboard.writeText(entregado.connectorUrl);
      this.copiadaDe.set(entregado.plan.code);
      setTimeout(() => this.copiadaDe.set(null), 2500);
    } catch {
      this.error.set('No pudimos copiar. Selecciona la URL y cópiala a mano.');
    }
  }

  /** Si alguno de los productos del carrito trae una URL del conector que guardar. */
  hayUrlEn(entregados: ProductoEntregado[]): boolean {
    return entregados.some((entregado) => Boolean(entregado.connectorUrl));
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

  /**
   * Abre el formulario de Culqi.
   *
   * La orden se abre en NUESTRO servidor primero: ahí se fija el importe, con
   * el descuento si lo hay, y ese es el que se cobra. El formulario solo
   * enseña la cifra; el navegador nunca decide cuánto se paga.
   */
  async pagarConCulqi(): Promise<void> {
    const lineas = this.lineas();
    const clave = this.pasarelaCulqi()?.publicKey;
    if (lineas.length === 0 || !clave || this.abriendoCulqi() || this.procesando()) return;

    this.error.set(null);
    this.errorCulqi.set(null);
    this.abriendoCulqi.set(true);

    try {
      await this.culqi.preparar();
      const orden = await firstValueFrom(
        this.payments.createOrder(lineas, 'CULQI', this.codigoDelTotal()),
      );
      this.culqi.abrir(
        clave,
        { amountCents: orden.amountCents, email: this.auth.user()?.email ?? null },
        (resultado) => void this.alResultadoCulqi(resultado, clave, orden),
      );
    } catch (error: unknown) {
      this.errorCulqi.set(
        error instanceof HttpErrorResponse
          ? toApiError(error).message
          : 'No pudimos abrir el pago con tarjeta o Yape. Inténtalo de nuevo o paga con Yape y tu captura.',
      );
    } finally {
      this.abriendoCulqi.set(false);
    }
  }

  /**
   * El formulario devolvió el token: se cobra en el servidor. Si el banco pide
   * su verificación (3-D Secure), se pasa y se vuelve a confirmar con los
   * mismos datos más los del banco, como pide Culqi.
   */
  private async alResultadoCulqi(
    resultado: ResultadoCheckout,
    clave: string,
    orden: PaymentOrder,
  ): Promise<void> {
    if (resultado.tipo === 'error') {
      this.errorCulqi.set(resultado.mensaje);
      return;
    }

    this.procesando.set(true);
    this.errorCulqi.set(null);

    try {
      const huella = await this.culqi.huella(clave);
      const correo = resultado.email && resultado.email.length <= 50 ? resultado.email : null;
      const datos: DatosDelCobro = {
        token: resultado.token,
        ...(huella ? { deviceFingerprint: huella } : {}),
        ...(correo ? { email: correo } : {}),
      };

      let cobro = await firstValueFrom(this.payments.capture(orden.orderId, 'CULQI', datos));

      if (cobro.requiresAuthentication) {
        let parametros;
        try {
          parametros = await this.culqi.verificar(clave, {
            token: resultado.token,
            amountCents: orden.amountCents,
            email: correo ?? this.auth.user()?.email ?? '',
          });
        } catch {
          this.errorCulqi.set(
            'Tu banco no confirmó la compra. No se te cobró nada: vuelve a intentarlo o usa otra tarjeta.',
          );
          return;
        }
        cobro = await firstValueFrom(
          this.payments.capture(orden.orderId, 'CULQI', { ...datos, authentication3DS: parametros }),
        );
      }

      this.mostrarCompra(cobro);
    } catch (error: unknown) {
      this.errorCulqi.set(toApiError(error).message);
    } finally {
      this.procesando.set(false);
    }
  }

  /**
   * Enseña lo comprado, venga de PayPal o de Culqi, y lo saca del carrito.
   *
   * Un carrito trae `items`, uno por producto, y se enseña en su propia
   * pantalla: cada licencia llega con su URL, y una pantalla pensada para una
   * sola se quedaría con la primera.
   */
  private mostrarCompra(resultado: PaymentResult): void {
    if (resultado.balance) this.saldo.set(resultado.balance);
    this.sacarDelCarrito(this.enPago().map((plan) => plan.code));

    // La ventana ya no tiene nada que cobrar. Se suelta aquí y no con
    // `cambiarPlan`, que se niega mientras el pago se está procesando.
    this.enPago.set([]);
    this.cierraEn.set(null);

    if (resultado.items) {
      this.carritoComprado.set(resultado.items);
      return;
    }

    this.bolsaComprada.set(resultado.pack ?? null);
    this.licenciaComprada.set(resultado.license ?? null);
    this.membresiaComprada.set(resultado.membresia ?? null);
    this.urlConector.set(resultado.connectorUrl ?? null);

    if (resultado.alreadyProcessed && !resultado.connectorUrl) {
      this.error.set(
        'Este pago ya estaba confirmado. Si compraste el método y perdiste tu URL, ' +
          'genera una nueva desde tu panel.',
      );
    }
  }

  private async montarBoton(contenedor: HTMLElement): Promise<void> {
    // La orden abierta en este momento. `onError` no dice cuál era, y sin
    // cerrarla quedaba «pendiente» en el servidor para siempre.
    let ordenAbierta: string | null = null;

    try {
      const sdk = await this.paypal.load(this.pasarelaPaypal()?.currency ?? 'USD');

      await sdk
        .Buttons({
          style: { layout: 'vertical', shape: 'rect', label: 'pay', height: 44 },

          createOrder: async () => {
            this.error.set(null);
            this.procesando.set(true);
            try {
              const orden = await firstValueFrom(this.payments.createOrder(this.lineas(), 'PAYPAL', this.codigoDelTotal()));
              ordenAbierta = orden.orderId;
              return orden.orderId;
            } catch (error: unknown) {
              this.procesando.set(false);
              this.error.set(toApiError(error).message);
              throw error;
            }
          },

          onApprove: async (data, actions) => {
            try {
              const resultado = await firstValueFrom(this.payments.capture(data.orderID));
              ordenAbierta = null;
              this.mostrarCompra(resultado);
            } catch (error: unknown) {
              const apiError = toApiError(error);
              this.error.set(apiError.message);
              // El banco rechazó esa tarjeta pero la orden sigue abierta: PayPal
              // pide reabrir su ventana para que elija otro medio de pago.
              if (apiError.code === ERROR_CODE.PAYMENT_DECLINED) {
                try {
                  await actions.restart();
                  return;
                } catch {
                  // Si no se puede reabrir, queda el mensaje y el botón de nuevo.
                }
              }
            } finally {
              this.procesando.set(false);
            }
          },

          onCancel: (data) => {
            this.procesando.set(false);
            const orden = data.orderID ?? ordenAbierta;
            ordenAbierta = null;
            if (orden) {
              this.payments.cancel(orden).subscribe({ error: () => undefined });
            }
            this.error.set(
              'Cerraste PayPal sin terminar el pago; no se te cobró nada. ' +
                'Si tu tarjeta no pasó en PayPal, puedes pagar por Yape.',
            );
          },

          onError: (error: unknown) => {
            this.procesando.set(false);
            // El error pasa dentro de la ventana de PayPal y el servidor no lo
            // ve: se cierra la orden y se le manda el motivo para el log.
            const motivo = error instanceof Error ? error.message : String(error ?? '');
            if (ordenAbierta) {
              this.payments
                .cancel(ordenAbierta, 'PAYPAL', motivo || 'Error del botón de PayPal')
                .subscribe({ error: () => undefined });
              ordenAbierta = null;
            }
            this.error.set('PayPal devolvió un error. Vuelve a intentarlo o págalo por Yape.');
          },
        })
        .render(contenedor);
    } catch {
      this.hostMontado = null;
      this.error.set('No pudimos cargar el pago con PayPal. Escríbenos y lo activamos a mano.');
    }
  }
}
