import { computed, effect, inject, signal, Signal, WritableSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { mensajeDeError } from '../../core/http/api-error';
import { ActivationCode, MetodoDeCobro, PackAdmin } from '../../core/models/admin.model';
import { Descuento } from '../../core/models/payment.model';
import { Plan } from '../../core/models/rewrite.model';
import { AdminService } from '../../core/services/admin.service';
import { BillingService, Grupo } from '../../core/services/billing.service';
import { RevisionDeCorreo, leerListaDeCorreos, revisarCorreo } from '../../shared/validators/correo';

export class VentasManualesAdmin {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminService);
  private readonly billing = inject(BillingService);
  readonly planesLicencia = computed(() => this.planes().filter(p => p.kind === 'LICENSE'));
  constructor(
    readonly error: WritableSignal<string | null>,
    readonly aviso: WritableSignal<string | null>,
    readonly trabajando: WritableSignal<boolean>,
    readonly copiados: WritableSignal<boolean>,
    readonly planes: Signal<Plan[]>,
    readonly grupos: Signal<Grupo[]>,
    readonly codigos: WritableSignal<ActivationCode[]>,
    readonly bolsas: WritableSignal<PackAdmin[]>,
  ) {}
  /** Códigos recién generados. Se muestran una vez y no vuelven. */
  readonly codigosNuevos = signal<string[]>([]);
  /** Correo al que el servidor acaba de mandarlos, si se indicó uno. */
  readonly codigoEnviadoA = signal<string | null>(null);
  /** Qué códigos le tocaron a cada comprador, cuando se vendió a una lista. */
  readonly enviosNuevos = signal<{ email: string | null; codes: string[] }[]>([]);
  /** Cobro apuntado en los códigos recién generados. Null si fue cortesía. */
  readonly cobroApuntado = signal<{ paymentMethod: MetodoDeCobro; amountCents: number } | null>(
    null,
  );
  readonly formularioCodigosAbierto = signal(false);
  readonly formCodigos = this.fb.nonNullable.group({
    cantidad: [1, [Validators.required, Validators.min(1), Validators.max(100)]],
    productCode: ['METODO_9_SKILLS'],
    buyerEmail: [''],
    // La lista pegada tal cual, para vender a varios compradores de una vez.
    buyerEmails: [''],
    note: [''],
    // El medio arranca en Western Union porque este formulario existe para las
    // ventas cobradas fuera de la web; una cortesía es lo excepcional y se elige
    // a propósito. Importe vacío = el precio del plan, que es lo habitual.
    paymentMethod: ['WESTERN_UNION' as MetodoDeCobro, Validators.required],
    paymentRef: [''],
    importe: [null as number | null, [Validators.min(0)]],
    // Días de acceso que da el código. Vacío = los del plan, que es lo habitual.
    duracion: [null as number | null, [Validators.min(1), Validators.max(3650)]],
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

  /**
   * Vender a uno o a una lista.
   *
   * Con una lista es la misma venta repetida: mismo producto, mismo medio y
   * mismo importe por código, y a cada comprador le llega solo el suyo.
   */
  readonly variosCompradores = signal(false);

  /**
   * Lo que dijo el servidor de cada correo ya comprobado.
   *
   * Aquí se sabe si el dominio recibe correo, cosa que el navegador no puede
   * mirar: `zz@hou.com` tiene la forma perfecta, no se parece a ningún
   * proveedor, y no tiene buzones.
   */
  readonly revisionesServidor = signal<ReadonlyMap<string, RevisionDeCorreo>>(new Map());
  readonly comprobandoCorreos = signal(false);

  readonly valoresCodigos = toSignal(
    this.formCodigos.valueChanges.pipe(map(() => this.formCodigos.getRawValue())),
    { initialValue: this.formCodigos.getRawValue() },
  );

  /**
   * El correo del comprador, revisado. Null si está vacío, que es válido: el
   * código se genera y solo se ve en pantalla.
   *
   * `type="email"` no basta: `kelin@gamail.com` tiene la forma perfecta y se
   * vendió un código a un dominio que no es de nadie.
   */
  readonly revisionCorreo = computed(() => {
    const texto = this.valoresCodigos().buyerEmail.trim();
    if (!texto) return null;
    const local = revisarCorreo(texto);
    return local.problema ? local : (this.revisionesServidor().get(local.correo) ?? local);
  });

  readonly listaCorreos = computed(() => {
    const lista = leerListaDeCorreos(this.valoresCodigos().buyerEmails);
    const servidor = this.revisionesServidor();
    return {
      ...lista,
      correos: lista.correos.map((r) => (r.problema ? r : (servidor.get(r.correo) ?? r))),
    };
  });

  /** Correos con buena forma que el servidor aún no ha visto. */
  readonly correosPorComprobar = computed(() => {
    const servidor = this.revisionesServidor();
    const candidatos = this.variosCompradores()
      ? this.listaCorreos().correos
      : [this.revisionCorreo()];
    return candidatos
      .filter((r): r is RevisionDeCorreo => !!r && !r.problema && !servidor.has(r.correo))
      .map((r) => r.correo);
  });

  /** Se comprueban al dejar de escribir, no con cada tecla. */
  private readonly comprobarCorreosAlEscribir = effect((onCleanup) => {
    const pendientes = this.correosPorComprobar();
    if (!this.formularioCodigosAbierto() || pendientes.length === 0) return;
    const espera = setTimeout(() => this.pedirRevisionDeCorreos(pendientes).subscribe(), 700);
    onCleanup(() => clearTimeout(espera));
  });
  readonly correosConProblema = computed(() =>
    this.listaCorreos().correos.filter((r) => r.problema),
  );

  /** Los que el servidor miró pero cuyo servidor de correo no quiso contestar. */
  readonly correosSinComprobar = computed(
    () => this.listaCorreos().correos.filter((r) => !r.problema && r.buzon === null).length,
  );

  /** Las membresías de «Preparar documento»: documentos al mes, sin conector. */
  readonly planesDocumentos = computed(() =>
    this.planes().filter((p) => p.kind === 'DOCUMENTO' && p.priceCents > 0),
  );

  /**
   * Los productos que se pueden regalar o vender con código.
   *
   * Los públicos y, detrás, los que están en prueba: esos no salen en la web,
   * así que un código es la única manera de dárselos a alguien que no es
   * administrador. Los retirados no, porque no tienen topes que copiar.
   *
   * Van también las membresías de «Preparar documento», que se venden igual por
   * WhatsApp. No licencian nada, así que no tienen `productCode` y se
   * identifican por el `code` de su plan; el servidor lo reconoce al canjear y
   * entrega documentos al mes en vez de una URL de conector.
   */
  readonly productosCodigos = computed(() => {
    const lista = this.planesLicencia().map((plan) => ({
      productCode: plan.productCode ?? plan.code,
      nombre: plan.name,
      priceCents: plan.priceCents,
      durationDays: plan.durationDays,
    }));
    const vistos = new Set(lista.map((p) => p.productCode));

    for (const plan of this.planesDocumentos()) {
      const codigo = plan.productCode ?? plan.code;
      if (vistos.has(codigo)) continue;
      vistos.add(codigo);
      lista.push({
        productCode: codigo,
        nombre: plan.name,
        priceCents: plan.priceCents,
        durationDays: plan.durationDays,
      });
    }

    for (const grupo of this.grupos()) {
      const codigo = grupo.productCode ?? grupo.code;
      if (!grupo.active || !grupo.soloPara || vistos.has(codigo)) continue;
      vistos.add(codigo);
      lista.push({
        productCode: codigo,
        nombre: `${grupo.name} · en prueba`,
        priceCents: grupo.priceCents,
        durationDays: grupo.durationDays,
      });
    }
    return lista;
  });

  /** Los plazos que más se venden, a un clic. Cualquier otro se escribe en días. */
  readonly plazosRapidos = [
    { nombre: '1 mes', dias: 30 },
    { nombre: '3 meses', dias: 90 },
    { nombre: '6 meses', dias: 180 },
    { nombre: '1 año', dias: 365 },
  ];

  elegirDuracion(dias: number | null): void {
    this.formCodigos.controls.duracion.setValue(dias);
  }

  /** El plazo del producto elegido, para enseñarlo como lo que vale si se deja vacío. */
  readonly duracionDelPlan = computed(() => {
    const { productCode } = this.valoresCodigos();
    const dias = this.productosCodigos().find((p) => p.productCode === productCode)?.durationDays;
    return dias && dias > 0 ? `${dias} días` : 'sin caducidad';
  });

  /** Cuántos códigos salen y cuánto se apunta, para verlo antes de generar. */
  readonly resumenLista = computed(() => {
    const { cantidad, productCode, paymentMethod, importe } = this.valoresCodigos();
    const correos = this.listaCorreos().correos.length;
    const codigos = correos * (Number(cantidad) || 0);
    const plan = this.productosCodigos().find((p) => p.productCode === productCode);
    const porCodigoCents =
      paymentMethod === 'CORTESIA'
        ? 0
        : importe !== null && importe !== undefined
          ? Math.round(importe * 100)
          : (plan?.priceCents ?? 0);

    return {
      correos,
      codigos,
      porCodigoCents,
      totalCents: porCodigoCents * codigos,
      // El mismo tope que aplica el servidor, contando a todos los compradores.
      excede: codigos > 100,
    };
  });

  readonly formBolsa = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    planCode: ['TESISTA', Validators.required],
    paymentMethod: ['YAPE', Validators.required],
    paymentRef: [''],
    note: [''],
  });
  abrirFormularioCodigos(): void {
    this.error.set(null);
    // Los códigos de la vez anterior se quitan al abrir, no al generar: si
    // siguieran ahí, los nuevos aparecerían debajo de unos viejos ya copiados y
    // no habría forma de saber cuáles son cuáles.
    this.codigosNuevos.set([]);
    this.codigoEnviadoA.set(null);
    this.enviosNuevos.set([]);
    this.cobroApuntado.set(null);
    this.limpiarDescuento();
    this.quitarCapturaCodigo();
    this.formularioCodigosAbierto.set(true);
  }

  cambiarModoCompradores(varios: boolean): void {
    this.variosCompradores.set(varios);
  }

  usarSugerenciaDeCorreo(sugerencia: string): void {
    this.formCodigos.controls.buyerEmail.setValue(sugerencia);
  }

  private pedirRevisionDeCorreos(correos: string[]): Observable<void> {
    this.comprobandoCorreos.set(true);
    return this.admin.revisarCorreos(correos).pipe(
      // Si la comprobación falla no se bloquea la venta: al generar, el servidor
      // lo vuelve a mirar y ahí sí la rechaza.
      catchError(() => of(correos.map((correo) => ({ correo, problema: null, sugerencia: null })))),
      map((revisiones) => {
        const juntas = new Map(this.revisionesServidor());
        for (const r of revisiones) juntas.set(r.correo, r);
        this.revisionesServidor.set(juntas);
        this.comprobandoCorreos.set(false);
      }),
    );
  }

  /**
   * Reescribe la lista pegada, un correo por línea.
   *
   * Arreglar desde los botones y no a mano en el cuadro: con treinta correos,
   * buscar el que falla es justo donde se escapa otro.
   */
  private reescribirLista(cambio: (r: RevisionDeCorreo) => string | null): void {
    const correos = this.listaCorreos()
      .correos.map(cambio)
      .filter((c): c is string => !!c);
    this.formCodigos.controls.buyerEmails.setValue(correos.join('\n'));
  }

  corregirEnLista(correo: string, sugerencia: string): void {
    this.reescribirLista((r) => (r.correo === correo ? sugerencia : r.correo));
  }

  corregirTodosEnLista(): void {
    this.reescribirLista((r) => (r.problema && r.sugerencia ? r.sugerencia : r.correo));
  }

  quitarDeLista(correo: string): void {
    this.reescribirLista((r) => (r.correo === correo ? null : r.correo));
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
    if (this.formCodigos.invalid || this.trabajando() || this.comprobandoCorreos()) return;

    // Sin comprobar no sale: se pregunta ahora y se vuelve a intentar.
    const pendientes = this.correosPorComprobar();
    if (pendientes.length > 0) {
      this.pedirRevisionDeCorreos(pendientes).subscribe(() => {
        if (this.correosPorComprobar().length === 0) this.generarCodigos();
      });
      return;
    }

    // Ningún código sale hacia un correo mal escrito. El servidor lo rechaza
    // igual; esto es para que el aviso salga aquí, junto al campo, y no como un
    // error genérico detrás de la ventana.
    const varios = this.variosCompradores();
    if (varios) {
      const sinCorreos = this.listaCorreos().correos.length === 0;
      if (sinCorreos || this.correosConProblema().length > 0 || this.resumenLista().excede) {
        this.formCodigos.controls.buyerEmails.markAsTouched();
        return;
      }
    } else if (this.revisionCorreo()?.problema) {
      this.formCodigos.controls.buyerEmail.markAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.codigosNuevos.set([]);
    this.codigoEnviadoA.set(null);
    this.enviosNuevos.set([]);
    this.cobroApuntado.set(null);

    const { cantidad, productCode, note, paymentMethod, paymentRef, importe, duracion } =
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
        buyerEmail: varios ? undefined : this.revisionCorreo()?.correo || undefined,
        buyerEmails: varios ? this.listaCorreos().correos.map((r) => r.correo) : undefined,
        note: notaFinal || undefined,
        paymentMethod,
        paymentRef: paymentRef || undefined,
        // Vacío no es cero: significa «cobré el precio de la web» y lo resuelve
        // el servidor. Mandar 0 sería decir que la venta fue gratis.
        importe: importe === null || importe === undefined ? undefined : importe,
        // Vacío = el plazo del plan; lo resuelve el servidor al canjear.
        durationDays: duracion ? duracion : undefined,
      })
      .subscribe({
        next: ({ codes, ids, enviadoA, envios, cobro }) => {
          this.codigosNuevos.set(codes);
          this.codigoEnviadoA.set(enviadoA);
          this.enviosNuevos.set(envios ?? []);
          this.cobroApuntado.set(cobro);

          // La captura se sube DESPUÉS, cuando ya existe el código al que
          // engancharla, y sin bloquear: los códigos ya están generados y son
          // lo que el administrador necesita en pantalla. Si la imagen falla se
          // avisa, pero no se deshace una venta por una foto.
          this.adjuntarCaptura(ids);
          this.formCodigos.patchValue({
            buyerEmail: '',
            buyerEmails: '',
            note: '',
            paymentRef: '',
            importe: null,
            duracion: null,
          });
          this.formCodigos.controls.buyerEmail.markAsUntouched();
          this.formCodigos.controls.buyerEmails.markAsUntouched();
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

    // Con una lista se copia cada código con su correo, separados por un
    // tabulador: pegado en una hoja de cálculo cae en dos columnas.
    const envios = this.enviosNuevos();
    const texto =
      envios.length > 1
        ? envios.flatMap((e) => e.codes.map((c) => `${e.email ?? ''}\t${c}`)).join('\n')
        : codigos.join('\n');

    try {
      await navigator.clipboard.writeText(texto);
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
}
