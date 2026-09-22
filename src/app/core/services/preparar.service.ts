import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import {
  EncargoAceptado,
  IdiomaPreparar,
  PanelPreparar,
  Preparacion,
  ServicioPreparar,
} from '../models/preparar.model';

/**
 * «Preparar documento».
 *
 * Con sesión, a diferencia de las subidas que reparte el conector: aquí no hay
 * enlace firmado porque la membresía cuelga de la cuenta y quien entra ya está
 * dentro de la web.
 */
@Injectable({ providedIn: 'root' })
export class PrepararService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/preparar`;

  /** Membresía, cupo del mes e historial, de una sola petición. */
  panel(): Observable<PanelPreparar> {
    return this.http.get<ApiResponse<PanelPreparar>>(this.base).pipe(map((res) => res.data));
  }

  /**
   * Manda un documento a preparar.
   *
   * El archivo va como bytes, igual que el resto de subidas del sitio, y el
   * nombre por cabecera: solo sirve para devolvérselo con un nombre que
   * reconozca, nunca para escribir en disco.
   */
  encargar(
    servicio: ServicioPreparar,
    archivo: File,
    idioma?: IdiomaPreparar,
  ): Observable<EncargoAceptado> {
    const conIdioma = idioma ? `?idioma=${idioma}` : '';

    return this.http
      .post<ApiResponse<EncargoAceptado>>(`${this.base}/${servicio.toLowerCase()}${conIdioma}`, archivo, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Nombre-Archivo': encodeURIComponent(archivo.name).slice(0, 200),
        },
      })
      .pipe(map((res) => res.data));
  }

  /** Cómo va un trabajo. La pantalla lo pregunta cada pocos segundos. */
  ver(id: string): Observable<Preparacion> {
    return this.http
      .get<ApiResponse<Preparacion>>(`${this.base}/trabajos/${id}`)
      .pipe(map((res) => res.data));
  }

  /**
   * El .docx terminado.
   *
   * Se baja como blob en vez de abrir la URL en una pestaña porque la ruta va
   * con sesión: una pestaña nueva no lleva la cabecera de autorización y el
   * servidor contestaría 401.
   */
  descargar(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/trabajos/${id}/descargar`, { responseType: 'blob' });
  }
}
