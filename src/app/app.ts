import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { MantenimientoService } from './core/services/mantenimiento.service';
import { Dialogo } from './shared/layout/dialogo';
import { Mantenimiento } from './shared/layout/mantenimiento';

@Component({
  imports: [Dialogo, Mantenimiento, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly mantenimiento = inject(MantenimientoService);
}
