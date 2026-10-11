import { Component, ElementRef, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { TROPIEZOS } from '../../shared/contenido/tutoriales';
import { SalaDeVideos } from '../../shared/cuenta/sala-de-videos';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';
import { PrivadaPipe } from '../../core/router/privada.pipe';

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
 * El reproductor y la lista son `SalaDeVideos` (en `shared`), que desde el
 * 11-oct también se pone en el perfil al lado de «Por dónde vas».
 */
@Component({
  selector: 'app-tutoriales',
  imports: [PrivadaPipe, RouterLink, SalaDeVideos, SiteHeader, SiteFooter],
  templateUrl: './tutoriales.html',
  styleUrl: './tutoriales.css',
})
export class Tutoriales {
  private readonly fallas = viewChild<ElementRef<HTMLElement>>('fallas');

  readonly whatsappUrl = environment.whatsappUrl;

  // Los tropiezos siguen en código: es texto que cambia cuando cambia el
  // producto, no cuando se graba un video, y no hay nadie esperando para
  // editarlos sin desplegar.
  readonly tropiezos = TROPIEZOS;

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
}
