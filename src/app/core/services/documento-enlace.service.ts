import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { DocumentoSubido } from './proyecto.service';

/** Si el enlace que dio Claude sigue valiendo, y qué documento hay ahora. */
export interface EnlaceDeDocumento {
  caduca: string;
  documento: DocumentoSubido | null;
}

export interface DocumentoRecibido {
  /** Lo escribe el servidor, para el tesista: cuántos párrafos y qué se conservó. */
  mensaje: string;
}

/**
 * La subida del documento del tesista desde el enlace que da Claude al citar o
 * humanizar. Sin sesión, como la del formato: el token del enlace es la llave.
 */
@Injectable({ providedIn: 'root' })
export class DocumentoEnlaceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/proyectos/documento-enlace`;

  comprobar(token: string): Observable<EnlaceDeDocumento> {
    return this.http
      .get<ApiResponse<EnlaceDeDocumento>>(`${this.base}/${encodeURIComponent(token)}`)
      .pipe(map((res) => res.data));
  }

  /** El archivo va tal cual, como bytes; el nombre por cabecera, solo para enseñarlo. */
  subir(token: string, archivo: File): Observable<DocumentoRecibido> {
    return this.http
      .post<ApiResponse<unknown>>(`${this.base}/${encodeURIComponent(token)}`, archivo, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Nombre-Archivo': encodeURIComponent(archivo.name).slice(0, 200),
        },
      })
      .pipe(map((res) => ({ mensaje: res.message ?? '' })));
  }
}
