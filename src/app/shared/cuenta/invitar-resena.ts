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

/** Hasta cuándo no se vuelve a ofrecer, en milisegundos desde 1970. */
const CLAVE_APLAZADA = 'acosta.resena.aplazada';
/** La × la aparta un mes: ni cada vez que entra ni nunca más. */
const APLAZAR_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * La banda que invita a dejar una reseña, arriba del perfil.
 *
 * Una línea de texto como el saludo de la portada, dentro de la barra pegajosa
 * del perfil para que baje con la cabecera al desplazarse. Sale a quien todavía
 * no ha escrito ninguna reseña; la × la quita un mes en este navegador (en una
 * ventana privada, para la visita). «Dejar mi reseña» abre `app-ventana-resena`
 * sin salir del panel.
 */
@Component({
  selector: 'app-invitar-resena',
  template: `
    @if (visible()) {
      <div class="banda" role="note">
        <p>
          <span class="estrella" aria-hidden="true">★</span>
          <b>¿Te gusta nuestro servicio?</b> Déjanos una buena reseña: ayuda a otros tesistas a
          decidirse.
        </p>
        <button type="button" class="enlace" (click)="escribir()">Dejar mi reseña</button>
        <button type="button" class="cerrar" aria-label="Quitar este aviso" (click)="aplazar()">
          ×
        </button>
      </div>
    }
  `,
  styleUrl: './invitar-resena.css',
})
export class InvitarResena implements OnInit {
  private readonly resenas = inject(ResenaService);
  private readonly emergente = inject(ResenaEmergenteService);

  private readonly toca = signal(false);
  private readonly cerrada = signal(false);

  readonly visible = computed(() => this.toca() && !this.cerrada());

  ngOnInit(): void {
    if (aplazadaHasta() > Date.now()) return;

    this.resenas.mias().subscribe({
      next: (mias) => this.toca.set(mias.length === 0),
      // Sin saber si ya escribió una, mejor no molestar.
      error: () => this.toca.set(false),
    });
  }

  /** Abre el formulario; la banda se va y, si no la termina, vuelve otro día. */
  escribir(): void {
    this.cerrada.set(true);
    this.emergente.abrir();
  }

  aplazar(): void {
    this.cerrada.set(true);
    try {
      localStorage.setItem(CLAVE_APLAZADA, String(Date.now() + APLAZAR_MS));
    } catch {
      // Almacenamiento bloqueado: vale para esta visita.
    }
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

function aplazadaHasta(): number {
  try {
    return Number(localStorage.getItem(CLAVE_APLAZADA)) || 0;
  } catch {
    return 0;
  }
}
