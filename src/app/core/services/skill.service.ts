import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Un capítulo tal como lo ve el visitante. */
export interface SkillPublica {
  code: string;
  orden: number;
  displayName: string;
  summary: string;
  anthropicSkillId: string | null;
}

/** La ficha completa, para el panel. */
export interface Skill extends SkillPublica {
  id: string;
  active: boolean;
  skillMdBytes: number;
  createdAt: string;
  updatedAt: string;
}

/** Lo que devuelve inspeccionar un .skill antes de guardarlo. */
export interface AnalisisBundle {
  code: string;
  displayNameSugerido: string;
  summarySugerido: string;
  skillMdBytes: number;
  pasos: number;
  archivos: number;
  materiales: string[];
  reemplaza: Skill | null;
}

export interface DatosFicha {
  displayName?: string;
  summary?: string;
  orden?: number;
  active?: boolean;
}

/**
 * Catálogo de capítulos.
 *
 * El bundle se manda como cuerpo binario y sus datos por la query: es un solo
 * archivo, así que un formulario multiparte solo añadiría ceremonia.
 */
@Injectable({ providedIn: 'root' })
export class SkillService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/skills`;

  /** Público: no hace falta sesión para ver qué capítulos hay. */
  catalogo(): Observable<SkillPublica[]> {
    return this.http
      .get<ApiResponse<{ skills: SkillPublica[] }>>(`${this.base}/catalogo`)
      .pipe(map((res) => res.data.skills));
  }

  list(): Observable<Skill[]> {
    return this.http
      .get<ApiResponse<{ skills: Skill[] }>>(this.base)
      .pipe(map((res) => res.data.skills));
  }

  /** Comprueba el archivo sin guardarlo, para avisar antes de reemplazar. */
  inspeccionar(archivo: File): Observable<AnalisisBundle> {
    return this.http
      .post<ApiResponse<AnalisisBundle>>(`${this.base}/inspeccionar`, archivo, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      .pipe(map((res) => res.data));
  }

  subir(archivo: File, datos: DatosFicha): Observable<{ skill: Skill; tramos: number }> {
    let params = new HttpParams();
    if (datos.displayName) params = params.set('displayName', datos.displayName);
    if (datos.summary) params = params.set('summary', datos.summary);
    if (datos.orden !== undefined) params = params.set('orden', String(datos.orden));
    if (datos.active !== undefined) params = params.set('active', String(datos.active));

    return this.http
      .post<ApiResponse<{ skill: Skill; tramos: number }>>(this.base, archivo, {
        params,
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      .pipe(map((res) => res.data));
  }

  actualizar(id: string, cambios: DatosFicha): Observable<Skill> {
    return this.http
      .patch<ApiResponse<{ skill: Skill }>>(`${this.base}/${id}`, cambios)
      .pipe(map((res) => res.data.skill));
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
