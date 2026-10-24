import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  ElementRef,
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
  CapituloWord,
  DetalleHumanizado,
  EncargoAceptado,
  PanelPreparar,
  ParrafoComparado,
  Preparacion,
  ReporteIaSubido,
} from '../../core/models/preparar.model';
import { PrepararService } from '../../core/services/preparar.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';
import { SiteHeader } from '../../shared/layout/site-header';

/** Humanizar todo el Word, o solo lo que marcó el reporte de IA de Turnitin. */
type Modo = 'TODO' | 'MARCADO';

/** Cada cuánto se pregunta por los trabajos en marcha, como en «Edición y Traducción». */
const CADA_MS = 3000;

/** Desde cuántas palabras un párrafo se puede rehacer (lo mismo que humaniza el servidor). */
const PALABRAS_MINIMAS = 15;

/** Para buscar sin que importen las tildes ni las mayúsculas. */
const plano = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const mismoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Un paso de la respuesta del humanizador. */
export interface PasoHumanizar {
  texto: string;
  estado: 'hecho' | 'actual' | 'pendiente';
}

/**
 * «Humanizar» como conversación (24-oct-2026).
 *
 * A la izquierda, los documentos humanizados; a la derecha, o la bienvenida
 * para empezar uno, o la conversación del que está abierto (`?doc=<id>`): lo
 * que se pidió, los pasos y, al terminar, el Word con «Ver cambios»,
 * «Descargar», «Subir un nuevo reporte de Turnitin» y «Rehacer un párrafo».
 *
 * No hay texto libre para el modelo: lo que el cliente puede pedir son
 * casillas (los capítulos que no se tocan), porque una indicación escrita no
 * se puede garantizar y las citas, cifras, tablas y bibliografía ya se
 * protegen siempre. Los trabajos son los mismos de «Edición y Traducción»
 * (`/preparar`); cada ronda es un trabajo más, que parte del Word entregado.
 */
