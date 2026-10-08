import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { mensajeDeError } from '../../core/http/api-error';
import {
  AvisoPreparacion,
  ComparacionPreparacion,
  IdiomaPreparar,
  PanelPreparar,
  ParrafoComparado,
  Preparacion,
  ServicioPreparar,
} from '../../core/models/preparar.model';
import { PrepararService } from '../../core/services/preparar.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';
import { Trozo, trocear } from './comparar-texto';

/** Lo que se cuenta de cada pestaña, en un solo sitio para no repetirlo en la plantilla. */
interface Pestana {
  id: ServicioPreparar;
  titulo: string;
  /** Qué es, en una o dos frases. Lo demás se vende en /planes, no aquí dentro. */
  descripcion: string;
  /** Las tres promesas con check. La última lleva el tope de palabras, que viene del servidor. */
  promesas: readonly string[];
}

const PESTANAS: readonly Pestana[] = [
  {
    id: 'EDICION',
    titulo: 'Edición de inglés académico',
    descripcion:
      'Para textos ya escritos en inglés. Lo recibes con control de cambios. Las citas, siglas y ' +
      'bibliografía no se modifican.',
    promesas: ['Citas y referencias protegidas', 'Control de cambios en Word'],
  },
  {
    id: 'TRADUCCION',
    titulo: 'Traducción',
    descripcion:
      'A español, inglés, portugués o chino, con el registro de una revista indexada. Las citas, ' +
      'siglas y bibliografía se quedan como están.',
    promesas: ['Citas y referencias protegidas', 'El índice sale traducido'],
  },
];

/** Por qué estado se puede filtrar la lista. */
type Filtro = 'TODOS' | 'LISTO' | 'FALLIDO';

/**
 * Los tres botones del filtro. No hay uno de «en marcha»: lo que se está
 * preparando se va solo en unos minutos y el filtro casi siempre saldría vacío.
 */
const FILTROS: readonly { id: Filtro; texto: string }[] = [
  { id: 'TODOS', texto: 'Todos' },
  { id: 'LISTO', texto: 'Listos' },
  { id: 'FALLIDO', texto: 'Con error' },
];

/** Las tres formas de ver un documento terminado. */
type Modo = 'ORIGINAL' | 'RESULTADO' | 'LADO';

const MODOS: readonly { id: Modo; texto: string }[] = [
  { id: 'ORIGINAL', texto: 'Original' },
  { id: 'RESULTADO', texto: 'Resultado' },
  { id: 'LADO', texto: 'Lado a lado' },
];

/** Los cuatro pasos de «Procesando…», en el orden en que los da el servidor. */
const PASOS = ['LEYENDO', 'PROTEGIENDO', 'EDITANDO', 'ARMANDO'] as const;

/** Cada cuánto se pregunta por los trabajos que están en marcha. */
const CADA_MS = 3000;

/** Filas por página en la tabla de documentos. */
const POR_PAGINA = 5;

/**
 * Cuántas palabras caben en una «página» de la vista previa.
 *
 * No son las páginas del Word —esas dependen de la letra, los márgenes y las
 * figuras, y no las sabemos—: es un trozo que se lee sin desplazarse mucho.
 */
const PALABRAS_POR_PAGINA = 420;

/** A dónde escribe quien tuvo un problema. Es el mismo correo del pie del sitio. */
const CORREO = 'asesoriaprofesional599@gmail.com';

/** Para buscar sin que importen las tildes ni las mayúsculas. */
const plano = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Un párrafo de la vista previa, ya troceado para pintarlo. */
interface ParrafoPintado {
  clave: string;
  nivel: number | null;
  original: Trozo[];
  resultado: Trozo[];
}

