import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Un capítulo tal como lo ve el visitante. */
export interface SkillPublica {
  code: string;
  /**
   * En qué grupos aparece.
   *
   * Un capítulo puede estar en varios a la vez: «Tema y delimitación» es el
   * primero del método de tesis y también del pack con humanizador. Lista
   * vacía = sin grupo, y entonces se ve desde cualquier licencia.
   */
  productCodes: string[];
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
  /** La lista COMPLETA de grupos: lo que no venga en ella deja de serlo. */
  productCodes?: string[];
  summary?: string;
  orden?: number;
  active?: boolean;
}

/** Al subir un archivo se indica UN grupo, y el capítulo se añade a él. */
export interface DatosSubida extends Omit<DatosFicha, 'productCodes'> {
  productCode?: string;
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

  /**
   * Público: no hace falta sesión para ver qué capítulos hay.
   *
   * Con `grupo`, solo los de ese producto. Sin él vienen todos, y eso en una
   * página de venta es un revoltijo: quien mira el método de tesis no tiene por
   * qué leer las fases del artículo científico.
   */
  catalogo(grupo?: string): Observable<SkillPublica[]> {
    const params = grupo ? new HttpParams().set('grupo', grupo) : undefined;

    return this.http
      .get<ApiResponse<{ skills: SkillPublica[] }>>(`${this.base}/catalogo`, { params })
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

  subir(archivo: File, datos: DatosSubida): Observable<{ skill: Skill; tramos: number }> {
    let params = new HttpParams();
    if (datos.displayName) params = params.set('displayName', datos.displayName);
    if (datos.summary) params = params.set('summary', datos.summary);
    if (datos.orden !== undefined) params = params.set('orden', String(datos.orden));
    if (datos.active !== undefined) params = params.set('active', String(datos.active));
    if (datos.productCode) params = params.set('productCode', datos.productCode);

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

  /**
   * Fija de una vez qué capítulos tiene un grupo.
   *
   * Una sola petición en vez de un PATCH por capítulo, y sobre todo: solo puede
   * tocar la pertenencia a ESTE grupo. Antes se mandaba el grupo nuevo en la
   * ficha de cada capítulo, y como un capítulo solo podía estar en uno,
   * marcarlo aquí lo borraba del grupo de al lado.
   *
   * Devuelve el catálogo entero porque los capítulos compartidos cambian la
   * ficha de más de un grupo.
   */
  fijarCapitulosDelGrupo(productCode: string, skillIds: string[]): Observable<Skill[]> {
    return this.http
      .put<ApiResponse<{ skills: Skill[] }>>(`${this.base}/grupos/${productCode}`, { skillIds })
      .pipe(map((res) => res.data.skills));
  }

  eliminar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
