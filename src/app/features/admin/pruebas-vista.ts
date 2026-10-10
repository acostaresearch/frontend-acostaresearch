import { DatePipe } from '@angular/common';
import { Component, input, Signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FiltrosLista } from './filtros-lista';
import { PieLista } from './pie-lista';
import { MenuFila } from './menu-fila';
import { PruebasConectorAdmin } from './pruebas-conector';
@Component({
  selector: 'app-pruebas-vista',
  imports: [DatePipe, ReactiveFormsModule, FiltrosLista, PieLista, MenuFila],
  templateUrl: './pruebas-vista.html',
  styleUrl: './pruebas-vista.css',
})
export class PruebasVista {
  readonly pruebasConector = input.required<PruebasConectorAdmin>();
  readonly trabajando = input.required<Signal<boolean>>();
}
