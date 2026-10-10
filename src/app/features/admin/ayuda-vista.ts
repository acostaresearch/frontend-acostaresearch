import { Component, input, Signal } from '@angular/core';
import { Seccion } from './navegacion';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FiltrosLista } from './filtros-lista';
import { PieLista } from './pie-lista';
import { MenuFila } from './menu-fila';
import { ContenidoAyudaAdmin } from './contenido-ayuda';

@Component({
  selector: 'app-ayuda-vista',
  imports: [ReactiveFormsModule, RouterLink, FiltrosLista, PieLista, MenuFila],
  templateUrl: './ayuda-vista.html',
  styleUrl: './ayuda-vista.css',
})
export class AyudaVista {
  readonly ayuda = input.required<ContenidoAyudaAdmin>();
  readonly seccion = input.required<Signal<Seccion>>();
  readonly direccion = input.required<(seccion: Seccion) => string>();
}
