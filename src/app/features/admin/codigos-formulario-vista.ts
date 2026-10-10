import { Component, input, Signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { VentasManualesAdmin } from './ventas-manuales';

@Component({
  selector: 'app-codigos-formulario-vista',
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './codigos-formulario-vista.html',
  styleUrl: './codigos-formulario-vista.css',
})
export class CodigosFormulario {
  readonly ventasManuales = input.required<VentasManualesAdmin>();
  readonly trabajando = input.required<Signal<boolean>>();
  readonly metodos = input.required<readonly string[]>();
}
