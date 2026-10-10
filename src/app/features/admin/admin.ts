import { CodigosFormulario } from './codigos-formulario-vista';
import { AyudaVista } from './ayuda-vista';
import { CorpusVista } from './corpus-vista';
import { LicenciasVista } from './licencias-vista';
import { AccesosVista } from './accesos-vista';
import { PruebasVista } from './pruebas-vista';
import { DescuentosVista } from './descuentos-vista';
import { ProductosVista } from './productos-vista';
import { VentasMensualesVista } from './ventas-mensuales-vista';
import { ResumenVista } from './resumen-vista';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { Observable, catchError, forkJoin, of } from 'rxjs';

import { mensajeDeError } from '../../core/http/api-error';
import { ActivationCode, Alerta, LicenciaAdmin, PackAdmin, PagoAdmin,  } from '../../core/models/admin.model';
import { PagoRevisado,  } from '../../core/models/payment.model';
import { Plan } from '../../core/models/rewrite.model';
import { PrivadaPipe } from '../../core/router/privada.pipe';
import { rutaDeSeccion } from '../../core/router/rutas-privadas';
import { AdminService } from '../../core/services/admin.service';
import { AuthService } from '../../core/services/auth.service';
import { RecorridoWeb } from '../../core/services/recorrido-web.service';
import { TemaService } from '../../core/services/tema.service';
import { FondoService } from '../../core/services/fondo.service';
import { BillingService } from '../../core/services/billing.service';
import { PaymentService } from '../../core/services/payment.service';
import { SkillService } from '../../core/services/skill.service';
import { UserService } from '../../core/services/user.service';
import { AjustesDeCuenta } from '../../shared/cuenta/ajustes-de-cuenta';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';
import { BibliografiaAdmin } from './bibliografia';
import { ContenidoAyudaAdmin } from './contenido-ayuda';
import { VentasMensualesAdmin } from './ventas-mensuales';
import { UsuariosAdmin } from './usuarios-admin';
import { SeguimientoAdmin } from './seguimiento';
import { PruebasConectorAdmin } from './pruebas-conector';
import { DescuentosAdmin } from './descuentos-admin';
import { VentasManualesAdmin } from './ventas-manuales';
import { ProductosAdmin } from './productos-admin';
import { AccionesAccesosAdmin } from './acciones-accesos';
import { PagosManualesAdmin } from './pagos-manuales';
import { DIRECCIONES, MENU, PAGINAS, Seccion, seccionDe } from './navegacion';
import { Acceso, unirAccesos } from './accesos';
import { ResumenIngresosAdmin, soles } from './resumen-ingresos';
import { FiltrosLista } from './filtros-lista';
import { Listado } from './listado';
import { EmbudoAdmin } from './embudo';
import { InstitucionesAdmin } from './instituciones';
import { PieLista } from './pie-lista';
import { MenuFila } from './menu-fila';
import { ReclamosAdmin } from './reclamos';
import { ResenasAdmin } from './resenas';
import { AsesoresAdmin } from './asesores';
import { PedidosAdmin } from './pedidos';
import { WhatsappAdmin } from './whatsapp';
import { SorteosAdmin } from './sorteos';


/** Métodos de pago que acepta el backend para una activación manual. */
const METODOS = ['YAPE', 'PLIN', 'TRANSFERENCIA', 'PAYPAL', 'WESTERN_UNION', 'CORTESIA'] as const;

/**
 * Panel de administración.
 *
 * Es una herramienta de trabajo, no un escaparate: lo que se mira a diario va
 * primero —vender y vigilar— y el histórico queda detrás.
 */
