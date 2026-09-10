import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { mensajeDeError } from '../../core/http/api-error';
import {
  ActivationCode,
  Alerta,
  CodigoDescuento,
  LicenciaAdmin,
  MetodoDeCobro,
  PackAdmin,
  PagoAdmin,
} from '../../core/models/admin.model';
import {
  Descuento,
  MEDIOS_PAGO as MEDIOS,
  PagoPorRevisar,
  PagoRevisado,
} from '../../core/models/payment.model';
import { Plan } from '../../core/models/rewrite.model';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { FondoService } from '../../core/services/fondo.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { BillingService, Grupo } from '../../core/services/billing.service';
import { PaymentService } from '../../core/services/payment.service';
import { Tutorial, TutorialEnvio, TutorialService } from '../../core/services/tutorial.service';
import {
  EstadoCorpus,
  Referencia,
  ReferenceService,
} from '../../core/services/reference.service';
import { AnalisisBundle, Skill, SkillService } from '../../core/services/skill.service';
import { AdminCreado, UserService } from '../../core/services/user.service';
import { User } from '../../core/models/user.model';
import { AjustesDeCuenta } from '../../shared/cuenta/ajustes-de-cuenta';
import { MiConector } from '../../shared/cuenta/mi-conector';
import { SiteHeader } from '../../shared/layout/site-header';
import { Acceso, unirAccesos } from './accesos';
import { columnas, lunes, porCategoria, porSemana } from './graficos';
import { FiltrosLista } from './filtros-lista';
import { Listado } from './listado';
import { PieLista } from './pie-lista';

type Seccion =
  | 'accesos'
  | 'grupos'
  | 'descuentos'
  | 'licencias'
  | 'alertas'
  | 'corpus'
  | 'tutoriales'
  | 'admins'
  | 'usuarios'
  | 'perfil';

/**
 * El nombre y el para qué de cada sección, tal y como salen en la cabecera.
 *
 * Vivían dentro de las tarjetas —repetidos en unas, ausentes en otras—, así que
 * la pantalla no decía qué era hasta que se leía la primera tabla. Aquí están
 * los diez en una sola lista, que es donde se ve si uno desentona.
 */
const PAGINAS: Record<Seccion, { titulo: string; nota: string }> = {
  accesos: {
    titulo: 'Accesos',
    nota: 'Lo que entra, lo que falta revisar y todo lo emitido o cobrado.',
  },
  descuentos: {
    titulo: 'Descuentos',
    nota: 'Códigos promocionales que rebajan el precio de un producto.',
  },
  grupos: {
    titulo: 'Grupos',
    nota:
      'Un grupo es un producto: sus capítulos, su precio y cuánto dura. «Método de tesis» es ' +
      'uno; «humanizar texto» puede ser otro, con otros capítulos y otro precio. Cada licencia ' +
      'solo ve los capítulos de su grupo.',
  },
  licencias: {
    titulo: 'Licencias',
    nota: 'Quién tiene el conector encendido, con qué producto y cuánto lo está usando.',
  },
  alertas: {
    titulo: 'Alertas',
    nota:
      'Sospechas de uso compartido. A la primera alta se avisa al comprador por correo; solo si ' +
      'vuelve a saltar pasadas 12 horas se revoca sola. Aquí puedes adelantarte o descartarla.',
  },
  corpus: {
    titulo: 'Bibliografía',
    nota: 'El corpus que citan las Skills. Se cura en Zotero; aquí solo se trae y se comprueba.',
  },
  tutoriales: {
    titulo: 'Tutoriales',
    nota: 'Los videos que se ven en acostaresearch.com/tutoriales.',
  },
  admins: {
    titulo: 'Administradores',
    nota:
      'Da acceso al panel a otra persona. Solo se crean administradores: los usuarios normales ' +
      'se registran solos desde la web.',
  },
  usuarios: {
    titulo: 'Usuarios',
    nota: 'Todo el que tiene cuenta en la web. Esta lista solo la ve un administrador.',
  },
  perfil: {
    titulo: 'Mi perfil',
    nota: 'Tus datos, tu contraseña y tu propio conector.',
  },
};

/** Rebaja mínima que acepta el servidor, en céntimos de sol. */
const DESCUENTO_MINIMO = 1000;

/**
 * Un `.skill` esperando turno para publicarse.
 *
 * Se inspecciona en cuanto entra en la cola —antes de que nadie pulse nada—,
 * así que para cuando el administrador mira ya sabe cuáles son nuevos y
 * cuáles pisan un capítulo existente.
 */
interface EnCola {
  archivo: File;
  analisis: AnalisisBundle | null;
  estado: 'analizando' | 'lista' | 'subiendo' | 'publicada' | 'error';
  error: string | null;
}

/**
 * Semanas que abarcan los gráficos.
 *
 * Ocho es lo que cabe legible en una tarjeta del ancho del panel sin que las
 * etiquetas del eje se pisen, y a la vez suficiente para ver una tendencia en
 * un negocio que vende por trimestres.
 */
const SEMANAS = 8;

/** Importes cortos para los ejes: S/ 1,2k en vez de S/ 1.200. */
const MILES = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });

/** Importe entero, con separador de miles: S/ 1,200. */
function soles(cents: number): string {
  return `S/ ${MILES.format(cents / 100)}`;
}

/**
 * Lo mismo, abreviado, y SOLO para las marcas del eje.
 *
 * Ahí el hueco es de treinta píxeles y «S/ 1,200» no cabe sin comerse la
 * primera barra. La cifra grande y la pista sí van enteras: son las que se
 * leen, y un ingreso redondeado a «1,2k» esconde justo lo que se quiere ver.
 */
function solesCorto(cents: number): string {
  const valor = cents / 100;
  if (valor >= 1000) return `S/ ${(valor / 1000).toFixed(1).replace('.', ',')}k`;
  return `S/ ${Math.round(valor)}`;
}

/** Métodos de pago que acepta el backend para una activación manual. */
const METODOS = ['YAPE', 'PLIN', 'TRANSFERENCIA', 'PAYPAL', 'WESTERN_UNION', 'CORTESIA'] as const;

/**
 * Soles por dólar, y cuánto se carga encima para PayPal.
 *
 * El precio se piensa y se escribe en soles, que es lo que paga un tesista por
 * Yape. El de PayPal se calcula: pedir dos precios a mano era pedir dos veces lo
 * mismo, y garantizaba que un día se cambiara uno y no el otro.
 *
 * El recargo cubre lo que PayPal se queda —un 5,4 % más una comisión fija— para
 * que lo que llega se parezca al precio anunciado. Con estos números, S/ 199
 * salen $ 57,90, que es exactamente lo que hay hoy en el catálogo.
 *
 * El tipo de cambio se mueve, así que conviene revisarlo un par de veces al año.
 * Está aquí y no en la base de datos a propósito: cambiarlo es una decisión de
 * negocio que se toma mirando, no un ajuste que deba poder tocarse por descuido
 * desde una pantalla.
 */
const SOLES_POR_DOLAR = 3.75;
const RECARGO_PAYPAL = 0.09;

/**
 * Deja el código de un grupo como lo exige el servidor: `MAYUSCULAS_CON_GUION`.
 *
 * Se normaliza mientras se escribe en vez de rechazarlo al guardar. Ese código
 * viaja en cada licencia emitida y en los logs, así que la regla es estricta a
 * propósito —sin tildes, sin espacios, sin minúsculas—, pero nada de eso es
 * evidente para quien escribe «Método_Tesis_Humanizador» y recibe un error
 * después de haber rellenado el formulario entero.
 *
 * La descomposición Unicode separa la tilde de su letra («é» → «e» + acento) y
 * el rango se lleva por delante los acentos sueltos, que es la forma corta de
 * convertir É en E sin una tabla de equivalencias.
 */
function normalizarCodigoDeGrupo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_');
}

/** Lo que se cobrará por PayPal. Se redondea hacia arriba a la décima. */
function aDolares(soles: number): number {
  if (!soles || soles <= 0) return 0;
  return Math.ceil((soles / SOLES_POR_DOLAR) * (1 + RECARGO_PAYPAL) * 10) / 10;
}

/**
 * Un importe de la pasarela, en céntimos de sol.
 *
 * PayPal cobra en dólares y todo lo demás en soles. Los gráficos suman las dos
 * cosas, y sin convertir el resultado no es dinero de ninguna moneda: un dólar
 * contaba como un sol y PayPal salía casi cuatro veces más pequeño de lo que es.
 *
 * Es una conversión para MIRAR, no para cuadrar la contabilidad: usa el mismo
 * tipo con el que se ponen los precios, no el del día del cobro.
 */
function aCentimosDeSol(cents: number, moneda: string): number {
  return moneda === 'USD' ? Math.round(cents * SOLES_POR_DOLAR) : cents;
}

/**
 * Las vías por las que puede entrar dinero. Salen todas, incluso a cero.
 *
 * Son tres cosas distintas y ninguna sustituye a otra: PayPal cobra solo, Yape
 * necesita que alguien mire el comprobante, y el código de activación es lo que
 * se vende a mano por WhatsApp. Que una esté a cero es información, no un motivo
 * para esconderla.
 */
const VIAS_DE_COBRO = ['PayPal', 'Yape', 'Código de activación'];

/**
 * Panel de administración.
 *
 * Es una herramienta de trabajo, no un escaparate: lo que se mira a diario va
 * primero —vender y vigilar— y el histórico queda detrás.
 */
