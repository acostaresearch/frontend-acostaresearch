import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { ResenaService } from '../../core/services/resena.service';
import { TourService } from '../../core/services/tour.service';

/** Hasta cuándo no se vuelve a ofrecer, en milisegundos desde 1970. */
const CLAVE_APLAZADA = 'acosta.resena.aplazada';
/** «Ahora no» la aparta un mes: ni cada vez que entra ni nunca más. */
const APLAZAR_MS = 30 * 24 * 60 * 60 * 1000;
/** Una cuenta recién abierta todavía no ha probado nada que reseñar. */
const ANTIGUEDAD_MIN_MS = 3 * 24 * 60 * 60 * 1000;
/** Que primero vea su panel; el mensaje llega después, no encima de la carga. */
const ESPERA_MS = 4000;

/**
 * El mensajito que invita a dejar una reseña al entrar al perfil.
 *
 * Sale abajo a la IZQUIERDA —abajo a la derecha vive el asistente— y solo a
 * quien tiene algo que contar: que haya pagado algo o que la cuenta tenga ya
 * unos días (quien entra con un código de Yape no tiene pagos en la web). No
 * sale a quien ya escribió una, ni durante el recorrido guiado, ni durante un
 * mes después de «Ahora no». El aplazamiento vive en este navegador; si no se
 * puede guardar (ventana privada), vale para esta visita.
 *
 * El acceso fijo, para cuando sí quiera, está en la tarjeta de ayuda.
 */
@Component({
  selector: 'app-invitar-resena',
  imports: [RouterLink],
  template: `
    @if (visible()) {
      <aside class="invitar" role="dialog" aria-labelledby="invitar-resena-titulo">
        <button type="button" class="cerrar" aria-label="Cerrar" (click)="aplazar()">×</button>
        <span class="estrellas" aria-hidden="true">★★★★★</span>
        <strong id="invitar-resena-titulo">¿Te gusta nuestro servicio?</strong>
        <p>Cuéntanos cómo te fue. Tu reseña ayuda a otros tesistas a decidirse, y la leemos una por una.</p>
        <div class="acciones">
          <a class="boton" routerLink="/resenas" fragment="escribir-mi-resena" (click)="cerrar()">
            Dejar mi reseña
          </a>
          <button type="button" class="boton secundario" (click)="aplazar()">Ahora no</button>
        </div>
      </aside>
    }
  `,
  styleUrl: './invitar-resena.css',
})
export class InvitarResena implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly resenas = inject(ResenaService);
  private readonly tour = inject(TourService);

  /** Si tiene algún pago confirmado. Lo sabe el perfil, que ya los pidió. */
  readonly haComprado = input(false);

  private readonly toca = signal(false);
  private readonly cerrada = signal(false);
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  readonly visible = computed(
    () =>
      this.toca() &&
      !this.cerrada() &&
      !this.tour.activo() &&
      (this.haComprado() || this.cuentaConSolera()),
  );

  private readonly cuentaConSolera = computed(() => {
    const creada = this.auth.user()?.createdAt;
    return !!creada && Date.now() - new Date(creada).getTime() >= ANTIGUEDAD_MIN_MS;
  });

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
  }

  /** Va a escribirla: se cierra, y si no la termina vuelve a salir otro día. */
  cerrar(): void {
    this.cerrada.set(true);
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
