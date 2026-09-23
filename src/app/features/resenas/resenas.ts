import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ResenaPublica, ResenaService, nota } from '../../core/services/resena.service';
import { MiResenaDelServicio } from '../../shared/cuenta/mi-resena';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Qué se está mirando. */
type Filtro = 'TODAS' | 'VIDEO' | 'ESCRITAS';

const FILTROS: { clave: Filtro; nombre: string }[] = [
  { clave: 'TODAS', nombre: 'Todas' },
  { clave: 'VIDEO', nombre: 'En video' },
  { clave: 'ESCRITAS', nombre: 'Escritas' },
];

/** Cuántas se enseñan de entrada, y cuántas más añade cada «Ver más reseñas». */
const PASO = 9;

/**
 * Lo que dicen quienes ya lo usaron.
 *
 * Página aparte y no solo una banda en la portada porque son dos cosas
 * distintas: la portada enseña tres o cuatro elegidas a mano —ahí el sitio es
 * caro— y aquí están todas las aprobadas, que es lo que hace que las de la
 * portada se puedan creer. Un carrusel de cuatro elogios sin nada detrás lo
 * tiene cualquiera.
 *
 * Todas las que salen pasaron por el panel. Ninguna se publica sola.
 *
 * EN REJILLA Y NO EN UNA COLUMNA
 * ------------------------------
 * Un testimonio no se lee como un artículo: se ojea. En columna estrecha había
 * que bajar media pantalla por cada uno y nadie llegaba al quinto; en tarjetas
 * se ven ocho de un vistazo, que es justo lo que venía a comprobar quien entra
 * aquí —que hay muchas, no que haya una muy larga—.
 *
 * LOS VIDEOS NO SE CARGAN SOLOS
 * -----------------------------
 * Cada tarjeta enseña el primer fotograma y su duración, y el archivo no empieza
 * a bajar hasta que alguien le da al triángulo. Nueve testimonios grabados con
 * el móvil cargándose a la vez son cientos de megas en la primera pantalla.
 *
 * Si no hay ninguna todavía, la página no finge: lo dice y ofrece las dos
 * salidas que sí existen —las demostraciones y el método—, que es lo que
 * venía a buscar quien entró aquí.
 */
@Component({
  selector: 'app-resenas',
  imports: [RouterLink, SiteHeader, SiteFooter, MiResenaDelServicio],
  templateUrl: './resenas.html',
  styleUrl: './resenas.css',
})
export class Resenas implements OnInit {
  protected readonly api = inject(ResenaService);
  protected readonly auth = inject(AuthService);

  readonly nota = nota;
  readonly filtros = FILTROS;

  /** Si tiene abierto el formulario de la suya, debajo de la cabecera. */
  readonly escribiendo = signal(false);

  escribir(): void {
    this.escribiendo.update((abierto) => !abierto);
  }

  readonly cargando = signal(true);
  readonly resenas = signal<ResenaPublica[]>([]);
  readonly total = signal(0);
  readonly media = signal<number | null>(null);

  /** Lo que se está mirando, y cuántas caben antes de pedir más. */
  readonly filtro = signal<Filtro>('TODAS');
  readonly cuantas = signal(PASO);

  /**
   * El resumen solo se anuncia con unas cuantas detrás.
   *
   * Con dos reseñas, «5,0 de 5» no es una media: es una coincidencia con
   * aspecto de dato. Por debajo de cinco se enseñan las opiniones y se calla la
   * cifra, que es el mismo criterio que ya se usa con la nota de los asesores.
   */
  readonly hayResumen = computed(() => this.media() !== null && this.total() >= 5);

  /**
   * Las pestañas solo salen si hay de las dos clases.
   *
   * Un filtro que no filtra nada es un botón que miente: con solo testimonios
   * escritos, «En video» llevaría a una página vacía y parecería que algo se
   * rompió.
   */
  readonly hayDeLasDos = computed(
    () => this.resenas().some((r) => r.video) && this.resenas().some((r) => !r.video),
  );

  readonly filtradas = computed(() => {
    const resenas = this.resenas();
    switch (this.filtro()) {
      case 'VIDEO':
        return resenas.filter((r) => r.video);
      case 'ESCRITAS':
        return resenas.filter((r) => !r.video);
      default:
        return resenas;
    }
  });

  readonly visibles = computed(() => this.filtradas().slice(0, this.cuantas()));
  readonly hayMas = computed(() => this.filtradas().length > this.cuantas());

  filtrar(filtro: Filtro): void {
    this.filtro.set(filtro);
    // Cambiar de pestaña empieza otra lista: dejar el «ver más» de la anterior
    // enseñaría treinta escritas porque antes se habían pedido treinta de todas.
    this.cuantas.set(PASO);
  }

  verMas(): void {
    this.cuantas.update((n) => n + PASO);
  }

  /**
   * La primera con video manda en la rejilla y ocupa cuatro huecos.
   *
   * Una grabación es el testimonio más difícil de fingir y el que más cuesta
   * conseguir: si hay una, es lo primero que tiene que ver quien entra. En
   * miniatura no se le ve la cara a nadie, así que ahí no valdría de nada.
   *
   * Con menos de tres reseñas no se agranda ninguna: una tarjeta enorme al lado
   * de un hueco vacío se lee como una página a medio cargar.
   */
  esGrande(resena: ResenaPublica, i: number): boolean {
    return i === 0 && resena.video && this.visibles().length >= 3;
  }

  // ── Los videos ────────────────────────────────────────────────────────────

  /** El que se está reproduciendo. Solo uno: dos a la vez no los oye nadie. */
  readonly sonando = signal<string | null>(null);
  /** «1:11» por reseña, leído del propio archivo cuando el navegador lo sabe. */
  readonly duraciones = signal<Record<string, string>>({});

  reproducir(id: string, video: HTMLVideoElement): void {
    this.sonando.set(id);
    void video.play().catch(() => {
      // Si el navegador se niega a reproducir, al menos que queden los mandos.
    });
  }

  /**
   * Apunta la duración en cuanto el navegador la sabe.
   *
   * Sale en la esquina de la miniatura porque es la pregunta de quien duda si
   * darle: no es lo mismo un minuto que ocho.
   */
  apuntarDuracion(id: string, video: HTMLVideoElement): void {
    const segundos = Math.round(video.duration);
    if (!Number.isFinite(segundos) || segundos <= 0) return;

    const minutos = Math.floor(segundos / 60);
    const resto = String(segundos % 60).padStart(2, '0');
    this.duraciones.update((d) => ({ ...d, [id]: `${minutos}:${resto}` }));
  }

  // ── Detalles de cómo se pinta ─────────────────────────────────────────────

  llenas(nota: number): string {
    return '★'.repeat(this.redondeada(nota));
  }

  vacias(nota: number): string {
    return '☆'.repeat(5 - this.redondeada(nota));
  }

  private redondeada(nota: number): number {
    return Math.min(5, Math.max(0, Math.round(nota)));
  }

  ngOnInit(): void {
    this.api.publicas().subscribe({
      next: ({ resenas, total, nota }) => {
        this.resenas.set(resenas);
        this.total.set(total);
        this.media.set(nota);
        this.cargando.set(false);
      },
      // Sin lista no se pinta un error: se queda la página vacía, que ya dice
      // lo que hay que decir y no asusta a quien venía a leer opiniones.
      error: () => this.cargando.set(false),
    });
  }

  /** «septiembre de 2026». El día exacto de una opinión no le importa a nadie. */
  cuando(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-PE', {
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Lima',
      });
    } catch {
      return '';
    }
  }
}
