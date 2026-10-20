import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AnaliticaService } from './core/services/analitica.service';
import { MantenimientoService } from './core/services/mantenimiento.service';
import { Asistente } from './shared/layout/asistente';
import { AvisoCookies } from './shared/layout/aviso-cookies';
import { Avisos } from './shared/layout/avisos';
import { Dialogo } from './shared/layout/dialogo';
import { Mantenimiento } from './shared/layout/mantenimiento';
import { Tour } from './shared/layout/tour';

@Component({
  imports: [Asistente, AvisoCookies, Avisos, Dialogo, Mantenimiento, RouterOutlet, Tour],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly mantenimiento = inject(MantenimientoService);

  constructor() {
    // Mide solo si la persona aceptó el aviso de cookies en una visita anterior.
    inject(AnaliticaService).iniciar();
  }
}
