import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Una casilla del 621 con su monto en soles enteros. `casilla` null = sin número fijo. */
export interface CasillaDeclaracion {
  casilla: string | null;
  texto: string;
  soles: number;
}

export interface CalculoDeclaracion {
  ventas: { boletas: number; notas: number; baseCents: number; igvCents: number; ajusteBaseCents: number };
  compras: { cantidad: number; baseCents: number; igvCents: number };
  saldoAnteriorCents: number;
  igvAPagarCents: number;
  saldoSiguienteCents: number;
  rentaCents: number;
  totalAPagarCents: number;
  casillas: CasillaDeclaracion[];
}

export type EstadoDeclaracion = 'PENDIENTE' | 'DECLARADA' | 'PAGADA';

export interface MesDeclaracion {
  anio: number;
  mes: number;
  nombre: string;
  enCurso: boolean;
  estado: EstadoDeclaracion;
  /** `aaaa-mm-dd`. */
  vencimiento: string | null;
  diasParaVencer: number | null;
  ajusteBaseCents: number;
  ajusteNota: string | null;
  saldoFavorInicialCents: number | null;
  numeroOrden: string | null;
  igvPagadoCents: number | null;
  rentaPagadaCents: number | null;
  declaradaEn: string | null;
  calculo: CalculoDeclaracion;
}

export interface CompraRegistrada {
  id: string;
  fecha: string;
  rucProveedor: string;
  razonSocial: string | null;
  serie: string;
  numero: number;
  baseCents: number;
  igvCents: number;
  descripcion: string | null;
  /** FACTURA (proveedor peruano) o EXTRANJERO (su IGV se paga con el 1662). */
  tipo: 'FACTURA' | 'EXTRANJERO';
  /** N.º de factura o recibo del proveedor extranjero. */
  documento: string | null;
  monedaOriginal: 'USD' | 'PEN' | null;
  importeOriginalCents: number | null;
  tipoCambio: string | number | null;
  ordenPago: string | null;
  /** Día en que se pagó su IGV con el 1662; null = aún no. */
  igvPagadoEn: string | null;
}

export interface DetalleDeclaracion extends MesDeclaracion {
  compras: CompraRegistrada[];
  /** Compras del extranjero cuyo IGV falta pagar con el 1662 (de cualquier mes). */
  porPagar1662: CompraRegistrada[];
}

/** Un servicio de un proveedor del extranjero (Claude, Google, Canva…). */
export interface NuevaCompraExtranjera {
  tipo: 'EXTRANJERO';
  fecha: string;
  razonSocial: string;
  documento: string;
  monedaOriginal: 'USD' | 'PEN';
  importeOriginalCents: number;
  tipoCambio?: number;
  ordenPago?: string;
  igvPagadoEn?: string;
  descripcion?: string;
}

export interface NuevaCompra {
  tipo?: 'FACTURA';
  fecha: string;
  rucProveedor: string;
  razonSocial?: string;
  serie: string;
  numero: number;
  baseCents: number;
  igvCents: number;
  descripcion?: string;
}

/** La declaración mensual del 621 (RER) en el panel. Solo ADMIN. */
@Injectable({ providedIn: 'root' })
export class TributosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/tributos`;

  meses(): Observable<MesDeclaracion[]> {
    return this.http.get<ApiResponse<{ meses: MesDeclaracion[] }>>(`${this.base}/meses`).pipe(map((r) => r.data.meses));
  }

  detalle(anio: number, mes: number): Observable<DetalleDeclaracion> {
    return this.http.get<ApiResponse<DetalleDeclaracion>>(`${this.base}/meses/${anio}/${mes}`).pipe(map((r) => r.data));
  }

  actualizar(
    anio: number,
    mes: number,
    datos: { vencimiento?: string | null; ajusteBaseCents?: number; ajusteNota?: string | null; saldoFavorInicialCents?: number | null },
  ): Observable<DetalleDeclaracion> {
    return this.http
      .patch<ApiResponse<DetalleDeclaracion>>(`${this.base}/meses/${anio}/${mes}`, datos)
      .pipe(map((r) => r.data));
  }

  declarar(
    anio: number,
    mes: number,
    datos: { numeroOrden?: string; igvPagadoCents?: number | null; rentaPagadaCents?: number | null },
  ): Observable<DetalleDeclaracion> {
    return this.http
      .post<ApiResponse<DetalleDeclaracion>>(`${this.base}/meses/${anio}/${mes}/declarar`, datos)
      .pipe(map((r) => r.data));
  }

  reabrir(anio: number, mes: number): Observable<DetalleDeclaracion> {
    return this.http
      .post<ApiResponse<DetalleDeclaracion>>(`${this.base}/meses/${anio}/${mes}/reabrir`, {})
      .pipe(map((r) => r.data));
  }

  agregarCompra(compra: NuevaCompra | NuevaCompraExtranjera): Observable<void> {
    return this.http.post<unknown>(`${this.base}/compras`, compra).pipe(map(() => undefined));
  }

  /** «Ya pagué el IGV con el 1662» de una compra del extranjero. */
  pagar1662(id: string, datos: { ordenPago?: string; fecha: string; igvCents?: number }): Observable<void> {
    return this.http.post<unknown>(`${this.base}/compras/${id}/pago-1662`, datos).pipe(map(() => undefined));
  }

  borrarCompra(id: string): Observable<void> {
    return this.http.delete<unknown>(`${this.base}/compras/${id}`).pipe(map(() => undefined));
  }
}
