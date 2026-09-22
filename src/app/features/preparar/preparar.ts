import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import {
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
  resumen: string;
  /** Lo que de verdad hace, en frases cortas. Se enseña dentro de la pestaña. */
  detalle: string[];
  /** Qué tiene que traer el cliente para que esto tenga sentido. */
  requisito: string;
}

const PESTANAS: readonly Pestana[] = [
  {
    id: 'EDICION',
    titulo: 'Edición de inglés académico',
    resumen: 'Corregimos tu manuscrito en inglés y te lo devolvemos con control de cambios.',
    detalle: [
      'Gramática, artículos, preposiciones y colocaciones: los errores por los que una revista devuelve un manuscrito por el idioma.',
      'Con control de cambios: aceptas o rechazas cada corrección desde tu Word, una por una.',
      'No reescribimos lo que ya está bien. Cada cambio de más es un cambio que tienes que revisar.',
      'Tus tablas, figuras, citas y bibliografía salen exactamente como entraron.',
    ],
    requisito: 'Tu documento tiene que estar ya escrito en inglés. Si está en español, usa Traducción.',
  },
  {
    id: 'TRADUCCION',
    titulo: 'Traducción',
    resumen: 'A español, inglés, portugués o chino, con registro de revista indexada.',
    detalle: [
      'Terminología del área, no traducción palabra por palabra.',
      'Las citas, los apellidos, las siglas y las cifras se quedan como están.',
      'La bibliografía no se traduce: un título traducido es un título que nadie puede buscar.',
      'Te devolvemos tu mismo documento, con su formato, sus tablas y sus figuras.',
    ],
    requisito: 'Elige el idioma al que quieres llegar.',
  },
  {
    id: 'RESUMEN',
    titulo: 'Resúmenes',
    resumen: 'El resumen, el abstract y las palabras clave, sacados de tu propio trabajo.',
    detalle: [
      'Resumen en español y abstract en inglés, de 200 a 250 palabras, en estructura IMRyD.',
      'De 4 a 6 palabras clave y sus keywords, en el mismo orden.',
      'Las cifras salen de tu texto. Lo que tu trabajo no diga, no se inventa.',
      'Se entrega en un documento aparte, para que lo pegues donde te pida tu reglamento.',
    ],
    requisito: 'Sube el trabajo completo: leemos el principio y el final para escribirlo.',
  },
];

/** Cada cuánto se pregunta por los trabajos que están en marcha. */
const CADA_MS = 5000;

/**
 * «Preparar documento»: edición de inglés académico, traducción y resúmenes.
 *
 * TRES PESTAÑAS Y UNA SOLA MEMBRESÍA
 * ----------------------------------
 * Las tres hacen lo mismo de cara al cliente —subir un .docx y recibir otro— y
 * gastan del mismo cupo. Por eso la barra de «te quedan N documentos» vive
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

  readonly panel = signal<PanelPreparar | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  readonly elegida = signal<ServicioPreparar>('EDICION');
  readonly idioma = signal<IdiomaPreparar>('en');
  readonly subiendo = signal(false);
  readonly encima = signal(false);

  private reloj: ReturnType<typeof setInterval> | null = null;

  readonly pestana = computed(
    () => PESTANAS.find((p) => p.id === this.elegida()) ?? PESTANAS[0],
  );

  /** Puede mandar un documento: hay membresía con cupo y el servicio está en pie. */
  readonly puede = computed(() => {
    const panel = this.panel();
    return Boolean(panel?.disponible && panel.motivo === null);
  });

  readonly trabajos = computed(() => this.panel()?.trabajos ?? []);

  readonly enMarcha = computed(() =>
    this.trabajos().filter((t) => t.estado === 'EN_COLA' || t.estado === 'EN_CURSO'),
  );

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
    this.aviso.set(null);
    this.error.set(null);
  }

  elegirIdioma(codigo: string): void {
    this.idioma.set(codigo as IdiomaPreparar);
  }

  // ── Subir ────────────────────────────────────────────────────────────────

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
          'Lo tenemos. Te avisamos por correo cuando esté, y aquí abajo lo verás cambiar solo.',
        );
        this.cargar();
      },
      error: (e: unknown) => {
        this.subiendo.set(false);
        this.error.set(mensajeDeError(e));
        // Puede ser un «se te acabó el cupo»: se recarga para que la barra de
        // arriba diga la verdad en vez de seguir anunciando documentos que ya
        // no hay.
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
    if (trabajo.servicio === 'RESUMEN') return `${base} (resumen y abstract).docx`;
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
    if (trabajo.servicio === 'RESUMEN') return 'Resumen, abstract y palabras clave.';

    const tocados = `${trabajo.tocados} párrafo${trabajo.tocados === 1 ? '' : 's'}`;
    const hecho = trabajo.servicio === 'EDICION' ? 'con correcciones' : 'traducidos';
    if (trabajo.intactos === 0) return `${tocados} ${hecho}.`;

    return (
      `${tocados} ${hecho}. Otros ${trabajo.intactos} quedaron intactos porque llevaban algo ` +
      'que no se puede rehacer sin romperlo: una cita de Zotero, una nota al pie, una ecuación ' +
      'o una imagen.'
    );
  }
}
