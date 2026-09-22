import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import {
  AvisoPreparacion,
  IdiomaPreparar,
  PanelPreparar,
  Preparacion,
  ServicioPreparar,
} from '../../core/models/preparar.model';
import { PrepararService } from '../../core/services/preparar.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/** Lo que se cuenta de cada pestaña, en un solo sitio para no repetirlo en la plantilla. */
interface Pestana {
  id: ServicioPreparar;
  titulo: string;
  /** Cuál de los dos dibujos lleva la pestaña. El `<svg>` vive en la plantilla. */
  icono: 'edicion' | 'traduccion';
  /**
   * Qué es y qué hace falta para usarlo, en dos o tres frases.
   *
   * Es TODO lo que se cuenta del servicio. La pantalla llevaba antes cuatro
   * promesas en lista y un «cómo funciona» de dos pasos al lado, y entre las
   * dos cosas el recuadro de subir quedaba por debajo del pliegue. Lo que hace
   * falta para no equivocarse de pestaña —«esto es para textos ya en inglés»—
   * cabe en una línea; lo demás se vende en /planes, no aquí dentro.
   */
  descripcion: string;
  /** Si la descripción acaba mandándole a la otra pestaña, el enlace que lo lleva. */
  enlace?: { texto: string; va: ServicioPreparar };
}

const PESTANAS: readonly Pestana[] = [
  {
    id: 'EDICION',
    titulo: 'Edición de inglés académico',
    icono: 'edicion',
    descripcion:
      'Para textos ya escritos en inglés. Te lo devolvemos con control de cambios. Si está en ' +
      'español, usa',
    enlace: { texto: 'Traducción', va: 'TRADUCCION' },
  },
  {
    id: 'TRADUCCION',
    titulo: 'Traducción',
    icono: 'traduccion',
    descripcion:
      'A español, inglés, portugués o chino, con el registro de una revista indexada. Las citas, ' +
      'las siglas y la bibliografía se quedan como están.',
  },
];

/** Por qué estado se puede filtrar la lista de la derecha. */
type Filtro = 'TODOS' | 'LISTO' | 'FALLIDO';

/**
 * Los tres botones del filtro.
 *
 * No hay uno de «en marcha» a propósito: lo que está preparándose se va solo
 * en unos minutos, y un filtro que casi siempre sale vacío es un botón que
 * estorba. Con «Todos» se ven igual.
 */
const FILTROS: readonly { id: Filtro; texto: string }[] = [
  { id: 'TODOS', texto: 'Todos' },
  { id: 'LISTO', texto: 'Listos' },
  { id: 'FALLIDO', texto: 'Sin completar' },
];

/** Cada cuánto se pregunta por los trabajos que están en marcha. */
const CADA_MS = 5000;

/** Cuántos documentos se enseñan de entrada. El resto, pulsando «ver más». */
const TOPE = 3;

/**
 * Los servicios que hoy tienen pestaña.
 *
 * Sirve para lo que NO está aquí: un trabajo de un servicio retirado —los
 * resúmenes, que se quitaron el 22-sep-2026— no es de ninguna de las dos
 * pestañas, y filtrando a secas desaparecería de la pantalla para siempre.
 * Esos se enseñan en la lista mire lo que mire: son pocos, no se crean más y
 * el cliente tiene que poder descargarlos.
 */
const CON_PESTANA: readonly string[] = PESTANAS.map((p) => p.id);

/** A dónde escribe quien tuvo un problema. Es el mismo correo del pie del sitio. */
const CORREO = 'asesoriaprofesional599@gmail.com';

/**
 * «Preparar documento»: edición de inglés académico y traducción.
 *
 * DOS PESTAÑAS Y UNA SOLA MEMBRESÍA
 * ---------------------------------
 * Las dos hacen lo mismo de cara al cliente —subir un .docx y recibir otro— y
 * gastan del mismo cupo. Por eso el cupo vive en la cabecera de la tarjeta,
 * fuera de las pestañas: es de la membresía, no del servicio.
 *
 * POR QUÉ SE PREGUNTA CADA CINCO SEGUNDOS
 * ---------------------------------------
 * Porque preparar un documento son minutos y la petición de subida contesta
 * enseguida (ver `preparar.service` en el backend). Se pregunta solo mientras
 * haya algo en marcha, y se deja de preguntar en cuanto no queda ninguno: un
 * reloj que sigue corriendo con la pestaña abierta en segundo plano es tráfico
 * que no le sirve a nadie.
 */
@Component({
  selector: 'app-preparar',
  imports: [AvisoFlotante, RouterLink, DatePipe, DecimalPipe, SiteHeader, SiteFooter],
  templateUrl: './preparar.html',
  styleUrl: './preparar.css',
})
export class Preparar implements OnInit, OnDestroy {
  private readonly api = inject(PrepararService);