/**
 * «Preparar documento»: edición de inglés académico y traducción.
 *
 * TRES VISTAS EN LA MISMA DIRECCIÓN
 * ---------------------------------
 * La lista (subir y ver lo mandado), «Procesando…» y el documento terminado
 * con su vista previa. Las dos últimas cuelgan de `?doc=<id>` en la misma
 * página, sin rutas hijas: recargar o volver atrás siguen funcionando y la
 * página no se desmonta al ir de una vista a otra (el sondeo sigue vivo).
 * Cuál de las dos se ve lo decide el estado del trabajo: en marcha,
 * «Procesando…»; listo, la vista previa.
 *
 * POR QUÉ SE PREGUNTA CADA TRES SEGUNDOS
 * --------------------------------------
 * Preparar un documento son minutos y la subida contesta enseguida (ver
 * `preparar.service` en el backend). Se pregunta solo mientras haya algo en
 * marcha y se para en cuanto no queda ninguno.
 */
@Component({
  selector: 'app-preparar',
  imports: [AvisoFlotante, RouterLink, DatePipe, DecimalPipe, SiteHeader, SiteFooter],
  templateUrl: './preparar.html',
  styleUrl: './preparar.css',
})
export class Preparar implements OnInit, OnDestroy {
  private readonly api = inject(PrepararService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly pestanas = PESTANAS;
  readonly filtros = FILTROS;
  readonly modos = MODOS;

  readonly panel = signal<PanelPreparar | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  readonly elegida = signal<ServicioPreparar>('EDICION');
  readonly idioma = signal<IdiomaPreparar>('en');
  readonly subiendo = signal(false);
  readonly encima = signal(false);

  // ── La lista ─────────────────────────────────────────────────────────────

  readonly filtro = signal<Filtro>('TODOS');
  readonly busqueda = signal('');
  readonly pagina = signal(0);
  /** El trabajo cuyo menú «⋮» está abierto. */
  readonly menu = signal<string | null>(null);

  /** El trabajo cuyo resumen está abierto en el emergente, o null. */
  readonly resumen = signal<Preparacion | null>(null);

  /** El campo de archivo, escondido. Se abre desde el recuadro, «Reintentar» y «Volver a procesar». */
  private readonly selector = viewChild<ElementRef<HTMLInputElement>>('selector');

  private reloj: ReturnType<typeof setInterval> | null = null;

  readonly pestana = computed(() => PESTANAS.find((p) => p.id === this.elegida()) ?? PESTANAS[0]);

  /** Puede mandar un documento: hay membresía con cupo y el servicio está en pie. */
  readonly puede = computed(() => {
    const panel = this.panel();
    return Boolean(panel?.disponible && panel.motivo === null);
  });

  readonly trabajos = computed(() => this.panel()?.trabajos ?? []);

  readonly trabajosFiltrados = computed(() => {
    const filtro = this.filtro();
    const buscado = plano(this.busqueda().trim());
    return this.trabajos().filter(
      (t) =>
        (filtro === 'TODOS' || t.estado === filtro) &&
        (buscado === '' || plano(t.nombre).includes(buscado)),
    );
  });

  readonly paginas = computed(() =>
    Math.max(1, Math.ceil(this.trabajosFiltrados().length / POR_PAGINA)),
  );

  readonly visibles = computed(() => {
    const desde = Math.min(this.pagina(), this.paginas() - 1) * POR_PAGINA;
    return this.trabajosFiltrados().slice(desde, desde + POR_PAGINA);
  });

  /** «Mostrando 10 de 23»: hasta dónde llega lo visto, no cuántos hay en la página. */
  readonly mostrando = computed(
    () => Math.min(this.pagina(), this.paginas() - 1) * POR_PAGINA + this.visibles().length,
  );

  readonly enMarcha = computed(() =>
    this.trabajos().filter((t) => t.estado === 'EN_COLA' || t.estado === 'EN_CURSO'),
  );

  // ── El documento abierto (?doc=) ─────────────────────────────────────────

  readonly docId = toSignal(this.ruta.queryParamMap.pipe(map((q) => q.get('doc'))), {
    initialValue: null,
  });

  /**
   * Un trabajo que no está en la lista del panel —el panel trae los últimos
   * cincuenta— y se pidió suelto.
   */
  private readonly suelto = signal<Preparacion | null>(null);

  readonly abierto = computed<Preparacion | null>(() => {
    const id = this.docId();
    if (!id) return null;
    return (
      this.trabajos().find((t) => t.id === id) ?? (this.suelto()?.id === id ? this.suelto() : null)
    );
  });

  readonly vista = computed<'lista' | 'procesando' | 'detalle'>(() => {
    const t = this.abierto();
    if (!t) return 'lista';
    return t.estado === 'LISTO' ? 'detalle' : 'procesando';
  });

  readonly comparacion = signal<ComparacionPreparacion | null>(null);
  readonly cargandoComparacion = signal(false);
  readonly errorComparacion = signal<string | null>(null);

  readonly modo = signal<Modo>('LADO');
  readonly resaltar = signal(true);
  readonly paginaDoc = signal(0);

  /** Los párrafos en páginas de unas cuatrocientas palabras. */
  private readonly paginasDoc = computed<ParrafoComparado[][]>(() => {
    const parrafos = this.comparacion()?.parrafos ?? [];
    const paginas: ParrafoComparado[][] = [];
    let actual: ParrafoComparado[] = [];
    let palabras = 0;
    for (const p of parrafos) {
      const suyas = p.original.split(/\s+/).length;
      if (actual.length > 0 && palabras + suyas > PALABRAS_POR_PAGINA) {
        paginas.push(actual);
        actual = [];
        palabras = 0;
      }
      actual.push(p);
      palabras += suyas;
    }
    if (actual.length > 0) paginas.push(actual);
    return paginas;
  });

  readonly totalPaginasDoc = computed(() => Math.max(1, this.paginasDoc().length));

  /** La página que se ve, troceada con sus colores. */
  readonly parrafosPintados = computed<ParrafoPintado[]>(() => {
    const pagina = this.paginasDoc()[Math.min(this.paginaDoc(), this.totalPaginasDoc() - 1)] ?? [];
    const conColor = this.resaltar();
    const palabraAPalabra = this.abierto()?.servicio === 'EDICION';
    return pagina.map((p) => {
      if (!conColor) {
        return {
          clave: p.clave,
          nivel: p.nivel,
          original: [{ texto: p.original, tipo: 'igual' }],
          resultado: [{ texto: p.resultado, tipo: 'igual' }],
        };
      }
      const trozos = trocear(
        p.original,
        p.resultado,
        p.citasOriginal,
        p.citasResultado,
        palabraAPalabra,
      );
      return { clave: p.clave, nivel: p.nivel, ...trozos };
    });
  });

  constructor() {
    // Al abrir un documento terminado, su comparación. Una sola vez por documento.
    effect(() => {
      const t = this.abierto();
      const listo = t?.estado === 'LISTO' ? t.id : null;
      untracked(() => this.cargarComparacion(listo));
    });

    // Un ?doc= que no está en la lista del panel: se pide suelto.
    effect(() => {
      const id = this.docId();
      const panel = this.panel();
      if (!id || !panel || panel.trabajos.some((t) => t.id === id)) return;
      untracked(() => {
        if (this.suelto()?.id === id) return;
        this.api.ver(id).subscribe({
          next: (t) => this.suelto.set(t),
          error: (e: unknown) => {
            this.error.set(mensajeDeError(e));
            this.volverALaLista();
          },
        });
      });
    });
  }

  private comparacionDe: string | null = null;

  private cargarComparacion(id: string | null): void {
    if (id === this.comparacionDe) return;
    this.comparacionDe = id;
    this.comparacion.set(null);
    this.errorComparacion.set(null);
    this.paginaDoc.set(0);
    if (!id) return;

    this.cargandoComparacion.set(true);
    this.api.comparacion(id).subscribe({
      next: (c) => {
        if (this.comparacionDe !== id) return;
        this.comparacion.set(c);
        this.cargandoComparacion.set(false);
      },
      error: (e: unknown) => {
        if (this.comparacionDe !== id) return;
        this.errorComparacion.set(mensajeDeError(e));
        this.cargandoComparacion.set(false);
      },
    });
  }

  ngOnInit(): void {
    this.cargar(true);
  }

  ngOnDestroy(): void {
    this.pararReloj();
  }

  // ── Datos ────────────────────────────────────────────────────────────────

  private cargar(primeraVez = false): void {
    this.api.panel().subscribe({
      next: (panel) => {
        this.panel.set(panel);
        this.cargando.set(false);
        if (primeraVez) this.error.set(null);
        this.ajustarReloj();
      },
      error: (e: unknown) => {
        this.cargando.set(false);
        // Un fallo del sondeo no borra lo que ya se ve. Solo se avisa en la primera carga.
        if (primeraVez) this.error.set(mensajeDeError(e));
      },
    });
  }

  private ajustarReloj(): void {
    if (this.enMarcha().length > 0) {
      if (!this.reloj) this.reloj = setInterval(() => this.cargar(), CADA_MS);
      return;
    }
    this.pararReloj();
  }

  private pararReloj(): void {
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = null;
  }

  // ── Navegar entre las vistas ─────────────────────────────────────────────

  abrir(trabajo: Preparacion): void {
    this.menu.set(null);
    this.router.navigate([], { relativeTo: this.ruta, queryParams: { doc: trabajo.id } });
  }

  volverALaLista(): void {
    this.router.navigate([], { relativeTo: this.ruta, queryParams: {} });
  }

  // ── La pestaña, el filtro y la tabla ─────────────────────────────────────

  elegir(servicio: ServicioPreparar): void {
    this.elegida.set(servicio);
    this.aviso.set(null);
    this.error.set(null);
  }

  elegirIdioma(codigo: string): void {
    this.idioma.set(codigo as IdiomaPreparar);
  }

  elegirFiltro(filtro: Filtro): void {
    this.filtro.set(filtro);
    this.pagina.set(0);
  }

  buscar(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
    this.pagina.set(0);
  }

  anterior(): void {
    this.pagina.update((p) => Math.max(0, p - 1));
  }

  siguiente(): void {
    this.pagina.update((p) => Math.min(this.paginas() - 1, p + 1));
  }

  alternarMenu(id: string, evento: Event): void {
    evento.stopPropagation();
    this.menu.update((abierto) => (abierto === id ? null : id));
  }

  /** Un clic en cualquier otro sitio cierra el menú «⋮». */
  @HostListener('document:click')
  alHacerClic(): void {
    if (this.menu()) this.menu.set(null);
  }

  /** Escape cierra el emergente o el menú, como cualquier ventana. */
  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    if (this.resumen()) this.cerrarResumen();
    else if (this.menu()) this.menu.set(null);
  }

