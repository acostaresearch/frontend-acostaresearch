import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Los tipos que se pueden filtrar. Los mismos nombres que en el servidor. */
export type TipoDeAlicia = 'pregrado' | 'maestria' | 'doctorado' | 'articulos';

export interface ResultadoDeAlicia {
  /** Lo único que vuelve al guardar. */
  id: string;
  titulo: string;
  autores: string;
  anio: number | null;
  /** «Tesis de maestría», «Artículo»… */
  tipo: string;
  universidad: string | null;
  /** Solo en los artículos. */
  revista: string | null;
  asesor: string | null;
  /** El registro en el repositorio de la universidad o de la revista. */
  url: string | null;
  resumen: string | null;
  yaLaTienes: boolean;
}

export interface BusquedaDeAlicia {
  /** La consulta que se mandó a ALICIA, ya con los términos en español. */
  consulta: string;
  desde: number | null;
  hasta: number | null;
  total: number;
  pagina: number;
  paginas: number;
  porPagina: number;
  resultados: ResultadoDeAlicia[];
}

export interface PeticionDeAlicia {
  ecuacion: string;
  /** Solo si la corrigió a mano. */
  consulta?: string;
  pagina?: number;
  tipos?: TipoDeAlicia[];
  desde?: number | null;
  hasta?: number | null;
}

export interface ImportacionDeAlicia {
  guardadas: number;
  repetidas: number;
  noEncontradas: number;
  sinResumen: number;
  total: number;
}

/**
 * ALICIA (CONCYTEC) junto al buscador de Scopus: tesis y revistas peruanas.
 *
 * Igual que con Scopus, al guardar viajan identificadores y no fichas: el
 * servidor se las vuelve a pedir a ALICIA.
 */
@Injectable({ providedIn: 'root' })
export class AliciaService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/mi-scopus/alicia`;

  buscar(peticion: PeticionDeAlicia): Observable<BusquedaDeAlicia> {
    return this.http
      .post<ApiResponse<BusquedaDeAlicia>>(this.base, peticion)
      .pipe(map((res) => res.data));
  }

  importar(ids: string[]): Observable<{ datos: ImportacionDeAlicia; mensaje: string | null }> {
    return this.http
      .post<ApiResponse<ImportacionDeAlicia>>(`${this.base}/importar`, { ids })
      .pipe(map((res) => ({ datos: res.data, mensaje: res.message ?? null })));
  }
}
