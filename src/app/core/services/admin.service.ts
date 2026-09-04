import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ActivarBolsa,
  ActivationCode,
  Alerta,
  CodigoDescuento,
  CrearDescuento,
  GenerarCodigos,
  LicenciaAdmin,
  PackAdmin,
  PagoAdmin,
} from '../models/admin.model';
import { ApiResponse } from '../models/api.model';

/**
 * Operaciones del administrador. Todas exigen rol ADMIN en el servidor; el
 * guard del cliente solo evita enseñar una pantalla que no va a funcionar.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly licencias = `${environment.apiUrl}/licenses`;
  private readonly facturacion = `${environment.apiUrl}/billing`;
  private readonly pagos = `${environment.apiUrl}/payments`;

  // ── Códigos de activación ──────────────────────────────────────────────

  /**
   * Genera códigos. La respuesta trae los valores EN CLARO y es la única vez
   * que se pueden leer: en la base de datos solo queda su hash.
   */
  generarCodigos(datos: GenerarCodigos): Observable<{ productCode: string; codes: string[] }> {
    return this.http
      .post<ApiResponse<{ productCode: string; codes: string[] }>>(
        `${this.licencias}/codes`,
        datos,
      )
      .pipe(map((res) => res.data));
  }

  codigos(): Observable<ActivationCode[]> {
    return this.http
      .get<ApiResponse<{ codes: ActivationCode[] }>>(`${this.licencias}/codes`)
      .pipe(map((res) => res.data.codes));
  }

  anularCodigo(id: string): Observable<void> {
    return this.http.delete<void>(`${this.licencias}/codes/${id}`);
  }

  // ── Licencias ──────────────────────────────────────────────────────────

  licenciasTodas(): Observable<LicenciaAdmin[]> {
    return this.http
      .get<ApiResponse<{ licenses: LicenciaAdmin[] }>>(this.licencias)
      .pipe(map((res) => res.data.licenses));
  }

  revocar(id: string, reason?: string): Observable<LicenciaAdmin> {
    return this.http
      .post<ApiResponse<{ license: LicenciaAdmin }>>(`${this.licencias}/${id}/revoke`, { reason })
      .pipe(map((res) => res.data.license));
  }

  reactivar(id: string): Observable<LicenciaAdmin> {
    return this.http
      .post<ApiResponse<{ license: LicenciaAdmin }>>(`${this.licencias}/${id}/reactivate`, {})
      .pipe(map((res) => res.data.license));
  }

  alertas(): Observable<Alerta[]> {
    return this.http
      .get<ApiResponse<{ alerts: Alerta[] }>>(`${this.licencias}/alerts`)
      .pipe(map((res) => res.data.alerts));
  }

  // ── Bolsas de palabras ─────────────────────────────────────────────────

  /** Activación manual tras confirmar un Yape o una transferencia. */
  activarBolsa(datos: ActivarBolsa): Observable<{ pack: PackAdmin }> {
    return this.http
      .post<ApiResponse<{ pack: PackAdmin }>>(`${this.facturacion}/packs`, datos)
      .pipe(map((res) => res.data));
  }

  bolsasRecientes(): Observable<PackAdmin[]> {
    return this.http
      .get<ApiResponse<{ packs: PackAdmin[] }>>(`${this.facturacion}/packs`)
      .pipe(map((res) => res.data.packs));
  }

  // ── Códigos de descuento ───────────────────────────────────────────────

  crearDescuento(datos: CrearDescuento): Observable<CodigoDescuento> {
    return this.http
      .post<ApiResponse<{ discount: CodigoDescuento }>>(`${this.facturacion}/discounts`, datos)
      .pipe(map((res) => res.data.discount));
  }

  descuentos(): Observable<CodigoDescuento[]> {
    return this.http
      .get<ApiResponse<{ discounts: CodigoDescuento[] }>>(`${this.facturacion}/discounts`)
      .pipe(map((res) => res.data.discounts));
  }

  /** Apaga o vuelve a encender un código sin borrarlo. */
  activarDescuento(id: string, active: boolean): Observable<CodigoDescuento> {
    return this.http
      .patch<ApiResponse<{ discount: CodigoDescuento }>>(
        `${this.facturacion}/discounts/${id}`,
        { active },
      )
      .pipe(map((res) => res.data.discount));
  }

  // ── Pagos ──────────────────────────────────────────────────────────────

  pagosRecientes(): Observable<PagoAdmin[]> {
    return this.http
      .get<ApiResponse<{ payments: PagoAdmin[] }>>(`${this.pagos}/recent`)
      .pipe(map((res) => res.data.payments));
  }
}