  abrirResumen(trabajo: Preparacion): void {
    this.menu.set(null);
    this.resumen.set(trabajo);
  }

  cerrarResumen(): void {
    this.resumen.set(null);
  }

  // ── La vista previa ──────────────────────────────────────────────────────

  elegirModo(modo: Modo): void {
    this.modo.set(modo);
  }

  alternarResaltar(evento: Event): void {
    this.resaltar.set((evento.target as HTMLInputElement).checked);
  }

  paginaAnterior(): void {
    this.paginaDoc.update((p) => Math.max(0, p - 1));
  }

  paginaSiguiente(): void {
    this.paginaDoc.update((p) => Math.min(this.totalPaginasDoc() - 1, p + 1));
  }

  // ── «Procesando…» ────────────────────────────────────────────────────────

  /** En qué paso va: 0 a 3, o -1 si aún está en cola. */
  pasoDe(trabajo: Preparacion): number {
    if (trabajo.estado === 'EN_COLA') return -1;
    // EN_CURSO sin progreso: acaba de empezar, o el proceso se reinició.
    return PASOS.indexOf(trabajo.progreso?.paso ?? 'LEYENDO');
  }

  /** El porcentaje de la barra. Leer y proteger son segundos; editar es casi todo. */
  porcentajeDe(trabajo: Preparacion): number {
    const paso = this.pasoDe(trabajo);
    if (paso < 0) return 2;
    if (paso === 0) return 5;
    if (paso === 1) return 10;
    if (paso === 3) return 95;
    const { hechas = 0, total = 0 } = trabajo.progreso ?? {};
    return total > 0 ? Math.round(12 + (80 * hechas) / total) : 12;
  }

