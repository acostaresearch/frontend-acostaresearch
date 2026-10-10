import { computed, inject, signal, WritableSignal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Observable, firstValueFrom, map, of, switchMap, tap } from 'rxjs';
import { mensajeDeError } from '../../core/http/api-error';
import { Plan } from '../../core/models/rewrite.model';
import { BillingService, Grupo } from '../../core/services/billing.service';
import { AnalisisBundle, Skill, SkillService } from '../../core/services/skill.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { Listado } from './listado';

/** Tipo de cambio usado para precios y gráficos; conserva el valor del panel. */
export const SOLES_POR_DOLAR = 3.75;

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
  return Math.ceil((soles / SOLES_POR_DOLAR) * (1 + 0.09) * 10) / 10;
}

/** Catalogo, formularios y publicacion de capitulos del panel. */
export class ProductosAdmin {
  private readonly fb = inject(FormBuilder);
  private readonly billing = inject(BillingService);
  private readonly dialogos = inject(DialogoService);
  private readonly skillsApi = inject(SkillService);

  readonly skills = signal<Skill[]>([]);
  readonly editando = signal<Skill | null>(null);

  // ── Grupos ───────────────────────────────────────────────────────────────
  //
  // Un grupo es un producto: sus capítulos, su precio y su duración. Se crean
  // aquí y luego cada .skill se cuelga de uno al subirlo.
  readonly grupos = signal<Grupo[]>([]);

  /** Los productos con buscador y filtros, como las demás tablas. */
  readonly listaGrupos = new Listado(this.grupos, {
    filtros: [
      { valor: 'todos', etiqueta: 'Todos' },
      { valor: 'venta', etiqueta: 'A la venta' },
      { valor: 'prueba', etiqueta: 'En prueba' },
      { valor: 'retirados', etiqueta: 'Retirados' },
    ],
    texto: (g: Grupo) => [g.name, g.code],
    // «En prueba» es el que está activo pero solo lo ve quien se indica.
    pasa: (g: Grupo, filtro: string) =>
      filtro === 'venta'
        ? g.active && !g.soloPara
        : filtro === 'prueba'
          ? g.active && !!g.soloPara
          : !g.active,
  });
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
   * Los capítulos de ESTE grupo, y solo ellos.
   *
   * Antes se listaba el catálogo entero, para poder montar un producto con
   * capítulos que ya existían. El efecto real era otro: la lista crecía con los
   * de los demás productos, había que buscar los propios entre ellos y era fácil
   * desmarcar uno ajeno sin querer. Un capítulo puede seguir estando en varios
   * grupos; para meterlo en este se sube su archivo aquí, o se marca desde el
   * grupo donde ya está.
   */
  readonly capitulosDisponibles = computed(() => {
    const grupo = this.editandoGrupo();
    if (!grupo) return [];
    const mio = grupo.productCode ?? grupo.code;
    return this.capitulosOrdenados().filter((s) => s.productCodes.includes(mio));
  });

  /**
   * Los capítulos que no están en ningún grupo.
   *
   * No debería haber ninguno: sin grupo, un capítulo lo recibe CUALQUIER
   * licencia, también las de prueba (`perteneceAlGrupo` en el backend lo da por
   * bueno cuando la lista viene vacía). Como la lista de arriba ya no los
   * enseña, se sacan aparte: aquí se ven y se meten en su grupo, en vez de
   * quedarse repartiéndose sin que nadie los vea.
   */
  readonly capitulosSinGrupo = computed(() =>
    this.capitulosOrdenados().filter((s) => s.productCodes.length === 0),
  );

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
    // Correos separados por coma. Vacío = a la venta como siempre.
    soloPara: ['', [Validators.maxLength(1000)]],
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