  readonly pestanas = PESTANAS;
  readonly filtros = FILTROS;
  readonly tope = TOPE;

  readonly panel = signal<PanelPreparar | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  readonly elegida = signal<ServicioPreparar>('EDICION');
  readonly idioma = signal<IdiomaPreparar>('en');
  readonly subiendo = signal(false);
  readonly encima = signal(false);
  /** Si la lista de la derecha está desplegada. Se recoge al cambiar de pestaña. */
  readonly verTodos = signal(false);
  readonly filtro = signal<Filtro>('TODOS');

  /**
   * El campo de archivo, escondido.
   *
   * Está una sola vez y se abre desde dos sitios: «elige el archivo» del
   * recuadro y «volver a mandarlo» de un trabajo que falló. Antes era un
   * `<label>` que lo envolvía, que solo sirve para el primero.
   */
  private readonly selector = viewChild<ElementRef<HTMLInputElement>>('selector');

  private reloj: ReturnType<typeof setInterval> | null = null;

  readonly pestana = computed(() => PESTANAS.find((p) => p.id === this.elegida()) ?? PESTANAS[0]);

  /** Puede mandar un documento: hay membresía con cupo y el servicio está en pie. */
  readonly puede = computed(() => {
    const panel = this.panel();
    return Boolean(panel?.disponible && panel.motivo === null);
  });

  readonly trabajos = computed(() => this.panel()?.trabajos ?? []);

  /**
   * Los de la pestaña que está mirando.
   *
   * La lista de la derecha es del servicio elegido y no de todo lo que ha
   * mandado nunca: quien viene a traducir no tiene por qué revolver entre sus
   * ediciones de inglés para encontrar lo suyo. El sondeo, en cambio, sigue
   * mirando `trabajos` entero: un documento en marcha en la otra pestaña tiene
   * que seguir refrescándose igual.
   */
  readonly trabajosDelServicio = computed(() =>
    this.trabajos().filter(
      (t) => t.servicio === this.elegida() || !CON_PESTANA.includes(t.servicio),
    ),
  );

  /** Los de la pestaña que además pasan el filtro de estado. */
  readonly trabajosFiltrados = computed(() => {
    const filtro = this.filtro();
    const lista = this.trabajosDelServicio();
    return filtro === 'TODOS' ? lista : lista.filter((t) => t.estado === filtro);
  });

  /** Los tres primeros, o todos si ha pulsado «ver más». */
  readonly visibles = computed(() => {
    const lista = this.trabajosFiltrados();
    return this.verTodos() ? lista : lista.slice(0, TOPE);
  });

  readonly ocultos = computed(() => this.trabajosFiltrados().length - this.visibles().length);

  /** Cuántos hay en la otra pestaña: un «aquí no hay nada» a secas despista. */
  readonly enLaOtra = computed(() => this.trabajos().length - this.trabajosDelServicio().length);

  readonly enMarcha = computed(() =>
    this.trabajos().filter((t) => t.estado === 'EN_COLA' || t.estado === 'EN_CURSO'),
  );

  /** Cuánto queda del mes, para la barra de la cabecera. */
  readonly restantePorciento = computed(() => {
    const cupo = this.panel()?.cupo;
    if (!cupo || cupo.total === 0) return 0;
    return Math.round((cupo.restantes / cupo.total) * 100);
  });

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
        // Un fallo del sondeo no borra lo que ya se ve: si la red parpadea
        // mientras se espera un documento, la pantalla no tiene por qué
        // vaciarse. Solo se avisa en la primera carga.
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

  // ── La pestaña ───────────────────────────────────────────────────────────

  elegir(servicio: ServicioPreparar): void {
    this.elegida.set(servicio);
    this.verTodos.set(false);
    this.aviso.set(null);
    this.error.set(null);
  }

  elegirIdioma(codigo: string): void {
    this.idioma.set(codigo as IdiomaPreparar);
  }

  elegirFiltro(filtro: Filtro): void {
    this.filtro.set(filtro);
    this.verTodos.set(false);
  }

  // ── Subir ────────────────────────────────────────────────────────────────

  abrirSelector(): void {
    this.selector()?.nativeElement.click();
  }

