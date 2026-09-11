import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { TROPIEZOS } from '../../shared/contenido/tutoriales';
import { Tutorial, TutorialService } from '../../core/services/tutorial.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Un bloque de la lista: su rótulo y los videos que lleva, con su posición. */
interface Grupo {
  nombre: string;
  videos: { tutorial: Tutorial; indice: number }[];
}

/**
 * Cómo usar el conector: los videos y los tropiezos por escrito.
 *
 * ES PÚBLICA, Y ES A PROPÓSITO
 * ----------------------------
 * Lo natural sería esconderla detrás de la cuenta, porque es material para
 * quien ya compró. Pero un video que enseña a conectar algo que todavía no
 * tienes no le regala nada a nadie, y en cambio hace dos trabajos aquí fuera:
 * quien duda ve el segundo y entiende qué compra, y sobre todo la alcanza quien
 * compró y NO ha vuelto a entrar a la web —que es justo el que necesita el
 * primero—.
 *
 * Por eso el enlace vive en tres sitios: aquí, en el panel del comprador junto a
 * su URL, y en el correo de entrega.
 *
 * UN REPRODUCTOR, NO UNO POR VIDEO
 * --------------------------------
 * Con ocho videos apilados la página se hacía eterna y cargaba ocho iframes de
 * YouTube. Ahora hay uno solo, con la lista al lado como en un curso, y el
 * iframe no existe hasta que se pulsa play: antes se enseña la miniatura, que es
 * una imagen y no un reproductor entero.
 */
@Component({
  selector: 'app-tutoriales',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './tutoriales.html',
  styleUrl: './tutoriales.css',
})
export class Tutoriales implements OnInit {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly api = inject(TutorialService);

  private readonly reproductor = viewChild<ElementRef<HTMLElement>>('reproductor');
  private readonly fallas = viewChild<ElementRef<HTMLElement>>('fallas');

  readonly whatsappUrl = environment.whatsappUrl;

  readonly tutoriales = signal<Tutorial[]>([]);
  readonly cargando = signal(true);

  /** El video que está en la pantalla, por su posición en la lista. */
  readonly actual = signal(0);

  /** Si ya se pulsó play. Hasta entonces no hay iframe, solo la miniatura. */
  readonly reproduciendo = signal(false);

  // Los tropiezos siguen en código: es texto que cambia cuando cambia el
  // producto, no cuando se graba un video, y no hay nadie esperando para
  // editarlos sin desplegar.
  readonly tropiezos = TROPIEZOS;

  readonly seleccionado = computed(() => this.tutoriales()[this.actual()] ?? null);

  /**
   * Los videos seguidos con el mismo grupo, juntos.
   *
   * Seguidos y no todos los del mismo nombre: el orden manda. Si alguien pone
   * «Para empezar» en el 1 y en el 9, salen dos bloques, que es lo que ve en el
   * panel, en vez de un 9 que salta a la cabeza de la lista sin que nadie lo
   * haya movido.
   */
  readonly grupos = computed<Grupo[]>(() => {
    const grupos: Grupo[] = [];
    this.tutoriales().forEach((tutorial, indice) => {
      const ultimo = grupos.at(-1);
      if (ultimo && ultimo.nombre === tutorial.grupo) {
        ultimo.videos.push({ tutorial, indice });
      } else {
        grupos.push({ nombre: tutorial.grupo, videos: [{ tutorial, indice }] });
      }
    });
    return grupos;
  });

  /**
   * La URL del iframe, calculada una vez por video.
   *
   * En un `computed` y no en un método llamado desde la plantilla: cada
   * `bypassSecurityTrust…` devuelve un objeto nuevo, y un objeto nuevo en
   * `[src]` es un iframe que se recarga en cada ciclo de detección de cambios.
   */
  readonly embedActual = computed<SafeResourceUrl | null>(() => {
    const id = this.identificador(this.seleccionado()?.videoUrl ?? '');
    if (!id) return null;

    // Angular bloquea cualquier `src` de iframe sin marcar. Aquí la URL se
    // construye con un identificador ya validado, no con lo que venga. Con
    // autoplay porque solo se pinta después de pulsar play: pedir dos clics
    // para ver un video es uno de más.
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
    );
  });

  /** La miniatura de YouTube del video en pantalla, o null si no está grabado. */
  readonly miniaturaActual = computed(() => {
    const id = this.identificador(this.seleccionado()?.videoUrl ?? '');
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  });

  ngOnInit(): void {
    this.api.publicos().subscribe({
      next: (lista) => {
        this.tutoriales.set(lista);
        this.cargando.set(false);
      },
      // Sin lista no se enseña un error: los tropiezos escritos de más abajo
      // siguen sirviendo, que es la mitad útil de esta página.
      error: () => this.cargando.set(false),
    });
  }

  /** Lo que va en el círculo: la etiqueta si la tiene («S4»), si no su número. */
  etiqueta(tutorial: Tutorial, indice: number): string {
    return tutorial.etiqueta || String(indice + 1);
  }

  /** Si ese enlace se puede reproducir. Decide si se pinta el play o el aviso. */
  reproducible(enlace: string): boolean {
    return this.identificador(enlace) !== null;
  }

  elegir(indice: number): void {
    if (indice < 0 || indice >= this.tutoriales().length) return;
    this.actual.set(indice);
    this.reproduciendo.set(false);

    // En pantalla estrecha la lista queda DEBAJO del reproductor: quien toca el
    // último video cambia algo que ya no ve y cree que no pasó nada. Se sube
    // hasta la pantalla. En escritorio el reproductor está al lado y fijo.
    if (window.matchMedia('(max-width: 1100px)').matches) {
      this.reproductor()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  reproducir(): void {
    if (this.embedActual()) this.reproduciendo.set(true);
  }

  /**
   * Baja a «Si algo falla».
   *
   * Con un método y no con `href="#fallas"`: el enrutador no mueve la página a
   * un ancla de la misma ruta, y el enlace cambiaba la URL sin hacer nada más.
   */
  irAFallas(evento: Event): void {
    evento.preventDefault();
    this.fallas()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * El identificador del video, o null si el enlace no lleva ninguno.
   *
   * El null importa. Antes esto daba por hecho que lo que no encajara con
   * ningún patrón YA era un identificador suelto, y así una URL de Studio de
   * 165 caracteres —la de la barra del navegador, que es la que uno copia sin
   * darse cuenta— pasó por identificador y produjo un reproductor en negro con
   * un error de YouTube que no explicaba nada.
   */
  private identificador(enlace: string): string | null {
    const texto = (enlace ?? '').trim();
    if (/^[\w-]{11}$/.test(texto)) return texto;

    const encontrado = /(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/.exec(texto);
    return encontrado ? encontrado[1] : null;
  }
}
