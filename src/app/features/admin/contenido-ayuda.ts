import { WritableSignal, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { catchError, firstValueFrom, of, switchMap } from 'rxjs';

import { mensajeDeError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import { Tutorial, TutorialEnvio, TutorialService } from '../../core/services/tutorial.service';
import { Guia, GuiaEnvio, GuiaService } from '../../core/services/guia.service';
import { duracionLegible, idDeYouTube, leerDatosDeYouTube } from '../../core/services/youtube-datos';
import { PRODUCTOS_DE_AYUDA, nombreDeProducto, saleEn } from '../../shared/contenido/productos-de-ayuda';
import { Listado } from './listado';

const FILTROS_POR_PRODUCTO = PRODUCTOS_DE_AYUDA.map((p) => ({ valor: p.codigo, etiqueta: p.nombre }));

/** Formularios y listas de los vídeos y guías publicados desde el administrador. */
export class ContenidoAyudaAdmin {
  private readonly fb = inject(FormBuilder);
  private readonly dialogos = inject(DialogoService);

  constructor(
    private readonly error: WritableSignal<string | null>,
    private readonly aviso: WritableSignal<string | null>,
  ) {}

  // ── Tutoriales ───────────────────────────────────────────────────────────
  //
  // Los videos viven en la base y no en el código porque quien los graba no
  // despliega. Antes había que editar TypeScript y empujar a git para publicar
  // una URL de YouTube, que es pedirle a alguien que aprenda git para hacer su
  // trabajo.

  private readonly tutorialesApi = inject(TutorialService);

  readonly tutoriales = signal<Tutorial[]>([]);

  /**
   * Videos y guías con su buscador, sin pestañas de estado: son pocos y los
   * ocultos ya se ven marcados en la fila.
   */
  readonly listaTutoriales = new Listado(this.tutoriales, {
    filtros: [{ valor: 'todos', etiqueta: 'Todos' }, ...FILTROS_POR_PRODUCTO],
    texto: (t: Tutorial) => [t.titulo, t.grupo, t.entrada],
    pasa: (t: Tutorial, producto) => saleEn(t.productos, producto),
  });
  readonly listaGuias = new Listado(
    computed(() => this.guias()),
    {
      filtros: [{ valor: 'todas', etiqueta: 'Todas' }, ...FILTROS_POR_PRODUCTO],
      texto: (g: Guia) => [g.titulo, g.archivoNombre],
      pasa: (g: Guia, producto) => saleEn(g.productos, producto),
    },
  );

  // ── Productos de un video o una guía ──
  //
  // Cada uno puede ir en varios productos (tesis, informes, suficiencia…), y
  // sin ninguno marcado sale en todos. Las pestañas de arriba de cada lista
  // enseñan lo que verá quien elija ese producto en la web: lo suyo y lo común.

  readonly productosDeAyuda = PRODUCTOS_DE_AYUDA;
  /** «tsp» → «Suficiencia Profesional», para las pastillas de cada fila. */
  readonly nombreDeAyuda = nombreDeProducto;

  /** El producto de la pestaña abierta, como lista; en «Todos», ninguno. */
  private productoMirado(filtro: string): string[] {
    return PRODUCTOS_DE_AYUDA.some((p) => p.codigo === filtro) ? [filtro] : [];
  }

  /** Marca o desmarca un producto en la ventana del video o de la guía. */
  alternarProducto(control: FormControl<string[]>, codigo: string): void {
    const marcados = control.value;
    control.setValue(
      marcados.includes(codigo) ? marcados.filter((c) => c !== codigo) : [...marcados, codigo],
    );
    control.markAsDirty();
  }
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
    grupo: ['', [Validators.maxLength(60)]],
    etiqueta: ['', [Validators.maxLength(8)]],
    titulo: ['', [Validators.required, Validators.maxLength(160)]],
    duracion: [''],
    entrada: [''],
    puntos: [''],
    videoUrl: [''],
    productos: this.fb.nonNullable.control<string[]>([]),
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
    this.videoLeido.set(null);
    this.videoPedido = tutorial?.videoUrl ? idDeYouTube(tutorial.videoUrl) : null;
    this.autoTitulo = '';
    this.resumenVideo.set(null);

    this.formTutorial.reset({
      // Uno nuevo, siempre al final; el sitio se cambia arrastrando en la lista.
      orden: tutorial?.orden ?? Math.min(99, Math.max(0, ...this.tutoriales().map((t) => t.orden)) + 1),
      // Uno nuevo cae en el grupo del último: casi siempre se añade al final
      // del bloque que se está grabando.
      grupo: tutorial?.grupo ?? this.tutoriales().at(-1)?.grupo ?? '',
      etiqueta: tutorial?.etiqueta ?? '',
      titulo: tutorial?.titulo ?? '',
      duracion: tutorial?.duracion ?? '',
      entrada: tutorial?.entrada ?? '',
      // De lista a texto: en el panel se escriben en un cuadro normal, una
      // línea por punto, sin corchetes que cerrar.
      puntos: (tutorial?.puntos ?? []).join('\n'),
      videoUrl: tutorial?.videoUrl ?? '',
      // Uno nuevo nace en el producto que se está mirando en la lista.
      productos: tutorial?.productos ?? this.productoMirado(this.listaTutoriales.filtro()),
      active: tutorial?.active ?? true,
    });
  }

  cerrarTutorial(): void {
    this.formularioTutorial.set(false);
    this.tutorialAbierto.set(null);
    this.formTutorial.reset();
  }

  // ── Título y duración desde el propio video ──
  //
  // Al pegar el enlace se leen solos: el título por el servidor (oEmbed) y la
  // duración con el reproductor incrustado (ver `youtube-datos.ts`). El título
  // solo se rellena si está vacío o se rellenó solo antes: lo escrito a mano
  // no se pisa. La duración es de solo lectura y siempre la pone el video.

  /** «leyendo» mientras pregunta; el texto del resultado, o null. */
  readonly videoLeido = signal<{ estado: 'leyendo' | 'listo' | 'nada'; texto: string } | null>(
    null,
  );
  private videoPedido: string | null = null;
  private videoEspera: ReturnType<typeof setTimeout> | null = null;
  private autoTitulo = '';

  alCambiarEnlaceVideo(): void {
    if (this.videoEspera) clearTimeout(this.videoEspera);
    this.videoEspera = setTimeout(() => void this.leerVideo(), 500);
  }

  private async leerVideo(): Promise<void> {
    const id = idDeYouTube(this.formTutorial.controls.videoUrl.value);
    if (!id) {
      this.videoPedido = null;
      this.videoLeido.set(null);
      return;
    }
    if (id === this.videoPedido) return;
    this.videoPedido = id;
    this.videoLeido.set({ estado: 'leyendo', texto: 'Leyendo el título y la duración del video…' });

    const [tituloServidor, delReproductor] = await Promise.all([
      firstValueFrom(this.tutorialesApi.tituloDeYouTube(id).pipe(catchError(() => of(null)))),
      leerDatosDeYouTube(id),
    ]);
    // Si mientras tanto pegó otro enlace, esto ya no vale.
    if (this.videoPedido !== id) return;

    const titulo = tituloServidor ?? delReproductor?.titulo ?? null;
    const duracion = delReproductor?.segundos ? duracionLegible(delReproductor.segundos) : null;
    const campos = this.formTutorial.controls;
    const puestos: string[] = [];

    const tituloActual = campos.titulo.value.trim();
    if (titulo && (!tituloActual || tituloActual === this.autoTitulo)) {
      campos.titulo.setValue(titulo);
      this.autoTitulo = titulo;
      puestos.push('el título');
    }
    // La duración no se edita a mano: siempre la del video.
    if (duracion) {
      campos.duracion.setValue(duracion);
      puestos.push('la duración');
    }

    if (puestos.length > 0) {
      this.videoLeido.set({ estado: 'listo', texto: `✓ Tomé ${puestos.join(' y ')} del video.` });
    } else if (titulo || duracion) {
      this.videoLeido.set(null);
    } else {
      this.videoLeido.set({
        estado: 'nada',
        texto: 'YouTube no dio el título ni la duración. Escríbelos a mano.',
      });
    }

  }

  // ── «De qué va» y «Puntos que cubre», por la IA ──
  //
  // Gemini ve el video y los escribe (`POST /tutoriales/youtube/:id/resumen`).
  // SOLO al pulsar «Escribir con IA»: ver un video gasta muchos tokens, y
  // pegar o corregir un enlace no puede gastarlos sin que se pida.

  readonly resumenVideo = signal<{ estado: 'leyendo' | 'listo' | 'nada'; texto: string } | null>(
    null,
  );

  /** Si hay un enlace de YouTube válido: sin él, el botón no sale. */
  hayVideoParaResumir(): boolean {
    return idDeYouTube(this.formTutorial.controls.videoUrl.value) !== null;
  }

  escribirConIa(): void {
    const id = idDeYouTube(this.formTutorial.controls.videoUrl.value);
    if (!id || this.resumenVideo()?.estado === 'leyendo') return;
    this.videoPedido = id;
    void this.resumirVideo(id);
  }

  /** Pedido a mano: lo que traiga sustituye lo escrito en los dos cuadros. */
  private async resumirVideo(id: string): Promise<void> {
    const campos = this.formTutorial.controls;

    this.resumenVideo.set({
      estado: 'leyendo',
      texto: 'La IA está viendo el video para escribir «De qué va» y los puntos… (unos segundos)',
    });
    try {
      const resumen = await firstValueFrom(this.tutorialesApi.resumenDeYouTube(id));
      if (this.videoPedido !== id) return;
      if (resumen.entrada) {
        campos.entrada.setValue(resumen.entrada);
      }
      const puntos = resumen.puntos.join('\n');
      if (puntos) {
        campos.puntos.setValue(puntos);
      }
      this.resumenVideo.set({
        estado: 'listo',
        texto: '✓ Escrito por la IA viendo el video. Revísalo y corrige lo que haga falta.',
      });
    } catch (e: unknown) {
      if (this.videoPedido !== id) return;
      this.resumenVideo.set({ estado: 'nada', texto: mensajeDeError(e) });
    }
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

  // ── Arrastrar para cambiar el orden ──
  //
  // Arrastre nativo de HTML, sin librería: es una tabla corta y solo hace falta
  // soltar una fila encima de otra. Se arrastra SOLO desde el asa: si toda la
  // fila fuera arrastrable, seleccionar el título o pulsar «Editar» empezaría
  // a moverla.

  /** El que se está arrastrando. */
  readonly arrastrandoTutorial = signal<string | null>(null);
  /** La fila sobre la que caería, para marcarla. */
  readonly destinoTutorial = signal<string | null>(null);
  private asaPulsada = false;

  agarrarTutorial(): void {
    this.asaPulsada = true;
  }

  empezarArrastreTutorial(evento: DragEvent, tutorial: Tutorial): void {
    if (!this.asaPulsada) {
      evento.preventDefault();
      return;
    }
    this.arrastrandoTutorial.set(tutorial.id);
    evento.dataTransfer?.setData('text/plain', tutorial.id);
    if (evento.dataTransfer) evento.dataTransfer.effectAllowed = 'move';
  }

  sobreTutorial(evento: DragEvent, tutorial: Tutorial): void {
    if (!this.arrastrandoTutorial()) return;
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'move';
    this.destinoTutorial.set(tutorial.id);
  }

  terminarArrastreTutorial(): void {
    this.asaPulsada = false;
    this.arrastrandoTutorial.set(null);
    this.destinoTutorial.set(null);
  }

  /**
   * Suelta el arrastrado en el sitio del destino y guarda la lista entera.
   *
   * Se mueve dentro de la lista COMPLETA, no de la página visible: con el
   * buscador o la paginación puestos, el destino sigue siendo la fila sobre la
   * que se soltó y los demás no cambian de sitio entre sí.
   */
  soltarTutorial(evento: DragEvent, destino: Tutorial): void {
    evento.preventDefault();
    const movido = this.arrastrandoTutorial();
    this.terminarArrastreTutorial();
    if (!movido || movido === destino.id) return;

    const antes = this.tutoriales();
    const lista = [...antes];
    const desde = lista.findIndex((t) => t.id === movido);
    const hasta = lista.findIndex((t) => t.id === destino.id);
    if (desde < 0 || hasta < 0) return;
    const [fila] = lista.splice(desde, 1);
    lista.splice(hasta, 0, fila);

    // Se pinta ya, con los números nuevos, y si el servidor falla se vuelve atrás.
    this.tutoriales.set(lista.map((t, i) => ({ ...t, orden: i + 1 })));
    this.error.set(null);

    this.tutorialesApi.reordenar(lista.map((t) => t.id)).subscribe({
      next: (renumerada) => {
        this.tutoriales.set(renumerada);
        this.aviso.set(`«${fila.titulo}» pasó al número ${hasta + 1}.`);
      },
      error: (e: unknown) => {
        this.tutoriales.set(antes);
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

  // ── Guías en PDF ─────────────────────────────────────────────────────────
  //
  // Lo mismo que los videos, pero con archivo: salen en /guias-de-instalacion,
  // que es adonde llevan «Guías de instalación» del perfil, la compra y la prueba.

  private readonly guiasApi = inject(GuiaService);

  readonly guias = signal<Guia[]>([]);
  readonly guardandoGuia = signal(false);
  /** Si la ventana está abierta. Con `guiaAbierta` null = una nueva. */
  readonly formularioGuia = signal(false);
  readonly guiaAbierta = signal<Guia | null>(null);
  /** El PDF elegido en la ventana: obligatorio para una nueva, opcional al editar. */
  readonly pdfElegido = signal<File | null>(null);

  readonly formGuia = this.fb.nonNullable.group({
    orden: [1, [Validators.required]],
    titulo: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(160)]],
    descripcion: ['', [Validators.maxLength(600)]],
    productos: this.fb.nonNullable.control<string[]>([]),
    active: [true],
  });

  cargarGuias(): void {
    this.guiasApi.todas().subscribe({
      next: (lista) => this.guias.set(lista),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  enlaceGuia(guia: Guia): string {
    return this.guiasApi.enlace(guia);
  }

  /** «1,2 MB», para ver de un vistazo que el archivo subió entero. */
  pesoGuia(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }

  editarGuia(guia: Guia | null): void {
    this.error.set(null);
    this.aviso.set(null);
    this.guiaAbierta.set(guia);
    this.pdfElegido.set(null);
    this.formularioGuia.set(true);
    this.formGuia.reset({
      orden: guia?.orden ?? this.guias().length + 1,
      titulo: guia?.titulo ?? '',
      descripcion: guia?.descripcion ?? '',
      productos: guia?.productos ?? this.productoMirado(this.listaGuias.filtro()),
      active: guia?.active ?? true,
    });
  }

  cerrarGuia(): void {
    this.formularioGuia.set(false);
    this.guiaAbierta.set(null);
    this.pdfElegido.set(null);
    this.formGuia.reset();
  }

  elegirPdf(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    this.pdfElegido.set(entrada.files?.[0] ?? null);
  }

  /** Una nueva sin PDF no se puede guardar: no habría nada que descargar. */
  puedeGuardarGuia(): boolean {
    if (this.formGuia.invalid || this.guardandoGuia()) return false;
    return this.guiaAbierta() !== null || this.pdfElegido() !== null;
  }

  guardarGuia(): void {
    if (!this.puedeGuardarGuia()) return;

    const datos = this.formGuia.getRawValue() as GuiaEnvio;
    const abierta = this.guiaAbierta();
    const pdf = this.pdfElegido();

    this.guardandoGuia.set(true);
    this.error.set(null);

    // Al editar, primero la ficha y, si se eligió otro PDF, después el archivo.
    const peticion = abierta
      ? this.guiasApi
          .actualizar(abierta.id, datos)
          .pipe(switchMap((guia) => (pdf ? this.guiasApi.cambiarArchivo(guia.id, pdf) : of(guia))))
      : this.guiasApi.crear(datos, pdf as File);

    peticion.subscribe({
      next: (guia) => {
        this.guardandoGuia.set(false);
        this.cerrarGuia();
        this.cargarGuias();
        this.aviso.set(
          guia.active
            ? `«${guia.titulo}» guardada. Ya se ve en la página de guías.`
            : `«${guia.titulo}» guardada, pero oculta: no sale en la web.`,
        );
      },
      error: (e: unknown) => {
        this.guardandoGuia.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  async borrarGuia(guia: Guia): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: `¿Borrar «${guia.titulo}»?`,
      mensaje:
        'Desaparece de la web y se borra el PDF. Si solo quieres retirarla un tiempo, ocúltala ' +
        'en vez de borrarla.',
      confirmar: 'Borrar',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.guiasApi.borrar(guia.id).subscribe({
      next: () => {
        this.cargarGuias();
        this.aviso.set(`«${guia.titulo}» borrada.`);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }
}