  constructor(
    readonly error: WritableSignal<string | null>,
    readonly aviso: WritableSignal<string | null>,
    readonly trabajando: WritableSignal<boolean>,
    readonly planes: WritableSignal<Plan[]>,
  ) {
    // Mantiene el precio calculado y normaliza el código mientras se escribe.
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

  /**
   * Guarda los grupos y elige destino si aún no hay ninguno.
   *
   * Vive aparte de quien los pide porque llegan por dos caminos —este cargador
   * y la recarga general— y el efecto tiene que ser el mismo en los dos.
   */
  aplicarGrupos(grupos: Grupo[]): void {
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
      soloPara: '',
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
      soloPara: grupo.soloPara ?? '',
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
      // Vacío va como null, no como undefined: vaciar la casilla es sacarlo de la
      // prueba y ponerlo a la venta, no dejarlo como estaba.
      soloPara: v.soloPara.trim() || null,
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

  // ── Actualizar todos los archivos de una vez ─────────────────────────────

  /** La tanda en curso: comprobando los archivos o subiéndolos, y por cuál va. */
  readonly actualizandoTodos = signal<{
    fase: 'comprobando' | 'subiendo';
    hechos: number;
    total: number;
  } | null>(null);
  /** Cómo acabó la última tanda, para decirlo junto al botón y no detrás de la ventana. */
  readonly resumenTodos = signal<{ tono: 'ok' | 'error'; texto: string } | null>(null);

  /**
   * «Cambiar» para muchos capítulos a la vez.
   *
   * Cuando sale una versión nueva del método llegan nueve o diez .skill juntos,
   * y cambiarlos uno por uno era abrir diez veces el diálogo del sistema. Aquí
   * se eligen todos de una vez y cada archivo va a SU capítulo, por el código
   * que declara su SKILL.md —el nombre del archivo no importa—.
   *
   * Solo actualiza capítulos que ya existen. Un archivo que no corresponde a
   * ninguno se deja fuera y se dice por qué: crear capítulos nuevos es otra
   * decisión, y se toma en «Subir capítulos nuevos». Cada capítulo conserva su
   * nombre, su resumen, su posición, su visibilidad y sus grupos, igual que con
   * «Cambiar».
   *
   * Antes de subir nada enseña la lista de lo que va a pasar, y sube de uno en
   * uno, como la cola: cada subida reescribe el índice que sirve el conector.
   */
  async actualizarTodos(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivos = Array.from(entrada.files ?? []);
    // Se vacía siempre, para que volver a elegir los mismos archivos dispare el evento.
    entrada.value = '';
    if (archivos.length === 0 || this.actualizandoTodos() || this.reemplazando()) return;

    this.error.set(null);
    this.aviso.set(null);
    this.resumenTodos.set(null);
    this.actualizandoTodos.set({ fase: 'comprobando', hechos: 0, total: archivos.length });

    const comprobados = await Promise.all(
      archivos.map((archivo) =>
        firstValueFrom(this.skillsApi.inspeccionar(archivo)).then(
          (analisis) => ({ archivo, analisis, fallo: null as string | null }),
          (e: unknown) => ({ archivo, analisis: null, fallo: mensajeDeError(e) }),
        ),
      ),
    );

    const elegidos = new Set<string>();
    const aActualizar: { archivo: File; skill: Skill }[] = [];
    const fuera: string[] = [];

    for (const { archivo, analisis, fallo } of comprobados) {
      if (!analisis) {
        fuera.push(`${archivo.name}: ${fallo}`);
        continue;
      }
      // Solo los capítulos de este grupo. Actualizar desde aquí el de otro
      // producto cambiaría en silencio lo que reciben compradores que no se
      // están mirando, y la lista de esta ventana ya no los enseña.
      const skill = this.capitulosDisponibles().find((s) => s.code === analisis.code);
      if (!skill) {
        const ajeno = this.skills().find((s) => s.code === analisis.code);
        fuera.push(
          ajeno
            ? ajeno.productCodes.length === 0
              ? `${archivo.name}: «${analisis.code}» no está en ningún grupo. Márcalo abajo, en «Capítulos sin grupo», y vuelve a subirlo.`
              : `${archivo.name}: «${analisis.code}» es de ${this.otrosGrupos(ajeno)}. Actualízalo desde ese grupo.`
            : `${archivo.name}: «${analisis.code}» no es ningún capítulo publicado. Si es nuevo, súbelo en «Subir capítulos nuevos».`,
        );
        continue;
      }
      if (elegidos.has(skill.id)) {
        fuera.push(`${archivo.name}: ya hay otro archivo para «${skill.displayName}».`);
        continue;
      }
      elegidos.add(skill.id);
      aActualizar.push({ archivo, skill });
    }

    if (aActualizar.length === 0) {
      this.actualizandoTodos.set(null);
      this.resumenTodos.set({
        tono: 'error',
        texto: `No se actualizó nada: ningún archivo corresponde a un capítulo publicado.\n${fuera.join('\n')}`,
      });
      return;
    }

    aActualizar.sort((a, b) => a.skill.orden - b.skill.orden);
    const compartidos = aActualizar.filter(({ skill }) => this.otrosGrupos(skill)).length;

    const seguro = await this.dialogos.confirmar({
      titulo: `Actualizar ${aActualizar.length} ${aActualizar.length === 1 ? 'capítulo' : 'capítulos'}`,
      mensaje: [
        'Se cambia el archivo de:',
        ...aActualizar.map(({ skill }) => `· ${skill.displayName}`),
        ...(fuera.length > 0 ? ['No se sube:', ...fuera.map((motivo) => `· ${motivo}`)] : []),
      ].join('\n'),
      nota:
        'Cada capítulo conserva su nombre, su resumen, su posición y sus grupos. El cambio llega al ' +
        'conector al momento' +
        (compartidos > 0
          ? `, también en los otros grupos donde están ${compartidos === 1 ? 'uno de ellos' : `${compartidos} de ellos`}.`
          : '.'),
      confirmar: 'Actualizar',
    });
    if (!seguro) {
      this.actualizandoTodos.set(null);
      return;
    }

    const fallidos: string[] = [];
    let hechos = 0;
    for (const [i, { archivo, skill }] of aActualizar.entries()) {
      this.actualizandoTodos.set({ fase: 'subiendo', hechos: i, total: aActualizar.length });
      try {
        await firstValueFrom(
          this.skillsApi.subir(archivo, {
            displayName: skill.displayName,
            summary: skill.summary,
            orden: skill.orden,
            active: skill.active,
          }),
        );
        hechos += 1;
      } catch (e: unknown) {
        // Que uno falle no detiene a los demás: se anota y se sigue.
        fallidos.push(`«${skill.displayName}»: ${mensajeDeError(e)}`);
      }
    }

    this.actualizandoTodos.set(null);
    const lineas = [
      hechos === 1
        ? '1 capítulo actualizado. Ya está en el conector, sin reinstalar nada.'
        : `${hechos} capítulos actualizados. Ya están en el conector, sin reinstalar nada.`,
      ...(fallidos.length > 0 ? ['No se pudieron actualizar:', ...fallidos] : []),
      ...(fuera.length > 0 ? ['Se dejaron fuera:', ...fuera] : []),
    ];
    this.resumenTodos.set({ tono: fallidos.length > 0 ? 'error' : 'ok', texto: lineas.join('\n') });
    this.cargarSkills();
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

  cargarSkills(): void {
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

}