@Component({
  selector: 'app-humanizar',
  imports: [AvisoFlotante, DatePipe, DecimalPipe, RouterLink, SiteHeader],
  templateUrl: './humanizar.html',
  styleUrl: './humanizar.css',
})
export class Humanizar implements OnInit, OnDestroy {
  private readonly api = inject(PrepararService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly panel = signal<PanelPreparar | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly busqueda = signal('');

  // ── Para empezar uno ─────────────────────────────────────────────────────
  readonly modo = signal<Modo>('TODO');
  readonly archivo = signal<File | null>(null);
  readonly capitulos = signal<CapituloWord[]>([]);
  readonly leyendoCapitulos = signal(false);
  readonly noTocar = signal<ReadonlySet<string>>(new Set());
  readonly reporte = signal<ReporteIaSubido | null>(null);
  readonly nombreReporte = signal<string | null>(null);
  readonly subiendoReporte = signal(false);
  readonly enviando = signal(false);
  readonly encima = signal(false);

  // ── La conversación abierta ──────────────────────────────────────────────
  readonly docId = toSignal(this.ruta.queryParamMap.pipe(map((q) => q.get('doc'))), {
    initialValue: null,
  });
  /** El trabajo abierto pedido suelto, con su `detalle`. */
  private readonly suelto = signal<Preparacion | null>(null);
  /** Turnitin dio «*%»: el reporte no sirve y se ofrece humanizar todo otra vez. */
  readonly sinMarcas = signal(false);
  readonly eligiendoParrafo = signal(false);
  readonly parrafos = signal<ParrafoComparado[] | null>(null);
  readonly buscandoParrafo = signal('');
  readonly pidiendoRonda = signal(false);

  private readonly selector = viewChild<ElementRef<HTMLInputElement>>('selector');
  private readonly selectorReporte = viewChild<ElementRef<HTMLInputElement>>('selectorReporte');
  private readonly selectorRonda = viewChild<ElementRef<HTMLInputElement>>('selectorRonda');
  private reloj: ReturnType<typeof setInterval> | null = null;

  readonly puede = computed(() => Boolean(this.panel()?.disponible && this.panel()?.humanizar));

  readonly trabajos = computed(() =>
    (this.panel()?.trabajos ?? []).filter((t) => t.servicio === 'HUMANIZAR'),
  );

  /** La barra lateral: «Hoy», «Ayer» y el resto por fecha, ya filtrada por el buscador. */
  readonly grupos = computed(() => {
    const buscado = plano(this.busqueda().trim());
    const hoy = new Date();
    const ayer = new Date(hoy.getTime() - 24 * 60 * 60 * 1000);
    const grupos: { titulo: string; trabajos: Preparacion[] }[] = [];
    for (const t of this.trabajos()) {
      if (buscado && !plano(t.nombre).includes(buscado)) continue;
      const fecha = new Date(t.createdAt);
      const titulo = mismoDia(fecha, hoy)
        ? 'Hoy'
        : mismoDia(fecha, ayer)
          ? 'Ayer'
          : fecha.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
      const grupo = grupos.find((g) => g.titulo === titulo);
      if (grupo) grupo.trabajos.push(t);
      else grupos.push({ titulo, trabajos: [t] });
    }
    return grupos;
  });

  readonly abierto = computed<Preparacion | null>(() => {
    const id = this.docId();
    if (!id) return null;
    const enLista = this.trabajos().find((t) => t.id === id) ?? null;
    const suelto = this.suelto()?.id === id ? this.suelto() : null;
    if (!enLista) return suelto;
    // La lista trae el estado al día; el suelto, el detalle.
    return { ...enLista, detalle: suelto?.detalle ?? enLista.detalle };
  });

  readonly detalle = computed<DetalleHumanizado | null>(() => this.abierto()?.detalle ?? null);

  /** Se puede mandar: hay Word y, si es «solo lo marcado», reporte. */
  readonly listoParaMandar = computed(
    () =>
      this.puede() &&
      Boolean(this.archivo()) &&
      !this.leyendoCapitulos() &&
      !this.enviando() &&
      (this.modo() === 'TODO' || Boolean(this.reporte())),
  );

  /** Los párrafos que se pueden rehacer, filtrados por el buscador. */
  readonly parrafosElegibles = computed(() => {
    const buscado = plano(this.buscandoParrafo().trim());
    return (this.parrafos() ?? []).filter(
      (p) =>
        !p.nivel &&
        p.resultado.split(/\s+/).length >= PALABRAS_MINIMAS &&
        (!buscado || plano(p.resultado).includes(buscado)),
    );
  });

  constructor() {
    // Al abrir uno, se pide suelto para tener su `detalle` (qué se pidió).
    effect(() => {
      const id = this.docId();
      untracked(() => {
        this.sinMarcas.set(false);
        this.eligiendoParrafo.set(false);
        this.parrafos.set(null);
        if (!id || this.suelto()?.id === id) return;
        this.api.ver(id).subscribe({
          next: (t) => this.suelto.set(t),
          error: (e: unknown) => {
            this.error.set(mensajeDeError(e));
            this.nueva();
          },
        });
      });
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
        this.ajustarReloj();
      },
      error: (e: unknown) => {
        this.cargando.set(false);
        if (primeraVez) this.error.set(mensajeDeError(e));
      },
    });
  }

  private ajustarReloj(): void {
    const enMarcha = this.trabajos().some((t) => t.estado === 'EN_COLA' || t.estado === 'EN_CURSO');
    if (enMarcha) {
      if (!this.reloj) this.reloj = setInterval(() => this.cargar(), CADA_MS);
      return;
    }
    this.pararReloj();
  }

  private pararReloj(): void {
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = null;
  }

  // ── Navegar ──────────────────────────────────────────────────────────────

  abrir(trabajo: Pick<Preparacion, 'id'>): void {
    this.router.navigate([], { relativeTo: this.ruta, queryParams: { doc: trabajo.id } });
  }

  nueva(): void {
    this.router.navigate([], { relativeTo: this.ruta, queryParams: {} });
  }

  /** La barra de abajo de la conversación: elegir otro Word lleva a empezar uno nuevo con él. */
  adjuntarOtro(): void {
    this.nueva();
    this.abrirSelector();
  }

  buscar(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
  }

  // ── Empezar uno ──────────────────────────────────────────────────────────

  elegirModo(modo: Modo): void {
    this.modo.set(modo);
    if (modo === 'TODO') this.quitarReporte();
  }

  abrirSelector(): void {
    this.selector()?.nativeElement.click();
  }

  abrirSelectorReporte(): void {
    this.selectorReporte()?.nativeElement.click();
  }

  desdeElBoton(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (archivo) this.elegirArchivo(archivo);
  }

  arrastrar(evento: DragEvent, dentro: boolean): void {
    evento.preventDefault();
    if (this.puede()) this.encima.set(dentro);
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(false);
    const archivo = evento.dataTransfer?.files?.[0];
    if (!archivo) return;
    if (archivo.name.toLowerCase().endsWith('.pdf')) this.leerReporte(archivo);
    else this.elegirArchivo(archivo);
  }

