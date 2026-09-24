import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { FondoService } from '../../core/services/fondo.service';
import { ResenaEmergenteService } from '../../core/services/resena-emergente.service';
import { ResenaService } from '../../core/services/resena.service';
import { MiResenaDelServicio } from './mi-resena';

/**
 * El emergente que invita a dejar una reseña, al entrar al perfil.
 *
 * Una tarjeta flotante fija arriba a la derecha, debajo de la cabecera: se
 * queda a la vista al desplazarse. Sale a quien todavía no ha escrito ninguna
 * reseña. La × la quita solo para esta vista: al recargar vuelve a salir, a
 * pedido del dueño. «Dejar mi reseña» abre `app-ventana-resena` sin salir
 * del panel.
 */
@Component({
  selector: 'app-invitar-resena',
  template: `
    @if (visible()) {
      <aside class="emergente" role="dialog" aria-labelledby="invitar-resena-titulo">
        <button
          type="button"
          class="cerrar"
          title="Quitar este aviso"
          aria-label="Quitar este aviso"
          (click)="cerrada.set(true)"
        >
          ×
        </button>
        <span class="estrellas" aria-hidden="true">★★★★★</span>
        <strong id="invitar-resena-titulo">¿Te gusta nuestro servicio?</strong>
        <p>Déjanos una buena reseña: ayuda a otros tesistas a decidirse.</p>
        <button type="button" class="boton" (click)="escribir()">Dejar mi reseña</button>
      </aside>
    }
  `,
  styleUrl: './invitar-resena.css',
})
export class InvitarResena implements OnInit {
  private readonly resenas = inject(ResenaService);
  private readonly emergente = inject(ResenaEmergenteService);

  private readonly toca = signal(false);
  readonly cerrada = signal(false);

  readonly visible = computed(() => this.toca() && !this.cerrada());

  ngOnInit(): void {
    this.resenas.mias().subscribe({
      next: (mias) => this.toca.set(mias.length === 0),
      // Sin saber si ya escribió una, mejor no molestar.
      error: () => this.toca.set(false),
    });
  }

  /** Abre el formulario; el emergente se va hasta la próxima vez que entre. */
  escribir(): void {
    this.cerrada.set(true);
    this.emergente.abrir();
  }
}

/**
 * La ventana emergente con el formulario: el mismo `app-mi-resena` de
 * /resenas, sin salir del panel. Se cierra con la ×, con Escape o fuera.
 */
@Component({
  selector: 'app-ventana-resena',
  imports: [MiResenaDelServicio],
  template: `
    @if (emergente.abierta()) {
      <div class="ventana-fondo" aria-hidden="true" (click)="emergente.cerrar()"></div>
      <div class="ventana" role="dialog" aria-modal="true" aria-labelledby="ventana-resena-titulo">
        <div class="ventana-cabecera">
          <div>
            <span class="estrellas" aria-hidden="true">★★★★★</span>
            <h2 id="ventana-resena-titulo">Tu reseña del servicio</h2>
          </div>
          <button type="button" class="cerrar" aria-label="Cerrar" (click)="emergente.cerrar()">
            ×
          </button>
        </div>
        <app-mi-resena />
      </div>
    }
  `,
  styleUrl: './invitar-resena.css',
})
export class VentanaResena implements OnDestroy {
  private readonly fondo = inject(FondoService);
  readonly emergente = inject(ResenaEmergenteService);

  constructor() {
    // Con la ventana delante, la página de debajo no se mueve.
    effect(() => this.fondo.fijar('resena', this.emergente.abierta()));
  }

  ngOnDestroy(): void {
    this.emergente.cerrar();
  }

  @HostListener('document:keydown.escape')
  cerrar(): void {
    this.emergente.cerrar();
  }
}
