import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import { DetalleDeclaracion, MesDeclaracion, TributosService } from '../../core/services/tributos.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/** `"12.50"` → 1250. Vacío o inválido → null. */
function aCentimos(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  const limpio = String(texto).replace(',', '.').trim();
  if (!limpio) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) ? Math.round(numero * 100) : null;
}

function aSoles(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? '' : (cents / 100).toFixed(2);
}

/**
 * La declaración mensual del 621 (RER: IGV + renta 1.5 %).
 *
 * El servidor calcula cada mes con las boletas y las compras de aquí, encadena
 * el saldo a favor y avisa antes del vencimiento. SUNAT no deja presentar el
 * 621 por API: se presenta en «Declara Fácil» y aquí se marca «Ya declaré».
 */
@Component({
  selector: 'app-declaraciones-admin',
  imports: [DatePipe, FormsModule, AvisoFlotante],
  templateUrl: './declaraciones.html',
  styleUrl: './declaraciones.css',
})
export class DeclaracionesAdmin implements OnInit {
  private readonly api = inject(TributosService);
  private readonly dialogo = inject(DialogoService);

  readonly meses = signal<MesDeclaracion[]>([]);
  readonly abierto = signal<DetalleDeclaracion | null>(null);
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  // Formularios (texto en soles, como se escribe).
  vencimiento = '';
  ajuste = '';
  ajusteNota = '';
  saldoInicial = '';
  compra = { fecha: '', rucProveedor: '', razonSocial: '', serie: '', numero: '', base: '', igv: '', descripcion: '' };
  numeroOrden = '';
  igvPagado = '';
  rentaPagada = '';

  ngOnInit(): void {
    this.cargarMeses(true);
  }

  soles(cents: number | null | undefined): string {
    return `S/ ${((cents ?? 0) / 100).toFixed(2)}`;
  }

  estadoTexto(m: MesDeclaracion): string {
    if (m.estado === 'PAGADA') return 'Pagada';
    if (m.estado === 'DECLARADA') return 'Declarada';
    if (m.enCurso) return 'En curso';
    if (m.diasParaVencer !== null && m.diasParaVencer < 0) return 'Vencida';
    return 'Por declarar';
  }

  estadoClase(m: MesDeclaracion): string {
    if (m.estado !== 'PENDIENTE') return 'buena';
    if (m.enCurso) return '';
    return m.diasParaVencer !== null && m.diasParaVencer < 0 ? 'mala' : 'espera';
  }

