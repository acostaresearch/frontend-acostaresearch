import { Injectable, signal } from '@angular/core';

/**
 * La ventana emergente de «Escribir mi reseña» del perfil.
 *
 * La pinta `app-invitar-resena`; la abren su propio mensajito y el acceso de
 * la tarjeta «¿Necesitas ayuda?», que vive en otro componente.
 */
@Injectable({ providedIn: 'root' })
export class ResenaEmergenteService {
  readonly abierta = signal(false);

  abrir(): void {
    this.abierta.set(true);
  }

  cerrar(): void {
    this.abierta.set(false);
  }
}
