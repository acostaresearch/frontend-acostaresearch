import { Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { Plan } from '../../core/models/rewrite.model';
import { DescuentosAdmin } from './descuentos-admin';

@Component({
  selector: 'app-descuentos-formulario',
  imports: [ReactiveFormsModule],
  templateUrl: './descuentos-formulario.html',
  styleUrls: ['./ventana-admin.css', './descuentos-formulario.css'],
})
export class DescuentosFormulario {
  readonly promociones = input.required<DescuentosAdmin>();
  readonly planes = input.required<Plan[]>();
  readonly trabajando = input.required<boolean>();
}
