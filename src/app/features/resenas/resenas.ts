import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import {
  ResenaPublica,
  ResenaService,
  estrellas,
  nota,
} from '../../core/services/resena.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

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
 * Si no hay ninguna todavía, la página no finge: lo dice y ofrece las dos
 * salidas que sí existen —las demostraciones y el método—, que es lo que
 * venía a buscar quien entró aquí.
 */
@Component({
  selector: 'app-resenas',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './resenas.html',
  styleUrl: './resenas.css',
})
export class Resenas implements OnInit {
  private readonly api = inject(ResenaService);
  protected readonly auth = inject(AuthService);

  readonly estrellas = estrellas;
  readonly nota = nota;

  readonly cargando = signal(true);
  readonly resenas = signal<ResenaPublica[]>([]);
  readonly total = signal(0);
  readonly media = signal<number | null>(null);

  /**
   * El resumen solo se anuncia con unas cuantas detrás.
   *
   * Con dos reseñas, «5,0 de 5» no es una media: es una coincidencia con
   * aspecto de dato. Por debajo de cinco se enseñan las opiniones y se calla la
   * cifra, que es el mismo criterio que ya se usa con la nota de los asesores.
   */
  readonly hayResumen = computed(() => this.media() !== null && this.total() >= 5);

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
