import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { Descuento } from '../models/payment.model';
import { Balance, Plan } from '../models/rewrite.model';

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/billing`;

  /** Público: no hace falta sesión para ver los precios. */
  plans(): Observable<Plan[]> {
    return this.http
      .get<ApiResponse<{ plans: Plan[] }>>(`${this.base}/plans`)
      .pipe(map((res) => res.data.plans));
  }

  /**
   * Comprueba un código promocional. El precio final lo calcula el servidor:
   * aquí solo viaja el código.
   */
  validarDescuento(code: string, planCode: string): Observable<Descuento> {
    return this.http
      .post<ApiResponse<{ discount: Descuento }>>(`${this.base}/discounts/validate`, {
        code,
        planCode,
      })
      .pipe(map((res) => res.data.discount));
  }

  balance(): Observable<Balance> {
    return this.http
      .get<ApiResponse<{ balance: Balance }>>(`${this.base}/balance`)
      .pipe(map((res) => res.data.balance));
  }
}
