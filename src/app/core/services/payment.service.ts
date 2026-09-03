import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { Payment, PaymentOrder, PaymentProvider, PaymentResult } from '../models/payment.model';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/payments`;

  /** Pasarelas configuradas. Vacío = solo queda el pago manual por Yape. */
  providers(): Observable<PaymentProvider[]> {
    return this.http
      .get<ApiResponse<{ providers: PaymentProvider[] }>>(`${this.base}/providers`)
      .pipe(map((res) => res.data.providers));
  }

  /**
   * Abre la orden. Se manda el código del plan, nunca el precio: el importe lo
   * calcula el servidor.
   */
  createOrder(planCode: string, provider = 'PAYPAL'): Observable<PaymentOrder> {
    return this.http
      .post<ApiResponse<{ order: PaymentOrder }>>(`${this.base}/orders`, { planCode, provider })
      .pipe(map((res) => res.data.order));
  }

  /** Cobra la orden aprobada y devuelve el saldo ya actualizado. */
  capture(orderId: string, provider = 'PAYPAL'): Observable<PaymentResult> {
    return this.http
      .post<ApiResponse<PaymentResult>>(
        `${this.base}/orders/${orderId}/capture?provider=${provider}`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  cancel(orderId: string, provider = 'PAYPAL'): Observable<void> {
    return this.http.post<void>(`${this.base}/orders/${orderId}/cancel?provider=${provider}`, {});
  }

  mine(): Observable<Payment[]> {
    return this.http
      .get<ApiResponse<{ payments: Payment[] }>>(this.base)
      .pipe(map((res) => res.data.payments));
  }
}
