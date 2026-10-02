import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import {
  AprobacionManual,
  ComprobanteEnviado,
  DatosDelCobro,
  LineaCarrito,
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
   * Abre la orden de lo que se está pagando: un plan o todo el carrito. Se
   * mandan los códigos, nunca el precio: el importe lo calcula el servidor.
   *
   * Un solo producto viaja como siempre (`planCode`) y va por el camino de la
   * compra suelta; con varios, como `items`, y el servidor abre una sola orden
   * por la suma. `codigoDelTotal` es el código del carrito, que rebaja la
   * suma una sola vez.
   */
  createOrder(
    lineas: LineaCarrito[],
    provider = 'PAYPAL',
    codigoDelTotal?: string,
  ): Observable<PaymentOrder> {
    const cuerpo =
      lineas.length === 1
        ? {
            planCode: lineas[0].planCode,
            ...(lineas[0].discountCode ? { discountCode: lineas[0].discountCode } : {}),
          }
        : { items: lineas, ...(codigoDelTotal ? { discountCode: codigoDelTotal } : {}) };

    return this.http
      .post<ApiResponse<{ order: PaymentOrder }>>(`${this.base}/orders`, { ...cuerpo, provider })
      .pipe(map((res) => res.data.order));
  }

  /** Cobra la orden aprobada y devuelve el saldo ya actualizado. */
  capture(orderId: string, provider = 'PAYPAL', datos: DatosDelCobro = {}): Observable<PaymentResult> {
    return this.http
      .post<ApiResponse<PaymentResult>>(
        `${this.base}/orders/${orderId}/capture?provider=${provider}`,
        datos,
      )
      .pipe(map((res) => res.data));
  }

  /** `motivo`: el error que dio el botón de PayPal, para que quede en el servidor. */
  cancel(orderId: string, provider = 'PAYPAL', motivo?: string): Observable<void> {
    return this.http.post<void>(
      `${this.base}/orders/${orderId}/cancel?provider=${provider}`,
      motivo ? { motivo: motivo.slice(0, 200) } : {},
    );
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
    lineas: LineaCarrito[],
    archivo: File,
    opciones: { operationCode?: string; codigoDelTotal?: string } = {},
  ): Observable<ComprobanteEnviado> {
    // Un plan, como siempre; un carrito, como `PLAN:CODIGO,PLAN2` en la query,
    // porque el cuerpo de esta petición es la imagen.
    let params =
      lineas.length === 1
        ? new HttpParams().set('planCode', lineas[0].planCode)
        : new HttpParams().set(
            'items',
            lineas
              .map((l) => (l.discountCode ? `${l.planCode}:${l.discountCode}` : l.planCode))
              .join(','),
          );
    if (lineas.length === 1 && lineas[0].discountCode) {
      params = params.set('discountCode', lineas[0].discountCode);
    }
    if (lineas.length > 1 && opciones.codigoDelTotal) {
      params = params.set('discountCode', opciones.codigoDelTotal);
    }
    if (opciones.operationCode) params = params.set('operationCode', opciones.operationCode);

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

  /**
   * Constancia de pago en PDF de un pago confirmado. Se pide la respuesta entera
   * para leer el nombre del archivo, que lleva el número de la constancia.
   */
  constancia(paymentId: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.base}/${paymentId}/constancia`, {
      responseType: 'blob',
      observe: 'response',
    });
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
