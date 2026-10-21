import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import {
  BoletaDeCompra,
  Comprobante,
  ComprobantesDeVenta,
  CorreoComprobante,
  NuevoServicio,
  ResultadoAnulacion,
  ServicioRegistrado,
} from '../models/comprobante.model';

/**
 * Boletas y notas de crédito electrónicas (SUNAT). El cliente pide las suyas y
 * su PDF; el panel, la lista, el XML, la CDR, el reenvío del correo y anular.
 * Los archivos se piden con la respuesta entera para leer su nombre.
 */
@Injectable({ providedIn: 'root' })
export class ComprobantesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/sunat`;

  misBoletas(): Observable<BoletaDeCompra[]> {
    return this.http
      .get<ApiResponse<{ boletas: BoletaDeCompra[] }>>(`${this.base}/mis-boletas`)
      .pipe(map((res) => res.data.boletas));
  }

  /** PDF de una boleta o nota: `pdf`; para el panel también `xml` y `cdr`. */
  archivo(id: string, cual: 'pdf' | 'xml' | 'cdr'): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.base}/comprobantes/${id}/${cual}`, {
      responseType: 'blob',
      observe: 'response',
    });
  }

  /** Las boletas y notas de una venta de Accesos: un código o un pago. */
  deVenta(canal: 'codigo' | 'pago', id: string): Observable<ComprobantesDeVenta> {
    return this.http
      .get<ApiResponse<ComprobantesDeVenta>>(`${this.base}/de-venta`, { params: { canal, id } })
      .pipe(map((res) => res.data));
  }

  listar(): Observable<Comprobante[]> {
    return this.http
      .get<ApiResponse<{ comprobantes: Comprobante[] }>>(`${this.base}/comprobantes`)
      .pipe(map((res) => res.data.comprobantes));
  }

  reenviar(id: string): Observable<CorreoComprobante> {
    return this.http
      .post<ApiResponse<{ correo: CorreoComprobante }>>(`${this.base}/comprobantes/${id}/reenviar`, {})
      .pipe(map((res) => res.data.correo));
  }

  anular(id: string, motivo: string, refacturar: boolean): Observable<ResultadoAnulacion> {
    return this.http
      .post<ApiResponse<ResultadoAnulacion>>(`${this.base}/comprobantes/${id}/anular`, { motivo, refacturar })
      .pipe(map((res) => res.data));
  }

  /** Los servicios cobrados fuera de la web registrados en un mes, con su boleta. */
  servicios(anio: number, mes: number): Observable<ServicioRegistrado[]> {
    return this.http
      .get<ApiResponse<{ servicios: ServicioRegistrado[] }>>(`${this.base}/servicios`, { params: { anio, mes } })
      .pipe(map((res) => res.data.servicios));
  }

  registrarServicio(servicio: NuevoServicio): Observable<void> {
    return this.http.post<unknown>(`${this.base}/servicios`, servicio).pipe(map(() => undefined));
  }

  /** Solo mientras no tenga boleta. */
  quitarServicio(id: string): Observable<void> {
    return this.http.delete<unknown>(`${this.base}/servicios/${id}`).pipe(map(() => undefined));
  }
}

/** Guarda en el equipo un archivo bajado con sesión. */
export function guardarArchivo(respuesta: HttpResponse<Blob>, porDefecto: string): void {
  const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
  const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] ?? porDefecto;
  const url = URL.createObjectURL(respuesta.body as Blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  // Se suelta después: algunos navegadores aún no empezaron a guardar.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
