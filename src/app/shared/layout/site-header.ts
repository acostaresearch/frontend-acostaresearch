import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

/**
 * Cabecera del sitio. Cambia según haya sesión o no: al visitante le ofrece
 * entrar o crear cuenta, y a quien ya entró le da acceso directo a su panel.
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

  readonly menuAbierto = { valor: false };

  salir(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.router.navigate(['/']),
    });
  }
}
