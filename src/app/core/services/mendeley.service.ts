import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import {
  ColeccionDeZotero,
  EstadoDeZotero,
  QuePuedeTraer,
  ResultadoDeSincronizar,
} from './zotero.service';

/**
 * El Mendeley del propio comprador.
 *
 * El servidor contesta con LA MISMA FORMA que el de Zotero —estado, lista de
 * lo que puede traer, parte de la pasada—, con sus carpetas donde Zotero pone
 * colecciones. Por eso se reutilizan aquellos tipos en vez de copiarlos: si un
 * día cambia la forma, cambia para los dos.
 *
 * Los tokens de Mendeley NUNCA pasan por aquí: el intercambio ocurre entre el
 * navegador, mendeley.com y el servidor.
 */
@Injectable({ providedIn: 'root' })
export class MendeleyService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/mi-mendeley`;

  estado(): Observable<EstadoDeZotero> {
    return this.http
      .get<ApiResponse<{ mendeley: EstadoDeZotero }>>(`${this.base}/estado`)
      .pipe(map((res) => res.data.mendeley));
  }

  /** La dirección de autorización: la abre el navegador, no el cliente HTTP. */
  conectar(): Observable<{ url: string }> {
    return this.http
      .post<ApiResponse<{ url: string }>>(`${this.base}/conectar`, {})
      .pipe(map((res) => res.data));
  }

  carpetas(): Observable<QuePuedeTraer> {
    return this.http
      .get<ApiResponse<QuePuedeTraer>>(`${this.base}/carpetas`)
      .pipe(map((res) => res.data));
  }

  elegir(clave: string): Observable<{ coleccion: ColeccionDeZotero }> {
    return this.http
      .put<ApiResponse<{ coleccion: ColeccionDeZotero }>>(`${this.base}/carpeta`, { clave })
      .pipe(map((res) => res.data));
  }

  sincronizar(): Observable<ResultadoDeSincronizar> {
    return this.http
      .post<ApiResponse<ResultadoDeSincronizar>>(`${this.base}/sincronizar`, {})
      .pipe(map((res) => res.data));
  }

  desconectar(): Observable<{ ok: boolean }> {
    return this.http
      .delete<ApiResponse<{ ok: boolean }>>(this.base)
      .pipe(map((res) => res.data));
  }
}