  /** «sección 4 de 12», contando la que está en marcha. */
  seccionDe(trabajo: Preparacion): string | null {
    const { hechas = 0, total = 0 } = trabajo.progreso ?? {};
    if (total === 0) return null;
    return `sección ${Math.min(hechas + 1, total)} de ${total}`;
  }

  // ── Subir ────────────────────────────────────────────────────────────────

  abrirSelector(): void {
    this.selector()?.nativeElement.click();
  }

  /**
   * Volver a mandar uno: tras un fallo («Reintentar») o uno terminado («Volver
   * a procesar»).
   *
   * No se reenvía lo que hay en el servidor: se deja elegido el mismo servicio
   * y el mismo idioma y se abre el archivo. Un fallo no descuenta cupo; uno
   * terminado que se vuelve a mandar sí, porque es otro documento.
   */
  volverAMandar(trabajo: Preparacion): void {
    this.menu.set(null);
    this.elegir(trabajo.servicio);
    if (trabajo.servicio === 'TRADUCCION' && trabajo.idioma) this.idioma.set(trabajo.idioma);
    setTimeout(() => this.abrirSelector());
  }

  /** El correo de «escribirnos», ya con el documento y la referencia dentro. */
  correoDe(trabajo: Preparacion): string {
    const asunto = `Preparar documento: ${trabajo.nombre}`;
    const cuerpo = `Referencia del trabajo: ${trabajo.id}\n\n`;
    return `mailto:${CORREO}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  }

  desdeElBoton(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    // Se vacía para que volver a elegir el mismo archivo dispare el cambio.
    entrada.value = '';
    if (archivo) this.mandar(archivo);
  }

  arrastrar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    if (this.puede() && !this.subiendo()) this.encima.set(dentro);
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(false);
    const archivo = evento.dataTransfer?.files?.[0];
    if (archivo) this.mandar(archivo);
  }

  private mandar(archivo: File): void {
    if (this.subiendo()) return;
    if (!this.puede()) {
      this.error.set(this.panel()?.motivo ?? 'Ahora mismo no puedes mandar documentos.');
      return;
    }

    if (!archivo.name.toLowerCase().endsWith('.docx')) {
      this.error.set(
        'Solo trabajamos con .docx. Si tu documento es un .doc antiguo o un PDF, ábrelo en ' +
          'Word y guárdalo como «Documento de Word (.docx)».',
      );
      return;
    }

    this.subiendo.set(true);
    this.error.set(null);
    this.aviso.set(null);

    const servicio = this.elegida();
    const idioma = servicio === 'TRADUCCION' ? this.idioma() : undefined;

    this.api.encargar(servicio, archivo, idioma).subscribe({
      next: ({ preparacion }) => {
        this.subiendo.set(false);
        // Se mete ya en la lista para que «Procesando…» se pinte sin esperar al sondeo.
        this.panel.update((p) => (p ? { ...p, trabajos: [preparacion, ...p.trabajos] } : p));
        this.abrir(preparacion);
        this.cargar();
      },
      error: (e: unknown) => {
        this.subiendo.set(false);
        this.error.set(mensajeDeError(e));
        // Puede ser un «se te acabó el cupo»: se recarga para que la cabecera diga la verdad.
        this.cargar();
      },
    });
  }

  // ── Descargar ────────────────────────────────────────────────────────────

  descargar(trabajo: Preparacion): void {
    this.menu.set(null);
    this.api.descargar(trabajo.id).subscribe({
      next: (blob) => this.guardar(blob, this.nombreDeDescarga(trabajo)),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /**
   * El nombre con el que se guarda. Se calcula también aquí, igual que en el
   * servidor, porque el archivo llega como blob y el navegador no ve la
   * cabecera `Content-Disposition`.
   */
  private nombreDeDescarga(trabajo: Preparacion): string {
    const base = trabajo.nombre.replace(/\.docx$/i, '');
    if (trabajo.servicio === 'EDICION') return `${base} (inglés corregido).docx`;
    return `${base} (traducido al ${this.nombreDelIdioma(trabajo.idioma)}).docx`;
  }

  private guardar(blob: Blob, nombre: string): void {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  // ── Textos ───────────────────────────────────────────────────────────────

  /**
   * El plan, sin repetir el título de la pantalla: «Preparar documento ·
   * mensual» se queda en «Mensual» debajo de un título que ya lo dice.
   */
  nombreDelPlan(nombre: string | null | undefined): string {
    if (!nombre) return '';
    const corto = nombre.replace(/^preparar documento\s*[·:—-]?\s*/i, '');
    return corto.charAt(0).toUpperCase() + corto.slice(1);
  }

  nombreDelIdioma(codigo: string | null): string {
    return this.panel()?.idiomas.find((i) => i.codigo === codigo)?.nombre ?? 'idioma elegido';
  }

  /** El servicio, largo: «Edición de inglés académico», «Traducción al inglés». */
  tituloDe(trabajo: Preparacion): string {
    if (trabajo.servicio === 'TRADUCCION')
      return `Traducción al ${this.nombreDelIdioma(trabajo.idioma)}`;
    return PESTANAS.find((p) => p.id === trabajo.servicio)?.titulo ?? trabajo.servicio;
  }

  /** El servicio, corto, para la columna de la tabla: «Edición en inglés», «Traducción → ES». */
  servicioCorto(trabajo: Preparacion): string {
    if (trabajo.servicio === 'EDICION') return 'Edición en inglés';
    if (trabajo.servicio === 'TRADUCCION')
      return `Traducción → ${(trabajo.idioma ?? '').toUpperCase()}`;
    return 'Resumen';
  }

  /** El paso de editar se llama distinto traduciendo. */
  pasoEditar(trabajo: Preparacion): string {
    return trabajo.servicio === 'TRADUCCION' ? 'Traduciendo el texto' : 'Editando el texto';
  }

  pasoArmar(trabajo: Preparacion): string {
    return trabajo.servicio === 'TRADUCCION'
      ? 'Armando el Word traducido'
      : 'Armando el Word con control de cambios';
  }

  /** Qué se le dice de un trabajo terminado, en el resumen. */
  resultadoDe(trabajo: Preparacion): string | null {
    if (trabajo.estado !== 'LISTO') return null;

    const tocados = `${trabajo.tocados} párrafo${trabajo.tocados === 1 ? '' : 's'}`;
    const hecho = trabajo.servicio === 'EDICION' ? 'con correcciones' : 'traducidos';

    // El índice sale traducido desde el servidor; los números de página los rehace Word.
    const indice =
      trabajo.servicio === 'TRADUCCION'
        ? ' El índice va traducido; si quieres los números de página al día, ábrelo en Word y ' +
          'actualiza el campo (clic derecho sobre el índice → «Actualizar campos»).'
        : '';

    if (trabajo.intactos === 0) return `${tocados} ${hecho}.${indice}`;

    // El porqué lo manda el servidor en `avisos`, uno por motivo.
    const otros = `${tocados} ${hecho}. Otros ${trabajo.intactos} quedaron como estaban`;
    return trabajo.avisos?.length ? `${otros}:${indice}` : `${otros}.${indice}`;
  }

  /** Por qué quedó cada grupo sin tocar. Vacío en los trabajos de antes de guardarlo. */
  avisosDe(trabajo: Preparacion): AvisoPreparacion[] {
    return trabajo.estado === 'LISTO' ? (trabajo.avisos ?? []) : [];
  }
}
