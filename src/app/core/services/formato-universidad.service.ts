import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Para quién vale un formato. Los mismos códigos que el servidor (`formato.busqueda.js`). */
export type GradoDeFormato = 'cualquiera' | 'pregrado' | 'posgrado';

export const GRADOS_DE_FORMATO: readonly { codigo: GradoDeFormato; nombre: string }[] = [
  { codigo: 'cualquiera', nombre: 'Pregrado y posgrado' },
  { codigo: 'pregrado', nombre: 'Solo pregrado' },
  { codigo: 'posgrado', nombre: 'Solo posgrado' },
];

/** Un capítulo de la guía: su título y de qué fases del método sale su texto. */
export interface CapituloDeGuia {
  titulo: string;
  /** Vacío = un capítulo propio del reglamento (Hipótesis, por ejemplo). */
  de?: string[];
}

/** Un formato de la biblioteca, como lo manda el servidor. */
export interface FormatoUniversidad {
  id: string;
  universidad: string;
  alias: string;
  facultad: string;
  grado: GradoDeFormato;
  notas: string;
  archivoNombre: string;
  bytes: number;
  esquema: { capitulos: CapituloDeGuia[] } | null;
  esquemaProducto: string | null;
  /** Falso = lo subió un tesista y espera revisión. */
  aprobado: boolean;
  /** El proyecto del tesista que lo subió; nulo si lo subió el administrador. */
  origenProjectId: string | null;
  usos: number;
  /** «Universidad César Vallejo · Derecho · posgrado». */
  etiqueta: string;
  createdAt: string;
  updatedAt: string;
}

/** La ficha que se escribe en el panel. */
export interface FichaDeFormato {
  universidad: string;
  alias: string;
  facultad: string;
  grado: GradoDeFormato;
  notas: string;
}

/** Un método de tesis con sus fases: con qué se arman los capítulos. */
export interface MetodoConFases {
  productCode: string;
  nombre: string;
  fases: { code: string; nombre: string }[];
}

@Injectable({ providedIn: 'root' })
export class FormatoUniversidadService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/formatos-universidad`;

  todos(): Observable<FormatoUniversidad[]> {
    return this.http
      .get<ApiResponse<{ formatos: FormatoUniversidad[] }>>(this.base)
      .pipe(map((r) => r.data.formatos));
  }

  metodos(): Observable<MetodoConFases[]> {
    return this.http
      .get<ApiResponse<{ metodos: MetodoConFases[] }>>(`${this.base}/metodos`)
      .pipe(map((r) => r.data.metodos));
  }

  /** Uno nuevo. El .docx va en crudo, con la ficha en la query, como las guías. */
  crear(ficha: FichaDeFormato, archivo: File): Observable<FormatoUniversidad> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(ficha)) params = params.set(clave, String(valor));
    return this.http
      .post<ApiResponse<{ formato: FormatoUniversidad }>>(this.base, archivo, {
        params,
        headers: this.cabeceras(archivo),
      })
      .pipe(map((r) => r.data.formato));
  }

  /** La ficha, los capítulos o aprobarlo. */
  actualizar(
    id: string,
    cambios: Partial<FichaDeFormato> & {
      aprobado?: boolean;
      esquema?: { capitulos: CapituloDeGuia[] } | null;
      esquemaProducto?: string | null;
    },
  ): Observable<FormatoUniversidad> {
    return this.http
      .patch<ApiResponse<{ formato: FormatoUniversidad }>>(`${this.base}/${id}`, cambios)
      .pipe(map((r) => r.data.formato));
  }

  cambiarArchivo(id: string, archivo: File): Observable<FormatoUniversidad> {
    return this.http
      .put<ApiResponse<{ formato: FormatoUniversidad }>>(`${this.base}/${id}/docx`, archivo, {
        headers: this.cabeceras(archivo),
      })
      .pipe(map((r) => r.data.formato));
  }

  /** El .docx, con la sesión puesta: un enlace normal no la lleva. */
  descargar(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/docx`, { responseType: 'blob' });
  }

  borrar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  private cabeceras(archivo: File): Record<string, string> {
    return {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // Codificado: una cabecera HTTP no admite tildes tal cual.
      'X-Nombre-Archivo': encodeURIComponent(archivo.name),
    };
  }
}
