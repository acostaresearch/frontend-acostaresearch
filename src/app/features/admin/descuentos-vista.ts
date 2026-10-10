import { DatePipe } from '@angular/common';
import { Component, input, Signal } from '@angular/core';
import { Plan } from '../../core/models/rewrite.model';
import { FiltrosLista } from './filtros-lista';
import { PieLista } from './pie-lista';
import { MenuFila } from './menu-fila';
import { VentasMensualesVista } from './ventas-mensuales-vista';
import { DescuentosFormulario } from './descuentos-formulario';
import { DescuentosAdmin } from './descuentos-admin';
import { VentasMensualesAdmin } from './ventas-mensuales';
@Component({
  selector: 'app-descuentos-vista',
  imports: [DatePipe, FiltrosLista, PieLista, MenuFila, VentasMensualesVista, DescuentosFormulario],
  templateUrl: './descuentos-vista.html',
  styleUrl: './descuentos-vista.css',
})
export class DescuentosVista {
  readonly promociones = input.required<DescuentosAdmin>();
  readonly ventas = input.required<VentasMensualesAdmin>();
  readonly trabajando = input.required<Signal<boolean>>();
  readonly copiados = input.required<Signal<boolean>>();
  readonly planes = input.required<Signal<Plan[]>>();
  readonly importe = input.required<(cents: number | null) => string>();
}
