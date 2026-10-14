import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { toApiError } from '../../core/http/api-error';
import { doisDeLosPdf, normalizarDoi } from '../../core/pdf/doi-del-pdf';
import {
  FuenteGuardada,
  ImportacionAMano,
  ImportacionPorDoi,
  MisFuentes,
  MisFuentesService,
  ResultadoDeImportacion,
  TipoDeFuente,
} from '../../core/services/mis-fuentes.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { AvisoFlotante } from '../layout/aviso-flotante';
import { contenido as contenidoDeDescarga, nombreDelArchivo as nombreDeDescarga } from './mis-fuentes-exportar';
import { FORMATOS, FormatoDeExportacion } from './scopus-exportar';

/**
 * Los archivos que son un EXPORT de una base de datos: esos sí se suben, y los
 * lee el servidor. El `.xls` está porque el CSV de Scopus renombrado a `.xls`
 * es de lo que más se suelta aquí.
 */
const ES_EXPORT = /\.(csv|ris|bib|bibtex|txt|tsv|nbib|enw|xls)$/i;

/** Los formatos de libro electrónico: su ficha se abre ya como «Libro». */
const ES_LIBRO = /\.(epub|mobi|azw3?|djvu|fb2)$/i;

/** Techo local, para no subir ocho megas y que el servidor los rechace. */
const MAXIMO_BYTES = 8 * 1024 * 1024;

