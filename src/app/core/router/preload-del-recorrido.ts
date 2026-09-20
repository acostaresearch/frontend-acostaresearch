import { Injectable, inject } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

import { TourService } from '../services/tour.service';

/**
 * Descarga las páginas por adelantado, pero SOLO durante el recorrido guiado.
 *
 * El recorrido cruza diez páginas seguidas, y cada una es un trozo de código
 * que el navegador no tiene todavía: entre pulsar «Siguiente» y ver el paso
 * había una pausa por cada salto. Con esto, en cuanto el recorrido arranca se
 * van trayendo todas en segundo plano y los saltos salen instantáneos.
 *
 * Y solo entonces. Precargarlo todo siempre le costaría a cualquier visitante
 * —incluido el que entra desde un teléfono con datos— la descarga del panel de
 * administración entero para leer la portada.
 */
@Injectable({ providedIn: 'root' })
export class PreloadDelRecorrido implements PreloadingStrategy {
  private readonly tour = inject(TourService);

  preload(_ruta: Route, cargar: () => Observable<unknown>): Observable<unknown> {
    return this.tour.activo() ? cargar() : of(null);
  }
}
