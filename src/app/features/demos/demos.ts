import { Component, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { DEMOS } from '../../shared/contenido/metodo';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';
import { environment } from '../../../environments/environment';

/** Las demostraciones grabadas. Es la página que más convence, así que va sola. */
@Component({
  selector: 'app-demos',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './demos.html',
  styleUrl: './demos.css',
})
export class Demos {
  private readonly sanitizer = inject(DomSanitizer);

  readonly demos = DEMOS;
  readonly redes = environment.redes;

  /**
   * URL para incrustar, acepte lo que acepte quien la pegue.
   *
   * Da igual si en `DEMOS` va el identificador suelto, el enlace de la barra
   * del navegador o el corto de youtu.be: pegar la URL entera es lo natural, y
   * fallar por eso sería una trampa tonta.
   */
  embed(video: string): SafeResourceUrl {
    const id = /(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(video)?.[1] ?? video.trim();
    // Angular bloquea cualquier `src` de iframe que no venga marcado. Aquí la
    // URL se construye con un identificador nuestro, no con nada que escriba
    // el visitante, así que marcarla no abre ninguna puerta.
    return this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.youtube.com/embed/${id}`);
  }
}
