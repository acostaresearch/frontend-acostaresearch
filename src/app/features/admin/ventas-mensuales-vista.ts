import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';
import { VentasMensualesAdmin } from './ventas-mensuales';
import { soles } from './resumen-ingresos';

@Component({
  selector: 'app-ventas-mensuales-vista',
  imports: [DatePipe, AvisoFlotante],
  templateUrl: './ventas-mensuales-vista.html',
  styleUrls: ['./ventana-admin.css', './ventas-mensuales-vista.css'],
})
export class VentasMensualesVista {
  readonly ventas = input.required<VentasMensualesAdmin>();
  readonly soles = soles;
}
