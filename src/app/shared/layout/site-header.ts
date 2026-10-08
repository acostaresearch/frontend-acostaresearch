import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { CarritoService } from '../../core/services/carrito.service';
import { RecorridoWeb } from '../../core/services/recorrido-web.service';
import { TemaService } from '../../core/services/tema.service';
import { PrivadaPipe } from '../../core/router/privada.pipe';

/**
 * Cabecera del sitio. Cambia según haya sesión o no: al visitante le ofrece
 * entrar o crear cuenta, y a quien ya entró le da acceso directo a su panel.
 *
 * En móvil, los enlaces y las acciones se pliegan tras un botón de menú. Antes
 * la navegación se escondía y punto: desde un teléfono no había forma de llegar
 * a «Las 12 Skills» ni a «Artículos» si no era escribiendo la URL.
 */
@Component({
  selector: 'app-site-header',
  imports: [NgTemplateOutlet, PrivadaPipe, RouterLink, RouterLinkActive],
  templateUrl: './site-header.html',
  styleUrl: './site-header.css',
})
export class SiteHeader {
  private readonly router = inject(Router);
  private readonly recorrido = inject(RecorridoWeb);
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly auth = inject(AuthService);
  protected readonly tema = inject(TemaService);
  protected readonly carrito = inject(CarritoService);

  /** Solo cuenta en móvil: en pantalla ancha el menú está siempre desplegado. */
  readonly menuAbierto = signal(false);

  /** El desplegable «Productos» abierto con un clic (con el ratón basta pasar por encima). */
  readonly productosAbierto = signal(false);

  /** Si la página actual es uno de los productos: «Productos» se marca como activo. */
  readonly enProducto = signal(false);

  constructor() {
    // Al cambiar de página se cierra solo. Sin esto, tocar un enlace deja el
    // desplegable abierto encima de la página nueva, y quien lo ve cree que no
    // ha pasado nada.
    this.router.events
      .pipe(
        filter((evento) => evento instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.menuAbierto.set(false);
        this.productosAbierto.set(false);
        this.enProducto.set(/^\/(metodo|articulo|preparar-documento)(\/|\?|#|$)/.test(this.router.url));
      });
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

  alternarProductos(): void {
    this.productosAbierto.update((abierto) => !abierto);
  }

  cerrarProductos(): void {
    this.productosAbierto.set(false);
  }

  /** Un clic fuera de «Productos» lo cierra, como cualquier desplegable. */
  @HostListener('document:click', ['$event'])
  alPulsarFuera(evento: MouseEvent): void {
    if (!this.productosAbierto()) return;
    const productos = this.elemento.nativeElement.querySelector('.productos');
    if (productos && !productos.contains(evento.target as Node)) this.cerrarProductos();
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