  /**
   * Volver a mandar uno que falló.
   *
   * No se reenvía lo que hay en el servidor: se deja la pantalla puesta en el
   * mismo servicio y el mismo idioma y se abre el archivo. El navegador no
   * guarda el .docx de antes —ni puede—, así que lo honesto es pedirlo otra
   * vez ya con todo lo demás elegido. Un fallo no descuenta cupo, así que
   * repetirlo no cuesta nada.
   */
  volverAMandar(trabajo: Preparacion): void {
    this.elegir(trabajo.servicio);
    if (trabajo.servicio === 'TRADUCCION' && trabajo.idioma) this.idioma.set(trabajo.idioma);
    // En el turno siguiente: la pestaña acaba de cambiar y el campo puede estar
    // recién pintado.
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
    if (this.subiendo() || !this.puede()) return;

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
      next: () => {
        this.subiendo.set(false);
        this.aviso.set(
          'Lo tenemos. Te avisamos por correo cuando esté, y aquí al lado lo verás cambiar solo.',
        );
        this.cargar();
      },
      error: (e: unknown) => {
        this.subiendo.set(false);
        this.error.set(mensajeDeError(e));
        // Puede ser un «se te acabó el cupo»: se recarga para que la cabecera
        // diga la verdad en vez de seguir anunciando documentos que ya no hay.
        this.cargar();
      },
    });
  }

  // ── Descargar ────────────────────────────────────────────────────────────

  descargar(trabajo: Preparacion): void {
    this.api.descargar(trabajo.id).subscribe({
      next: (blob) => this.guardar(blob, this.nombreDeDescarga(trabajo)),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /**
   * El nombre con el que se guarda.
   *
   * Se calcula también aquí, igual que en el servidor, porque el archivo llega
   * como blob y el navegador no ve la cabecera `Content-Disposition`. Que sean
   * dos sitios no es ideal; la alternativa —leer la cabecera— obliga a pedir la
   * respuesta entera y a desenredar el `filename*`, que es más frágil que esto.
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
   * El plan, sin repetir el título de la pantalla.
   *
   * Los dos planes se llaman «Preparar documento · mensual» y «Preparar
   * documento · trimestral», que es como tienen que aparecer en /planes y en
   * el comprobante. Aquí dentro, debajo de un título que ya dice «Preparar
   * documento», se queda en «Mensual» o «Trimestral».
   */
  nombreDelPlan(nombre: string | null | undefined): string {
    if (!nombre) return '';
    const corto = nombre.replace(/^preparar documento\s*[·:—-]?\s*/i, '');
    return corto.charAt(0).toUpperCase() + corto.slice(1);
  }

  nombreDelIdioma(codigo: string | null): string {
    return this.panel()?.idiomas.find((i) => i.codigo === codigo)?.nombre ?? 'idioma elegido';
  }

  tituloDe(trabajo: Preparacion): string {
    const pestana = PESTANAS.find((p) => p.id === trabajo.servicio);
    if (trabajo.servicio === 'TRADUCCION') {
      return `Traducción al ${this.nombreDelIdioma(trabajo.idioma)}`;
    }
    return pestana?.titulo ?? trabajo.servicio;
  }

  /** Qué se le dice de un trabajo terminado, incluida la letra pequeña. */
  resultadoDe(trabajo: Preparacion): string | null {
    if (trabajo.estado !== 'LISTO') return null;

    const tocados = `${trabajo.tocados} párrafo${trabajo.tocados === 1 ? '' : 's'}`;
    const hecho = trabajo.servicio === 'EDICION' ? 'con correcciones' : 'traducidos';

    // El índice no se traduce: es un campo que Word rehace solo con los títulos
    // que ya están traducidos. Sin decirlo, el cliente abre el archivo, ve el
    // índice en español y cree que quedó a medias.
    const indice =
      trabajo.servicio === 'TRADUCCION'
        ? ' Si tu documento lleva índice, ábrelo en Word y actualízalo (clic derecho sobre el ' +
          'índice → «Actualizar campos») para que recoja los títulos traducidos.'
        : '';

    if (trabajo.intactos === 0) return `${tocados} ${hecho}.${indice}`;

    // El porqué NO se escribe aquí: lo manda el servidor en `avisos`, uno por
    // motivo, y se enseña debajo. Esta frase decía «llevaban dentro una nota al
    // pie, una ecuación o una imagen» pasara lo que pasara, y salía igual en
    // documentos que no tienen ni una sola nota al pie.
    const otros = `${tocados} ${hecho}. Otros ${trabajo.intactos} quedaron como estaban`;

    return trabajo.avisos?.length ? `${otros}:${indice}` : `${otros}.${indice}`;
  }

  /**
   * Por qué quedó cada grupo sin tocar, para enseñarlo en lista.
   *
   * Vacío en los trabajos entregados antes de que el servidor guardara el
   * motivo: de aquellos no hay de dónde sacarlo, y preferimos no decir nada a
   * decir algo que no sabemos.
   */
  avisosDe(trabajo: Preparacion): AvisoPreparacion[] {
    return trabajo.estado === 'LISTO' ? (trabajo.avisos ?? []) : [];
  }
}
