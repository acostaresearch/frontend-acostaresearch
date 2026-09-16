import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** El formato que ya tiene puesto, si subió uno. */
export interface FormatoPuesto {
  nombre: string | null;
  desde: string;
  /** Falso = se subió antes de que se tomaran márgenes, encabezado, pie y portada. */
  completa: boolean;
  /** Si su Word sale con la portada del formato. */
  portada: boolean;
  camposDePortada: string[];
}

/** Si el enlace que dio Claude sigue valiendo, y qué formato hay puesto. */
export interface EnlaceDeFormato {
  caduca: string;
  formato: FormatoPuesto | null;
  /**
   * Qué escribe quien sube el formato: decide los textos de la página. Opcional
   * porque un backend anterior no lo manda, y entonces se ven los de tesis.
   */
  tipo?: 'tesis' | 'articulo' | 'informe';
  /** «empresa» en un informe de empresa; nulo o ausente en los demás. */
  ambito?: 'empresa' | null;
}

export interface FormatoSubido {
  cuantos: number;
  formato: FormatoPuesto | null;
  /** Qué se tomó del archivo, dicho para el tesista. Lo escribe el servidor. */
  mensaje: string;
}

/**
 * La subida del formato de la universidad, desde el enlace que da Claude.
 *
 * No lleva sesión: el token del enlace es la llave. Quien llega aquí viene de la
 * conversación con Claude y no tiene por qué haber entrado en la web.
 */
@Injectable({ providedIn: 'root' })
export class FormatoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/proyectos/formato`;

  comprobar(token: string): Observable<EnlaceDeFormato> {
    return this.http
      .get<ApiResponse<EnlaceDeFormato>>(`${this.base}/${encodeURIComponent(token)}`)
      .pipe(map((res) => res.data));
  }

  /** El .docx va tal cual, como bytes; el nombre por cabecera, solo para enseñarlo luego. */
  subir(token: string, archivo: File): Observable<FormatoSubido> {
    return this.http
      .post<ApiResponse<{ cuantos: number; formato: FormatoPuesto | null }>>(
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
