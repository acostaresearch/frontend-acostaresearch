import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
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
  /** La línea de debajo del título en la tarjeta: qué se lleva, en tres palabras. */
  gancho: string;
  /** Cuál de los tres dibujos lleva la tarjeta. El `<svg>` vive en la plantilla. */
  icono: 'edicion' | 'traduccion';
  resumen: string;
  /**
   * Lo que de verdad hace, en frases cortas. Va partido en dos porque el
   * principio se lee en negrita: quien pasa la vista por la lista sin leerla
   * entera se lleva de todas formas las cuatro promesas.
   */
  detalle: { fuerte: string; resto: string }[];
  /** El trato en dos pasos: qué sube y qué recibe. */
  flujo: { sube: string; subeNota: string; recibe: string; recibeNota: string };
  /** Qué tiene que traer el cliente para que esto tenga sentido. */
  requisito: string;
  /** Si el requisito acaba mandándole a otra pestaña, el enlace que lo lleva. */
  requisitoEnlace?: { texto: string; va: ServicioPreparar };
}

const PESTANAS: readonly Pestana[] = [
  {
    id: 'EDICION',
    titulo: 'Edición de inglés académico',
    gancho: 'Tu manuscrito corregido',
    icono: 'edicion',
    resumen: 'Corregimos tu manuscrito en inglés y te lo devolvemos con control de cambios.',
    detalle: [
      {
        fuerte: 'Gramática, artículos, preposiciones y colocaciones:',
        resto: 'los errores por los que una revista devuelve un manuscrito por el idioma.',
      },
      {
        fuerte: 'Con control de cambios:',
        resto: 'aceptas o rechazas cada corrección desde tu Word, una por una.',
      },
      {
        fuerte: 'No reescribimos lo que ya está bien.',
        resto: 'Cada cambio de más es un cambio que tienes que revisar.',
      },
      {
        fuerte: 'Tus tablas, figuras, citas y bibliografía',
        resto: 'salen exactamente como entraron.',
      },
    ],
    flujo: {
      sube: 'Tu manuscrito',
      subeNota: 'en inglés, en Word',
      recibe: 'Tu mismo Word',
      recibeNota: 'con control de cambios',
    },
    requisito: 'Tu documento tiene que estar ya escrito en inglés. Si está en español, usa',
    requisitoEnlace: { texto: 'Traducción', va: 'TRADUCCION' },
  },
  {
    id: 'TRADUCCION',
    titulo: 'Traducción',
    gancho: 'A cuatro idiomas',
    icono: 'traduccion',
    resumen: 'A español, inglés, portugués o chino, con registro de revista indexada.',
    detalle: [
      { fuerte: 'Terminología del área,', resto: 'no traducción palabra por palabra.' },
      {
        fuerte: 'Las citas, los apellidos, las siglas y las cifras',
        resto: 'se quedan como están.',
      },
      {
        fuerte: 'La bibliografía no se traduce:',
        resto: 'un título traducido es un título que nadie puede buscar.',
      },
      {
        fuerte: 'Te devolvemos tu mismo documento,',
        resto: 'con su formato, sus tablas y sus figuras.',
      },
    ],
    flujo: {
      sube: 'Tu documento',
      subeNota: 'en su idioma original',
      recibe: 'Tu mismo documento',
      recibeNota: 'traducido, con su formato',
    },
    requisito: 'Elige el idioma al que quieres llegar.',
  },
];

/** Cada cuánto se pregunta por los trabajos que están en marcha. */
const CADA_MS = 5000;

/**
 * «Preparar documento»: edición de inglés académico y traducción.
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

  readonly pestana = computed(() => PESTANAS.find((p) => p.id === this.elegida()) ?? PESTANAS[0]);

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
