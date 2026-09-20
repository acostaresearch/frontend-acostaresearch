import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { RecorridoWeb } from '../../core/services/recorrido-web.service';
import { TemaService } from '../../core/services/tema.service';

/**
 * Cabecera del sitio. Cambia según haya sesión o no: al visitante le ofrece
 * entrar o crear cuenta, y a quien ya entró le da acceso directo a su panel.
 *
 * En móvil, los enlaces y las acciones se pliegan tras un botón de menú. Antes
 * la navegación se escondía y punto: desde un teléfono no había forma de llegar
 * a «Las 11 Skills» ni a «Artículos» si no era escribiendo la URL.
 */
@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './site-header.html',
  styleUrl: './site-header.css',
})
export class SiteHeader {
  private readonly router = inject(Router);
  private readonly recorrido = inject(RecorridoWeb);
  protected readonly auth = inject(AuthService);
  protected readonly tema = inject(TemaService);

  /** Solo cuenta en móvil: en pantalla ancha el menú está siempre desplegado. */
  readonly menuAbierto = signal(false);

  constructor() {
    // Al cambiar de página se cierra solo. Sin esto, tocar un enlace deja el
    // desplegable abierto encima de la página nueva, y quien lo ve cree que no
    // ha pasado nada.
    this.router.events
      .pipe(
        filter((evento) => evento instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuAbierto.set(false));
  }

  /**
   * El recorrido guiado, empezando por ESTA página. Ver `RecorridoWeb`.
   *
   * Si el menú de móvil estaba desplegado, se cierra: tapa media pantalla, que
   * es justo lo que el recorrido va a señalar.
   */
  verElRecorrido(): void {
    this.menuAbierto.set(false);
    this.recorrido.empezarAqui();
  }

  alternarMenu(): void {
    this.menuAbierto.update((abierto) => !abierto);
  }

  cerrarMenu(): void {
    this.menuAbierto.set(false);
  }

  salir(): void {
    this.cerrarMenu();
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.router.navigate(['/']),
    });
  }
}