@Component({
  selector: 'app-admin',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    SiteHeader,
    FiltrosLista,
    PieLista,
    AjustesDeCuenta,
    MiConector,
  ],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminService);
  private readonly billing = inject(BillingService);
  private readonly dialogos = inject(DialogoService);
  private readonly fondo = inject(FondoService);
  private readonly payments = inject(PaymentService);
  private readonly usuariosApi = inject(UserService);
  private readonly auth = inject(AuthService);

  /** La cuenta con la que se está administrando ahora mismo. */
  readonly yo = this.auth.user;

  readonly metodos = METODOS;
  readonly seccion = signal<Seccion>('accesos');

  /** Título y descripción de la sección abierta, para la cabecera. */
  readonly pagina = computed(() => PAGINAS[this.seccion()]);

  /** Las dos letras del avatar de la barra lateral. */
  readonly iniciales = computed(() => {
    const user = this.yo();
    if (!user) return '';
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  });

  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  // ── Datos ────────────────────────────────────────────────────────────────
  readonly planes = signal<Plan[]>([]);
  readonly licencias = signal<LicenciaAdmin[]>([]);
  readonly alertas = signal<Alerta[]>([]);
  readonly codigos = signal<ActivationCode[]>([]);
  readonly bolsas = signal<PackAdmin[]>([]);
  readonly pagos = signal<PagoAdmin[]>([]);
  readonly descuentos = signal<CodigoDescuento[]>([]);
  readonly descuentoNuevo = signal<CodigoDescuento | null>(null);

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

  // ── Listados ─────────────────────────────────────────────────────────────
  //
  // Las cinco tablas largas del panel se buscan, se filtran y se despliegan de
  // diez en diez. El comportamiento vive en `Listado`; aquí solo se dice, por
  // cada una, por qué texto se busca y qué significa cada pestaña.

  readonly listaLicencias = new Listado(this.licencias, {
    filtros: [
      { valor: 'todas', etiqueta: 'Todas' },
      { valor: 'activas', etiqueta: 'Activas' },
      { valor: 'suspendidas', etiqueta: 'Suspendidas' },
      { valor: 'revocadas', etiqueta: 'Revocadas' },
    ],
    texto: (l) => [
      l.user.email,
      `${l.user.firstName} ${l.user.lastName}`,
      l.productCode,
      l.tokenHint,
      l.revokedReason,
    ],
    pasa: (l, filtro) =>
      filtro === 'activas'
        ? l.status === 'ACTIVE'
        : filtro === 'suspendidas'
          ? l.status === 'SUSPENDED'
          : l.status === 'REVOKED',
  });

  readonly listaAlertas = new Listado(this.alertas, {
    filtros: [
      { valor: 'todas', etiqueta: 'Todas' },
      { valor: 'graves', etiqueta: 'Sospecha alta' },
      { valor: 'avisos', etiqueta: 'Avisos' },
      { valor: 'sin-avisar', etiqueta: 'Sin avisar' },
    ],
    texto: (a) => [
      a.license.user.email,
      `${a.license.user.firstName} ${a.license.user.lastName}`,
      a.license.productCode,
      a.detalle,
      this.nombreCorto(a),
    ],
    pasa: (a, filtro) =>
      filtro === 'graves'
        ? a.level === 'SOSPECHA_ALTA'
        : filtro === 'avisos'
          ? a.level === 'ALERTA'
          : a.action === 'NINGUNA',
  });

  readonly listaBolsas = new Listado(this.bolsas, {
    filtros: [
      { valor: 'todas', etiqueta: 'Todas' },
      { valor: 'con-saldo', etiqueta: 'Con saldo' },
      { valor: 'agotadas', etiqueta: 'Agotadas' },
    ],
    texto: (b) => [
      b.user.email,
      `${b.user.firstName} ${b.user.lastName}`,
      b.plan.name,
      b.paymentMethod,
      b.paymentRef,
      b.note,
    ],
    // 'agotadas' es exactamente EXHAUSTED: una bolsa revocada no está agotada,
    // y meterla ahí haría mentir a la cuenta de la pestaña.
    pasa: (b, filtro) =>
      filtro === 'con-saldo' ? b.status === 'ACTIVE' : b.status === 'EXHAUSTED',
  });

  readonly listaDescuentos = new Listado(this.descuentos, {
    filtros: [
      { valor: 'todos', etiqueta: 'Todos' },
      { valor: 'activos', etiqueta: 'Activos' },
      { valor: 'agotados', etiqueta: 'Agotados' },
      { valor: 'caducados', etiqueta: 'Caducados' },
      { valor: 'apagados', etiqueta: 'Apagados' },
    ],
    texto: (d) => [d.code, d.planCode, d.note],
    // Cada pestaña es un estado en plural: 'activos' mira los 'activo'.
    pasa: (d, filtro) => filtro === `${this.estadoDescuento(d)}s`,
  });

  // ── Historial de accesos ─────────────────────────────────────────────────
  //
  // Las tres listas de arriba contadas como una sola. No sustituye a ninguna:
  // vive en su propia pestaña para poder compararlas antes de decidir si las
  // otras sobran.
  readonly accesos = computed(() =>
    unirAccesos(this.codigos(), this.porRevisar(), this.historial(), this.pagos()),
  );

  /**
   * Estado por el que se está cribando, o vacío para todos.
   *
   * Va aparte de las pestañas del listado y no dentro de ellas: canal y estado
   * son dos preguntas distintas —«por dónde entró» y «en qué quedó»— y quien
   * busca suele querer cruzarlas, no elegir una.
   */
  readonly estadoAcceso = signal('');

  /** Los estados que existen de verdad en los datos, sin inventar ninguno. */
  readonly estadosDeAcceso = computed(() =>
    [...new Set(this.accesos().map((a) => a.estado))].sort((a, b) => a.localeCompare(b)),
  );

  /**
   * Lo que ve el listado: los accesos ya cribados por estado.
   *
   * Se filtra ANTES de dárselo al listado para que los contadores de las
   * pestañas cuenten sobre lo mismo que se está mirando. Al revés, «Yape 6»
   * seguiría diciendo seis con un solo rechazado en pantalla.
   */
  private readonly accesosPorEstado = computed(() => {
    const estado = this.estadoAcceso();
    return estado ? this.accesos().filter((a) => a.estado === estado) : this.accesos();
  });
  readonly listaAccesos = new Listado(this.accesosPorEstado, {
    filtros: [
      { valor: 'todos', etiqueta: 'Todos' },
      { valor: 'codigo', etiqueta: 'Código' },
      { valor: 'yape', etiqueta: 'Yape' },
      // Hoy la única pasarela es PayPal; si entra otra, este filtro se parte.
      { valor: 'paypal', etiqueta: 'PayPal' },
    ],
    // Se busca por lo que uno tiene a mano al abrir esto: un correo de una
    // conversación, el final de un código, un número de operación.
    texto: (a: Acceso) => [a.comprador, a.referencia, a.producto, a.estado, a.canalNombre],
    pasa: (a: Acceso, filtro: string) => a.canal === filtro,
  });
  /** Códigos recién generados. Se muestran una vez y no vuelven. */
  readonly codigosNuevos = signal<string[]>([]);
  /** Correo al que el servidor acaba de mandarlos, si se indicó uno. */
  readonly codigoEnviadoA = signal<string | null>(null);
  /** Cobro apuntado en los códigos recién generados. Null si fue cortesía. */
  readonly cobroApuntado = signal<{ paymentMethod: MetodoDeCobro; amountCents: number } | null>(
    null,
  );
  readonly copiados = signal(false);
  readonly trabajando = signal(false);
  /** Hay una recarga en marcha. Bloquea el botón y lo dice en el texto. */
  readonly recargando = signal(false);

  readonly planesLicencia = computed(() => this.planes().filter((p) => p.kind === 'LICENSE'));
  readonly planesPalabras = computed(() =>
    this.planes().filter((p) => p.kind === 'WORDS' && p.priceCents > 0),
  );

  /** Lo que hay que mirar hoy: alertas sin resolver y licencias caídas. */
  readonly alertasGraves = computed(
    () => this.alertas().filter((a) => a.level === 'SOSPECHA_ALTA').length,
  );
  readonly licenciasActivas = computed(
    () => this.licencias().filter((l) => l.status === 'ACTIVE').length,
  );
  readonly licenciasRevocadas = computed(
    () => this.licencias().filter((l) => l.status === 'REVOKED').length,
  );
  readonly codigosSinUsar = computed(
    () => this.codigos().filter((c) => c.status === 'AVAILABLE').length,
  );

  // ── Ventanas de crear ────────────────────────────────────────────────────
  /** La ventana de generar. Vive fuera de la tarjeta, encima de la página. */
  readonly formularioCodigosAbierto = signal(false);
  /** La de crear un código promocional. Mismo trato: crear es algo puntual. */
  readonly formularioDescuentoAbierto = signal(false);

  // ── Gráficos ─────────────────────────────────────────────────────────────
  //
  // Se calculan sobre lo que el panel YA tiene cargado: ni una petición más.
  // Eso pone un límite honesto que conviene tener presente —`/payments/recent`
  // devuelve los últimos 50 cobros—, y por eso el pie de cada gráfico dice
  // sobre qué está hecho en lugar de dejar creer que es todo el histórico.

  /**
   * Lo que se dice al pasar por encima de una barra.
   *
   * Lleva de qué gráfico es porque hay dos en la misma fila: sin eso, señalar
   * una semana de ingresos pintaba también una pista sobre los vencimientos.
   */
  readonly pista = signal<{ texto: string; centro: number; grafico: string } | null>(null);

  /** Cobros efectivos: los que fallaron o se cancelaron no son ingresos. */
  private readonly cobrados = computed(() => this.pagos().filter((p) => p.status === 'PAID'));

  /**
   * Ventas cobradas al generar un código de activación.
   *
   * Van aparte de las barras de la pasarela porque no entran por el mismo sitio:
   * aquí el dinero ya está cobrado —por Yape, por Western Union, por donde sea—
   * y lo que se emite es la llave. Contarlas con el resto escondería el canal
   * que, en la práctica, mueve la mayor parte de lo que se vende a mano.
   *
   * Se cuentan desde el código y NO desde el pago, y esa es la diferencia que
   * importa: el pago no nace hasta que el comprador canjea, así que una venta
   * cobrada el lunes y canjeada el viernes —o nunca— era dinero invisible en
   * este gráfico. Un código anulado no cuenta: ese cobro se deshizo. Una
   * cortesía tampoco: no hubo dinero.
   */
  private readonly codigosVendidos = computed(() =>
    this.codigos().filter(
      (codigo) =>
        codigo.status !== 'VOID' &&
        codigo.paymentMethod !== null &&
        codigo.paymentMethod !== 'CORTESIA' &&
        (codigo.amountCents ?? 0) > 0,
    ),
  );

  /**
   * Cada entrada de dinero, ya normalizada: cuándo entró, cuánto y por dónde.
   *
   * Los dos gráficos de ingresos se calculan sobre esta misma lista, y eso es lo
   * que garantiza que digan lo mismo: antes uno sumaba solo pagos y el otro
   * sumaba pagos y códigos, así que los totales no cuadraban entre sí.
   *
   * Dos cosas se arreglan al normalizar aquí:
   *
   * 1. El canje de un código apunta su propio pago, con el medio con el que se
   *    cobró. Sin descartarlo, esa venta saldría dos veces —una en su código y
   *    otra en Yape—. Se reconoce porque el pago del canje lleva el
   *    identificador del código como número de orden.
   * 2. PayPal cobra en dólares y todo lo demás en soles. Sumar las dos cosas en
   *    una misma barra da un número que no es dinero de ninguna moneda, así que
   *    los dólares se pasan a soles al tipo con el que se ponen los precios.
   */
  private readonly entradasDeDinero = computed(() => {
    const deCodigos = new Set(this.codigos().map((codigo) => codigo.id));

    const entradas = this.cobrados()
      .filter((pago) => !deCodigos.has(pago.providerOrderId))
      .map((pago) => ({
        via: MEDIOS[pago.provider] ?? pago.provider,
        fecha: pago.paidAt ? new Date(pago.paidAt) : null,
        cents: aCentimosDeSol(pago.amountCents, pago.currency),
      }));

    for (const codigo of this.codigosVendidos()) {
      entradas.push({
        via: 'Código de activación',
        // La fecha es la de la venta, no la del canje: es cuando entró el dinero.
        fecha: new Date(codigo.createdAt),
        cents: codigo.amountCents ?? 0,
      });
    }

    return entradas;
  });

  readonly ingresosPorSemana = computed(() =>
    columnas(
      porSemana(
        this.entradasDeDinero(),
        (entrada) => entrada.fecha,
        (entrada) => entrada.cents,
        SEMANAS,
      ).map((punto) => ({
        ...punto,
        detalle: `${punto.detalle}: ${soles(punto.valor)}`,
      })),
      solesCorto,
    ),
  );

  /**
   * Por dónde entra el dinero.
   *
   * Categorías sin orden natural —PayPal, Yape, código de activación—, así que
   * todas las barras van del mismo color: la longitud ya dice cuál es mayor, y
   * teñir cada una de un tono distinto gastaría el color en repetir eso mismo.
   *
   * Las tres vías salen SIEMPRE, aunque una esté a cero. Enseñar solo las que
   * tienen dinero deja un gráfico que engaña por omisión: una semana sin ventas
   * por PayPal se leía como si PayPal no existiera, cuando lo que dice de verdad
   * es que está abierto y no entró nada por ahí. Un cero también es una cifra.
   */
  readonly ingresosPorMedio = computed(() => {
    const vias = VIAS_DE_COBRO.map((via) => ({ via, cents: 0 }));
    const entradas = this.entradasDeDinero().map(({ via, cents }) => ({ via, cents }));

    return porCategoria(
      [...vias, ...entradas],
      (entrada) => entrada.via,
      (entrada) => entrada.cents,
    );
  });

  /**
   * Licencias que caducan en las próximas semanas.
   *
   * Es el único sitio del panel que mira hacia adelante. Una licencia vencida
   * es un cliente que se va sin avisar; verlas con semanas de margen es lo que
   * permite escribirle antes y no después.
   */
  readonly vencimientos = computed(() =>
    columnas(
      porSemana(
        this.licencias().filter((l) => l.status === 'ACTIVE'),
        (licencia) => (licencia.expiresAt ? new Date(licencia.expiresAt) : null),
        () => 1,
        SEMANAS,
        lunes(new Date()),
        false,
      ).map((punto) => ({
        ...punto,
        detalle: `${punto.detalle}: ${punto.valor} ${punto.valor === 1 ? 'licencia' : 'licencias'}`,
      })),
      (valor) => `${Math.round(valor)}`,
    ),
  );

  mostrarPista(barra: { detalle: string; centro: number }, grafico: string): void {
    this.pista.set({ texto: barra.detalle, centro: barra.centro, grafico });
  }

  /** La pista, solo si es de este gráfico. */
  pistaDe(grafico: string): { texto: string; centro: number } | null {
    const actual = this.pista();
    return actual && actual.grafico === grafico ? actual : null;
  }

  ocultarPista(): void {
    this.pista.set(null);
  }

  /** Importes en soles, para las etiquetas de los gráficos. */
  soles(cents: number): string {
    return soles(cents);
  }

  // ── Formularios ──────────────────────────────────────────────────────────
  readonly formCodigos = this.fb.nonNullable.group({
    cantidad: [1, [Validators.required, Validators.min(1), Validators.max(100)]],
    productCode: ['METODO_9_SKILLS'],
    buyerEmail: [''],
    note: [''],
    // El medio arranca en Western Union porque este formulario existe para las
    // ventas cobradas fuera de la web; una cortesía es lo excepcional y se elige
    // a propósito. Importe vacío = el precio del plan, que es lo habitual.
    paymentMethod: ['WESTERN_UNION' as MetodoDeCobro, Validators.required],
    paymentRef: [''],
    importe: [null as number | null, [Validators.min(0)]],
    // El código promocional que se le aplicó a esta venta, si hubo uno.
    descuento: [''],
  });

  /**
   * El descuento comprobado contra el servidor, listo para aplicar.
   *
   * No se guarda en el código de activación: lo que queda registrado es el
   * importe final, que es el dinero que entró de verdad. El código promocional
   * es cómo se llegó a esa cifra, y aquí sirve para no tener que calcularla a
   * mano —restar mal un descuento es cuadrar mal el mes—.
   */
  readonly descuentoAplicado = signal<Descuento | null>(null);
  readonly comprobandoDescuento = signal(false);
  readonly errorDescuento = signal<string | null>(null);

  /**
   * Captura del pago que acompaña a esta venta, si el administrador quiere
   * guardarla.
   *
   * Es opcional del todo: una cortesía no tiene comprobante y una transferencia
   * que ya se vio en el extracto tampoco lo necesita. Cuando lo hay, es lo que
   * permite reconstruir meses después de dónde salió ese dinero.
   */
  readonly capturaCodigo = signal<File | null>(null);
  readonly capturaCodigoPrevia = signal<string | null>(null);

  readonly formDescuento = this.fb.nonNullable.group({
    // En soles, que es como piensa el precio; se convierte a céntimos al enviar.
    soles: [20, [Validators.required, Validators.min(DESCUENTO_MINIMO / 100)]],
    planCode: [''],
    code: [''],
    maxUses: [0, [Validators.min(0)]],
    // Días hasta que deje de valer. 0 = no caduca, que es lo que hacía siempre
    // hasta ahora: el servidor aceptaba una fecha y el panel no la pedía, así
    // que una promo de septiembre seguía canjeándose en enero.
    expiraEnDias: [0, [Validators.min(0), Validators.max(365)]],
    note: [''],
  });

  readonly formBolsa = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    planCode: ['TESISTA', Validators.required],
    paymentMethod: ['YAPE', Validators.required],
    paymentRef: [''],
    note: [''],
  });

  // ── Capítulos del método ─────────────────────────────────────────────────
  private readonly skillsApi = inject(SkillService);

  readonly skills = signal<Skill[]>([]);
  readonly editando = signal<Skill | null>(null);

  // ── Grupos ───────────────────────────────────────────────────────────────
  //
  // Un grupo es un producto: sus capítulos, su precio y su duración. Se crean
  // aquí y luego cada .skill se cuelga de uno al subirlo.
  readonly grupos = signal<Grupo[]>([]);
  readonly editandoGrupo = signal<Grupo | null>(null);

  /**
   * El formulario vive en una ventana emergente, no encima de la tabla.
   *
   * Lo primero que se ve al entrar es la lista, que es lo que uno viene a
   * consultar el 90 % de las veces; crear y editar son acciones puntuales y no
   * tienen por qué ocupar la pantalla mientras tanto.
   */
  readonly formularioAbierto = signal(false);

  /**
   * Grupo que se está a punto de borrar, y lo que el administrador lleva
   * tecleado para confirmarlo.
   *
   * Borrar se pide escribiendo la palabra y no con un «¿seguro?», porque a un
   * «¿seguro?» se le da que sí sin leerlo. Escribir obliga a mirar qué se está
   * borrando.
   */
  readonly borrandoGrupo = signal<Grupo | null>(null);
  readonly confirmacionBorrado = signal('');
  readonly puedeBorrar = computed(
    () => this.confirmacionBorrado().trim().toLowerCase() === 'eliminar',
  );

  /**
   * El precio en soles que hay escrito ahora mismo, para poder enseñar debajo
   * cuánto será en PayPal mientras se teclea.
   */
  readonly solesEscritos = signal(199);
  readonly dolaresCalculados = computed(() => aDolares(this.solesEscritos()));

  /**
   * Qué capítulos quedan dentro del grupo que se está editando, por id.
   *
   * Se elige aquí y no capítulo a capítulo en la otra pantalla porque la
   * pregunta natural es «qué lleva este producto», no «a qué producto pertenece
   * este capítulo». Lo segundo obliga a recordar el grupo mientras se recorre
   * una lista larga.
   */
  readonly capitulosElegidos = signal<ReadonlySet<string>>(new Set());

  /** Capítulos ordenados como los ve el comprador. */
  readonly capitulosOrdenados = computed(() =>
    [...this.skills()].sort(
      (a, b) => a.orden - b.orden || a.displayName.localeCompare(b.displayName),
    ),
  );

  /**
   * Todos los capítulos, incluidos los que ya son de otro grupo.
   *
   * Se listan todos a propósito: montar un producto con capítulos que ya
   * existen es un caso real —un paquete reducido, una edición distinta—. Y
   * marcar aquí uno ajeno ya no se lo quita a nadie: un capítulo puede estar en
   * varios grupos a la vez. La etiqueta de su fila dice en cuáles más está,
   * porque editarlo cambia lo que reciben todos.
   */
  readonly capitulosDisponibles = this.capitulosOrdenados;

  /** Grupo cuyos capítulos se están mirando desde la tabla. */
  readonly viendoCapitulos = signal<Grupo | null>(null);
  readonly capitulosDelGrupo = computed(() => {
    const grupo = this.viendoCapitulos();
    if (!grupo) return [];
    const mio = grupo.productCode ?? grupo.code;
    return this.capitulosOrdenados().filter((s) => s.productCodes.includes(mio));
  });
  /** A qué grupo van los archivos que hay ahora mismo en la cola. */
  readonly grupoDestino = signal<string>('');

  readonly gruposActivos = computed(() => this.grupos().filter((g) => g.active));

  readonly formGrupo = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(40)]],
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(255)]],
    // En soles, que es como se piensa un precio; se pasa a céntimos al enviar.
    soles: [199, [Validators.required, Validators.min(0)]],
    // El precio tachado, en soles. 0 = sin oferta. No se cobra: solo se enseña.
    antes: [0, [Validators.min(0)]],
    // 0 = no caduca. 90 días es el trimestre por defecto.
    durationDays: [90, [Validators.required, Validators.min(0)]],
    mcpCallsPerDay: [200, [Validators.required, Validators.min(0)]],
    active: [true],
  });

  /** Archivos soltados, en el orden en que se publicarán. */
  readonly cola = signal<EnCola[]>([]);
  /** El puntero está encima de la zona de soltar: solo pinta el resaltado. */
  readonly arrastrando = signal(false);
  readonly publicando = signal(false);

  readonly colaListas = computed(() => this.cola().filter((c) => c.estado === 'lista'));
  readonly colaAnalizando = computed(() => this.cola().some((c) => c.estado === 'analizando'));
  readonly colaReemplazos = computed(
    () => this.colaListas().filter((c) => c.analisis?.reemplaza).length,
  );

  readonly skillsVisibles = computed(() => this.skills().filter((s) => s.active).length);
  /** Ordenados como se van a mostrar, que es lo que ven las flechas. */
  readonly skillsOrdenadas = computed(() => [...this.skills()].sort((a, b) => a.orden - b.orden));

  /**
   * Ficha editable de un capítulo ya publicado.
   *
   * No lleva `orden`: la posición se cambia con las flechas de la lista, que
   * es donde se ve el resultado. Escribir un número a ciegas y descubrir luego
   * que había un empate era la forma lenta de hacer lo mismo.
   */
  readonly formSkill = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    summary: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    // Los grupos NO se editan desde aquí: se marcan en la ventana del grupo,
    // que es donde se ve qué lleva cada producto. Tener las dos vías era tener
    // dos verdades, y la de la ficha pisaba a la otra sin decir nada.
    active: [true],
  });

  constructor() {
    // Con una ventana abierta, la página de detrás no se mueve. Se miran todas
    // juntas porque el panel tiene ocho y se pueden apilar.
    effect(() => {
      const alguna =
        this.accesoAbierto() !== null ||
        this.formularioAbierto() ||
        this.formularioCodigosAbierto() ||
        this.formularioDescuentoAbierto() ||
        this.formularioAdminAbierto() ||
        this.viendoCapitulos() !== null ||
        this.editando() !== null ||
        this.borrandoGrupo() !== null ||
        this.formularioTutorial();

      this.fondo.fijar('admin', alguna);
    });
  }
  ngOnInit(): void {
    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
    this.recargar();

    // La ficha de «Datos de la cuenta» sale de la sesión, y la sesión se llenó al
    // entrar: el último acceso o la verificación pueden haber cambiado desde
    // otro dispositivo. Se vuelve a pedir para no enseñar algo viejo como si
    // fuera de ahora. Si falla, se queda lo que ya había.
    this.usuariosApi.me().subscribe({ next: (usuario) => this.auth.setUser(usuario) });

    // El precio de PayPal se enseña mientras se teclea el de soles. El
    // componente vive lo que la página, así que no hace falta soltar esto.
    this.formGrupo.controls.soles.valueChanges.subscribe((soles) => {
      this.solesEscritos.set(Number(soles) || 0);
    });

    // El código se corrige solo según se escribe. `emitEvent: false` corta el
    // bucle: sin él, escribir el valor corregido dispararía otra vez este mismo
    // suscriptor.
    this.formGrupo.controls.code.valueChanges.subscribe((code) => {
      const limpio = normalizarCodigoDeGrupo(code ?? '');
      if (limpio !== code) {
        this.formGrupo.controls.code.setValue(limpio, { emitEvent: false });
      }
    });
  }

  // ── Grupos ───────────────────────────────────────────────────────────────

  /**
   * Guarda los grupos y elige destino si aún no hay ninguno.
   *
   * Vive aparte de quien los pide porque llegan por dos caminos —este cargador
   * y la recarga general— y el efecto tiene que ser el mismo en los dos.
   */
  private aplicarGrupos(grupos: Grupo[]): void {
    this.grupos.set(grupos);
    // Con un solo grupo no tiene sentido preguntar a cuál va cada archivo.
    const activos = grupos.filter((g) => g.active);
    if (!this.grupoDestino() && activos.length > 0) {
      this.grupoDestino.set(activos[0].code);
    }
  }

  private cargarGrupos(): void {
    this.billing.grupos().subscribe({
      next: (grupos) => this.aplicarGrupos(grupos),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  elegirGrupoDestino(evento: Event): void {
    this.grupoDestino.set((evento.target as HTMLSelectElement).value);
  }

  /** Abre la ventana en blanco, para crear. */
  nuevoGrupo(): void {
    this.formularioAbierto.set(true);
    this.editandoGrupo.set(null);
    this.error.set(null);
    this.aviso.set(null);
    this.formGrupo.reset({
      code: '',
      name: '',
      description: '',
      soles: 199,
      antes: 0,
      durationDays: 90,
      mcpCallsPerDay: 200,
      active: true,
    });
    this.solesEscritos.set(199);
    // Un grupo nuevo nace vacío: los capítulos se marcan a mano.
    this.capitulosElegidos.set(new Set());
    this.cola.set([]);
    // Sin destino: todavía no hay grupo. Se pone al crearlo, y hasta entonces
    // el botón de publicar no aparece. Dejarlo con el valor del grupo anterior
    // habría publicado los archivos en el producto equivocado.
    this.grupoDestino.set('');
    this.formGrupo.controls.code.enable();
  }

  /** Abre la ventana con los datos del grupo dentro. */
  editarGrupo(grupo: Grupo): void {
    this.formularioAbierto.set(true);
    this.editandoGrupo.set(grupo);
    this.error.set(null);
    this.aviso.set(null);
    this.formGrupo.patchValue({
      code: grupo.code,
      name: grupo.name,
      description: grupo.description ?? '',
      soles: grupo.priceCents / 100,
      antes: (grupo.listPriceCents ?? 0) / 100,
      durationDays: grupo.durationDays,
      mcpCallsPerDay: grupo.mcpCallsPerDay,
      active: grupo.active,
    });
    this.solesEscritos.set(grupo.priceCents / 100);
    this.capitulosElegidos.set(
      new Set(
        this.skills()
          .filter((s) => s.productCodes.includes(grupo.productCode ?? grupo.code))
          .map((s) => s.id),
      ),
    );
    // Lo que se suelte en la zona de arrastre de esta ventana se publica dentro
    // de ESTE grupo. La cola se vacía para no arrastrar archivos de una sesión
    // anterior que acabarían en el producto equivocado.
    this.grupoDestino.set(grupo.productCode ?? grupo.code);
    this.cola.set([]);
    // El código no se toca nunca: lo llevan las licencias ya emitidas y los
    // capítulos que cuelgan de él. Cambiarlo dejaría a esos compradores
    // apuntando a un producto que ya no existe.
    this.formGrupo.controls.code.disable();
  }

  /** Marca o desmarca un capítulo dentro del grupo que se está editando. */
  alternarCapitulo(id: string): void {
    const copia = new Set(this.capitulosElegidos());
    if (copia.has(id)) copia.delete(id);
    else copia.add(id);
    this.capitulosElegidos.set(copia);
  }

  /** Abre la lista de capítulos de un grupo, desde la tabla. */
  verCapitulos(grupo: Grupo): void {
    this.viendoCapitulos.set(grupo);
  }

  cerrarCapitulos(): void {
    this.viendoCapitulos.set(null);
  }

  /**
   * En qué OTROS grupos está ya un capítulo.
   *
   * Se enseña junto a la casilla para que se vea que el capítulo es compartido:
   * editarlo o reemplazar su archivo cambia lo que reciben los dos productos.
   * Marcarlo o desmarcarlo aquí ya no lo saca de esos otros grupos.
   */
  otrosGrupos(skill: Skill): string {
    const actual = this.editandoGrupo();
    const mio = actual ? (actual.productCode ?? actual.code) : null;

    const nombres = skill.productCodes
      .filter((code) => code !== mio)
      .map((code) => this.grupos().find((g) => g.productCode === code)?.name ?? code);

    return nombres.join(' · ');
  }

  /** Cierra la ventana sin guardar. */
  cerrarFormularioGrupo(): void {
    if (this.trabajando()) return;
    this.formularioAbierto.set(false);
    this.editandoGrupo.set(null);
  }

  /** Abre la confirmación de borrado con el campo vacío. */
  pedirBorrarGrupo(grupo: Grupo): void {
    this.error.set(null);
    this.aviso.set(null);
    this.confirmacionBorrado.set('');
    this.borrandoGrupo.set(grupo);
  }

  cancelarBorrado(): void {
    if (this.trabajando()) return;
    this.borrandoGrupo.set(null);
    this.confirmacionBorrado.set('');
  }

  escribirConfirmacion(evento: Event): void {
    this.confirmacionBorrado.set((evento.target as HTMLInputElement).value);
  }

  /**
   * Borra de verdad.
   *
   * El servidor comprueba otra vez que el grupo no tenga licencias, pagos ni
   * capítulos, y se niega diciendo cuál de las tres cosas lo impide. Esa
   * respuesta se enseña tal cual: es la información que el administrador
   * necesita para saber que lo que quiere es «Retirar», no borrar.
   */
  confirmarBorrado(): void {
    const grupo = this.borrandoGrupo();
    if (!grupo || !this.puedeBorrar() || this.trabajando()) return;

    this.trabajando.set(true);
    this.error.set(null);

    this.billing.eliminarGrupo(grupo.code).subscribe({
      next: (borrado) => {
        this.aviso.set(`Grupo «${borrado.name}» eliminado.`);
        this.borrandoGrupo.set(null);
        this.confirmacionBorrado.set('');
        this.trabajando.set(false);
        this.cargarGrupos();
        this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.borrandoGrupo.set(null);
        this.confirmacionBorrado.set('');
        this.trabajando.set(false);
      },
    });
  }

  guardarGrupo(): void {
    if (this.formGrupo.invalid || this.trabajando()) {
      this.formGrupo.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    const v = this.formGrupo.getRawValue();
    const datos = {
      name: v.name,
      description: v.description || undefined,
      priceCents: Math.round(v.soles * 100),
      // El precio de PayPal no se pide: se calcula del de soles. Ver `aDolares`.
      priceUsdCents: v.soles > 0 ? Math.round(aDolares(v.soles) * 100) : undefined,
      // 0 o vacío es quitar la oferta, no dejarla como estaba: por eso va null y
      // no undefined. El servidor descarta el que no supere al precio vigente.
      listPriceCents: v.antes > 0 ? Math.round(v.antes * 100) : null,
      durationDays: v.durationDays,
      mcpCallsPerDay: v.mcpCallsPerDay,
      active: v.active,
    };

    const enEdicion = this.editandoGrupo();
    const peticion = enEdicion
      ? this.billing.actualizarGrupo(enEdicion.code, datos)
      : this.billing.crearGrupo({ ...datos, code: v.code });

    // Los capítulos se mueven DESPUÉS de guardar el grupo, y no antes, porque
    // uno nuevo todavía no tiene código al que engancharlos.
    peticion
      // `productCode` y `code` se mantienen iguales al crear un grupo; el tipo
      // admite nulo por el modelo, así que el código hace de respaldo.
      .pipe(
        switchMap((grupo) =>
          this.moverCapitulos(grupo.productCode ?? grupo.code).pipe(map(() => grupo)),
        ),
      )
      .subscribe({
        next: (grupo) => {
          this.aviso.set(
            enEdicion ? `Grupo «${grupo.name}» actualizado.` : `Grupo «${grupo.name}» creado.`,
          );
          this.trabajando.set(false);
          this.cargarGrupos();
          // El precio y la duración salen en la web de venta.
          this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });

          // Ya hay grupo, así que los archivos que esperaban en la cola tienen
          // dónde ir. Se apunta el destino ANTES de publicar: hasta este momento
          // no existía y por eso el botón de publicar no se ofrecía.
          this.grupoDestino.set(grupo.productCode ?? grupo.code);

          if (this.colaListas().length > 0) {
            // La ventana no se cierra: hay que ver cómo van las subidas. Pasa a
            // modo edición, que es lo que de verdad es ya —el grupo existe— y
            // deja el código bloqueado como en cualquier edición.
            this.editandoGrupo.set(grupo);
            this.formGrupo.controls.code.disable();
            this.publicarCola();
            return;
          }

          this.editandoGrupo.set(null);
          // Solo se cierra al guardar bien. Si el servidor rechaza, la ventana se
          // queda abierta con lo escrito: cerrarla obligaría a teclearlo otra vez.
          this.formularioAbierto.set(false);
          this.cargarSkills();
        },
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e));
          this.trabajando.set(false);
        },
      });
  }

  /**
   * Aplica lo marcado en la lista: estos son los capítulos de este grupo.
   *
   * Una sola petición, y una que por construcción solo puede tocar ESTE grupo.
   * Antes era un PATCH por capítulo cambiando su grupo, y como un capítulo solo
   * podía estar en uno, marcar aquí uno que ya usaba otro producto se lo
   * quitaba a ese otro sin avisar.
   */
  private moverCapitulos(productCode: string): Observable<unknown> {
    const elegidos = [...this.capitulosElegidos()];
    const antes = this.skills()
      .filter((s) => s.productCodes.includes(productCode))
      .map((s) => s.id);

    // Nada que cambiar: ni se molesta al servidor.
    const igual = antes.length === elegidos.length && antes.every((id) => elegidos.includes(id));
    if (igual) return of(null);

    return this.skillsApi
      .fijarCapitulosDelGrupo(productCode, elegidos)
      .pipe(tap((skills) => this.skills.set(skills)));
  }

  async alternarGrupo(grupo: Grupo): Promise<void> {
    if (this.trabajando()) return;

    if (grupo.active) {
      const seguro = await this.dialogos.confirmar({
        titulo: `Retirar «${grupo.name}» de la venta`,
        mensaje: 'Dejará de ofrecerse a partir de ahora.',
        nota: 'Lo ya vendido sigue igual: quien lo compró conserva su licencia.',
        confirmar: 'Retirar de la venta',
        tono: 'aviso',
      });
      if (!seguro) return;
    }

    this.trabajando.set(true);
    this.billing.actualizarGrupo(grupo.code, { active: !grupo.active }).subscribe({
      next: () => {
        this.trabajando.set(false);
        this.cargarGrupos();
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.trabajando.set(false);
      },
    });
  }

  /** Cuánto dura, dicho como lo diría una persona. */
  duracion(dias: number): string {
    if (dias <= 0) return 'Sin caducidad';
    if (dias % 30 !== 0) return `${dias} días`;
    const meses = dias / 30;
    return meses === 1 ? '1 mes' : `${meses} meses`;
  }

  nombreGrupo(code: string | null): string {
    if (!code) return 'Sin grupo';
    return this.grupos().find((g) => g.productCode === code || g.code === code)?.name ?? code;
  }

  // ── Publicar capítulos ───────────────────────────────────────────────────

  /** Los archivos llegan del diálogo del sistema o arrastrados a la zona. */
  elegirArchivos(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    this.encolar(Array.from(entrada.files ?? []));
    // Se vacía para que volver a elegir el MISMO archivo dispare el evento.
    entrada.value = '';
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando.set(false);
    this.encolar(Array.from(evento.dataTransfer?.files ?? []));
  }

  arrastrar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    this.arrastrando.set(dentro);
  }

  /**
   * Mete los archivos en la cola y los inspecciona a la vez.
   *
   * Se comprueban todos antes de escribir nada: así el administrador ve de un
   * vistazo cuáles son nuevos y cuáles pisan un capítulo que ya está en el
   * conector, y decide con esa lista delante en vez de archivo por archivo.
   */
  private encolar(archivos: File[]): void {
    if (archivos.length === 0) return;

    this.error.set(null);
    this.aviso.set(null);
    this.editando.set(null);

    const nuevos: EnCola[] = archivos.map((archivo) => ({
      archivo,
      analisis: null,
      estado: 'analizando' as const,
      error: null,
    }));
    this.cola.update((cola) => [...cola, ...nuevos]);

    for (const item of nuevos) {
      this.skillsApi.inspeccionar(item.archivo).subscribe({
        next: (analisis) => {
          this.marcar(item, { analisis, estado: 'lista' });
          // Se reordena con cada análisis que llega: la posición final sale del
          // orden de esta lista, así que lo que se ve es lo que se aplicará.
          this.ordenarCola();
        },
        error: (e: unknown) => this.marcar(item, { estado: 'error', error: mensajeDeError(e) }),
      });
    }
  }

  /**
   * Por dónde se ordena un archivo de la cola.
   *
   * Por el nombre que declara el propio bundle, no por el del archivo. Los
   * `.skill` del método se llaman `analisis-datos-rstudio-v3-…`, y alfabéticamente
   * eso pone el Capítulo IV el primero. Dentro, en cambio, cada uno se presenta
   * como «1 · Tema y delimitación», «2 · Capítulo I · …»: ese es el orden real.
   *
   * Si el análisis aún no ha llegado se usa el nombre del archivo, que al menos
   * mantiene la lista estable mientras se comprueban.
   */
  private etiquetaDeOrden(item: EnCola): string {
    const a = item.analisis;
    if (!a) return item.archivo.name;
    return a.reemplaza?.displayName ?? a.displayNameSugerido;
  }

  /**
   * Ordena la cola sola, para no tener que soltar los archivos de uno en uno.
   *
   * El comparador entiende los números dentro del texto: sin él, «10 · …» iría
   * antes que «2 · …», que es lo que hace una ordenación de cadenas normal y
   * corriente.
   */
  private ordenarCola(): void {
    const comparador = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    this.cola.update((cola) =>
      [...cola].sort((x, y) =>
        comparador.compare(this.etiquetaDeOrden(x), this.etiquetaDeOrden(y)),
      ),
    );
  }

  /** La entrada se localiza por su File, que no cambia aunque la fila sí. */
  private marcar(item: EnCola, cambios: Partial<EnCola>): void {
    this.cola.update((cola) =>
      cola.map((x) => (x.archivo === item.archivo ? { ...x, ...cambios } : x)),
    );
  }

  quitarDeCola(item: EnCola): void {
    if (this.publicando()) return;
    this.cola.update((cola) => cola.filter((x) => x.archivo !== item.archivo));
  }

  vaciarCola(): void {
    if (this.publicando()) return;
    this.cola.set([]);
  }

  /**
   * Publica toda la cola de una vez.
   *
   * Uno detrás de otro y no en paralelo: cada subida reescribe el índice que
   * sirve el conector, y lanzarlas juntas sería pelearse por el mismo archivo.
   */
  publicarCola(): void {
    const pendientes = this.colaListas();
    if (pendientes.length === 0 || this.publicando()) return;

    this.publicando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    // Se publican en el orden de la lista, y la lista viene ya ordenada por el
    // nombre que declara cada bundle. Soltar los nueve de golpe los deja en su
    // orden del método sin tocar una flecha.
    this.ordenarCola();

    const ultimo = this.skills().reduce((max, s) => Math.max(max, s.orden), 0);
    this.publicarSiguiente(this.colaListas(), 0, 0, ultimo + 1);
  }

  private publicarSiguiente(
    pendientes: EnCola[],
    i: number,
    hechas: number,
    proximoOrden: number,
  ): void {
    if (i >= pendientes.length) {
      this.publicando.set(false);
      // Las publicadas desaparecen; las que fallaron se quedan con su motivo.
      this.cola.update((cola) => cola.filter((x) => x.estado !== 'publicada'));
      this.aviso.set(
        hechas === 0
          ? null
          : hechas === 1
            ? 'Capítulo publicado. Ya está en el conector, sin reinstalar nada.'
            : `${hechas} capítulos publicados. Ya están en el conector, sin reinstalar nada.`,
      );
      this.cargarSkills();
      return;
    }

    const item = pendientes[i];
    const a = item.analisis;
    if (!a) {
      this.publicarSiguiente(pendientes, i + 1, hechas, proximoOrden);
      return;
    }

    // Un reemplazo conserva la ficha que ya tenía —nombre, resumen, posición y
    // visibilidad—: el archivo cambia, la ficha no. Uno nuevo entra al final,
    // con lo que declara su propio SKILL.md.
    const esNuevo = !a.reemplaza;
    this.marcar(item, { estado: 'subiendo' });

    this.skillsApi
      .subir(item.archivo, {
        displayName: a.reemplaza?.displayName ?? a.displayNameSugerido,
        summary: a.reemplaza?.summary ?? a.summarySugerido,
        orden: a.reemplaza?.orden ?? proximoOrden,
        active: a.reemplaza?.active ?? true,
        // Un reemplazo se queda en el grupo que ya tenía; uno nuevo va al que
        // esté elegido arriba. Mover un capítulo de grupo se hace a propósito,
        // desde Editar, no de rebote al actualizar su archivo.
        productCode: this.grupoDestino() ?? undefined,
      })
      .subscribe({
        next: () => {
          this.marcar(item, { estado: 'publicada' });
          this.publicarSiguiente(
            pendientes,
            i + 1,
            hechas + 1,
            esNuevo ? proximoOrden + 1 : proximoOrden,
          );
        },
        // Que uno falle no detiene a los demás: se marca y se sigue.
        error: (e: unknown) => {
          this.marcar(item, { estado: 'error', error: mensajeDeError(e) });
          this.publicarSiguiente(pendientes, i + 1, hechas, proximoOrden);
        },
      });
  }

  // ── La lista ─────────────────────────────────────────────────────────────

  /** Cierra la ficha sin guardar. La ventana del grupo sigue detrás, intacta. */
  cancelarFicha(): void {
    if (this.trabajando()) return;
    this.editando.set(null);
  }

  editarSkill(skill: Skill): void {
    this.error.set(null);
    this.editando.set(skill);
    this.formSkill.patchValue({
      displayName: skill.displayName,
      summary: skill.summary,
      active: skill.active,
    });
  }

  guardarFicha(): void {
    const skill = this.editando();
    if (!skill || this.formSkill.invalid || this.trabajando()) {
      this.formSkill.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);

    this.skillsApi.actualizar(skill.id, this.formSkill.getRawValue()).subscribe({
      next: (actualizada) => {
        this.skills.update((lista) =>
          lista.map((s) => (s.id === actualizada.id ? actualizada : s)),
        );
        this.aviso.set(`Ficha de «${actualizada.displayName}» actualizada.`);
        this.editando.set(null);
        this.trabajando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.trabajando.set(false);
      },
    });
  }

  /** Activa o desactiva sin abrir el formulario: es el gesto más frecuente. */
  /** Qué capítulo se está reemplazando ahora mismo, para bloquear solo esa fila. */
  readonly reemplazando = signal<string | null>(null);

  /**
   * Cambia el archivo de un capítulo por otro del equipo, conservando su ficha.
   *
   * Se comprueba ANTES de subir que el bundle sea el de ese capítulo. El
   * servidor identifica una skill por el `name` de su SKILL.md, así que soltar
   * aquí el archivo equivocado no daría error: crearía un capítulo nuevo y
   * dejaría el viejo intacto, y el administrador se iría convencido de haberlo
   * actualizado. Comparar el código y negarse es lo único que evita eso.
   *
   * Lo que cambia es el archivo. El nombre, el resumen, la posición, la
   * visibilidad y el grupo se conservan: actualizar el contenido de un capítulo
   * no es motivo para reescribir su ficha.
   */
  cambiarArchivoDeCapitulo(skill: Skill, evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    // El input se limpia siempre: sin esto, elegir el mismo archivo dos veces
    // seguidas no dispara el evento y parece que la segunda no hizo nada.
    entrada.value = '';
    if (!archivo || this.reemplazando()) return;

    this.reemplazando.set(skill.id);
    this.error.set(null);
    this.aviso.set(null);

    this.skillsApi
      .inspeccionar(archivo)
      .pipe(
        switchMap((analisis) => {
          if (analisis.code !== skill.code) {
            throw new Error(
              `Ese archivo es «${analisis.code}», no «${skill.code}». ` +
                'Subirlo aquí habría creado un capítulo nuevo en vez de actualizar este.',
            );
          }

          return this.skillsApi.subir(archivo, {
            displayName: skill.displayName,
            summary: skill.summary,
            orden: skill.orden,
            active: skill.active,
          });
        }),
      )
      .subscribe({
        next: () => {
          this.aviso.set(
            `«${skill.displayName}» actualizado. Ya está en el conector, sin reinstalar nada.`,
          );
          this.reemplazando.set(null);
          this.cargarSkills();
        },
        error: (e: unknown) => {
          this.error.set(e instanceof Error ? e.message : mensajeDeError(e));
          this.reemplazando.set(null);
        },
      });
  }

  alternarSkill(skill: Skill): void {
    this.skillsApi.actualizar(skill.id, { active: !skill.active }).subscribe({
      next: (actualizada) =>
        this.skills.update((lista) =>
          lista.map((s) => (s.id === actualizada.id ? actualizada : s)),
        ),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /**
   * Sube o baja un capítulo en el método.
   *
   * Intercambiar la posición con el vecino son dos escrituras. Si la segunda
   * falla, los dos quedarían con el mismo número, así que se recarga en ambos
   * casos: más vale volver a preguntar que enseñar un orden que no es el real.
   */
  mover(skill: Skill, direccion: -1 | 1): void {
    if (this.trabajando()) return;

    // Se intercambia con el vecino DE LA LISTA QUE SE ESTÁ VIENDO, no con el de
    // la lista global. Si no, pulsar «bajar» en el último capítulo de un grupo
    // lo cambiaría por uno de otro producto —invisible en esta pantalla— y el
    // administrador vería que no pasa nada.
    const lista = this.capitulosDisponibles();
    const i = lista.findIndex((s) => s.id === skill.id);
    const vecina = lista[i + direccion];
    if (i < 0 || !vecina) return;

    this.trabajando.set(true);
    this.error.set(null);

    this.skillsApi
      .actualizar(skill.id, { orden: vecina.orden })
      .pipe(switchMap(() => this.skillsApi.actualizar(vecina.id, { orden: skill.orden })))
      .subscribe({
        next: () => {
          this.trabajando.set(false);
          this.cargarSkills();
        },
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e));
          this.trabajando.set(false);
          this.cargarSkills();
        },
      });
  }

  /**
   * Quita el capítulo del catálogo.
   *
   * El servidor exige que esté oculto antes de borrarlo, para no dejar a medias
   * a quien esté trabajando con él. Ese paso lo damos aquí en lugar de obligar
   * al administrador a ocultar primero y volver después: la advertencia ya le
   * dijo que está visible, y confirmarlo dos veces no protege de nada.
   */
  async eliminarSkill(skill: Skill): Promise<void> {
    if (this.trabajando()) return;

    const seguro = await this.dialogos.confirmar({
      titulo: `Quitar «${skill.displayName}» del catálogo`,
      mensaje: skill.active
        ? 'Está visible en el conector ahora mismo. Se ocultará y se quitará del catálogo.'
        : 'Se quitará del catálogo del conector.',
      nota: 'El archivo .skill se conserva en el servidor, así que puedes volver a subirlo.',
      confirmar: 'Quitar del catálogo',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.trabajando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    const borrar: Observable<void> = skill.active
      ? this.skillsApi
          .actualizar(skill.id, { active: false })
          .pipe(switchMap(() => this.skillsApi.eliminar(skill.id)))
      : this.skillsApi.eliminar(skill.id);

    borrar.subscribe({
      next: () => {
        this.skills.update((lista) => lista.filter((s) => s.id !== skill.id));
        if (this.editando()?.id === skill.id) this.editando.set(null);
        this.aviso.set(`«${skill.displayName}» ya no aparece en el conector.`);
        this.trabajando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.trabajando.set(false);
        // Pudo quedarse oculta pero sin borrar: que la lista lo refleje.
        this.cargarSkills();
      },
    });
  }

  private cargarSkills(): void {
    this.skillsApi.list().subscribe({
      next: (skills) => {
        this.skills.set(skills);
        this.marcarLosQueYaSonDelGrupo(skills);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /**
   * Deja marcados los capítulos que el servidor dice que ya son del grupo.
   *
   * Hace falta al publicar desde la ventana: el capítulo recién subido nace con
   * el grupo puesto, pero la selección de la pantalla no se entera. Sin esto
   * aparecería sin marcar y, al pulsar «Guardar cambios», `moverCapitulos` lo
   * habría entendido como «lo han desmarcado» y lo habría echado del grupo
   * recién subido.
   */
  private marcarLosQueYaSonDelGrupo(skills: Skill[]): void {
    const grupo = this.editandoGrupo();
    if (!grupo) return;

    const mio = grupo.productCode ?? grupo.code;
    const seleccion = new Set(this.capitulosElegidos());
    for (const skill of skills) {
      if (skill.productCodes.includes(mio)) seleccion.add(skill.id);
    }
    this.capitulosElegidos.set(seleccion);
  }

  /**
   * Vuelve a pedirlo todo.
   *
   * Se lanzan a la vez y se espera a que terminen todas, y eso es lo que
   * permite bloquear el botón mientras tanto: antes disparaba nueve peticiones
   * sueltas y no cambiaba nada en pantalla, así que pulsarlo se parecía
   * demasiado a que no hiciera nada.
   *
   * UNA QUE FALLE NO TIRA LAS DEMÁS
   * -------------------------------
   * Cada petición atrapa su propio error y sigue. Con un `forkJoin` a secas,
   * que se cayera una sola —un 500 en alertas, pongamos— descartaría las ocho
   * respuestas buenas y dejaría el panel entero con datos viejos. Así se
   * refresca lo que sí llegó y el aviso dice exactamente qué no.
   */
  recargar(): void {
    if (this.recargando()) return;

    this.recargando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    const fallos: string[] = [];
    const tolerante = <T>(nombre: string, origen: Observable<T>): Observable<T | null> =>
      origen.pipe(
        catchError((e: unknown) => {
          fallos.push(`${nombre} (${mensajeDeError(e)})`);
          return of(null);
        }),
      );

    forkJoin({
      skills: tolerante('capítulos', this.skillsApi.list()),
      grupos: tolerante('grupos', this.billing.grupos()),
      // Los planes NO se pedían aquí, solo al abrir el panel. Cambiar el precio
      // de un grupo y pulsar Actualizar dejaba el desplegable de productos con
      // el precio viejo hasta recargar la página entera.
      planes: tolerante('planes', this.billing.plans()),
      licencias: tolerante('licencias', this.admin.licenciasTodas()),
      alertas: tolerante('alertas', this.admin.alertas()),
      codigos: tolerante('códigos', this.admin.codigos()),
      bolsas: tolerante('bolsas', this.admin.bolsasRecientes()),
      pagos: tolerante('ventas', this.admin.pagosRecientes()),
      descuentos: tolerante('descuentos', this.admin.descuentos()),
      porRevisar: tolerante('yapes por revisar', this.payments.porRevisar()),
      historial: tolerante('historial de yapes', this.payments.historialManual()),
    }).subscribe((datos) => {
      if (datos.skills) this.skills.set(datos.skills);
      if (datos.grupos) this.aplicarGrupos(datos.grupos);
      if (datos.planes) this.planes.set(datos.planes);
      if (datos.licencias) this.licencias.set(datos.licencias);
      if (datos.alertas) this.alertas.set(datos.alertas);
      if (datos.codigos) this.codigos.set(datos.codigos);
      if (datos.bolsas) this.bolsas.set(datos.bolsas);
      if (datos.pagos) this.pagos.set(datos.pagos);
      if (datos.descuentos) this.descuentos.set(datos.descuentos);
      if (datos.porRevisar) this.aplicarPorRevisar(datos.porRevisar);
      if (datos.historial) this.historial.set(datos.historial);

      this.recargando.set(false);

      if (fallos.length > 0) {
        this.error.set(`No se pudo actualizar: ${fallos.join('; ')}.`);
        return;
      }

      // Se borra solo: es la confirmación de que el botón hizo algo, no un
      // mensaje que haya que leer.
      this.aviso.set('Datos actualizados.');
      setTimeout(() => {
        if (this.aviso() === 'Datos actualizados.') this.aviso.set(null);
      }, 2500);
    });
  }

  // ── Comprobantes de Yape ─────────────────────────────────────────────────

  /** Guarda los comprobantes pendientes y baja las miniaturas que falten. */
  private aplicarPorRevisar(pagos: PagoPorRevisar[]): void {
    this.porRevisar.set(pagos);
    for (const pago of pagos) this.cargarCaptura(pago.id);
  }

  private cargarPorRevisar(): void {
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

  /** Saca el pago de la bandeja y libera su miniatura. */
  private olvidarPago(paymentId: string): void {
    const url = this.capturas()[paymentId];
    if (url) URL.revokeObjectURL(url);

    this.porRevisar.update((pagos) => pagos.filter((p) => p.id !== paymentId));
    this.capturas.update(({ [paymentId]: _fuera, ...resto }) => resto);
    this.motivos.update(({ [paymentId]: _tambien, ...resto }) => resto);
  }

  // ── Historial de Yape ────────────────────────────────────────────────────

  private cargarHistorial(): void {
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

  // ── Estados en castellano ────────────────────────────────────────────────
  //
  // El servidor guarda los códigos en inglés y mayúsculas, que es lo correcto
  // para una columna. Enseñarlos tal cual en la tabla no: quien mira el panel
  // lee «REVOKED» donde debería leer «Revocada».

  /** Cómo acabó un pago. Sirve para la pasarela y para el historial de Yape. */
  estadoPago(estado: string): string {
    const nombres: Record<string, string> = {
      PAID: 'Pagado',
      PENDING: 'Pendiente',
      IN_REVIEW: 'En revisión',
      REJECTED: 'Rechazado',
      FAILED: 'Fallido',
      CANCELLED: 'Cancelado',
    };
    return nombres[estado] ?? estado;
  }

  /**
   * Igual, pero para el historial de Yape.
   *
   * Cambia en dos: PAID es «Aprobado» —lo aprobó una persona, no una pasarela—
   * y PENDING es «Sin comprobante», que es lo que de verdad significa ahí: se
   * abrió el pago y nunca llegó la captura.
   */
  estadoHistorial(pago: PagoRevisado): string {
    if (pago.status === 'PAID') return 'Aprobado';
    if (pago.status === 'PENDING') return 'Sin comprobante';
    return this.estadoPago(pago.status);
  }

  /**
   * En qué está de verdad un código promocional.
   *
   * `active` solo dice si lo apagamos a mano. Un código que ya gastó sus usos,
   * o al que se le pasó la fecha, sigue con `active: true` y en la tabla se
   * leía «Activo» aunque la web lo rechace: justo lo contrario de lo que hace.
   */
  estadoDescuento(promo: CodigoDescuento): 'activo' | 'apagado' | 'agotado' | 'caducado' {
    if (!promo.active) return 'apagado';
    if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) return 'caducado';
    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) return 'agotado';
    return 'activo';
  }

  etiquetaDescuento(promo: CodigoDescuento): string {
    const nombres: Record<string, string> = {
      activo: 'Activo',
      apagado: 'Apagado',
      agotado: 'Agotado',
      caducado: 'Caducado',
    };
    return nombres[this.estadoDescuento(promo)];
  }

  estadoCodigo(estado: string): string {
    const nombres: Record<string, string> = {
      AVAILABLE: 'Disponible',
      REDEEMED: 'Canjeado',
      VOID: 'Anulado',
    };
    return nombres[estado] ?? estado;
  }

  estadoLicencia(estado: string): string {
    const nombres: Record<string, string> = {
      ACTIVE: 'Activa',
      SUSPENDED: 'Suspendida',
      REVOKED: 'Revocada',
    };
    return nombres[estado] ?? estado;
  }

  estadoBolsa(estado: string): string {
    const nombres: Record<string, string> = {
      ACTIVE: 'Con saldo',
      EXHAUSTED: 'Agotada',
      REVOKED: 'Revocada',
    };
    return nombres[estado] ?? estado;
  }

  /** Qué se hizo ya con una alerta. NINGUNA es «nada todavía», no un vacío. */
  accionAlerta(accion: string): string {
    const nombres: Record<string, string> = {
      NINGUNA: 'Sin avisar',
      NOTIFICADO: 'Comprador avisado',
      REVOCADO: 'Licencia revocada',
    };
    return nombres[accion] ?? accion;
  }

  // ── Descuentos ───────────────────────────────────────────────────────────

  abrirFormularioDescuento(): void {
    this.error.set(null);
    // El código de la vez anterior se quita al abrir: dejarlo puesto haría
    // pensar que el nuevo es ese, y son códigos que se reparten.
    this.descuentoNuevo.set(null);
    this.formularioDescuentoAbierto.set(true);
  }

  cerrarFormularioDescuento(): void {
    if (this.trabajando()) return;
    this.formularioDescuentoAbierto.set(false);
  }
  crearDescuento(): void {
    if (this.formDescuento.invalid || this.trabajando()) {
      this.formDescuento.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.descuentoNuevo.set(null);

    const { soles, planCode, code, maxUses, expiraEnDias, note } = this.formDescuento.getRawValue();

    this.admin
      .crearDescuento({
        amountCents: Math.round(soles * 100),
        planCode: planCode || undefined,
        code: code.trim() || undefined,
        maxUses,
        expiraEnDias: expiraEnDias > 0 ? expiraEnDias : undefined,
        note: note || undefined,
      })
      .subscribe({
        next: (descuento) => {
          this.descuentoNuevo.set(descuento);
          this.descuentos.update((lista) => [descuento, ...lista]);
          this.formDescuento.patchValue({ code: '', note: '' });
          this.trabajando.set(false);
          this.formularioDescuentoAbierto.set(false);
        },
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e));
          this.trabajando.set(false);
        },
      });
  }

  alternarDescuento(descuento: CodigoDescuento): void {
    this.admin.activarDescuento(descuento.id, !descuento.active).subscribe({
      next: (actualizado) =>
        this.descuentos.update((lista) =>
          lista.map((d) => (d.id === actualizado.id ? actualizado : d)),
        ),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /**
   * Anuncia el código en la página de precios, o lo esconde.
   *
   * Publicar un código es enseñárselo a cualquiera que mire los precios, así
   * que se pregunta antes: un código negociado con una persona concreta,
   * publicado por descuido, se lo lleva todo el mundo y no hay forma de
   * deshacerlo salvo apagarlo. Esconderlo no se pregunta, que deshacer no
   * cuesta nada.
   */
  async alternarPublicacion(descuento: CodigoDescuento): Promise<void> {
    const publicar = !descuento.publico;

    if (publicar) {
      const seguro = await this.dialogos.confirmar({
        titulo: `Anunciar «${descuento.code}» en la web`,
        mensaje: `Cualquiera que mire los precios lo verá y podrá usarlo.`,
        nota: 'Para un código negociado con una persona concreta, no lo publiques.',
        confirmar: 'Anunciarlo',
        tono: 'aviso',
      });
      if (!seguro) return;
    }

    this.admin.publicarDescuento(descuento.id, publicar).subscribe({
      next: (actualizado) =>
        this.descuentos.update((lista) =>
          lista.map((d) => (d.id === actualizado.id ? actualizado : d)),
        ),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  async copiarDescuento(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.copiados.set(true);
      setTimeout(() => this.copiados.set(false), 2500);
    } catch {
      this.error.set('No pudimos copiar. Selecciónalo y cópialo a mano.');
    }
  }

  ir(seccion: Seccion): void {
    this.seccion.set(seccion);
    this.error.set(null);
    this.aviso.set(null);

    // Los usuarios NO se cargan con el resto del panel: es la única lista que
    // pagina en el servidor y la única que no hace falta para nada de lo que se
    // ve al entrar. Se pide la primera vez que se abre su sección. Las dos
    // listas —administradores y usuarios— salen de la misma petición, así que
    // basta con pedirla al abrir cualquiera de las dos.
    if ((seccion === 'admins' || seccion === 'usuarios') && this.usuarios().length === 0) {
      this.cargarUsuarios();
    }

    // El corpus tampoco: es una llamada a la base por una lista que solo
    // mira quien viene a curar bibliografía, no quien entra a revisar cobros.
    if (seccion === 'corpus' && this.corpus() === null) this.cargarCorpus();

    if (seccion === 'tutoriales' && this.tutoriales().length === 0) this.cargarTutoriales();
  }

  // ── Corpus bibliográfico ─────────────────────────────────────────────────

  private readonly referenciasApi = inject(ReferenceService);

  /** `null` mientras no se ha abierto la pestaña ni una vez. */
  readonly corpus = signal<EstadoCorpus | null>(null);
  readonly referencias = signal<Referencia[]>([]);
  readonly totalReferencias = signal(0);
  readonly paginaReferencias = signal(1);
  readonly buscadorCorpus = new FormControl<string>({ value: '', disabled: false });

  /** El temporizador que va preguntando cómo va la pasada. */
  private vigilanteDelCorpus: ReturnType<typeof setInterval> | null = null;

  // Al salir del panel el temporizador tiene que morir con él: si no, sigue
  // pidiendo el estado desde una pantalla que ya no existe.
  private readonly alDestruir = inject(DestroyRef).onDestroy(() =>
    this.pararVigilanteDelCorpus(),
  );

  readonly sincronizando = computed(() => this.corpus()?.trabajo?.activo === true);

  /** «1.200 de 24.006» mientras trabaja, para que no parezca colgado. */
  readonly avanceDelCorpus = computed(() => {
    const trabajo = this.corpus()?.trabajo;
    if (!trabajo?.activo) return '';

    const fase =
      trabajo.fase === 'notas'
        ? 'Leyendo las notas'
        : trabajo.fase === 'retiradas'
          ? 'Retirando lo borrado en Zotero'
          : 'Leyendo las fuentes';

    if (trabajo.total === 0) return `${fase}…`;
    return `${fase}: ${trabajo.hechas.toLocaleString('es-PE')} de ${trabajo.total.toLocaleString('es-PE')}`;
  });

  cargarCorpus(pagina = 1): void {
    this.paginaReferencias.set(pagina);

    this.referenciasApi.estado().subscribe({
      next: (estado) => {
        this.corpus.set(estado);
        // Una pasada completa son unas 450 peticiones a Zotero y varios
        // minutos. Si al abrir el panel ya hay uno en marcha —lo arrancó otra
        // pestaña, o se recargó esta—, se sigue mirando sin volver a lanzarlo.
        if (estado.trabajo?.activo) this.vigilarCorpus();
      },
      error: () => this.error.set('No pudimos leer el estado del corpus.'),
    });

    this.referenciasApi.listar({ pagina, texto: this.buscadorCorpus.value ?? '' }).subscribe({
      next: (datos) => {
        this.referencias.set(datos.filas);
        this.totalReferencias.set(datos.total);
      },
      error: () => this.error.set('No pudimos leer la bibliografía.'),
    });
  }

  /**
   * Pregunta cada tres segundos hasta que la pasada termina.
   *
   * Se para sola y también al salir del panel: un temporizador que sobrevive al
   * componente sigue pegándole a la API desde una pantalla que ya no existe.
   */
  private vigilarCorpus(): void {
    if (this.vigilanteDelCorpus) return;

    this.vigilanteDelCorpus = setInterval(() => {
      this.referenciasApi.estado().subscribe({
        next: (estado) => {
          this.corpus.set(estado);
          if (estado.trabajo?.activo) return;

          this.pararVigilanteDelCorpus();
          if (estado.trabajo?.error) this.error.set(`Zotero: ${estado.trabajo.error}`);
          else {
            this.aviso.set(
              `Corpus al día: ${estado.total.toLocaleString('es-PE')} fuentes` +
                (estado.trabajo?.retiradas ? `, ${estado.trabajo.retiradas} retiradas` : '') +
                '.',
            );
          }
          this.cargarCorpus(1);
        },
        error: () => this.pararVigilanteDelCorpus(),
      });
    }, 3000);
  }

  private pararVigilanteDelCorpus(): void {
    if (!this.vigilanteDelCorpus) return;
    clearInterval(this.vigilanteDelCorpus);
    this.vigilanteDelCorpus = null;
  }

  /**
   * Arranca una pasada. Vuelve enseguida: el trabajo sigue en el servidor.
   *
   * La pasada completa está a un clic aparte y no como comportamiento normal:
   * son unas 450 peticiones a Zotero, y Zotero las cuenta POR CUENTA. La cuenta
   * es una sola y sirve a todos los clientes a la vez, así que gastarlas por
   * costumbre acabaría bloqueando el corpus para todo el mundo.
   */
  sincronizarCorpus(completa = false): void {
    if (this.sincronizando()) return;

    this.error.set(null);
    this.aviso.set(null);

    this.referenciasApi.sincronizar(completa).subscribe({
      next: ({ arranque, mensaje }) => {
        this.corpus.update((estado) => (estado ? { ...estado, trabajo: arranque } : estado));
        this.aviso.set(mensaje);
        this.vigilarCorpus();
      },
      error: (fallo) =>
        this.error.set(
          fallo?.error?.message ?? 'No pudimos sincronizar con Zotero. Mira el log del servidor.',
        ),
    });
  }

  /** Cómo se lee una fuente sin producto: la ven todas las licencias. */
  productosDe(referencia: Referencia): string {
    if (referencia.groups.length === 0) return 'Todas';
    return referencia.groups.map((g) => g.productCode).join(', ');
  }

  // ── Tutoriales ───────────────────────────────────────────────────────────
  //
  // Los videos viven en la base y no en el código porque quien los graba no
  // despliega. Antes había que editar TypeScript y empujar a git para publicar
  // una URL de YouTube, que es pedirle a alguien que aprenda git para hacer su
  // trabajo.

  private readonly tutorialesApi = inject(TutorialService);

  readonly tutoriales = signal<Tutorial[]>([]);
  readonly guardandoTutorial = signal(false);

  /**
   * Si la ventana del formulario está abierta.
   *
   * Va aparte de `tutorialAbierto` y no se deduce de él: para uno NUEVO no hay
   * tutorial que abrir, así que `tutorialAbierto` vale null —que es también lo
   * que vale cuando no hay nada abierto—. Con una sola señal, «añadir video» no
   * podía abrir nada porque su estado era idéntico al de estar cerrada.
   */
  readonly formularioTutorial = signal(false);

  /** Cuál se está editando. Null con la ventana abierta = uno nuevo. */
  readonly tutorialAbierto = signal<Tutorial | null>(null);

  readonly formTutorial = this.fb.nonNullable.group({
    orden: [1, [Validators.required]],
    titulo: ['', [Validators.required, Validators.maxLength(160)]],
    duracion: [''],
    entrada: [''],
    puntos: [''],
    videoUrl: [''],
    active: [true],
  });

  cargarTutoriales(): void {
    this.tutorialesApi.todos().subscribe({
      next: (lista) => this.tutoriales.set(lista),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /** Abre uno para editarlo, o el formulario en blanco para crear otro. */
  editarTutorial(tutorial: Tutorial | null): void {
    this.error.set(null);
    this.aviso.set(null);
    this.tutorialAbierto.set(tutorial);
    this.formularioTutorial.set(true);

    this.formTutorial.reset({
      orden: tutorial?.orden ?? this.tutoriales().length + 1,
      titulo: tutorial?.titulo ?? '',
      duracion: tutorial?.duracion ?? '',
      entrada: tutorial?.entrada ?? '',
      // De lista a texto: en el panel se escriben en un cuadro normal, una
      // línea por punto, sin corchetes que cerrar.
      puntos: (tutorial?.puntos ?? []).join('\n'),
      videoUrl: tutorial?.videoUrl ?? '',
      active: tutorial?.active ?? true,
    });
  }

  cerrarTutorial(): void {
    this.formularioTutorial.set(false);
    this.tutorialAbierto.set(null);
    this.formTutorial.reset();
  }

  guardarTutorial(): void {
    if (this.formTutorial.invalid || this.guardandoTutorial()) return;

    const datos = this.formTutorial.getRawValue() as TutorialEnvio;
    const abierto = this.tutorialAbierto();

    this.guardandoTutorial.set(true);
    this.error.set(null);

    const peticion = abierto?.id
      ? this.tutorialesApi.actualizar(abierto.id, datos)
      : this.tutorialesApi.crear(datos);

    peticion.subscribe({
      next: (tutorial) => {
        this.guardandoTutorial.set(false);
        this.cerrarTutorial();
        this.cargarTutoriales();
        this.aviso.set(
          tutorial.videoUrl
            ? `«${tutorial.titulo}» guardado. Ya se ve en la web.`
            : `«${tutorial.titulo}» guardado. Sigue sin video: la tarjeta lo dice.`,
        );
      },
      error: (e: unknown) => {
        this.guardandoTutorial.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  async borrarTutorial(tutorial: Tutorial): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: `¿Borrar «${tutorial.titulo}»?`,
      mensaje:
        'Desaparece de la web y se pierde su texto. Si solo quieres retirarlo mientras lo ' +
        'regrabas, desactívalo en vez de borrarlo.',
      confirmar: 'Borrar',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.tutorialesApi.borrar(tutorial.id).subscribe({
      next: () => {
        this.cargarTutoriales();
        this.aviso.set(`«${tutorial.titulo}» borrado.`);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  // ── Equipo y perfil ──────────────────────────────────────────────────────

  // «Mi perfil» existe en el panel y no solo en /perfil porque el administrador
  // no llega al perfil: su botón de la cabecera va a «Administrar», y de las dos
  // gana siempre esa. Sin él, el dueño del producto era el único que no tenía
  // dónde ver su propia URL del conector ni la guía de instalación.

  readonly usuarios = signal<User[]>([]);
  readonly cargandoUsuarios = signal(false);
  readonly busquedaUsuarios = signal('');
  readonly paginaDeUsuarios = signal(1);
  readonly paginasDeUsuarios = signal(1);
  readonly totalDeUsuarios = signal(0);

  /**
   * Los administradores, sacados de la misma lista que se acaba de cargar.
   *
   * Sale de lo que ya hay en pantalla y no de otra petición, y eso trae un
   * límite honesto: si hay más administradores de los que caben en la página que
   * se está viendo, aquí faltarán. Con dos o tres personas en el panel eso no
   * pasa, y montar una consulta aparte para un caso que no existe todavía sería
   * pagar por adelantado.
   */
  readonly administradores = computed(() => this.usuarios().filter((u) => u.role === 'ADMIN'));

  private busquedaPendiente?: ReturnType<typeof setTimeout>;

  /**
   * Busca al dejar de teclear.
   *
   * Con 300 ms de espera: cada pulsación es una consulta al servidor, y escribir
   * un correo entero lanzaría veinte para tirar diecinueve.
   */
  buscarUsuarios(texto: string): void {
    this.busquedaUsuarios.set(texto);
    clearTimeout(this.busquedaPendiente);
    this.busquedaPendiente = setTimeout(() => {
      this.paginaDeUsuarios.set(1);
      this.cargarUsuarios();
    }, 300);
  }

  irAPaginaDeUsuarios(pagina: number): void {
    if (pagina < 1 || pagina > this.paginasDeUsuarios()) return;
    this.paginaDeUsuarios.set(pagina);
    this.cargarUsuarios();
  }

  private cargarUsuarios(): void {
    this.cargandoUsuarios.set(true);
    const busqueda = this.busquedaUsuarios().trim();

    this.usuariosApi
      .list({ page: this.paginaDeUsuarios(), perPage: 50, search: busqueda || undefined })
      .subscribe({
        next: ({ users, meta }) => {
          this.usuarios.set(users);
          this.paginasDeUsuarios.set(meta.totalPages);
          this.totalDeUsuarios.set(meta.total);
          this.cargandoUsuarios.set(false);
        },
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e));
          this.cargandoUsuarios.set(false);
        },
      });
  }

  // ── Crear administrador ──────────────────────────────────────────────────

  readonly formularioAdminAbierto = signal(false);
  readonly creandoAdmin = signal(false);
  /**
   * La cuenta recién creada, con su contraseña si la generó el servidor.
   *
   * Se queda en pantalla hasta que se cierra la ventana a mano: si la ventana se
   * cerrara sola al terminar, la contraseña provisional desaparecería antes de
   * que a nadie le diera tiempo a copiarla, y no hay forma de volver a verla.
   */
  readonly adminCreado = signal<AdminCreado | null>(null);

  readonly formAdmin = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    // Vacía a propósito: lo normal es que la genere el servidor y la mande.
    password: [''],
  });

  abrirFormularioAdmin(): void {
    this.formAdmin.reset();
    this.adminCreado.set(null);
    this.error.set(null);
    this.formularioAdminAbierto.set(true);
  }

  cerrarFormularioAdmin(): void {
    this.formularioAdminAbierto.set(false);
    this.adminCreado.set(null);
  }

  crearAdministrador(): void {
    if (this.formAdmin.invalid) {
      this.formAdmin.markAllAsTouched();
      this.error.set('Revisa el nombre, el apellido y el correo.');
      return;
    }

    const { firstName, lastName, email, password } = this.formAdmin.getRawValue();

    this.creandoAdmin.set(true);
    this.usuariosApi
      .crearAdministrador({
        firstName,
        lastName,
        email,
        // Vacío significa «genérala tú», no «contraseña en blanco».
        password: password.trim() || undefined,
      })
      .subscribe({
        next: (creado) => {
          this.adminCreado.set(creado);
          this.creandoAdmin.set(false);
          // La lista se recarga para que la cuenta nueva aparezca detrás.
          this.cargarUsuarios();
        },
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e));
          this.creandoAdmin.set(false);
        },
      });
  }

  /** Los estados y roles del servidor, en castellano. */
  estadoUsuario(estado: string): string {
    const nombres: Record<string, string> = {
      ACTIVE: 'Activa',
      PENDING: 'Sin verificar',
      SUSPENDED: 'Suspendida',
    };
    return nombres[estado] ?? estado;
  }

  rolUsuario(rol: string): string {
    const nombres: Record<string, string> = {
      USER: 'Usuario',
      EDITOR: 'Editor',
      ADMIN: 'Administrador',
    };
    return nombres[rol] ?? rol;
  }

  // ── Vender ───────────────────────────────────────────────────────────────

  abrirFormularioCodigos(): void {
    this.error.set(null);
    // Los códigos de la vez anterior se quitan al abrir, no al generar: si
    // siguieran ahí, los nuevos aparecerían debajo de unos viejos ya copiados y
    // no habría forma de saber cuáles son cuáles.
    this.codigosNuevos.set([]);
    this.codigoEnviadoA.set(null);
    this.cobroApuntado.set(null);
    this.limpiarDescuento();
    this.quitarCapturaCodigo();
    this.formularioCodigosAbierto.set(true);
  }

  /**
   * Sube la captura a los códigos recién creados.
   *
   * Se manda a todos los de la tanda: generar varios de golpe es repartir una
   * misma venta —un colegio que compra diez—, y el comprobante es el mismo para
   * todos. Adjuntarlo solo al primero dejaría los otros nueve sin justificante.
   */
  private adjuntarCaptura(ids: string[]): void {
    const imagen = this.capturaCodigo();
    if (!imagen || ids.length === 0) return;

    forkJoin(ids.map((id) => this.admin.subirComprobanteDeCodigo(id, imagen))).subscribe({
      next: () => {
        this.quitarCapturaCodigo();
        this.admin.codigos().subscribe({ next: (c) => this.codigos.set(c) });
      },
      error: (e: unknown) => {
        // El código ya existe y es válido: esto solo avisa de que la imagen no
        // se guardó, para que se pueda volver a intentar sin rehacer la venta.
        this.error.set(`El código se generó, pero el comprobante no: ${mensajeDeError(e)}`);
        this.quitarCapturaCodigo();
      },
    });
  }

  /**
   * Abre el comprobante de un código en otra pestaña.
   *
   * No puede ser un enlace normal: la imagen se sirve por la API y exige el
   * token, que un `<img src>` o un `target="_blank"` no mandan. Se descarga con
   * la sesión puesta y se abre el blob ya en memoria.
   */
  verComprobanteDeCodigo(codigo: ActivationCode): void {
    this.admin.comprobanteDeCodigo(codigo.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        // Se suelta pasado un momento: revocarlo de inmediato dejaría la
        // pestaña nueva sin nada que enseñar.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /** Guarda la captura elegida y su vista previa. */
  elegirCapturaCodigo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0] ?? null;
    entrada.value = '';

    this.quitarCapturaCodigo();
    if (!archivo) return;

    this.capturaCodigo.set(archivo);
    this.capturaCodigoPrevia.set(URL.createObjectURL(archivo));
  }

  quitarCapturaCodigo(): void {
    const previa = this.capturaCodigoPrevia();
    // La vista previa es un object URL: si no se suelta, el navegador se queda
    // con la imagen en memoria hasta que se recargue la página.
    if (previa) URL.revokeObjectURL(previa);
    this.capturaCodigo.set(null);
    this.capturaCodigoPrevia.set(null);
  }

  private limpiarDescuento(): void {
    this.descuentoAplicado.set(null);
    this.errorDescuento.set(null);
    this.formCodigos.controls.descuento.setValue('', { emitEvent: false });
  }

  /**
   * Comprueba el código promocional y rellena el importe con el precio ya
   * rebajado.
   *
   * Lo calcula el servidor, no esta pantalla: es el mismo cálculo que se le
   * aplica a un comprador que paga por la web, así que una venta cobrada por
   * Western Union con el mismo cupón queda apuntada por la misma cifra. Si se
   * restara aquí a mano, dos caminos de venta acabarían con dos precios.
   */
  aplicarDescuento(): void {
    const code = this.formCodigos.controls.descuento.value.trim();
    const plan = this.formCodigos.controls.productCode.value;

    if (!code || this.comprobandoDescuento()) return;

    this.comprobandoDescuento.set(true);
    this.errorDescuento.set(null);

    this.billing.validarDescuento(code, plan).subscribe({
      next: (descuento) => {
        this.descuentoAplicado.set(descuento);
        // El importe queda escrito, no solo enseñado: es el campo que viaja al
        // servidor, y dejarlo vacío habría registrado el precio de catálogo.
        this.formCodigos.controls.importe.setValue(descuento.finalPriceCents / 100);
        this.comprobandoDescuento.set(false);
      },
      error: (e: unknown) => {
        this.descuentoAplicado.set(null);
        this.errorDescuento.set(mensajeDeError(e));
        this.comprobandoDescuento.set(false);
      },
    });
  }

  /** Quita el descuento y deja el importe en blanco: vacío = precio del plan. */
  quitarDescuento(): void {
    this.limpiarDescuento();
    this.formCodigos.controls.importe.setValue(null);
  }

  cerrarFormularioCodigos(): void {
    if (this.trabajando()) return;
    this.formularioCodigosAbierto.set(false);
  }

  generarCodigos(): void {
    if (this.formCodigos.invalid || this.trabajando()) return;

    this.trabajando.set(true);
    this.error.set(null);
    this.codigosNuevos.set([]);
    this.codigoEnviadoA.set(null);
    this.cobroApuntado.set(null);

    const { cantidad, productCode, buyerEmail, note, paymentMethod, paymentRef, importe } =
      this.formCodigos.getRawValue();

    // El cupón se anota en la nota. El importe final ya recoge la rebaja, pero
    // dentro de un mes «S/ 159» a secas no dice si fue una promoción o un
    // descuadre: la nota es el único sitio de este formulario donde queda por
    // qué se cobró esa cifra.
    const cupon = this.descuentoAplicado()?.code;
    const notaFinal = [note, cupon ? `cupón ${cupon}` : null].filter(Boolean).join(' · ');

    this.admin
      .generarCodigos({
        cantidad,
        productCode: productCode || undefined,
        buyerEmail: buyerEmail || undefined,
        note: notaFinal || undefined,
        paymentMethod,
        paymentRef: paymentRef || undefined,
        // Vacío no es cero: significa «cobré el precio de la web» y lo resuelve
        // el servidor. Mandar 0 sería decir que la venta fue gratis.
        importe: importe === null || importe === undefined ? undefined : importe,
      })
      .subscribe({
        next: ({ codes, ids, enviadoA, cobro }) => {
          this.codigosNuevos.set(codes);
          this.codigoEnviadoA.set(enviadoA);
          this.cobroApuntado.set(cobro);

          // La captura se sube DESPUÉS, cuando ya existe el código al que
          // engancharla, y sin bloquear: los códigos ya están generados y son
          // lo que el administrador necesita en pantalla. Si la imagen falla se
          // avisa, pero no se deshace una venta por una foto.
          this.adjuntarCaptura(ids);
          this.formCodigos.patchValue({ buyerEmail: '', note: '', paymentRef: '', importe: null });
          this.trabajando.set(false);
          // La ventana se cierra sola: los códigos en claro se enseñan en la
          // tarjeta de detrás, que es donde además aparece la fila nueva. Con la
          // ventana encima habría que cerrarla para verlos, y ese es justo el
          // momento en el que alguien la cierra sin haberlos copiado.
          this.formularioCodigosAbierto.set(false);
          this.admin.codigos().subscribe({ next: (c) => this.codigos.set(c) });
        },
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e));
          this.trabajando.set(false);
        },
      });
  }

  async copiarCodigos(): Promise<void> {
    const codigos = this.codigosNuevos();
    if (codigos.length === 0) return;

    try {
      await navigator.clipboard.writeText(codigos.join('\n'));
      this.copiados.set(true);
      setTimeout(() => this.copiados.set(false), 2500);
    } catch {
      this.error.set('No pudimos copiar. Selecciónalos y cópialos a mano.');
    }
  }

  activarBolsa(): void {
    if (this.formBolsa.invalid || this.trabajando()) {
      this.formBolsa.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    const datos = this.formBolsa.getRawValue();

    this.admin
      .activarBolsa({
        email: datos.email,
        planCode: datos.planCode,
        paymentMethod: datos.paymentMethod,
        paymentRef: datos.paymentRef || undefined,
        note: datos.note || undefined,
      })
      .subscribe({
        next: ({ pack }) => {
          this.aviso.set(
            `Activadas ${pack.wordsTotal.toLocaleString('es')} palabras para ${datos.email}.`,
          );
          this.formBolsa.patchValue({ email: '', paymentRef: '', note: '' });
          this.trabajando.set(false);
          this.admin.bolsasRecientes().subscribe({ next: (b) => this.bolsas.set(b) });
        },
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e));
          this.trabajando.set(false);
        },
      });
  }

  // ── Acciones desde el historial de accesos ───────────────────────────────
  //
  // La tabla junta tres cosas distintas, así que cada acción tiene que volver a
  // la fila de origen para actuar. Se busca por id dentro de su propia lista:
  // los ids son únicos dentro de cada canal, no entre canales.

  // ── Ficha de un acceso ───────────────────────────────────────────────────

  /** La fila abierta en la ficha, o null. */
  readonly accesoAbierto = signal<Acceso | null>(null);

  // ── Mover una licencia de producto ───────────────────────────────────────
  //
  // Existe porque el catálogo crece: quien compró «las 9 skills» antes de que
  // existiera la ruta del artículo tiene derecho a que se le amplíe sin volver a
  // pagar. Hasta ahora la única salida era emitirle una licencia nueva y
  // revocarle la vieja, lo que le rompe el conector ya instalado por una
  // decisión que no tomó él.

  /** Qué producto se ha elegido en el desplegable. Vacío = ninguno todavía. */
  /**
   * El nombre de un producto tal como se vende.
   *
   * La licencia guarda el código —METODO_9_SKILLS— y eso no es lo que hay que
   * enseñarle a nadie. Si no hay plan que lo nombre se devuelve el código: es
   * feo, pero es cierto, y es la señal de que falta un plan.
   */
  nombreDeProducto(productCode: string | null): string {
    if (!productCode) return '';
    const plan = this.planesLicencia().find((p) => p.productCode === productCode);
    return plan?.name ?? productCode;
  }

  readonly productoElegido = signal('');
  readonly moviendoProducto = signal(false);

  /**
   * Los productos a los que se puede mover, menos el que ya tiene.
   *
   * Solo planes de licencia y solo los que declaran producto: mover una licencia
   * a un plan de palabras no significa nada, y sin `productCode` el servidor no
   * sabría qué capítulos darle.
   */
  readonly productosDestino = computed(() => {
    const actual = this.accesoAbierto()?.productCode ?? '';
    const vistos = new Set<string>();

    return this.planesLicencia()
      .filter((plan) => plan.productCode && plan.productCode !== actual)
      .filter((plan) => !vistos.has(plan.productCode!) && vistos.add(plan.productCode!))
      .map((plan) => ({ productCode: plan.productCode!, nombre: plan.name }));
  });

  cambiarProductoDelAcceso(): void {
    const acceso = this.accesoAbierto();
    const destino = this.productoElegido();
    if (!acceso?.licenseId || !destino || this.moviendoProducto()) return;

    this.moviendoProducto.set(true);
    this.error.set(null);

    this.admin.cambiarProducto(acceso.licenseId, destino).subscribe({
      next: ({ mensaje }) => {
        this.moviendoProducto.set(false);
        this.productoElegido.set('');
        this.cerrarAcceso();
        this.aviso.set(mensaje);
        // El historial se arma de cuatro listas del servidor; con recargar se
        // queda al día sin tener que parchear la fila a mano.
        this.recargar();
      },
      error: (fallo) => {
        this.moviendoProducto.set(false);
        this.error.set(mensajeDeError(fallo));
      },
    });
  }
  /**
   * La captura de esa fila, ya descargada.
   *
   * La imagen NO se puede pedir con un <img src> a secas: el endpoint exige la
   * cabecera de autorización, así que se baja con el token y se enseña como
   * object URL. Se suelta al cerrar para no ir dejando blobs por el camino.
   */
  readonly capturaAbierta = signal<string | null>(null);
  readonly cargandoCaptura = signal(false);

  abrirAcceso(acceso: Acceso): void {
    this.accesoAbierto.set(acceso);
    this.soltarCaptura();
    if (acceso.tieneComprobante) this.descargarCaptura(acceso);
  }

  cerrarAcceso(): void {
    this.accesoAbierto.set(null);
    this.productoElegido.set('');
    this.soltarCaptura();
  }

  private soltarCaptura(): void {
    const anterior = this.capturaAbierta();
    if (anterior) URL.revokeObjectURL(anterior);
    this.capturaAbierta.set(null);
  }

  private descargarCaptura(acceso: Acceso): void {
    this.cargandoCaptura.set(true);

    const peticion =
      acceso.canal === 'codigo'
        ? this.admin.comprobanteDeCodigo(acceso.id)
        : this.payments.comprobante(acceso.id);

    peticion.subscribe({
      next: (blob) => {
        this.capturaAbierta.set(URL.createObjectURL(blob));
        this.cargandoCaptura.set(false);
      },
      // Que falte la imagen no rompe la ficha: el resto de los datos —importe,
      // nº de operación— es lo que de verdad se coteja con el extracto.
      error: () => this.cargandoCaptura.set(false),
    });
  }

  /** Anula desde la ficha y la cierra: lo que se estaba mirando ya cambió. */
  async anularDesdeFicha(acceso: Acceso): Promise<void> {
    const codigo = this.codigos().find((c) => c.id === acceso.id);
    if (!codigo) return;

    await this.anularCodigo(codigo);
    this.cerrarAcceso();
  }
  /** Abre la captura, venga de un código o de un comprobante de Yape. */
  verCaptura(acceso: Acceso): void {
    if (acceso.canal === 'codigo') {
      const codigo = this.codigos().find((c) => c.id === acceso.id);
      if (codigo) this.verComprobanteDeCodigo(codigo);
      return;
    }
    this.abrirComprobante(acceso.id);
  }

  anularAcceso(acceso: Acceso): void {
    const codigo = this.codigos().find((c) => c.id === acceso.id);
    if (codigo) void this.anularCodigo(codigo);
  }

  async anularCodigo(codigo: ActivationCode): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: `Anular el código …${codigo.hint}`,
      mensaje: 'Dejará de poder canjearse. No se puede deshacer.',
      confirmar: 'Anular el código',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.admin.anularCodigo(codigo.id).subscribe({
      next: () => this.admin.codigos().subscribe({ next: (c) => this.codigos.set(c) }),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /** Qué código se está borrando, para bloquear solo esa fila. */
  readonly borrandoCodigo = signal<string | null>(null);

  /**
   * Borra un código de la lista. Distinto de anularlo.
   *
   * Anular es la herramienta para una venta de verdad que se tuerce: deja la
   * fila con su importe apuntado y solo impide el canje. Esto es para los que
   * uno se generó probando, que si no se quedan ahí para siempre.
   *
   * El diálogo dice lo que cambia en las cifras, que es lo que no se ve: si el
   * código estaba sin canjear, su venta desaparece del gráfico; si ya se canjeó,
   * el dinero sigue contando pero pasa a contarse por su medio de cobro, porque
   * lo que queda es el pago.
   */
  async eliminarCodigo(codigo: ActivationCode): Promise<void> {
    if (this.borrandoCodigo()) return;

    const venta = (codigo.amountCents ?? 0) > 0;
    const canjeado = codigo.status === 'REDEEMED';

    const seguro = await this.dialogos.confirmar({
      titulo: `Borrar el código …${codigo.hint}`,
      mensaje: canjeado
        ? `Lo canjeó ${codigo.buyerEmail ?? 'un comprador'} y su licencia sigue ` +
          'funcionando: esto solo borra el código de la lista.'
        : venta
          ? `Se borra la venta de ${this.importe(codigo.amountCents)} que tenía apuntada, ` +
            'y con ella su comprobante si lo hubiera.'
          : 'Nunca se canjeó y no tenía cobro apuntado, así que no arrastra nada.',
      nota: canjeado
        ? 'Ese dinero deja de contar como «código de activación» y pasa a contar por su medio de cobro.'
        : 'Si es una venta de verdad que se torció, «Anular» corta el canje sin perder el apunte.',
      confirmar: 'Borrar el código',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.borrandoCodigo.set(codigo.id);
    this.admin.eliminarCodigo(codigo.id).subscribe({
      next: () => {
        this.codigos.update((lista) => lista.filter((c) => c.id !== codigo.id));
        this.borrandoCodigo.set(null);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.borrandoCodigo.set(null);
      },
    });
  }

  // ── Licencias ────────────────────────────────────────────────────────────

  async revocar(licencia: LicenciaAdmin): Promise<void> {
    const motivo = await this.dialogos.pedirTexto({
      titulo: 'Revocar la licencia',
      mensaje: `El conector dejará de responder a ${licencia.user.email}.`,
      nota: 'Se puede reactivar después desde esta misma tabla.',
      campo: {
        etiqueta: 'Motivo (queda guardado)',
        valor: 'Uso compartido',
        placeholder: 'Por qué se revoca',
        maxlength: 120,
      },
      confirmar: 'Revocar',
      tono: 'peligro',
    });
    if (motivo === null) return;

    this.admin.revocar(licencia.id, motivo || undefined).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.aviso.set(`Licencia de ${licencia.user.email} revocada.`);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  reactivar(licencia: LicenciaAdmin): void {
    this.admin.reactivar(licencia.id).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.aviso.set(`Licencia de ${licencia.user.email} reactivada.`);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /** La respuesta no trae el comprador, así que se conserva el que ya teníamos. */
  private reemplazar(actualizada: LicenciaAdmin): void {
    this.licencias.update((lista) =>
      lista.map((l) => (l.id === actualizada.id ? { ...l, ...actualizada } : l)),
    );
  }

  // ── Presentación ─────────────────────────────────────────────────────────

  importe(cents: number | null, moneda = 'PEN'): string {
    if (cents === null) return '—';
    return `${moneda === 'USD' ? '$' : 'S/ '}${(cents / 100).toFixed(2)}`;
  }

  nombreCorto(alerta: Alerta): string {
    const nombres: Record<Alerta['kind'], string> = {
      VOLUMEN: 'Volumen inusual',
      SESIONES_SOLAPADAS: 'Sesiones solapadas',
      CONSULTAS_INCOHERENTES: 'Consultas incoherentes',
      EXTRACCION: 'Intentos de extracción',
    };
    return nombres[alerta.kind];
  }
}
