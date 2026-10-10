import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  loQueLeToca,
  nombreDeProducto,
  pestanaElegida,
  pestanasDeProducto,
  saleEn,
} from '../../shared/contenido/productos-de-ayuda';
import { AuthService } from '../../core/services/auth.service';
import { TutorialService } from '../../core/services/tutorial.service';
import { Guia, GuiaService } from '../../core/services/guia.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Lo que pinta cada tarjeta: su ficha y adónde lleva la descarga. */
interface Tarjeta {
  titulo: string;
  descripcion: string;
  enlace: string;
  peso: string | null;
  /** A qué productos sirve. Vacío = a todos. */
  productos: string[];
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
  private readonly auth = inject(AuthService);
  private readonly ayuda = inject(TutorialService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly whatsappUrl = environment.whatsappUrl;
  readonly cargando = signal(true);

  /** Todas las publicadas, de todos los productos. */
  private readonly publicadas = signal<Tarjeta[]>([]);

  /**
   * Por producto, igual que los videos (ver `tutoriales.ts`): cada guía dice a
   * cuáles sirve y la que no dice ninguno sale en todos. Con sesión y algo
   * comprado, solo las de lo comprado; el visitante y el administrador, todas.
   * Pestañas solo con dos productos o más, siempre una marcada, y la elegida va
   * en la dirección (`?producto=tsp`).
   */
  private readonly mios = signal<string[] | null>(null);
  private readonly pedido = signal<string | null>(null);

  private readonly visibles = computed(() => loQueLeToca(this.publicadas(), this.mios()));

  readonly pestanas = computed(() => {
    const mios = this.mios();
    return pestanasDeProducto(this.visibles()).filter((p) => !mios || mios.includes(p.codigo));
  });

  readonly producto = computed(() => pestanaElegida(this.pestanas(), this.pedido()));

  /** Los nombres de lo que compró. Vacío si ve todo. */
  readonly deLoTuyo = computed(() => (this.mios() ?? []).map(nombreDeProducto).join(' · '));

  /** Lo que se ve: lo de la pestaña elegida más lo que es de todos. */
  readonly tarjetas = computed(() => {
    const producto = this.producto();
    const lista = this.visibles();
    return producto ? lista.filter((t) => saleEn(t.productos, producto)) : lista;
  });

  ngOnInit(): void {
    // Sin lista del servidor sale la guía de siempre, para no dejar la página vacía.
    const guias = this.api.publicas().pipe(
      map((lista) => (lista.length > 0 ? lista.map((g) => this.tarjeta(g)) : this.deSiempre())),
      catchError(() => of(this.deSiempre())),
    );
    forkJoin({
      guias,
      mios: this.auth.isAuthenticated() ? this.ayuda.misProductos() : of(null),
    }).subscribe(({ guias, mios }) => {
      this.mios.set(mios);
      this.publicadas.set(guias);
      this.pedido.set(this.ruta.snapshot.queryParamMap.get('producto'));
      this.cargando.set(false);
    });
  }

  /** Cambia de producto y lo deja en la dirección. */
  elegirProducto(codigo: string): void {
    if (!this.pestanas().some((p) => p.codigo === codigo)) return;
    this.pedido.set(codigo);
    void this.router.navigate([], {
      relativeTo: this.ruta,
      queryParams: { producto: codigo },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private tarjeta(guia: Guia): Tarjeta {
    return {
      titulo: guia.titulo,
      descripcion: guia.descripcion,
      enlace: this.api.enlace(guia),
      peso: this.peso(guia.bytes),
      productos: guia.productos,
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
        productos: [],
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
