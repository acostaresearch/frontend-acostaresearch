import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';

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
  protected readonly auth = inject(AuthService);

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
