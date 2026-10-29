import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Un artículo de la lista de SciELO. */
export interface ResultadoDeScielo {
  /** El de OpenAlex («W123»). Es lo único que vuelve al guardar. */
  id: string;
  doi: string | null;
  titulo: string;
  autores: string;
  anio: number | null;
  revista: string | null;
  idioma: string | null;
  citas: number;
  /** La página del artículo en su revista. */
  enlace: string | null;
  pdfLibre: string | null;
  resumen: string | null;
  /** En el resto de OpenAlex: «article», «review» o «dissertation» (tesis). */
  tipo?: string | null;
  /** Si ya está en su biblioteca. */
  tuya: boolean;
}

export type OrdenDeScielo = 'relevancia' | 'citas' | 'recientes' | 'antiguos';

export interface BusquedaEnScielo {
  /** Texto libre. O esto o `conceptos`. */
  tema?: string;
  /** Los conceptos del buscador de Scopus, con sus sinónimos. */
  conceptos?: { nombre: string; sinonimos: string[] }[];
  pagina?: number;
  porPagina?: number;
  orden?: OrdenDeScielo;
  idioma?: 'es' | 'pt' | 'en';
  desdeAnio?: number;
  hastaAnio?: number;
}

export interface PaginaDeScielo {
  resultados: ResultadoDeScielo[];
  total: number;
  porPagina: number;
}

/** Una base externa del menú «Ver». */
export interface BaseExterna {
  clave: string;
  nombre: string;
  detalle: string;
  activa: boolean;
}

export interface GuardadoDeScielo {
  pedidas: number;
  guardadas: number;
  repetidas: number;
  noEncontradas: number;
  sinResumen: number;
  total: number;
  sinResumenEnTotal: number;
}

/**
 * La mitad SciELO del buscador de Scopus: buscar en sus revistas y guardar lo
 * elegido en «mis fuentes». Ver `MiScopusPanel.buscar`, que mezcla las dos.
 *
 * Cuelga de `/mis-fuentes` porque es otra puerta de la misma biblioteca, no
 * una cuenta que conectar. El servidor busca en OpenAlex filtrando por las
 * revistas que están en SciELO: el buscador de SciELO no tiene API.
 */
@Injectable({ providedIn: 'root' })
export class ScieloService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/mis-fuentes/scielo`;

  buscar(busqueda: BusquedaEnScielo): Observable<{ pagina: PaginaDeScielo; mensaje?: string }> {
    return this.http
      .post<ApiResponse<PaginaDeScielo>>(`${this.base}/buscar`, busqueda)
      .pipe(map((res) => ({ pagina: res.data, mensaje: res.message })));
  }

  /**
   * El resto de OpenAlex (Redalyc, Latindex, repositorios y tesis), sin lo de
   * SciELO. Misma forma que `buscar`; lo marcado se guarda igual, por `guardar`.
   */
  buscarEnOpenAlex(busqueda: BusquedaEnScielo): Observable<{ pagina: PaginaDeScielo; mensaje?: string }> {
    return this.http
      .post<ApiResponse<PaginaDeScielo>>(`${environment.apiUrl}/mis-fuentes/openalex/buscar`, busqueda)
      .pipe(map((res) => ({ pagina: res.data, mensaje: res.message })));
  }

  /** Las palabras de una búsqueda vacía que no están en ningún artículo. */
  palabrasSinUso(texto: string): Observable<string[]> {
    return this.http
      .post<ApiResponse<{ palabras: string[] }>>(
        `${environment.apiUrl}/mis-fuentes/palabras-sin-uso`,
        { texto },
      )
      .pipe(map((res) => res.data.palabras));
  }

  guardar(ids: string[]): Observable<{ resultado: GuardadoDeScielo; mensaje?: string }> {
    return this.http
      .post<ApiResponse<GuardadoDeScielo>>(this.base, { ids })
      .pipe(map((res) => ({ resultado: res.data, mensaje: res.message })));
  }

  // ── Las bases externas del menú «Ver» (Semantic Scholar, PubMed, ERIC…) ──

  /** Las que ofrece el servidor; `activa` es false si le falta su clave. */
  basesExternas(): Observable<BaseExterna[]> {
    return this.http
      .get<ApiResponse<{ bases: BaseExterna[] }>>(`${environment.apiUrl}/mis-fuentes/externas`)
      .pipe(map((res) => res.data.bases));
  }

  /** Una base externa sola. Misma forma que `buscar`. */
  buscarEnExterna(
    base: string,
    busqueda: BusquedaEnScielo,
  ): Observable<{ pagina: PaginaDeScielo; mensaje?: string }> {
    return this.http
      .post<ApiResponse<PaginaDeScielo>>(
        `${environment.apiUrl}/mis-fuentes/externas/${encodeURIComponent(base)}/buscar`,
        busqueda,
      )
      .pipe(map((res) => ({ pagina: res.data, mensaje: res.message })));
  }

  /** Lo marcado de las bases externas, como «<base>:<id>». */
  guardarDeExternas(ids: string[]): Observable<{ resultado: GuardadoDeScielo; mensaje?: string }> {
    return this.http
      .post<ApiResponse<GuardadoDeScielo>>(`${environment.apiUrl}/mis-fuentes/externas`, { ids })
      .pipe(map((res) => ({ resultado: res.data, mensaje: res.message })));
  }
}
