import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';

import { toApiError } from '../../core/http/api-error';
import {
  ActivationCode,
  Alerta,
  CodigoDescuento,
  LicenciaAdmin,
  MetodoDeCobro,
  PackAdmin,
  PagoAdmin,
} from '../../core/models/admin.model';
import { PagoPorRevisar, PagoRevisado } from '../../core/models/payment.model';
import { Plan } from '../../core/models/rewrite.model';
import { AdminService } from '../../core/services/admin.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { BillingService, Grupo } from '../../core/services/billing.service';
import { PaymentService } from '../../core/services/payment.service';
import { AnalisisBundle, Skill, SkillService } from '../../core/services/skill.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

type Seccion =
  'ventas' | 'yape' | 'grupos' | 'descuentos' | 'licencias' | 'alertas' | 'movimientos';

/** Los estados por los que se puede filtrar el historial de Yape. */
type FiltroHistorial = 'todos' | 'aprobados' | 'rechazados' | 'sin-resolver';

/** Filas del historial que se enseñan de golpe, y que añade cada despliegue. */
const POR_TANDA = 10;

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

/** Métodos de pago que acepta el backend para una activación manual. */
const METODOS = ['YAPE', 'PLIN', 'TRANSFERENCIA', 'PAYPAL', 'WESTERN_UNION', 'CORTESIA'] as const;

/**
 * Cuántos códigos se enseñan de entrada.
 *
 * La lista crece con cada venta y no para. Ocho caben sin que la tarjeta se
 * coma la pantalla, y son de sobra para el uso real: lo que se mira a diario
 * son los últimos, y para lo demás está el buscador.
 */
const CODIGOS_VISIBLES = 8;

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

/** Lo que se cobrará por PayPal. Se redondea hacia arriba a la décima. */
function aDolares(soles: number): number {
  if (!soles || soles <= 0) return 0;
  return Math.ceil((soles / SOLES_POR_DOLAR) * (1 + RECARGO_PAYPAL) * 10) / 10;
}

/**
 * Panel de administración.
 *
 * Es una herramienta de trabajo, no un escaparate: lo que se mira a diario va
 * primero —vender y vigilar— y el histórico queda detrás.
 */