  cargarMeses(elegir = false): void {
    this.cargando.set(true);
    this.api.meses().subscribe({
      next: (lista) => {
        this.meses.set(lista);
        this.cargando.set(false);
        if (elegir && lista.length) {
          // El mes que toca declarar: el pendiente más antiguo ya terminado; si no, el más reciente.
          const toca = [...lista].reverse().find((m) => !m.enCurso && m.estado === 'PENDIENTE') ?? lista[0];
          this.abrir(toca);
        }
      },
      error: (e) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  abrir(m: MesDeclaracion): void {
    this.api.detalle(m.anio, m.mes).subscribe({
      next: (d) => this.mostrar(d),
      error: (e) => this.error.set(mensajeDeError(e)),
    });
  }

  private mostrar(d: DetalleDeclaracion): void {
    this.abierto.set(d);
    this.vencimiento = d.vencimiento ?? '';
    this.ajuste = d.ajusteBaseCents ? aSoles(d.ajusteBaseCents) : '';
    this.ajusteNota = d.ajusteNota ?? '';
    this.saldoInicial = aSoles(d.saldoFavorInicialCents);
    this.numeroOrden = d.numeroOrden ?? '';
    this.igvPagado = aSoles(d.igvPagadoCents ?? d.calculo.igvAPagarCents);
    this.rentaPagada = aSoles(d.rentaPagadaCents ?? d.calculo.rentaCents);
    const hoy = new Date().toISOString().slice(0, 10);
    const inicio = `${d.anio}-${String(d.mes).padStart(2, '0')}-01`;
    this.compra = { ...this.compra, fecha: hoy.startsWith(inicio.slice(0, 7)) ? hoy : inicio };
  }

  /** Tras cambiar un mes, la lista también cambia (el saldo pasa al siguiente). */
  private trasGuardar(d: DetalleDeclaracion, mensaje: string): void {
    this.guardando.set(false);
    this.mostrar(d);
    this.aviso.set(mensaje);
    this.cargarMeses();
  }

  private fallo(e: unknown): void {
    this.guardando.set(false);
    this.error.set(mensajeDeError(e));
  }

  guardarDatos(): void {
    const d = this.abierto();
    if (!d) return;
    this.guardando.set(true);
    this.api
      .actualizar(d.anio, d.mes, {
        vencimiento: this.vencimiento || null,
        ajusteBaseCents: aCentimos(this.ajuste) ?? 0,
        ajusteNota: this.ajusteNota.trim() || null,
        saldoFavorInicialCents: aCentimos(this.saldoInicial),
      })
      .subscribe({ next: (r) => this.trasGuardar(r, 'Guardado.'), error: (e) => this.fallo(e) });
  }

  /** Al escribir la base, el IGV se propone al 18 %. */
  proponerIgv(): void {
    const base = aCentimos(this.compra.base);
    if (base !== null) this.compra.igv = aSoles(Math.round(base * 0.18));
  }

  agregarCompra(): void {
    const d = this.abierto();
    const base = aCentimos(this.compra.base);
    const igv = aCentimos(this.compra.igv);
    const numero = Number(this.compra.numero);
    if (!d || base === null || igv === null || !Number.isInteger(numero)) {
      this.error.set('Revisa la base, el IGV y el número de la factura.');
      return;
    }
    this.guardando.set(true);
    this.api
      .agregarCompra({
        fecha: this.compra.fecha,
        rucProveedor: this.compra.rucProveedor.trim(),
        razonSocial: this.compra.razonSocial.trim() || undefined,
        serie: this.compra.serie.trim().toUpperCase(),
        numero,
        baseCents: base,
        igvCents: igv,
        descripcion: this.compra.descripcion.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.compra = { ...this.compra, rucProveedor: '', razonSocial: '', serie: '', numero: '', base: '', igv: '', descripcion: '' };
          this.api.detalle(d.anio, d.mes).subscribe((r) => this.trasGuardar(r, 'Compra añadida.'));
        },
        error: (e) => this.fallo(e),
      });
  }

  async borrarCompra(id: string): Promise<void> {
    const d = this.abierto();
    if (!d) return;
    const si = await this.dialogo.confirmar({ titulo: 'Quitar esta compra', confirmar: 'Quitar', tono: 'peligro' });
    if (!si) return;
    this.api.borrarCompra(id).subscribe({
      next: () => this.api.detalle(d.anio, d.mes).subscribe((r) => this.trasGuardar(r, 'Compra quitada.')),
      error: (e) => this.fallo(e),
    });
  }

  async declarar(): Promise<void> {
    const d = this.abierto();
    if (!d) return;
    const si = await this.dialogo.confirmar({
      titulo: `Marcar ${d.nombre} como declarado`,
      mensaje: 'Se guarda el cálculo tal como está y dejan de llegar los avisos de este mes.',
      nota: 'Hazlo después de presentar el 621 en Declara Fácil.',
      confirmar: 'Ya declaré',
    });
    if (!si) return;
    this.guardando.set(true);
    this.api
      .declarar(d.anio, d.mes, {
        numeroOrden: this.numeroOrden.trim() || undefined,
        igvPagadoCents: aCentimos(this.igvPagado),
        rentaPagadaCents: aCentimos(this.rentaPagada),
      })
      .subscribe({ next: (r) => this.trasGuardar(r, `${d.nombre} quedó como declarado.`), error: (e) => this.fallo(e) });
  }

  async reabrir(): Promise<void> {
    const d = this.abierto();
    if (!d) return;
    const si = await this.dialogo.confirmar({
      titulo: `Reabrir ${d.nombre}`,
      mensaje: 'El cálculo vuelve a hacerse con los datos de hoy (por ejemplo, para una rectificatoria).',
      confirmar: 'Reabrir',
    });
    if (!si) return;
    this.guardando.set(true);
    this.api.reabrir(d.anio, d.mes).subscribe({ next: (r) => this.trasGuardar(r, 'Reabierto.'), error: (e) => this.fallo(e) });
  }
}
