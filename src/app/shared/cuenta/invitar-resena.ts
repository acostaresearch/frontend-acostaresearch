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
import { TourService } from '../../core/services/tour.service';
import { MiResenaDelServicio } from './mi-resena';

/** Hasta cuándo no se vuelve a ofrecer, en milisegundos desde 1970. */
const CLAVE_APLAZADA = 'acosta.resena.aplazada';
/** «Ahora no» la aparta un mes: ni cada vez que entra ni nunca más. */
const APLAZAR_MS = 30 * 24 * 60 * 60 * 1000;
/** Que primero vea su panel; el mensaje llega después, no encima de la carga. */
const ESPERA_MS = 2500;

/**
 * La reseña dentro del perfil: el mensajito que la ofrece al entrar y la
 * ventana emergente con el formulario.
 *
 * El mensajito sale abajo a la IZQUIERDA —abajo a la derecha vive el
 * asistente— a quien todavía no ha escrito ninguna. No sale durante el
 * recorrido guiado ni durante un mes después de «Ahora no» (en este
 * navegador; en una ventana privada vale para la visita).
 *
 * La ventana es el mismo `app-mi-resena` de /resenas, sin salir del panel:
 * mandarlo a otra página a buscar el formulario perdía gente por el camino.
 * También la abre el acceso de la tarjeta «¿Necesitas ayuda?».
 */
@Component({
  selector: 'app-invitar-resena',
  imports: [MiResenaDelServicio],
  templateUrl: './invitar-resena.html',
  styleUrl: './invitar-resena.css',
})
export class InvitarResena implements OnInit, OnDestroy {
  private readonly resenas = inject(ResenaService);
  private readonly tour = inject(TourService);
  private readonly fondo = inject(FondoService);
  readonly emergente = inject(ResenaEmergenteService);

  private readonly toca = signal(false);
  private readonly cerrada = signal(false);
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  readonly visible = computed(
    () => this.toca() && !this.cerrada() && !this.tour.activo() && !this.emergente.abierta(),
  );

  constructor() {
    // Con la ventana delante, la página de debajo no se mueve.
    effect(() => this.fondo.fijar('resena', this.emergente.abierta()));
  }

  ngOnInit(): void {
    if (aplazadaHasta() > Date.now()) return;

    this.temporizador = setTimeout(() => {
      this.resenas.mias().subscribe({
        next: (mias) => this.toca.set(mias.length === 0),
        // Sin saber si ya escribió una, mejor no molestar.
        error: () => this.toca.set(false),
      });
    }, ESPERA_MS);
  }

  ngOnDestroy(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.emergente.cerrar();
  }

  @HostListener('document:keydown.escape')
  cerrarVentana(): void {
    this.emergente.cerrar();
  }

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

function aplazadaHasta(): number {
  try {
    return Number(localStorage.getItem(CLAVE_APLAZADA)) || 0;
  } catch {
    return 0;
  }
}
