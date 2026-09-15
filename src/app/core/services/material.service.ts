import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Un archivo del material del curso, sin su texto. */
export interface ArchivoDeMaterial {
  numero: number;
  nombre: string;
  subidoAt: string;
  caracteres: number;
}

/** Si el enlace que dio Claude sigue valiendo, y qué hay subido. */
export interface EnlaceDeMaterial {
  caduca: string;
  material: ArchivoDeMaterial[];
}

export interface MaterialSubido {
  material: ArchivoDeMaterial[];
  /** Lo escribe el servidor, para el estudiante. */
  mensaje: string;
}

/**
 * La subida del material del curso (consigna, rúbrica, índice), desde el enlace
 * que da Claude en el informe.
 *
 * Sin sesión, como la del formato: el token del enlace es la llave.
 */
@Injectable({ providedIn: 'root' })
export class MaterialService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/proyectos/material`;

  comprobar(token: string): Observable<EnlaceDeMaterial> {
    return this.http
      .get<ApiResponse<EnlaceDeMaterial>>(`${this.base}/${encodeURIComponent(token)}`)
      .pipe(map((res) => res.data));
  }

  /** El archivo va tal cual, como bytes; el nombre por cabecera, solo para enseñarlo. */
  subir(token: string, archivo: File): Observable<MaterialSubido> {
    return this.http
      .post<ApiResponse<{ material: ArchivoDeMaterial[] }>>(
        `${this.base}/${encodeURIComponent(token)}`,
        archivo,
        {
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Nombre-Archivo': encodeURIComponent(archivo.name).slice(0, 200),
          },
        },
      )
      .pipe(map((res) => ({ ...res.data, mensaje: res.message ?? '' })));
  }
}
