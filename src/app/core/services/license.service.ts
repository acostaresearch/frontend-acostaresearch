import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { License, ProgresoDeArranque } from '../models/payment.model';

@Injectable({ providedIn: 'root' })
export class LicenseService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/licenses`;

  /**
   * Las licencias del comprador y por dónde va su puesta en marcha.
   *
   * Viajan juntas porque el panel las pinta juntas: partirlo en dos llamadas
   * serían dos viajes para una sola pantalla.
   */
  mine(): Observable<{ licencias: License[]; progreso: ProgresoDeArranque }> {
    return this.http
      .get<ApiResponse<{ licenses: License[]; progreso: ProgresoDeArranque }>>(
        `${this.base}/mine`,
      )
      .pipe(map((res) => ({ licencias: res.data.licenses, progreso: res.data.progreso })));
  }

  /** Canjea un código de activación comprado fuera de la web. */
  redeem(code: string): Observable<{ license: License; connectorUrl: string }> {
    return this.http
      .post<ApiResponse<{ license: License; connectorUrl: string }>>(`${this.base}/redeem`, {
        code,
      })
      .pipe(map((res) => res.data));
  }

  /**
   * Genera una URL nueva y anula la anterior. Es la única forma de recuperar el
   * acceso si se pierde la URL: del token solo se guarda su hash.
   */
  rotate(licenseId: string): Observable<{ license: License; connectorUrl: string }> {
    return this.http
      .post<ApiResponse<{ license: License; connectorUrl: string }>>(
        `${this.base}/mine/${licenseId}/rotate`,
        {},
      )
      .pipe(map((res) => res.data));
  }
}
