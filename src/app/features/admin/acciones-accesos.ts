import { computed, inject, signal, Signal, WritableSignal } from '@angular/core';
import { ActivationCode, EntradaHistorial, LicenciaAdmin } from '../../core/models/admin.model';
import { Plan } from '../../core/models/rewrite.model';
import { AdminService } from '../../core/services/admin.service';
import { PaymentService } from '../../core/services/payment.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { Grupo } from '../../core/services/billing.service';
import { mensajeDeError } from '../../core/http/api-error';
import { Acceso } from './accesos';

export class AccionesAccesosAdmin {
  private readonly admin = inject(AdminService);
  private readonly payments = inject(PaymentService);
  private readonly dialogos = inject(DialogoService);
  constructor(
    readonly error: WritableSignal<string | null>,
    readonly aviso: WritableSignal<string | null>,
    readonly planesLicencia: Signal<Plan[]>,
    readonly grupos: Signal<Grupo[]>,
    readonly codigos: WritableSignal<ActivationCode[]>,
    readonly licencias: WritableSignal<LicenciaAdmin[]>,
    private readonly recargar: () => void,
    private readonly abrirCodigo: (codigo: ActivationCode) => void,
    private readonly abrirPago: (id: string) => void,
    readonly importe: (cents: number | null) => string,
  ) {}
  /** La licencia cuyo historial está abierto, y lo que el servidor contó de ella. */
  readonly viendoHistorial = signal<LicenciaAdmin | null>(null);
  readonly historialLicencia = signal<EntradaHistorial[] | null>(null);

  readonly accesoAbierto = signal<Acceso | null>(null);

  // ── Mover una licencia de producto ───────────────────────────────────────
  //
  // Existe porque el catálogo crece: quien compró «las 12 skills» antes de que
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
    // Los planes públicos no traen los que están en prueba; los grupos del
    // panel sí, y sin ellos el historial enseñaba el código en vez del nombre.
    const grupo = this.grupos().find((g) => g.productCode === productCode);
    return plan?.name ?? grupo?.name ?? productCode;
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
    // Si ya se movió, lo que tiene es `productoActual`; `productCode` es lo que
    // se vendió. Filtrar por este escondía justo el producto al que devolverlo.
    const acceso = this.accesoAbierto();
    const actual = acceso?.productoActual ?? acceso?.productCode ?? '';
    const vistos = new Set<string>();

