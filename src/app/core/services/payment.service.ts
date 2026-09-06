import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import {
  AprobacionManual,
  ComprobanteEnviado,
  DatosYape,
  PagoPorRevisar,
  PagoRevisado,
  Payment,
  PaymentOrder,
  PaymentProvider,
  PaymentResult,
} from '../models/payment.model';

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
  createOrder(
    planCode: string,
    discountCode?: string,
    provider = 'PAYPAL',
  ): Observable<PaymentOrder> {
    return this.http
      .post<ApiResponse<{ order: PaymentOrder }>>(`${this.base}/orders`, {
        planCode,
        provider,
        ...(discountCode ? { discountCode } : {}),
      })
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

  // ── Pago manual por Yape ───────────────────────────────────────────────

  /** Titular y número que se enseñan junto al QR. */
  datosYape(): Observable<DatosYape> {
    return this.http
      .get<ApiResponse<{ yape: DatosYape }>>(`${this.base}/manual/info`)
      .pipe(map((res) => res.data.yape));
  }

  /**
   * Envía la captura del Yape.
   *
   * El archivo va como cuerpo crudo, no en un formulario: así el servidor
   * recibe exactamente los bytes de la imagen y puede comprobar su firma. El
   * resto de datos viaja en la query.
   */
  enviarComprobante(
    planCode: string,
    archivo: File,
    opciones: { operationCode?: string; discountCode?: string } = {},
  ): Observable<ComprobanteEnviado> {
    let params = new HttpParams().set('planCode', planCode);
    if (opciones.operationCode) params = params.set('operationCode', opciones.operationCode);
    if (opciones.discountCode) params = params.set('discountCode', opciones.discountCode);

    return this.http
      .post<ApiResponse<ComprobanteEnviado>>(`${this.base}/manual`, archivo, {
        params,
        headers: { 'Content-Type': archivo.type },
      })
      .pipe(map((res) => res.data));
  }

  /** Bandeja del administrador: comprobantes esperando revisión. */
  porRevisar(): Observable<PagoPorRevisar[]> {
    return this.http
      .get<ApiResponse<{ payments: PagoPorRevisar[] }>>(`${this.base}/manual/pending`)
      .pipe(map((res) => res.data.payments));
  }

  /** Historial del administrador: comprobantes ya resueltos, del último al primero. */
  historialManual(): Observable<PagoRevisado[]> {
    return this.http
      .get<ApiResponse<{ payments: PagoRevisado[] }>>(`${this.base}/manual/history`)
      .pipe(map((res) => res.data.payments));
  }

  /** URL de la imagen del comprobante. La ruta exige sesión de administrador. */
  urlComprobante(paymentId: string): string {
    return `${this.base}/manual/${paymentId}/proof`;
  }

  /** Descarga la imagen para enseñarla: el <img> no puede mandar el token. */
  comprobante(paymentId: string): Observable<Blob> {
    return this.http.get(this.urlComprobante(paymentId), { responseType: 'blob' });
  }

  aprobarComprobante(paymentId: string): Observable<AprobacionManual> {
    return this.http
      .post<ApiResponse<AprobacionManual>>(`${this.base}/manual/${paymentId}/approve`, {})
      .pipe(map((res) => res.data));
  }

  rechazarComprobante(paymentId: string, motivo: string): Observable<void> {
    return this.http
      .post<ApiResponse<unknown>>(`${this.base}/manual/${paymentId}/reject`, { motivo })
      .pipe(map(() => undefined));
  }
}
