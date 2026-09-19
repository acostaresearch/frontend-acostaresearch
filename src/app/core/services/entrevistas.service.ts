import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Una entrevista subida, sin su texto. */
export interface Entrevista {
  /** «E1», «E2»…: el número con que Claude la nombra. */
  id: string;
  nombre: string;
  formato: 'docx' | 'txt' | 'pdf';
  subidoAt: string;
  parrafos: number;
  caracteres: number;
  citas: number;
}

/** Si el enlace que dio Claude sigue valiendo, y qué hay subido. */
export interface EnlaceDeEntrevistas {
  caduca: string;
  entrevistas: Entrevista[];
}

export interface EntrevistaSubida {
  entrevistas: Entrevista[];
  /** Lo escribe el servidor, para el tesista. */
  mensaje: string;
}

/**
 * La subida de las entrevistas del análisis cualitativo, desde el enlace que da
 * Claude con «analisis_cualitativo».
 *
 * Sin sesión, como la del material: el token del enlace es la llave. Un archivo
 * por petición.
 */
@Injectable({ providedIn: 'root' })
export class EntrevistasService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/cualitativo/entrevistas`;

  comprobar(token: string): Observable<EnlaceDeEntrevistas> {
    return this.http
      .get<ApiResponse<EnlaceDeEntrevistas>>(`${this.base}/${encodeURIComponent(token)}`)
      .pipe(map((res) => res.data));
  }

  /** El archivo va tal cual, como bytes; el nombre por cabecera, solo para enseñarlo. */
  subir(token: string, archivo: File): Observable<EntrevistaSubida> {
    return this.http
      .post<ApiResponse<{ entrevistas: Entrevista[] }>>(`${this.base}/${encodeURIComponent(token)}`, archivo, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Nombre-Archivo': encodeURIComponent(archivo.name).slice(0, 200),
        },
      })
      .pipe(map((res) => ({ ...res.data, mensaje: res.message ?? '' })));
  }
}