    // De los grupos del panel y no de los planes públicos: esos esconden los que
    // están en prueba, y entonces no había forma de devolver a nadie a uno de
    // ellos. Los retirados sí se quedan fuera, porque el servidor exige un plan
    // activo para copiar sus topes.
    return this.grupos()
      .filter((grupo) => grupo.active && grupo.productCode && grupo.productCode !== actual)
      .filter((grupo) => !vistos.has(grupo.productCode!) && vistos.add(grupo.productCode!))
      .map((grupo) => ({ productCode: grupo.productCode!, nombre: grupo.name }));
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
    this.limpiarVariasTesis();
    this.limpiarCorreo();
    if (acceso.tieneComprobante) this.descargarCaptura(acceso);
    if (acceso.licenseId) this.consultarLicencia(acceso.licenseId);
  }

  cerrarAcceso(): void {
    this.accesoAbierto.set(null);
    this.productoElegido.set('');
    this.soltarCaptura();
    this.limpiarVariasTesis();
    this.limpiarCorreo();
  }

  // ── Cambiar el correo de la cuenta ───────────────────────────────────────
  //
  // Para quien compró con un correo mal escrito o perdió su bandeja y nos lo
  // pide por WhatsApp. Cambia la cuenta, no la licencia: la URL sigue igual.

  /** Qué formulario de la ficha está desplegado: de uno en uno, para que no se alargue. */
  readonly accionAbierta = signal<'duracion' | 'correo' | 'producto' | null>(null);

  alternarAccion(cual: 'duracion' | 'correo' | 'producto'): void {
    this.accionAbierta.update((abierta) => (abierta === cual ? null : cual));
  }

  readonly correoNuevo = signal('');
  readonly cambiandoCorreo = signal(false);
  readonly avisoCorreo = signal<string | null>(null);
  readonly errorCorreo = signal<string | null>(null);

  private limpiarCorreo(): void {
    this.accionAbierta.set(null);
    this.correoNuevo.set('');
    this.cambiandoCorreo.set(false);
    this.avisoCorreo.set(null);
    this.errorCorreo.set(null);
  }

  async cambiarCorreoDelAcceso(): Promise<void> {
    const acceso = this.accesoAbierto();
    const email = this.correoNuevo().trim().toLowerCase();
    if (!acceso?.licenseId || !email || this.cambiandoCorreo()) return;

    const seguro = await this.dialogos.confirmar({
      titulo: '¿Cambiar el correo de la cuenta?',
      mensaje:
        `Desde ahora entrará con ${email}, y ahí le llegarán los códigos y los avisos. ` +
        'Si entraba con Google, tendrá que volver a entrar con Google con el correo nuevo.',
      nota: 'Le avisamos en los dos correos. Su URL del conector, su licencia y su tesis no cambian.',
      confirmar: 'Cambiar el correo',
    });
    if (!seguro || this.accesoAbierto() !== acceso) return;

    this.cambiandoCorreo.set(true);
    this.avisoCorreo.set(null);
    this.errorCorreo.set(null);

    this.admin.cambiarCorreo(acceso.licenseId, email).subscribe({
      next: ({ email: nuevo, mensaje }) => {
        this.cambiandoCorreo.set(false);
        this.correoNuevo.set('');
        this.avisoCorreo.set(mensaje);
        // Un cobro enseña el correo de la cuenta: se pone al día en la ficha y en
        // la lista. Un código enseña a quién se mandó, que no cambia.
        if (acceso.canal !== 'codigo') this.accesoAbierto.set({ ...acceso, comprador: nuevo });
        this.recargar();
      },
      error: (fallo) => {
        this.cambiandoCorreo.set(false);
        this.errorCorreo.set(mensajeDeError(fallo));
      },
    });
  }

  // ── Varias tesis por licencia ────────────────────────────────────────────
  //
  // Por defecto una licencia es para una tesis. Esto le deja abrir más desde
  // su perfil a quien lo necesite, sin tocarle la URL ni lo que ya tiene.

  /** Si la licencia de la ficha lo permite. Nulo mientras se consulta o si falló. */
  readonly variasTesis = signal<boolean | null>(null);
  readonly guardandoVariasTesis = signal(false);
  /** Mensajes dentro de la ficha: el aviso general queda tapado por la ventana. */
  readonly avisoVariasTesis = signal<string | null>(null);
  readonly errorVariasTesis = signal<string | null>(null);

  private limpiarVariasTesis(): void {
    this.variasTesis.set(null);
    this.guardandoVariasTesis.set(false);
    this.avisoVariasTesis.set(null);
    this.errorVariasTesis.set(null);
    this.limpiarDuracion();
  }

  /** Una sola consulta para las dos filas que leen la licencia: varias tesis y duración. */
  private consultarLicencia(licenseId: string): void {
    this.admin.licenciaDe(licenseId).subscribe({
      next: (license) => {
        // Si ya se abrió otra ficha, esta respuesta no es de ella.
        if (this.accesoAbierto()?.licenseId !== licenseId) return;
        this.variasTesis.set(license.variasTesis === true);
        this.ponerVigencia(license);
      },
      error: (fallo) => {
        if (this.accesoAbierto()?.licenseId === licenseId) {
          this.errorVariasTesis.set(mensajeDeError(fallo));
        }
      },
    });
  }

  // ── Duración de la membresía ─────────────────────────────────────────────
  //
  // En días desde el canje, igual que al vender el método: el mismo número
  // significa lo mismo en los dos sitios. Vacío = que no caduque.

  /** Caducidad y canje de la licencia de la ficha. Nulo mientras se consulta. */
  readonly vigencia = signal<{ expiresAt: string | null; createdAt: string } | null>(null);
  readonly diasDuracion = signal('');
  readonly guardandoDuracion = signal(false);
  readonly avisoDuracion = signal<string | null>(null);
  readonly errorDuracion = signal<string | null>(null);

  /** Lo que hay escrito en el campo, ya como número. Nulo = vacío; NaN = no vale. */
  private readonly diasEscritos = computed(() => {
    const texto = this.diasDuracion().trim();
    if (!texto) return null;
    const dias = Number(texto);
    return Number.isInteger(dias) && dias >= 1 && dias <= 3650 ? dias : NaN;
  });

  /** La fecha en que vencería con lo escrito; nula si quedaría sin caducidad. */
  readonly vencimientoPrevisto = computed(() => {
    const vigencia = this.vigencia();
    const dias = this.diasEscritos();
    if (!vigencia || dias === null || Number.isNaN(dias)) return null;
    return new Date(new Date(vigencia.createdAt).getTime() + dias * 86_400_000);
  });

  /** Si lo escrito vale y además cambia algo. */
  readonly duracionCambia = computed(() => {
    const vigencia = this.vigencia();
    const dias = this.diasEscritos();
    if (!vigencia || Number.isNaN(dias)) return false;
    if (dias === null) return vigencia.expiresAt !== null;
    return this.vencimientoPrevisto()?.getTime() !== new Date(vigencia.expiresAt ?? 0).getTime();
  });

  private ponerVigencia(license: { expiresAt: string | null; createdAt: string }): void {
    this.vigencia.set({ expiresAt: license.expiresAt, createdAt: license.createdAt });
    // Se rellena con lo que dura ahora, redondeado a días, para que se edite
    // sobre el número y no desde cero.
    this.diasDuracion.set(
      license.expiresAt
        ? String(
            Math.round(
              (new Date(license.expiresAt).getTime() - new Date(license.createdAt).getTime()) /
                86_400_000,
            ),
          )
        : '',
    );
  }

  private limpiarDuracion(): void {
    this.vigencia.set(null);
    this.diasDuracion.set('');
    this.guardandoDuracion.set(false);
    this.avisoDuracion.set(null);
    this.errorDuracion.set(null);
  }

  cambiarDuracionDelAcceso(): void {
    const acceso = this.accesoAbierto();
    const dias = this.diasEscritos();
    if (!acceso?.licenseId || !this.duracionCambia() || this.guardandoDuracion()) return;

    this.guardandoDuracion.set(true);
    this.avisoDuracion.set(null);
    this.errorDuracion.set(null);

    this.admin.cambiarDuracion(acceso.licenseId, dias).subscribe({
      next: ({ license, mensaje }) => {
        this.guardandoDuracion.set(false);
        if (this.accesoAbierto()?.licenseId !== acceso.licenseId) return;
        this.ponerVigencia(license);
        this.avisoDuracion.set(mensaje);
      },
      error: (fallo) => {
        this.guardandoDuracion.set(false);
        this.errorDuracion.set(mensajeDeError(fallo));
      },
    });
  }

  cambiarVariasTesis(): void {
    const acceso = this.accesoAbierto();
    const actual = this.variasTesis();
    if (!acceso?.licenseId || actual === null || this.guardandoVariasTesis()) return;

    this.guardandoVariasTesis.set(true);
    this.avisoVariasTesis.set(null);
    this.errorVariasTesis.set(null);

    this.admin.cambiarVariasTesis(acceso.licenseId, !actual).subscribe({
      next: ({ activa, mensaje }) => {
        this.guardandoVariasTesis.set(false);
        this.variasTesis.set(activa);
        this.avisoVariasTesis.set(mensaje);
      },
      error: (fallo) => {
        this.guardandoVariasTesis.set(false);
        this.errorVariasTesis.set(mensajeDeError(fallo));
      },
    });
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
      if (codigo) this.abrirCodigo(codigo);
      return;
    }
    this.abrirPago(acceso.id);
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
      nota: 'Le avisamos por correo con este motivo. Se puede reactivar después desde esta misma tabla.',
      campo: {
        etiqueta: 'Motivo (el cliente lo lee en el correo)',
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

  verHistorial(licencia: LicenciaAdmin): void {
    this.viendoHistorial.set(licencia);
    this.historialLicencia.set(null);
    this.admin.historialDe(licencia.id).subscribe({
      next: (entradas) => this.historialLicencia.set(entradas),
      error: (e: unknown) => {
        this.viendoHistorial.set(null);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /** La respuesta no trae el comprador, así que se conserva el que ya teníamos. */
  private reemplazar(actualizada: LicenciaAdmin): void {
    this.licencias.update((lista) =>
      lista.map((l) => (l.id === actualizada.id ? { ...l, ...actualizada } : l)),
    );
  }

}
