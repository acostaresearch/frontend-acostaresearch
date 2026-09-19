import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { Component, HostListener, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { toApiError } from '../../core/http/api-error';
import { doisDeLosPdf, normalizarDoi } from '../../core/pdf/doi-del-pdf';
import {
  ImportacionPorDoi,
  MisFuentes,
  MisFuentesService,
  ResultadoDeImportacion,
} from '../../core/services/mis-fuentes.service';
import { DialogoService } from '../../core/services/dialogo.service';

/** Lo que el navegador ofrece al abrir el diálogo. El servidor lo recomprueba. */
const ACEPTA = '.csv,.ris,.bib,.bibtex,.txt,.pdf';

/** Techo local, para no subir ocho megas y que el servidor los rechace. */
const MAXIMO_BYTES = 8 * 1024 * 1024;

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
  imports: [DatePipe, DecimalPipe, UpperCasePipe, ReactiveFormsModule],
  templateUrl: './mis-fuentes.html',
  styleUrl: './mis-fuentes.css',
})
export class MisFuentesPanel {
  private readonly fuentes = inject(MisFuentesService);
  private readonly dialogos = inject(DialogoService);

  readonly acepta = ACEPTA;

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
    this.error.set(null);
  }

  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
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
   * Los PDF y los exports son dos caminos distintos: del PDF solo se saca el
   * DOI, aquí en el navegador, y el archivo no sale del equipo; el export sí se
   * sube y lo lee el servidor. Se aceptan por la misma caja porque para el
   * tesista es lo mismo —«tengo esto, tómalo»— y saber cuál va por dónde es
   * problema nuestro.
   */
  private recibir(archivos: File[]): void {
    if (archivos.length === 0 || this.subiendo()) return;

    const pdfs = archivos.filter((a) => /\.pdf$/i.test(a.name) || a.type === 'application/pdf');
    const exports = archivos.filter((a) => !pdfs.includes(a));

    if (pdfs.length > 0) return void this.desdePdf(pdfs);
    // Los exports van de uno en uno: cada uno es una biblioteca entera y su
    // parte por separado, y juntarlos escondería cuál vino mal.
    this.subir(exports[0]);
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
  /** Los archivos que no declaran su DOI. Se piden a mano. */
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
    this.sinDoi.set(leidos.filter((l) => l.doi === null).map((l) => l.archivo));

    if (dois.length === 0) {
      this.subiendo.set(false);
      this.error.set(
        pdfs.length === 1
          ? 'Ese PDF no lleva su DOI escrito dentro. Ábrelo, cópialo de la primera página y ' +
            'pégalo abajo.'
          : 'Ninguno de esos PDF lleva su DOI escrito dentro. Puedes pegarlos abajo, uno por ' +
            'línea.',
      );
      return;
    }

    this.pedirPorDoi(dois);
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
