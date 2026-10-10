import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, input, Signal } from '@angular/core';
import { LicenciaAdmin } from '../../core/models/admin.model';
import { AccionesAccesosAdmin } from './acciones-accesos';
import { Listado } from './listado';
import { FiltrosLista } from './filtros-lista';
import { PieLista } from './pie-lista';
import { MenuFila } from './menu-fila';
@Component({selector: 'app-licencias-vista', imports: [DatePipe, DecimalPipe, FiltrosLista, PieLista, MenuFila], templateUrl: './licencias-vista.html', styleUrl: './licencias-vista.css'})
export class LicenciasVista {
  readonly accionesAccesos = input.required<AccionesAccesosAdmin>();
  readonly listaLicencias = input.required<Listado<LicenciaAdmin>>();
  readonly licencias = input.required<Signal<LicenciaAdmin[]>>();
  readonly estadoLicencia = input.required<(estado: string) => string>();
  readonly verAccesosDe = input.required<(correo: string) => void>();
  readonly copiarTexto = input.required<(texto: string, que?: string) => Promise<void>>();
}
