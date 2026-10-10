import { Component, input, Signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FiltrosLista } from './filtros-lista';
import { PieLista } from './pie-lista';
import { MenuFila } from './menu-fila';
import { ProductosAdmin } from './productos-admin';
@Component({
  selector: 'app-productos-vista',
  imports: [ReactiveFormsModule, FiltrosLista, PieLista, MenuFila],
  templateUrl: './productos-vista.html',
  styleUrl: './productos-vista.css',
})
export class ProductosVista {
  readonly productos = input.required<ProductosAdmin>();
  readonly trabajando = input.required<Signal<boolean>>();
}
