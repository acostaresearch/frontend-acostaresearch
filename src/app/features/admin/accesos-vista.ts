import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input, signal, Signal } from '@angular/core';
import { Acceso } from './accesos';
import { PagosManualesAdmin } from './pagos-manuales';
import { VentasManualesAdmin } from './ventas-manuales';
import { AccionesAccesosAdmin } from './acciones-accesos';
import { Listado } from './listado';
import { FiltrosLista } from './filtros-lista';
import { PieLista } from './pie-lista';
import { MenuFila } from './menu-fila';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';
@Component({selector: 'app-accesos-vista', imports: [DatePipe, DecimalPipe, FiltrosLista, PieLista, MenuFila, AvisoFlotante], templateUrl: './accesos-vista.html', styleUrl: './accesos-vista.css'})
export class AccesosVista {
  readonly pagosManuales = input.required<PagosManualesAdmin>();
  readonly ventasManuales = input.required<VentasManualesAdmin>();
  readonly accionesAccesos = input.required<AccionesAccesosAdmin>();
  readonly listaAccesos = input.required<Listado<Acceso>>();
  readonly copiados = input.required<Signal<boolean>>();
  readonly accesos = input.required<Signal<Acceso[]>>();
  readonly importe = input.required<(cents: number | null, moneda?: string) => string>();
  readonly verLicenciasDe = input.required<(correo: string) => void>();
  readonly copiarTexto = input.required<(texto: string, que?: string) => Promise<void>>();
  /** Los cobros fallidos que se pueden quitar de la lista de una vez. */
  readonly fallidos = computed(() =>
    this.accesos()().filter((acceso) => this.accionesAccesos().esFallido(acceso)),
  );
  /** De qué venta está abierto «Editar la venta» en la ficha: al abrir otra, sale plegado. */
  readonly edicionAbierta = signal<string | null>(null);
  alternarEdicion(id: string): void {
    this.edicionAbierta.set(this.edicionAbierta() === id ? null : id);
  }
}
