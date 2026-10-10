import { PagosManualesAdmin } from './pagos-manuales';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Seccion } from './navegacion';
import { ResumenIngresosAdmin } from './resumen-ingresos';
import { VentasMensualesAdmin } from './ventas-mensuales';
@Component({
  selector: 'app-resumen-vista',
  imports: [RouterLink],
  templateUrl: './resumen-vista.html',
  styleUrl: './resumen-vista.css',
})
export class ResumenVista {
  readonly pagosManuales = input.required<PagosManualesAdmin>();
  readonly resumen = input.required<ResumenIngresosAdmin>();
  readonly ventas = input.required<VentasMensualesAdmin>();
  readonly direccion = input.required<(seccion: Seccion) => string>();
}