/** Para buscar en «Ver fuentes»: «Gestión» y «gestion» son lo mismo. */
function sinTildes(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Cuántas fichas a mano se guardan de una vez. El servidor lo recomprueba. */
const MAXIMO_FICHAS = 20;

/**
 * Una fuente sin DOI a medio describir. El año va como texto mientras se
 * escribe; `archivo` es de qué PDF salió, o vacío si se añadió sin archivo.
 */
export interface FichaPendiente {
  archivo: string;
  titulo: string;
  autores: string;
  anio: string;
  fuente: string;
  tipo: TipoDeFuente;
}

/** Los tipos que se ofrecen, y cómo se llama en cada uno «de dónde sale». */
const TIPOS: { clave: TipoDeFuente; texto: string; fuente: string }[] = [
  { clave: 'tesis', texto: 'Tesis', fuente: 'Universidad' },
  { clave: 'articulo', texto: 'Artículo', fuente: 'Revista' },
  { clave: 'libro', texto: 'Libro', fuente: 'Editorial' },
  { clave: 'informe', texto: 'Informe', fuente: 'Institución' },
  { clave: 'otro', texto: 'Otro', fuente: 'Quién lo publica' },
];

/**
 * Las fuentes que el tesista sube de su propio export.
 *
 * POR QUÉ ESTO SIGUE ESTANDO, HABIENDO UN «CONECTAR SCOPUS» ENCIMA
 * ----------------------------------------------------------------
 * Porque esta vía no depende de nadie. La API de Elsevier exige que la
 * institución esté suscrita y su acuerdo de servicio prohíbe almacenar su
 * contenido y dárselo a terceros, así que `app-mi-scopus` está apagado salvo
 * que el servidor lo encienda. El tesista, en cambio, SÍ tiene Scopus por su
 * universidad: el método ya le arma la ecuación de búsqueda para que la pegue
 * allí, y esto es por dónde sube lo que exporta.
 *
 * Además el export trae el resumen —si marca «Abstract & keywords»— y la API
 * sin token institucional no. Aunque esté encendida, esta caja sigue siendo la
 * que da fichas completas.
 *
 * Un archivo no necesita credenciales de terceros ni claves que caducan. Y es
 * lo que ya prometía la web: «el marco teórico se redacta únicamente con los
 * artículos que tú subes de Scopus, SciELO o Google Académico».
 */
@Component({
  selector: 'app-mis-fuentes',
  imports: [AvisoFlotante, DatePipe, DecimalPipe, UpperCasePipe, ReactiveFormsModule],
  templateUrl: './mis-fuentes.html',
  styleUrl: './mis-fuentes.css',
})
export class MisFuentesPanel {
  private readonly fuentes = inject(MisFuentesService);
  private readonly dialogos = inject(DialogoService);


  readonly resumen = signal<MisFuentes | null>(null);
  readonly subiendo = signal(false);
  readonly vaciando = signal(false);
  readonly error = signal<string | null>(null);
  /** Tras «Borrar todas»: cuántas se quedaron por estar citadas, si alguna. */
  readonly conservadas = signal<string | null>(null);
  /** El parte de la última subida. Se enseña hasta que suba otra cosa. */
  readonly resultado = signal<ResultadoDeImportacion | null>(null);
  /** Para el resaltado al arrastrar un archivo encima. */
  readonly encima = signal(false);

  /**
   * La ventana de subir.
   *
   * La franja de arriba enseña la cifra, que es a lo que se vuelve; subir un
   * export es cosa de un rato al empezar, así que la caja de arrastrar y sus
   * explicaciones viven en una ventana que se abre con «Subir export».
   */
  readonly ventanaAbierta = signal(false);

  abrir(): void {
    this.error.set(null);
    this.conservadas.set(null);
    this.ventanaAbierta.set(true);
  }

  /**
   * Cierra la ventana y olvida el parte: la próxima vez que se abra empieza
   * limpia, en vez de enseñar «Añadimos 40 fuentes» de la subida de ayer.
   * Mientras sube no se cierra, para que el parte no llegue a una ventana que
   * ya no está.
   */
  cerrar(): void {
    if (this.subiendo()) return;
    this.ventanaAbierta.set(false);
    this.resultado.set(null);
    this.porDoi.set(null);
    this.sinDoi.set([]);
    this.fichas.set([]);
    this.aMano.set(null);
    this.error.set(null);
  }

  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    this.cerrarLista();
    if (this.ventanaAbierta()) this.cerrar();
  }

  constructor() {
    /**
     * El recuento se pide al entrar Y cada vez que entran fuentes por otra
     * puerta.
     *
     * La búsqueda de Scopus es OTRO componente y escribe en la misma
     * biblioteca. Sin esto, importar tres artículos dejaba aquí el número
     * viejo hasta recargar la página, y lo que parece entonces es que la
     * importación no funcionó.
     *
     * El `effect` corre solo la primera vez, así que esto hace también el
     * trabajo que antes hacía `ngOnInit`.
     */
    effect(() => {
      this.fuentes.cambio();
      this.cargar();
    });
  }

  private cargar(): void {
    this.fuentes.resumen().subscribe({
      next: (datos) => this.resumen.set(datos),
      error: () => this.resumen.set(null),
    });
  }

  elegir(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivos = [...(entrada.files ?? [])];
    // El campo se limpia siempre: sin esto, volver a elegir el MISMO archivo no
    // dispara ningún evento y parece que la página se quedó colgada.
    entrada.value = '';
    this.recibir(archivos);
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(false);
    this.recibir([...(evento.dataTransfer?.files ?? [])]);
  }

  /**
   * Reparte lo que llegó según lo que sea.
   *
   * Hay tres caminos. Del PDF solo se saca el DOI, aquí en el navegador, y el
   * archivo no sale del equipo. El export de una base de datos sí se sube y lo
   * lee el servidor. Y CUALQUIER OTRA COSA —un libro en EPUB, una tesis en
   * Word, una foto de la portada, una presentación— tampoco se sube: deja
   * abierta su ficha para llenarla a mano (11-oct-2026; antes se mandaba al
   * servidor como si fuera un export y volvía con «ese tipo de archivo no lo
   * leemos»). Se aceptan por la misma caja porque para el tesista es lo mismo
   * —«tengo esto, tómalo»— y saber cuál va por dónde es problema nuestro.
   */
  private recibir(archivos: File[]): void {
    if (archivos.length === 0 || this.subiendo()) return;

    const pdfs = archivos.filter((a) => /\.pdf$/i.test(a.name) || a.type === 'application/pdf');
    const exports = archivos.filter((a) => !pdfs.includes(a) && ES_EXPORT.test(a.name));
    const otros = archivos.filter((a) => !pdfs.includes(a) && !exports.includes(a));

    this.error.set(null);
    this.abrirFichas(
      otros.map((a) => ({
        archivo: a.name,
        // El nombre del archivo, sin extensión: casi siempre lo puso quien lo
        // descargó y es lo más parecido al título que hay sin abrirlo.
        titulo: a.name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(),
        autores: '',
        anio: '',
        fuente: '',
        tipo: ES_LIBRO.test(a.name) ? 'libro' : 'tesis',
      })),
    );

    if (pdfs.length > 0) return void this.desdePdf(pdfs);
    // Los exports van de uno en uno: cada uno es una biblioteca entera y su
    // parte por separado, y juntarlos escondería cuál vino mal.
    if (exports.length > 0) this.subir(exports[0]);
  }

  /**
   * Añade fichas a las que ya hay abiertas, sin repetir archivo y sin pasar
   * del tope: soltar en dos tandas suma, no pisa lo que ya se había escrito.
   */
  private abrirFichas(nuevas: FichaPendiente[]): void {
    if (nuevas.length === 0) return;
    this.aMano.set(null);
    this.fichas.update((lista) => {
      const yaEstan = new Set(lista.map((f) => f.archivo).filter(Boolean));
      return [...lista, ...nuevas.filter((f) => !yaEstan.has(f.archivo))].slice(0, MAXIMO_FICHAS);
    });
  }

  arrastraEncima(evento: DragEvent): void {
    evento.preventDefault();
    this.encima.set(true);
  }

  private subir(archivo: File): void {
    if (this.subiendo()) return;

    if (archivo.size > MAXIMO_BYTES) {
      this.error.set(
        'Ese archivo pesa más de 8 MB. Exporta una selección más ajustada a tu tema: una tesis ' +
          'no se sostiene sobre miles de fuentes, y las que sobran solo dificultan encontrar ' +
          'las buenas.',
      );
      return;
    }

    this.subiendo.set(true);
    this.error.set(null);
    this.resultado.set(null);

    this.fuentes.importar(archivo).subscribe({
      next: (resultado) => {
        this.resultado.set(resultado);
        this.subiendo.set(false);
        this.cargar();
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error).message);
        this.subiendo.set(false);
      },
    });
  }

  // ── Los PDF ──────────────────────────────────────────────────────────────
  /** Por dónde va la lectura de los archivos, para que se vea que pasa algo. */
  readonly leyendo = signal<{ hechos: number; total: number } | null>(null);
  readonly porDoi = signal<ImportacionPorDoi | null>(null);
  /** Los archivos que no declaran su DOI, o los DOI que el catálogo no conoce. */
  readonly sinDoi = signal<string[]>([]);
  readonly doiAMano = new FormControl('', { nonNullable: true });

  /**
   * De unos PDF a fuentes citables.
   *
   * El archivo NO se sube. Se lee aquí, se le saca el DOI y al servidor solo
   * viaja esa lista: veinte caracteres por artículo en vez de tres megas. Los
   * metadatos buenos —autores, año, revista, resumen— llegan del catálogo
   * abierto, no de interpretar el maquetado del PDF.
   */
  private async desdePdf(pdfs: File[]): Promise<void> {
    this.subiendo.set(true);
    this.error.set(null);
    this.resultado.set(null);
    this.porDoi.set(null);
    this.sinDoi.set([]);
    this.leyendo.set({ hechos: 0, total: pdfs.length });

    const leidos = await doisDeLosPdf(pdfs, (hechos, total) =>
      this.leyendo.set({ hechos, total }),
    );
    this.leyendo.set(null);

    const dois = leidos.map((l) => l.doi).filter((d): d is string => d !== null);
    const sinDoi = leidos.filter((l) => l.doi === null);
    this.sinDoi.set(sinDoi.map((l) => l.archivo));

    // Los que no dicen su DOI no son un error (hasta el 11-oct-2026 lo eran:
    // «pégalo abajo», y una tesis o un libro no tienen DOI que pegar). Cada
    // uno deja su ficha abierta, con el título que el PDF declara, para
    // completarla a mano; quien sí tenga el DOI lo pega arriba y quita la ficha.
    this.abrirFichas(
      sinDoi.map((l) => ({
        archivo: l.archivo,
        titulo: l.titulo,
        autores: l.autores,
        anio: '',
        fuente: '',
        tipo: 'tesis',
      })),
    );

    if (dois.length === 0) {
      this.subiendo.set(false);
      return;
    }

    this.pedirPorDoi(dois);
  }

  // ── Las fuentes sin DOI, a mano ──────────────────────────────────────────
  readonly tipos = TIPOS;
  readonly maximoFichas = MAXIMO_FICHAS;
  /** Las fichas abiertas: una por PDF sin DOI, más las que se añadan sueltas. */
  readonly fichas = signal<FichaPendiente[]>([]);
  /** El parte de las fichas guardadas a mano. */
  readonly aMano = signal<ImportacionAMano | null>(null);

  /** «Universidad», «Revista», «Editorial»… según el tipo elegido. */
  rotuloDeFuente(tipo: TipoDeFuente): string {
    return TIPOS.find((t) => t.clave === tipo)?.fuente ?? 'Quién lo publica';
  }

  /** Una ficha en blanco, para una fuente de la que no se tiene el PDF. */
  nuevaFicha(): void {
    if (this.fichas().length >= MAXIMO_FICHAS) return;
    this.aMano.set(null);
    this.fichas.update((lista) => [
      ...lista,
      { archivo: '', titulo: '', autores: '', anio: '', fuente: '', tipo: 'tesis' },
    ]);
  }

  quitarFicha(indice: number): void {
    this.fichas.update((lista) => lista.filter((_, i) => i !== indice));
  }

  escribirEnFicha(indice: number, campo: keyof FichaPendiente, evento: Event): void {
    const valor = (evento.target as HTMLInputElement | HTMLSelectElement).value;
    this.fichas.update((lista) =>
      lista.map((ficha, i) => (i === indice ? { ...ficha, [campo]: valor } : ficha)),
    );
  }

  /**
   * Guarda las fichas escritas a mano.
   *
   * Solo se exige el título: es con lo que se cita y con lo que se encuentra.
   * Autores y año se piden en la pantalla, pero una fuente institucional sin
   * autor o sin fecha existe, y APA sabe citarla («s. f.»).
   */
  guardarFichas(): void {
    if (this.subiendo() || this.fichas().length === 0) return;

    const fichas = this.fichas();
    if (fichas.some((f) => f.titulo.trim().length < 5)) {
      this.error.set('A alguna ficha le falta el título. Escríbelo completo, como sale en la portada.');
      return;
    }
    const anioMalo = fichas.some((f) => f.anio.trim() && !/^(1[5-9]|20)\d{2}$/.test(f.anio.trim()));
    if (anioMalo) {
      this.error.set('El año va con cuatro cifras, por ejemplo 2021. Si no lo tiene, déjalo vacío.');
      return;
    }

    this.subiendo.set(true);
    this.error.set(null);

    this.fuentes
      .aMano(
        fichas.map((f) => ({
          titulo: f.titulo.trim(),
          autores: f.autores.trim(),
          anio: f.anio.trim() ? Number(f.anio.trim()) : null,
          fuente: f.fuente.trim(),
          tipo: f.tipo,
          url: '',
          resumen: '',
        })),
      )
      .subscribe({
        next: (resultado) => {
          this.aMano.set(resultado);
          this.fichas.set([]);
          // Las que quedaban en «no dicen su DOI» eran estos mismos archivos.
          this.sinDoi.set([]);
          this.subiendo.set(false);
          this.cargar();
        },
        error: (error: unknown) => {
          this.error.set(toApiError(error).message);
          this.subiendo.set(false);
        },
      });
  }

  /** Los DOI que el tesista pega a mano, uno por línea o separados por comas. */
  enviarDoisAMano(): void {
    const dois = this.doiAMano.value
      .split(/[\n,;]+/)
      .map((d) => normalizarDoi(d))
      .filter((d): d is string => d !== null);

    if (dois.length === 0) {
      this.error.set(
        'Eso no parece un DOI. Tiene esta forma: 10.1145/3770762.3772598, y suele estar en la ' +
          'primera página del artículo.',
      );
      return;
    }

    this.pedirPorDoi(dois);
  }

  private pedirPorDoi(dois: string[]): void {
    this.subiendo.set(true);
    this.error.set(null);

    this.fuentes.porDoi(dois).subscribe({
      next: (resultado) => {
        this.porDoi.set(resultado);
        this.subiendo.set(false);
        this.doiAMano.reset();
        // Los que sí entraron dejan de estar pendientes; los que el catálogo no
        // conoce se quedan a la vista con su DOI, que es lo que hace falta para
        // buscarlos a mano.
        this.sinDoi.set(resultado.noEncontrados);
        this.cargar();
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error).message);
        this.subiendo.set(false);
      },
    });
  }

  /**
   * «Ver fuentes»: la lista entera en una ventana, con buscador. Pedido de un
   * cliente (14-oct): veía «56 fuentes tuyas» y no había dónde mirarlas.
   * Null = ventana cerrada.
   */
  readonly lista = signal<FuenteGuardada[] | null>(null);
  readonly cargandoLista = signal(false);
  readonly filtro = signal('');
  readonly filtradas = computed(() => {
    const todas = this.lista() ?? [];
    const buscado = sinTildes(this.filtro().trim());
    if (!buscado) return todas;
    return todas.filter((f) =>
      sinTildes([f.titulo, f.autores, f.anio ?? '', f.clave ?? '', f.fuente ?? '', f.doi ?? ''].join(' ')).includes(
        buscado,
      ),
    );
  });

  verFuentes(): void {
    if (this.cargandoLista()) return;
    this.cargandoLista.set(true);
    this.error.set(null);
    this.fuentes.paraDescargar().subscribe({
      next: (fuentes) => {
        this.cargandoLista.set(false);
        this.filtro.set('');
        this.lista.set(fuentes);
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error).message);
        this.cargandoLista.set(false);
      },
    });
  }

  cerrarLista(): void {
    this.menuLista.set(false);
    this.elegidas.set(new Set());
    this.lista.set(null);
  }

  /** Los formatos de «Descargar», los mismos que «Exportar» de Scopus. */
  readonly formatos = FORMATOS;

  /**
   * «Descargar», dentro de «Ver fuentes» (en la franja ya no está: 14-oct).
   * Las fuentes ya están en pantalla, así que no se vuelven a pedir. Baja lo
   * que se ve: todas, o solo lo que deja el buscador. El archivo se arma aquí;
   * ver `mis-fuentes-exportar`.
   */
  descargarLista(formato: FormatoDeExportacion): void {
    this.menuLista.set(false);
    this.guardarArchivo(formato, this.aDescargar());
  }

  /**
   * Las que marcó con la casilla. Si no marcó ninguna, se baja lo que se ve,
   * igual que «Exportar» de la búsqueda de Scopus.
   */
  readonly elegidas = signal<ReadonlySet<FuenteGuardada>>(new Set());
  readonly aDescargar = computed(() => {
    const elegidas = this.elegidas();
    return elegidas.size > 0 ? (this.lista() ?? []).filter((f) => elegidas.has(f)) : this.filtradas();
  });
  /** Todas las que se ven están marcadas: la casilla de arriba sale marcada. */
  readonly todasElegidas = computed(() => {
    const vistas = this.filtradas();
    return vistas.length > 0 && vistas.every((f) => this.elegidas().has(f));
  });

  alternar(fuente: FuenteGuardada): void {
    this.elegidas.update((antes) => {
      const despues = new Set(antes);
      if (despues.has(fuente)) despues.delete(fuente);
      else despues.add(fuente);
      return despues;
    });
  }

  quitarSeleccion(): void {
    this.elegidas.set(new Set());
  }

  /** La casilla de arriba marca o desmarca las que se ven (respeta el buscador). */
  alternarTodas(): void {
    const vistas = this.filtradas();
    const marcar = !this.todasElegidas();
    this.elegidas.update((antes) => {
      const despues = new Set(antes);
      for (const f of vistas) {
        if (marcar) despues.add(f);
        else despues.delete(f);
      }
      return despues;
    });
  }

  readonly menuLista = signal(false);

  private guardarArchivo(formato: FormatoDeExportacion, lista: readonly FuenteGuardada[]): void {
    if (lista.length === 0) return;
    const tipo = FORMATOS.find((f) => f.valor === formato);
    const blob = new Blob([contenidoDeDescarga(formato, lista)], { type: tipo?.mime ?? 'text/plain' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreDeDescarga(formato);
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /**
   * Vacía la biblioteca. Es el deshacer de una importación.
   *
   * Se pregunta antes porque no hay vuelta atrás: recuperarlas significa volver
   * a Scopus, repetir la búsqueda y exportar otra vez.
   */
  async vaciar(): Promise<void> {
    const total = this.resumen()?.total ?? 0;
    if (total === 0 || this.vaciando()) return;

    const seguro = await this.dialogos.confirmar({
      titulo: 'Borrar tus fuentes',
      mensaje: `Se borrarán las ${total} fuentes que subiste.`,
      nota:
        'Las que ya citas en tus capítulos se quedan, para que esas citas no se rompan en tu ' +
        'Word. La biblioteca de Acosta no se toca. Para recuperar las demás tendrías que volver ' +
        'a exportarlas.',
      confirmar: 'Borrar mis fuentes',
      tono: 'peligro',
    });
    if (!seguro || this.vaciando()) return;

    this.vaciando.set(true);
    this.error.set(null);
    this.resultado.set(null);
    this.conservadas.set(null);

    this.fuentes.vaciar().subscribe({
      next: ({ conservadas }) => {
        this.vaciando.set(false);
        if (conservadas > 0) {
          this.conservadas.set(
            conservadas === 1
              ? 'Se conservó 1 fuente porque la citas en tus capítulos. Si la quitas del texto, podrás borrarla.'
              : `Se conservaron ${conservadas} fuentes porque las citas en tus capítulos. Si las quitas del texto, podrás borrarlas.`,
          );
        }
        this.cargar();
      },
      error: (error: unknown) => {
        this.error.set(toApiError(error).message);
        this.vaciando.set(false);
      },
    });
  }
}
