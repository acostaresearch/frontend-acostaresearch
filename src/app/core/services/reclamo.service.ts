import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

export type TipoDeHoja = 'RECLAMO' | 'QUEJA';
export type TipoDeDocumento = 'DNI' | 'CE' | 'PASAPORTE';
export type TipoDeBien = 'PRODUCTO' | 'SERVICIO';

export const NOMBRE_DEL_TIPO: Record<TipoDeHoja, string> = { RECLAMO: 'Reclamo', QUEJA: 'Queja' };
export const NOMBRE_DEL_BIEN: Record<TipoDeBien, string> = {
  PRODUCTO: 'Producto',
  SERVICIO: 'Servicio',
};
export const NOMBRE_DEL_DOCUMENTO: Record<TipoDeDocumento, string> = {
  DNI: 'DNI',
  CE: 'Carné de extranjería',
  PASAPORTE: 'Pasaporte',
};

/** Quién responde. Encabeza cada hoja. */
export interface Proveedor {
  razonSocial: string;
  /** Nulo mientras no esté configurado en el servidor. */
  ruc: string | null;
  domicilio: string;
}

/** Lo que se manda al presentar una hoja. */
export interface ReclamoEnvio {
  tipo: TipoDeHoja;
  nombre: string;
  tipoDocumento: TipoDeDocumento;
  numeroDocumento: string;
  domicilio: string;
  telefono: string;
  email: string;
  menorDeEdad: boolean;
  apoderado: string;
  tipoBien: TipoDeBien;
  /** En soles. Nulo = no reclama un importe. */
  montoReclamado: number | null;
  descripcionBien: string;
  detalle: string;
  pedido: string;
}

/** Una hoja ya registrada, tal como la devuelve el servidor. */
export interface Reclamo {
  numero: number;
  /** «000000001-2026». */
  codigo: string;
  tipo: TipoDeHoja;
  nombre: string;
  tipoDocumento: TipoDeDocumento;
  numeroDocumento: string;
  domicilio: string;
  telefono: string | null;
  email: string;
  apoderado: string | null;
  tipoBien: TipoDeBien;
  montoReclamado: number | null;
  descripcionBien: string;
  detalle: string;
  pedido: string;
  fechaLimite: string;
  createdAt: string;
  respuesta: string | null;
  respondidoAt: string | null;
  respondido: boolean;
}

/**
 * Una fecha como la lee quien está en Perú.
 *
 * Con la zona de Lima fija y no la del navegador: el plazo legal se cuenta en
 * Lima, y quien abre la hoja desde otro país tiene que ver la misma fecha límite
 * que le llegó por correo.
 */
export function fechaEnLima(iso: string, conHora = false): string {
  try {
    return new Date(iso).toLocaleString('es-PE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
      timeZone: 'America/Lima',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

export function soles(importe: number | null): string {
  return importe === null ? '' : `S/ ${importe.toFixed(2)}`;
}

@Injectable({ providedIn: 'root' })
export class ReclamoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/reclamos`;

  /** Público: los datos del proveedor. */
  proveedor(): Observable<Proveedor> {
    return this.http
      .get<ApiResponse<{ proveedor: Proveedor }>>(`${this.base}/proveedor`)
      .pipe(map((res) => res.data.proveedor));
  }

  /** Público: presentar una hoja. Devuelve la hoja registrada, para imprimirla. */
  registrar(datos: ReclamoEnvio): Observable<{ reclamo: Reclamo; correoEnviado: boolean }> {
    return this.http
      .post<ApiResponse<{ reclamo: Reclamo; correoEnviado: boolean }>>(this.base, datos)
      .pipe(map((res) => res.data));
  }

  /** Panel: todas, la más reciente primero. */
  listar(): Observable<Reclamo[]> {
    return this.http
      .get<ApiResponse<{ reclamos: Reclamo[] }>>(this.base)
      .pipe(map((res) => res.data.reclamos));
  }

  /** Panel: la respuesta. Una sola vez por hoja. */
  responder(
    numero: number,
    respuesta: string,
  ): Observable<{ reclamo: Reclamo; correoEnviado: boolean }> {
    return this.http
      .post<
        ApiResponse<{ reclamo: Reclamo; correoEnviado: boolean }>
      >(`${this.base}/${numero}/respuesta`, { respuesta })
      .pipe(map((res) => res.data));
  }
}