  /** El Word elegido: se leen sus capítulos para poder marcar los que no se tocan. */
  elegirArchivo(archivo: File): void {
    if (!archivo.name.toLowerCase().endsWith('.docx')) {
      this.error.set(
        'Solo trabajamos con .docx. Si tu documento es un .doc antiguo o un PDF, ábrelo en Word y ' +
          'guárdalo como «Documento de Word (.docx)».',
      );
      return;
    }
    this.error.set(null);
    this.archivo.set(archivo);
    this.capitulos.set([]);
    this.noTocar.set(new Set());
    this.leyendoCapitulos.set(true);
    this.api.capitulos(archivo).subscribe({
      next: ({ capitulos }) => {
        if (this.archivo() !== archivo) return;
        this.capitulos.set(capitulos);
        this.leyendoCapitulos.set(false);
      },
      error: (e: unknown) => {
        if (this.archivo() !== archivo) return;
        this.leyendoCapitulos.set(false);
        this.archivo.set(null);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  quitarArchivo(): void {
    this.archivo.set(null);
    this.capitulos.set([]);
    this.noTocar.set(new Set());
    this.leyendoCapitulos.set(false);
  }

  alternarCapitulo(clave: string): void {
    this.noTocar.update((antes) => {
      const despues = new Set(antes);
      if (despues.has(clave)) despues.delete(clave);
      else despues.add(clave);
      return despues;
    });
  }

  desdeElReporte(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (archivo) this.leerReporte(archivo);
  }

  private leerReporte(archivo: File): void {
    if (this.subiendoReporte()) return;
    if (!archivo.name.toLowerCase().endsWith('.pdf')) {
      this.error.set('El reporte va en PDF: en Turnitin, abre «Escritura con IA» y descárgalo.');
      return;
    }
    this.subiendoReporte.set(true);
    this.error.set(null);
    this.api.subirReporte(archivo).subscribe({
      next: (leido) => {
        this.subiendoReporte.set(false);
        this.reporte.set(leido);
        this.nombreReporte.set(archivo.name);
        this.modo.set('MARCADO');
      },
      error: (e: unknown) => {
        this.subiendoReporte.set(false);
        this.quitarReporte();
        this.error.set(mensajeDeError(e));
      },
    });
  }

  quitarReporte(): void {
    this.reporte.set(null);
    this.nombreReporte.set(null);
  }

  mandar(): void {
    const archivo = this.archivo();
    if (!archivo || !this.listoParaMandar()) return;
    this.enviando.set(true);
    this.error.set(null);
    const reporteId = this.modo() === 'MARCADO' ? this.reporte()?.reporteId : undefined;
    this.api.encargar('HUMANIZAR', archivo, undefined, reporteId, [...this.noTocar()]).subscribe({
      next: (hecho) => {
        this.enviando.set(false);
        this.quitarArchivo();
        this.quitarReporte();
        this.modo.set('TODO');
        this.entrar(hecho);
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /** Un trabajo recién encargado: a la lista y a su conversación, sin esperar al sondeo. */
  private entrar({ preparacion }: EncargoAceptado): void {
    this.panel.update((p) => (p ? { ...p, trabajos: [preparacion, ...p.trabajos] } : p));
    this.abrir(preparacion);
    this.cargar();
  }

  // ── La conversación ──────────────────────────────────────────────────────

  /** Lo que pidió, en una frase: es la burbuja del cliente. */
  pedidoDe(trabajo: Preparacion): string {
    const d = trabajo.detalle;
    let frase: string;
    if (d?.parrafo) frase = 'Rehaz este párrafo.';
    else if (d?.conReporte) frase = d.deId ? 'Aquí está mi nuevo reporte: rehaz lo marcado.' : 'Humaniza solo lo marcado.';
    else frase = d?.deId ? 'Humaniza todo otra vez.' : 'Humaniza todo el documento.';
    if (d?.noTocar.length) frase += ` No toques: ${d.noTocar.join(', ')}.`;
    return frase;
  }

  /** La primera línea de la respuesta, según lo que se pidió. */
  introDe(trabajo: Preparacion): string {
    const d = trabajo.detalle;
    if (d?.parrafo) return 'Voy a rehacer solo ese párrafo; el resto del documento se queda como está.';
    if (d?.conReporte) {
      return (
        'Leí tu Word y el reporte de Turnitin. Voy a trabajar solo los párrafos que salieron marcados; ' +
        'lo que salió limpio, las tablas, las citas, las cifras y la bibliografía se quedan como están.'
      );
    }
    return (
      'Voy a humanizar el texto de tu Word. Las tablas, las citas, las cifras y la bibliografía se ' +
      'quedan como están.'
    );
  }

  pasosDe(trabajo: Preparacion): PasoHumanizar[] {
    const d = trabajo.detalle;
    const textos = [
      'Leer el documento',
      d?.conReporte ? 'Ubicar lo marcado en el reporte' : 'Proteger citas, cifras y tablas',
      d?.parrafo ? 'Reescribir el párrafo' : d?.conReporte ? 'Reescribir los párrafos marcados' : 'Reescribir el texto',
      'Armar el Word limpio',
    ];
    const orden = ['LEYENDO', 'PROTEGIENDO', 'EDITANDO', 'ARMANDO'];
    const actual =
      trabajo.estado === 'LISTO'
        ? textos.length
        : trabajo.estado === 'EN_CURSO'
          ? Math.max(0, orden.indexOf(trabajo.progreso?.paso ?? 'LEYENDO'))
          : -1;
    return textos.map((texto, i) => ({
      texto,
      estado: i < actual ? 'hecho' : i === actual ? 'actual' : 'pendiente',
    }));
  }

  /** «sección 4 de 12» mientras reescribe. */
  seccionDe(trabajo: Preparacion): string | null {
    const { paso, hechas = 0, total = 0 } = trabajo.progreso ?? {};
    if (paso !== 'EDITANDO' || total === 0) return null;
    return `sección ${Math.min(hechas + 1, total)} de ${total}`;
  }

  nombreDeDescarga(trabajo: Preparacion): string {
    return `${trabajo.nombre.replace(/\.docx$/i, '')} (humanizado).docx`;
  }

  descargar(trabajo: Preparacion): void {
    this.api.descargar(trabajo.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = this.nombreDeDescarga(trabajo);
        enlace.click();
        URL.revokeObjectURL(url);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  // ── Otra ronda ───────────────────────────────────────────────────────────

  abrirSelectorRonda(): void {
    this.selectorRonda()?.nativeElement.click();
  }

  /** El reporte de IA del Word ya humanizado: se rehace lo que marcó. */
  desdeElReporteDeRonda(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    const trabajo = this.abierto();
    if (!archivo || !trabajo || this.pidiendoRonda()) return;
    if (!archivo.name.toLowerCase().endsWith('.pdf')) {
      this.error.set('El reporte va en PDF: en Turnitin, abre «Escritura con IA» y descárgalo.');
      return;
    }
    this.pidiendoRonda.set(true);
    this.sinMarcas.set(false);
    this.error.set(null);
    this.api.subirReporte(archivo).subscribe({
      next: ({ reporteId }) => this.pedirRonda(trabajo, { reporteId }),
      error: (e: unknown) => {
        this.pidiendoRonda.set(false);
        const mensaje = mensajeDeError(e);
        // «*%»: Turnitin no marcó nada. Se ofrece humanizar todo otra vez.
        if (/no trae nada resaltado/i.test(mensaje)) this.sinMarcas.set(true);
        else this.error.set(mensaje);
      },
    });
  }

  todoOtraVez(): void {
    const trabajo = this.abierto();
    if (trabajo) this.pedirRonda(trabajo, {});
  }

  abrirParrafos(): void {
    const trabajo = this.abierto();
    if (!trabajo) return;
    this.eligiendoParrafo.set(true);
    this.buscandoParrafo.set('');
    if (this.parrafos()) return;
    this.api.comparacion(trabajo.id).subscribe({
      next: (c) => this.parrafos.set(c.parrafos),
      error: (e: unknown) => {
        this.eligiendoParrafo.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  cerrarParrafos(): void {
    this.eligiendoParrafo.set(false);
  }

  buscarParrafo(evento: Event): void {
    this.buscandoParrafo.set((evento.target as HTMLInputElement).value);
  }

  rehacer(parrafo: ParrafoComparado): void {
    const trabajo = this.abierto();
    if (trabajo) this.pedirRonda(trabajo, { clave: parrafo.clave });
  }

  private pedirRonda(trabajo: Preparacion, pedido: { reporteId?: string; clave?: string }): void {
    this.pidiendoRonda.set(true);
    this.api.ronda(trabajo.id, pedido).subscribe({
      next: (hecho) => {
        this.pidiendoRonda.set(false);
        this.entrar(hecho);
      },
      error: (e: unknown) => {
        this.pidiendoRonda.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /** El principio de un párrafo, para reconocerlo en la lista. */
  inicio(texto: string): string {
    return texto.length > 180 ? `${texto.slice(0, 180)}…` : texto;
  }
}