@Component({
  selector: 'app-admin',
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, SiteHeader, SiteFooter],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminService);
  private readonly billing = inject(BillingService);
  private readonly dialogos = inject(DialogoService);
  private readonly payments = inject(PaymentService);

  readonly metodos = METODOS;
  readonly seccion = signal<Seccion>('ventas');

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
  /** Comprobantes ya resueltos. Llega la tanda entera y se filtra aquí. */
  readonly historial = signal<PagoRevisado[]>([]);
  /** Texto del buscador: correo, nombre, nº de operación o referencia. */
  readonly buscaHistorial = signal('');
  readonly filtroHistorial = signal<FiltroHistorial>('todos');
  /**
   * Cuántas filas se enseñan.
   *
   * Se muestran diez y el resto se despliega a tandas. El historial crece sin
   * parar y nadie lo lee entero: lo que se busca casi siempre está en las
   * últimas, y lo que no, se encuentra con el buscador antes que bajando.
   */
  readonly visiblesHistorial = signal(POR_TANDA);
  /** Qué captura se está bajando, para no dejar el botón mudo mientras tanto. */
  readonly abriendo = signal<string | null>(null);
  /** Las pestañas del filtro, en el orden en que se leen. */
  readonly filtrosHistorial: { valor: FiltroHistorial; etiqueta: string }[] = [
    { valor: 'todos', etiqueta: 'Todos' },
    { valor: 'aprobados', etiqueta: 'Aprobados' },
    { valor: 'rechazados', etiqueta: 'Rechazados' },
    { valor: 'sin-resolver', etiqueta: 'Sin resolver' },
  ];
  readonly porTanda = POR_TANDA;

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

  // ── Códigos: ventana, búsqueda y filtro ──────────────────────────────────
  /** La ventana de generar. Vive fuera de la tarjeta, encima de la página. */
  readonly formularioCodigosAbierto = signal(false);
  readonly busquedaCodigos = signal('');
  readonly filtroEstadoCodigos = signal<'' | 'AVAILABLE' | 'REDEEMED' | 'VOID'>('');
  /** Si está desplegada la lista entera o solo los primeros. */
  readonly todosLosCodigos = signal(false);

  /**
   * Los códigos que pasan el buscador y el filtro.
   *
   * Se busca por todo lo que uno recuerda de una venta: los cuatro caracteres
   * del final, el correo, la nota, el número de operación y el producto. Quien
   * viene a esta tabla llega con un dato suelto de una conversación de
   * WhatsApp, no con el identificador.
   */
  readonly codigosFiltrados = computed(() => {
    const texto = this.busquedaCodigos().trim().toLowerCase();
    const estado = this.filtroEstadoCodigos();

    return this.codigos().filter((codigo) => {
      if (estado && codigo.status !== estado) return false;
      if (!texto) return true;

      return [
        codigo.hint,
        codigo.buyerEmail,
        codigo.note,
        codigo.paymentRef,
        codigo.paymentMethod,
        codigo.productCode,
      ].some((campo) => (campo ?? '').toLowerCase().includes(texto));
    });
  });

  /** Los que se pintan: los primeros, salvo que se pida ver el resto. */
  readonly codigosEnPantalla = computed(() =>
    this.todosLosCodigos()
      ? this.codigosFiltrados()
      : this.codigosFiltrados().slice(0, CODIGOS_VISIBLES),
  );

  readonly codigosOcultos = computed(
    () => this.codigosFiltrados().length - this.codigosEnPantalla().length,
  );

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
  });

  readonly formDescuento = this.fb.nonNullable.group({
    // En soles, que es como piensa el precio; se convierte a céntimos al enviar.
    soles: [20, [Validators.required, Validators.min(DESCUENTO_MINIMO / 100)]],
    planCode: [''],
    code: [''],
    maxUses: [0, [Validators.min(0)]],
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
   * Se listan todos a propósito. Un capítulo pertenece a un grupo y solo a uno,
   * así que marcar aquí uno ajeno lo MUEVE: eso se avisa con una etiqueta en su
   * fila, pero no se impide. Montar un producto nuevo con capítulos que ya
   * existen es un caso real —un paquete reducido, una edición distinta— y
   * obligar a desmarcarlos antes en el grupo de origen era dar un rodeo para
   * llegar al mismo sitio.
   */
  readonly capitulosDisponibles = this.capitulosOrdenados;

  /** Grupo cuyos capítulos se están mirando desde la tabla. */
  readonly viendoCapitulos = signal<Grupo | null>(null);
  readonly capitulosDelGrupo = computed(() => {
    const grupo = this.viendoCapitulos();
    if (!grupo) return [];
    return this.capitulosOrdenados().filter((s) => s.productCode === grupo.productCode);
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
    productCode: [''],
    active: [true],
  });

  ngOnInit(): void {
    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
    this.recargar();

    // El precio de PayPal se enseña mientras se teclea el de soles. El
    // componente vive lo que la página, así que no hace falta soltar esto.
    this.formGrupo.controls.soles.valueChanges.subscribe((soles) => {
      this.solesEscritos.set(Number(soles) || 0);
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
      error: (e: unknown) => this.error.set(toApiError(e).message),
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
      durationDays: grupo.durationDays,
      mcpCallsPerDay: grupo.mcpCallsPerDay,
      active: grupo.active,
    });
    this.solesEscritos.set(grupo.priceCents / 100);
    this.capitulosElegidos.set(
      new Set(
        this.skills()
          .filter((s) => s.productCode === grupo.productCode)
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
   * De qué otro grupo viene un capítulo, si viene de alguno.
   *
   * Se enseña junto a la casilla porque marcarlo aquí lo MUEVE: un capítulo
   * pertenece a un grupo y solo a uno. Sin este aviso, añadir un capítulo a un
   * producto nuevo se lo quitaría a otro sin que nadie lo viera.
   */
  grupoDe(productCode: string | null): string | null {
    if (!productCode) return null;
    const actual = this.editandoGrupo();
    if (actual && productCode === actual.productCode) return null;
    return this.grupos().find((g) => g.productCode === productCode)?.name ?? productCode;
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
        this.error.set(toApiError(e).message);
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
          this.error.set(toApiError(e).message);
          this.trabajando.set(false);
        },
      });
  }

  /**
   * Aplica lo marcado en la lista de capítulos: mete los nuevos y saca los que
   * se desmarcaron.
   *
   * Solo toca los que cambiaron. Reasignar los nueve capítulos cada vez que se
   * corrige una errata en el nombre del grupo serían nueve escrituras inútiles
   * y nueve líneas de log que no dicen nada.
   */
  private moverCapitulos(productCode: string): Observable<unknown> {
    const elegidos = this.capitulosElegidos();

    const cambios = this.skills()
      .filter((s) => (s.productCode === productCode) !== elegidos.has(s.id))
      .map((s) =>
        // Cadena vacía saca el capítulo de todo grupo, que es lo que el
        // servidor entiende por «sin grupo».
        this.skillsApi.actualizar(s.id, { productCode: elegidos.has(s.id) ? productCode : '' }),
      );

    return cambios.length > 0 ? forkJoin(cambios) : of(null);
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
        this.error.set(toApiError(e).message);
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
        error: (e: unknown) => this.marcar(item, { estado: 'error', error: toApiError(e).message }),
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
        productCode: a.reemplaza?.productCode ?? this.grupoDestino() ?? undefined,
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
          this.marcar(item, { estado: 'error', error: toApiError(e).message });
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
      productCode: skill.productCode ?? '',
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
        this.error.set(toApiError(e).message);
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
            productCode: skill.productCode ?? undefined,
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
          this.error.set(e instanceof Error ? e.message : toApiError(e).message);
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
      error: (e: unknown) => this.error.set(toApiError(e).message),
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
          this.error.set(toApiError(e).message);
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
        this.error.set(toApiError(e).message);
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
      error: (e: unknown) => this.error.set(toApiError(e).message),
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
      if (skill.productCode === mio) seleccion.add(skill.id);
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
          fallos.push(`${nombre} (${toApiError(e).message})`);
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
      error: (e: unknown) => this.error.set(toApiError(e).message),
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
        this.error.set(toApiError(e).message);
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
        this.error.set(toApiError(e).message);
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

  /** Cuántos hay en cada estado. Va en las pestañas del filtro. */
  readonly conteoHistorial = computed(() => {
    const pagos = this.historial();
    return {
      todos: pagos.length,
      aprobados: pagos.filter((p) => p.status === 'PAID').length,
      rechazados: pagos.filter((p) => p.status === 'REJECTED').length,
      'sin-resolver': pagos.filter((p) => p.status !== 'PAID' && p.status !== 'REJECTED').length,
    } satisfies Record<FiltroHistorial, number>;
  });

  /**
   * El historial ya cribado por el filtro y el buscador.
   *
   * Se busca por correo, nombre, nº de operación y referencia porque son las
   * cuatro cosas con las que llega una reclamación: «soy fulano», «pagué con
   * este correo» o «mi operación es la 01234567».
   */
  readonly historialFiltrado = computed(() => {
    const filtro = this.filtroHistorial();
    const busca = this.buscaHistorial().trim().toLowerCase();

    return this.historial().filter((pago) => {
      if (filtro === 'aprobados' && pago.status !== 'PAID') return false;
      if (filtro === 'rechazados' && pago.status !== 'REJECTED') return false;
      if (filtro === 'sin-resolver' && (pago.status === 'PAID' || pago.status === 'REJECTED')) {
        return false;
      }
      if (!busca) return true;

      return [
        pago.user.email,
        `${pago.user.firstName} ${pago.user.lastName}`,
        pago.operationCode ?? '',
        pago.providerOrderId,
        pago.plan.name,
      ]
        .join(' ')
        .toLowerCase()
        .includes(busca);
    });
  });

  /** La tanda que se está enseñando ahora mismo. */
  readonly historialVisible = computed(() =>
    this.historialFiltrado().slice(0, this.visiblesHistorial()),
  );

  /** Cuántos quedan escondidos, para decirlo en el botón. */
  readonly restanHistorial = computed(() =>
    Math.max(0, this.historialFiltrado().length - this.visiblesHistorial()),
  );

  buscarHistorial(evento: Event): void {
    this.buscaHistorial.set((evento.target as HTMLInputElement).value);
    // Cambiar la búsqueda con veinte filas abiertas dejaba el resultado nuevo
    // ya desplegado, sin que nadie lo pidiera.
    this.visiblesHistorial.set(POR_TANDA);
  }

  filtrarHistorial(filtro: FiltroHistorial): void {
    this.filtroHistorial.set(filtro);
    this.visiblesHistorial.set(POR_TANDA);
  }

  limpiarBusquedaHistorial(): void {
    this.buscaHistorial.set('');
    this.visiblesHistorial.set(POR_TANDA);
  }

  verMasHistorial(): void {
    this.visiblesHistorial.update((n) => n + POR_TANDA);
  }

  plegarHistorial(): void {
    this.visiblesHistorial.set(POR_TANDA);
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
        this.error.set(toApiError(e).message);
        this.abriendo.set(null);
      },
    });
  }

  /** Cómo acabó el pago, en castellano y en una palabra. */
  estadoHistorial(pago: PagoRevisado): string {
    switch (pago.status) {
      case 'PAID':
        return 'Aprobado';
      case 'REJECTED':
        return 'Rechazado';
      case 'CANCELLED':
        return 'Cancelado';
      case 'FAILED':
        return 'Fallido';
      default:
        return 'Sin comprobante';
    }
  }

  // ── Descuentos ───────────────────────────────────────────────────────────

  crearDescuento(): void {
    if (this.formDescuento.invalid || this.trabajando()) {
      this.formDescuento.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.descuentoNuevo.set(null);

    const { soles, planCode, code, maxUses, note } = this.formDescuento.getRawValue();

    this.admin
      .crearDescuento({
        amountCents: Math.round(soles * 100),
        planCode: planCode || undefined,
        code: code.trim() || undefined,
        maxUses,
        note: note || undefined,
      })
      .subscribe({
        next: (descuento) => {
          this.descuentoNuevo.set(descuento);
          this.descuentos.update((lista) => [descuento, ...lista]);
          this.formDescuento.patchValue({ code: '', note: '' });
          this.trabajando.set(false);
        },
        error: (e: unknown) => {
          this.error.set(toApiError(e).message);
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
      error: (e: unknown) => this.error.set(toApiError(e).message),
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
    this.formularioCodigosAbierto.set(true);
  }

  cerrarFormularioCodigos(): void {
    if (this.trabajando()) return;
    this.formularioCodigosAbierto.set(false);
  }

  /** El buscador y el filtro escriben aquí: en la plantilla no hay lógica. */
  buscarCodigos(evento: Event): void {
    this.busquedaCodigos.set((evento.target as HTMLInputElement).value);
    // Con la lista recortada, buscar y no ver lo que se busca es lo peor que
    // puede pasar: al filtrar se vuelve a los primeros de la nueva lista.
    this.todosLosCodigos.set(false);
  }

  filtrarCodigos(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.filtroEstadoCodigos.set(valor as '' | 'AVAILABLE' | 'REDEEMED' | 'VOID');
    this.todosLosCodigos.set(false);
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

    this.admin
      .generarCodigos({
        cantidad,
        productCode: productCode || undefined,
        buyerEmail: buyerEmail || undefined,
        note: note || undefined,
        paymentMethod,
        paymentRef: paymentRef || undefined,
        // Vacío no es cero: significa «cobré el precio de la web» y lo resuelve
        // el servidor. Mandar 0 sería decir que la venta fue gratis.
        importe: importe === null || importe === undefined ? undefined : importe,
      })
      .subscribe({
        next: ({ codes, enviadoA, cobro }) => {
          this.codigosNuevos.set(codes);
          this.codigoEnviadoA.set(enviadoA);
          this.cobroApuntado.set(cobro);
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
          this.error.set(toApiError(e).message);
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
          this.error.set(toApiError(e).message);
          this.trabajando.set(false);
        },
      });
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
      error: (e: unknown) => this.error.set(toApiError(e).message),
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
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  reactivar(licencia: LicenciaAdmin): void {
    this.admin.reactivar(licencia.id).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.aviso.set(`Licencia de ${licencia.user.email} reactivada.`);
      },
      error: (e: unknown) => this.error.set(toApiError(e).message),
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
