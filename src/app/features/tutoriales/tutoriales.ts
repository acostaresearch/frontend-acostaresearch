import { Component, OnInit, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { TROPIEZOS } from '../../shared/contenido/tutoriales';
import { Tutorial, TutorialService } from '../../core/services/tutorial.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * Cómo usar el conector: cuatro videos y los tropiezos por escrito.
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

  readonly tutoriales = signal<Tutorial[]>([]);
  readonly cargando = signal(true);

  // Los tropiezos siguen en código: es texto que cambia cuando cambia el
  // producto, no cuando se graba un video, y no hay nadie esperando para
  // editarlos sin desplegar.
  readonly tropiezos = TROPIEZOS;

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

  /**
   * URL para incrustar, acepte lo que acepte quien la pegue.
   *
   * Mismo criterio que en las demostraciones: da igual si va el identificador
   * suelto, el enlace de la barra del navegador o el corto de youtu.be.
   */
  embed(video: string): SafeResourceUrl {
    const id = /(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(video)?.[1] ?? video.trim();
    // Angular bloquea cualquier `src` de iframe sin marcar. La URL se construye
    // con un identificador nuestro, no con nada que escriba el visitante.
    return this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube.com/embed/${id}`);
  }
}