@Component({
  selector: 'app-admin',
  imports: [
    CodigosFormulario,
    AyudaVista,
    CorpusVista,
    LicenciasVista,
    AccesosVista,
    PruebasVista,
    DescuentosVista,
    ProductosVista,
    ResumenVista,
    VentasMensualesVista,
    PrivadaPipe,
    ReactiveFormsModule,
    DatePipe,
    RouterLink,
    FiltrosLista,
    EmbudoAdmin,
    InstitucionesAdmin,
    PieLista,
    MenuFila,
    AjustesDeCuenta,
    ReclamosAdmin,
    SorteosAdmin,
    ResenasAdmin,
    AsesoresAdmin,
    PedidosAdmin,
    WhatsappAdmin,
    AvisoFlotante,
  ],
  templateUrl: './admin.html',
  styleUrls: ['./admin-armazon.css', './admin.css', './admin-acciones.css'],
})
export class Admin implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly billing = inject(BillingService);
  private readonly fondo = inject(FondoService);
  private readonly payments = inject(PaymentService);
  private readonly usuariosApi = inject(UserService);
  private readonly auth = inject(AuthService);

  /** La cuenta con la que se está administrando ahora mismo. */
  readonly yo = this.auth.user;

  readonly metodos = METODOS;
  /**
   * La sección abierta. La manda la dirección (/admin/<sección>, ver
   * `DIRECCIONES`): se escribe solo al leer la ruta, y para cambiarla se navega
   * con `ir()`. Así recargar deja donde se estaba.
   */
  readonly seccion = signal<Seccion>('resumen');
  private readonly router = inject(Router);
  private readonly recorrido = inject(RecorridoWeb);
  private readonly ruta = inject(ActivatedRoute);
  private readonly titulo = inject(Title);
  private readonly destruir = inject(DestroyRef);
  protected readonly tema = inject(TemaService);

  /**
   * Las pestañas de arriba de algunas secciones. Cada pestaña es su propia
   * dirección —/admin/alertas, /admin/resenas…— y comparten título y entrada
   * en la barra lateral.
   */
  readonly vigilancia = computed(() =>
    ['alertas', 'resenas', 'reclamos'].includes(this.seccion()),
  );
  readonly enTutoriales = computed(() => ['tutoriales', 'guias'].includes(this.seccion()));
  readonly enUsuarios = computed(() => ['usuarios', 'admins'].includes(this.seccion()));

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

  readonly pagosManuales = new PagosManualesAdmin(this.error, this.aviso, () => this.recargar());

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

  // Se abre en «Sospecha alta», que es lo único que pide decidir algo, y
  // «Todas» va al final: es la que menos se mira.
  readonly listaAlertas = new Listado(this.alertas, {
    filtros: [
      { valor: 'graves', etiqueta: 'Sospecha alta' },
      { valor: 'avisos', etiqueta: 'Avisos' },
      { valor: 'sin-avisar', etiqueta: 'Sin avisar' },
      { valor: 'todas', etiqueta: 'Todas' },
    ],
    todos: 'todas',
    inicial: 'graves',
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

  // ── Historial de accesos ─────────────────────────────────────────────────
  //
  // Las tres listas de arriba contadas como una sola. No sustituye a ninguna:
  // vive en su propia pestaña para poder compararlas antes de decidir si las
  // otras sobran.
  readonly accesos = computed(() =>
    unirAccesos(
      this.codigos(),
      this.pagosManuales.porRevisar(),
      this.pagosManuales.historial(),
      this.pagos(),
      this.nombresDeProducto(),
    ),
  );

  /**
   * El nombre de venta de cada producto, para las filas de código de «Accesos».
   * Sale de los planes a la venta: un producto retirado se queda con su código.
   */
  private readonly nombresDeProducto = computed(() => {
    const nombres = new Map<string, string>();
    for (const plan of this.planes()) {
      if (plan.productCode && !nombres.has(plan.productCode)) nombres.set(plan.productCode, plan.name);
    }
    return nombres;
  });

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
      { valor: 'yape', etiqueta: 'Yape / Western Union' },
      // Hoy la única pasarela es PayPal; si entra otra, este filtro se parte.
      { valor: 'paypal', etiqueta: 'PayPal' },
    ],
    // Se busca por lo que uno tiene a mano al abrir esto: un correo de una
    // conversación, el final de un código, un número de operación.
    texto: (a: Acceso) => [a.comprador, a.referencia, a.producto, a.estado, a.canalNombre],
    pasa: (a: Acceso, filtro: string) => a.canal === filtro,
  });
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

  /** La de crear un código promocional. Mismo trato: crear es algo puntual. */

  // ── Gráficos ─────────────────────────────────────────────────────────────
  //
  // Se calculan sobre lo que el panel YA tiene cargado: ni una petición más.
  // `/payments/recent` y `/licenses/codes` devuelven TODOS los pagos y códigos
  // (hasta el 26-sep eran los últimos 50 y 100, y los ingresos salían cortos).

  readonly resumen = new ResumenIngresosAdmin(this.pagos, this.codigos, this.licencias);

  // ── Formularios ──────────────────────────────────────────────────────────
  private readonly skillsApi = inject(SkillService);
  readonly productos = new ProductosAdmin(this.error, this.aviso, this.trabajando, this.planes);
  readonly ventasManuales = new VentasManualesAdmin(
    this.error, this.aviso, this.trabajando, this.copiados, this.planes,
    this.productos.grupos, this.codigos, this.bolsas,
  );

  readonly accionesAccesos = new AccionesAccesosAdmin(
    this.error, this.aviso, this.planesLicencia, this.productos.grupos,
    this.codigos, this.licencias, () => this.recargar(),
    codigo => this.ventasManuales.verComprobanteDeCodigo(codigo),
    id => this.pagosManuales.abrirComprobante(id), cents => this.importe(cents),
  );

  constructor() {
    // Con una ventana abierta, la página de detrás no se mueve. Se miran todas
    // juntas porque el panel tiene ocho y se pueden apilar.
    effect(() => {
      const alguna =
        this.accionesAccesos.accesoAbierto() !== null ||
        this.productos.formularioAbierto() ||
        this.ventasManuales.formularioCodigosAbierto() ||
        this.promociones.formularioDescuentoAbierto() ||
        this.pruebasConector.formularioPruebaAbierto() ||
        this.pruebasConector.viendoInvitados() !== null ||
        this.accionesAccesos.viendoHistorial() !== null ||
        this.cuentas.formularioAdminAbierto() ||
        this.productos.viendoCapitulos() !== null ||
        this.productos.editando() !== null ||
        this.productos.borrandoGrupo() !== null ||
        this.ayuda.formularioTutorial();

      this.fondo.fijar('admin', alguna);
    });
  }
  ngOnInit(): void {
    // La sección sale de la dirección, y se vuelve a leer cada vez que cambia:
    // el componente es el mismo para todas y Angular lo reutiliza.
    this.ruta.paramMap
      .pipe(takeUntilDestroyed(this.destruir))
      .subscribe((params) => this.leerSeccion(params.get('seccion')));

    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
    this.recargar();

    // Las hojas del libro sí se piden al entrar, a diferencia de usuarios o
    // tutoriales: tienen un plazo legal, y el contador de la barra lateral es lo
    // que avisa de que hay una esperando sin tener que abrir la sección.
    this.seguimiento.cargarReclamos(false);

    // Las fichas de asesor, por lo mismo: el contador lateral es lo que avisa de
    // que hay alguien esperando respuesta sin tener que abrir la sección.
    this.seguimiento.cargarAsesores(false);

    // Y las reseñas: no tienen plazo legal, pero mientras no se apruebe una no
    // se ve en ninguna parte, y quien la escribió está esperándola.
    this.seguimiento.cargarResenas(false);

    // Y los pedidos, por lo mismo: un capítulo esperando sin asignar es alguien
    // mirando su seguimiento sin que se mueva nada.
    this.seguimiento.cargarPedidos(false);

    // La ficha de «Datos de la cuenta» sale de la sesión, y la sesión se llenó al
    // entrar: el último acceso o la verificación pueden haber cambiado desde
    // otro dispositivo. Se vuelve a pedir para no enseñar algo viejo como si
    // fuera de ahora. Si falla, se queda lo que ya había.
    this.usuariosApi.me().subscribe({ next: (usuario) => this.auth.setUser(usuario) });
  }

  // ── Grupos ───────────────────────────────────────────────────────────────

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
      if (datos.skills) this.productos.skills.set(datos.skills);
      if (datos.grupos) this.productos.aplicarGrupos(datos.grupos);
      if (datos.planes) this.planes.set(datos.planes);
      if (datos.licencias) this.licencias.set(datos.licencias);
      if (datos.alertas) this.alertas.set(datos.alertas);
      if (datos.codigos) this.codigos.set(datos.codigos);
      if (datos.bolsas) this.bolsas.set(datos.bolsas);
      if (datos.pagos) this.pagos.set(datos.pagos);
      if (datos.descuentos) this.promociones.descuentos.set(datos.descuentos);
      if (datos.porRevisar) this.pagosManuales.aplicarPorRevisar(datos.porRevisar);
      if (datos.historial) this.pagosManuales.historial.set(datos.historial);

      this.recargando.set(false);
      this.recargarSeccion();

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

  /**
   * Lo que la recarga general no trae, solo de la sección que se está mirando.
   *
   * Usuarios, bibliografía, tutoriales y pruebas se piden al abrir su sección
   * (ver `ir`), no con el resto del panel. Sin esto, «Actualizar» en esas
   * pantallas volvía a pedir ventas y licencias y dejaba la lista de delante
   * igual. Pedirlas todas en cada recarga sería gastar conexiones de la base
   * —son cinco— por pantallas que nadie está mirando.
   */
  private recargarSeccion(): void {
    switch (this.seccion()) {
      case 'pruebas':
        this.pruebasConector.cargarPruebas();
        break;
      case 'corpus':
        this.bibliografia.cargarCorpus(this.bibliografia.paginaReferencias());
        break;
      case 'tutoriales':
        this.ayuda.cargarTutoriales();
        this.ayuda.cargarGuias();
        break;
      case 'reclamos':
        this.seguimiento.cargarReclamos();
        break;
      case 'resenas':
        this.seguimiento.cargarResenas();
        break;
      case 'asesores':
        this.seguimiento.cargarAsesores();
        break;
      case 'pedidos':
        this.seguimiento.cargarPedidos();
        this.seguimiento.cargarAsesores();
        break;
      case 'admins':
      case 'usuarios':
        this.cuentas.cargarUsuarios();
        break;
      case 'perfil':
        this.usuariosApi.me().subscribe({ next: (usuario) => this.auth.setUser(usuario) });
        break;
    }
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

  // ── Ventas mensuales ─────────────────────────────────────────────────────

  readonly ventas = new VentasMensualesAdmin(soles);

  readonly promociones = new DescuentosAdmin(this.error, this.trabajando, this.copiados);

  readonly cerrandoSesion = signal(false);

  /**
   * El recorrido guiado desde el panel. Aquí no está la cabecera del sitio con
   * su brújula, así que el botón va en la barra lateral. Empieza por este panel
   * (ver `RecorridoWeb.empezarAqui`).
   */
  verElRecorrido(): void {
    this.recorrido.empezarAqui();
  }

  /** «Cerrar sesión» del pie de la barra lateral. */
  salir(): void {
    if (this.cerrandoSesion()) return;
    this.cerrandoSesion.set(true);
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.router.navigate(['/']),
    });
  }

  /**
   * El número rojo de «Alertas, reseñas y reclamos»: lo que hay que decidir.
   * Solo las alertas de sospecha alta —los avisos no piden nada—, más las
   * hojas del libro por responder y las reseñas por aprobar.
   */
  readonly pendientesDeVigilancia = computed(
    () =>
      this.alertas().filter((a) => a.level === 'SOSPECHA_ALTA').length +
      this.seguimiento.reclamosPendientes() +
      this.seguimiento.resenasPendientes(),
  );

  readonly menu = MENU;

  /** El número rojo de una entrada del menú, o 0 si no lleva. */
  contador(seccion: Seccion): number {
    if (seccion === 'accesos') return this.pagosManuales.porRevisar().length;
    if (seccion === 'alertas') return this.pendientesDeVigilancia();
    return 0;
  }

  /** Si se ve el texto de ayuda de la sección, el que abre la «i» del título. */
  readonly notaAbierta = signal(false);

  /** La licencia de una alerta, con todo lo que pide `revocar`. */
  licenciaDeAlerta(alerta: Alerta): LicenciaAdmin | null {
    return this.licencias().find((l) => l.id === alerta.license.id) ?? null;
  }

  // ── Saltos entre secciones ───────────────────────────────────────────────
  //
  // Desde una fila se va a lo mismo en otra sección con el correo ya escrito
  // en el buscador: de un acceso a su licencia, de una licencia a sus compras.

  verLicenciasDe(correo: string): void {
    this.listaLicencias.busca.set(correo);
    this.listaLicencias.filtrar('todas');
    this.ir('licencias');
  }

  verAccesosDe(correo: string): void {
    this.listaAccesos.busca.set(correo);
    this.listaAccesos.filtrar('todos');
    this.ir('accesos');
  }

  /** Copia un texto suelto —un correo, un código— y lo dice arriba. */
  async copiarTexto(texto: string, que = 'Copiado'): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.aviso.set(`${que}: ${texto}`);
    } catch {
      this.error.set('No pudimos copiar. Selecciónalo y cópialo a mano.');
    }
  }

  /** Cambia de sección navegando: la dirección es la que manda. */
  ir(seccion: Seccion): void {
    void this.router.navigateByUrl(this.direccion(seccion));
  }

  /** La dirección de una sección, para los `routerLink` de la barra lateral. */
  direccion(seccion: Seccion): string {
    return rutaDeSeccion(DIRECCIONES[seccion]);
  }

  /**
   * Lee la sección de la dirección. Una que no existe —un enlace viejo o mal
   * escrito— lleva al resumen sin dejar la mala en el historial.
   */
  private leerSeccion(direccion: string | null): void {
    const seccion = direccion ? seccionDe(direccion) : undefined;
    if (!seccion) {
      void this.router.navigateByUrl(this.direccion('resumen'), { replaceUrl: true });
      return;
    }
    this.titulo.setTitle(`${PAGINAS[seccion].titulo} · Administración · Acosta Research`);
    this.abrir(seccion);
  }

  /** Lo que pasa al entrar en una sección: pedir lo que aún no se tiene. */
  private abrir(seccion: Seccion): void {
    this.seccion.set(seccion);
    this.notaAbierta.set(false);
    this.error.set(null);
    this.aviso.set(null);

    // Los usuarios NO se cargan con el resto del panel: es la única lista que
    // pagina en el servidor y la única que no hace falta para nada de lo que se
    // ve al entrar. Se pide la primera vez que se abre su sección. Las dos
    // listas —administradores y usuarios— salen de la misma petición, así que
    // basta con pedirla al abrir cualquiera de las dos.
    if ((seccion === 'admins' || seccion === 'usuarios') && this.cuentas.usuarios().length === 0) {
      this.cuentas.cargarUsuarios();
    }

    // El corpus tampoco: es una llamada a la base por una lista que solo
    // mira quien viene a curar bibliografía, no quien entra a revisar cobros.
    if (seccion === 'corpus' && this.bibliografia.corpus() === null) this.bibliografia.cargarCorpus();

    if (this.enTutoriales() && this.ayuda.tutoriales().length === 0) this.ayuda.cargarTutoriales();
    if (this.enTutoriales() && this.ayuda.guias().length === 0) this.ayuda.cargarGuias();

    // Cada vez: una hoja nueva puede haber llegado mientras se miraba otra cosa.
    if (seccion === 'reclamos') this.seguimiento.cargarReclamos();

    if (seccion === 'resenas') this.seguimiento.cargarResenas();

    // Lo mismo con las fichas de asesor: el enlace está repartido y llegan solas.
    if (seccion === 'asesores') this.seguimiento.cargarAsesores();

    // Y con los pedidos, que llegan a cualquier hora. Los asesores hacen falta
    // aquí para poder asignar sin cambiar de sección.
    if (seccion === 'pedidos') {
      this.seguimiento.cargarPedidos();
      this.seguimiento.cargarAsesores();
    }

    // Las pruebas se miran de vez en cuando —antes y después de un taller—, no
    // a diario: tampoco se piden al entrar. Se vuelven a pedir cada vez que se
    // abre la sección, porque los cupos se van llenando mientras tanto.
    if (seccion === 'pruebas') this.pruebasConector.cargarPruebas();
  }

  // ── Pruebas del conector ─────────────────────────────────────────────────

  readonly pruebasConector = new PruebasConectorAdmin(
    this.error, this.aviso, this.trabajando, this.planesLicencia,
  );

  // ── Corpus bibliográfico ─────────────────────────────────────────────────

  readonly bibliografia = new BibliografiaAdmin(this.error, this.aviso);

  // ── Atención y revisiones ────────────────────────────────────────────────

  readonly seguimiento = new SeguimientoAdmin(this.error, this.aviso);

  // ── Tutoriales y guías ───────────────────────────────────────────────────

  readonly ayuda = new ContenidoAyudaAdmin(this.error, this.aviso);

  // ── Usuarios y administradores ──────────────────────────────────────────

  readonly cuentas = new UsuariosAdmin(this.error, this.aviso);

  // ── Vender ───────────────────────────────────────────────────────────────

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
