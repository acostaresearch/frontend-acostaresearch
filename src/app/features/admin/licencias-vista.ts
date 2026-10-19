import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, effect, input, untracked } from '@angular/core';
import { LicenciaAdmin } from '../../core/models/admin.model';
import { AccionesAccesosAdmin } from './acciones-accesos';
import { MenuFila } from './menu-fila';
/** Las licencias de una cuenta, desplegadas bajo su fila en «Usuarios». */
@Component({selector: 'app-licencias-vista', imports: [DatePipe, DecimalPipe, MenuFila], templateUrl: './licencias-vista.html', styleUrl: './licencias-vista.css'})
export class LicenciasVista {
  readonly accionesAccesos = input.required<AccionesAccesosAdmin>();
  readonly licencias = input.required<LicenciaAdmin[]>();
  readonly estadoLicencia = input.required<(estado: string) => string>();

  constructor() {
    // El historial de cada licencia se enseña debajo de ella, sin pulsar nada.
    effect(() => {
      const licencias = this.licencias();
      const acciones = this.accionesAccesos();
      untracked(() => acciones.cargarHistoriales(licencias));
    });
  }
}
