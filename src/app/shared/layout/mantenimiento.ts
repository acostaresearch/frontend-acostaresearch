import { Component, effect, inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { FondoService } from '../../core/services/fondo.service';
import { MantenimientoService } from '../../core/services/mantenimiento.service';

/**
 * La pantalla de «estamos en mantenimiento», montada una sola vez en la raíz.
 *
 * No decide cuándo sale ni cuándo se va: eso es de `MantenimientoService`. Aquí
 * solo se enseña, y se congela lo de detrás para que nadie siga rellenando un
 * formulario que no se va a poder enviar.
 */
@Component({
  selector: 'app-mantenimiento',
  templateUrl: './mantenimiento.html',
  styleUrl: './mantenimiento.css',
})
export class Mantenimiento {
  protected readonly mantenimiento = inject(MantenimientoService);
  protected readonly whatsappUrl = environment.whatsappUrl;

  constructor() {
    const fondo = inject(FondoService);
    effect(() => fondo.fijar('mantenimiento', this.mantenimiento.activo()));

    // Para ver la pantalla sin tirar la base: `localhost:4200/?mantenimiento`.
    // Solo con `npm start`; en producción el parámetro no hace nada, o
    // cualquiera podría repartir un enlace que enseña el sitio «caído».
    if (!environment.production && new URLSearchParams(location.search).has('mantenimiento')) {
      this.mantenimiento.activar();
    }
  }
}
