import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { Guia, GuiaService } from '../../core/services/guia.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Lo que pinta cada tarjeta: su ficha y adónde lleva la descarga. */
interface Tarjeta {
  titulo: string;
  descripcion: string;
  enlace: string;
  peso: string | null;
}

/**
 * Las guías en PDF, para elegir cuál descargar.
 *
 * Es la hermana de /tutoriales: allí los videos, aquí lo que se lee. Pública
 * por lo mismo —la alcanza quien compró y no ha vuelto a entrar— y porque la
 * descarga ya lo era.
 *
 * Las guías se suben desde el panel (Tutoriales → Guías en PDF). Mientras no
 * haya ninguna, sale la de siempre, la que enlaza el correo de compra, para que
 * la página nunca quede vacía el día que se despliega.
 */
@Component({
  selector: 'app-guias',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './guias.html',
  styleUrl: './guias.css',
})
export class Guias implements OnInit {
  private readonly api = inject(GuiaService);

  readonly whatsappUrl = environment.whatsappUrl;
  readonly cargando = signal(true);
  readonly tarjetas = signal<Tarjeta[]>([]);

  ngOnInit(): void {
    this.api.publicas().subscribe({
      next: (lista) => {
        this.tarjetas.set(lista.length > 0 ? lista.map((g) => this.tarjeta(g)) : this.deSiempre());
        this.cargando.set(false);
      },
      error: () => {
        this.tarjetas.set(this.deSiempre());
        this.cargando.set(false);
      },
    });
  }

  private tarjeta(guia: Guia): Tarjeta {
    return {
      titulo: guia.titulo,
      descripcion: guia.descripcion,
      enlace: this.api.enlace(guia),
      peso: this.peso(guia.bytes),
    };
  }

  /** La guía que había antes del panel, si el build la encontró. */
  private deSiempre(): Tarjeta[] {
    if (!environment.guiaUrl) return [];
    return [
      {
        titulo: 'Guía de instalación',
        descripcion: 'Cómo conectarlo a Claude, paso a paso y con capturas.',
        enlace: environment.guiaUrl,
        peso: null,
      },
    ];
  }

  /** «1,2 MB», para saber si conviene bajarla con datos del móvil. */
  private peso(bytes: number): string | null {
    if (!bytes) return null;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }
}
