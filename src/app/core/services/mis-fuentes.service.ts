import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Lo que el comprador tiene subido de su propio export. */
export interface MisFuentes {
  total: number;
  /**
   * Cuántas se guardaron sin resumen.
   *
   * Síntoma de haber exportado sin marcar «Abstract & keywords» en Scopus, que
   * no viene marcado. Se pueden citar igual, pero para encontrarlas solo queda
   * el título.
   */
  sinResumen: number;
  ultimaCarga: string | null;
  /** Máximo que admite su biblioteca. */
  tope: number;
}

/** Qué pasó al subir un archivo. */
export interface ResultadoDeImportacion {
  formato: 'csv' | 'ris' | 'bibtex';
  /** Fichas que traía el archivo, antes de descartar nada. */
  leidas: number;
  /** Fuentes nuevas de verdad. */
  guardadas: number;
  /** Ya las tenía: se refrescó la ficha, no se duplicó. */
  repetidas: number;
  /** Filas sin título utilizable. Casi siempre, relleno del export. */
  descartadas: number;
  /** De ESTE archivo, cuántas llegaron sin resumen. */
  sinResumen: number;
  total: number;
  /** Cuántas hay sin resumen en toda su biblioteca, contando las de antes. */
  sinResumenEnTotal: number;
}

/**
 * La biblioteca propia del comprador.
 *
 * El archivo se manda tal cual, sin `FormData`: es un solo fichero y no hay
 * ningún otro campo que lo acompañe, así que envolverlo en un formulario
 * multiparte solo añade una capa que el servidor tendría que desenvolver. El
 * backend lo recibe en crudo, igual que el comprobante de Yape.
 */
@Injectable({ providedIn: 'root' })
export class MisFuentesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/mis-fuentes`;

  resumen(): Observable<MisFuentes> {
    return this.http.get<ApiResponse<MisFuentes>>(this.base).pipe(map((res) => res.data));
  }

  importar(archivo: File): Observable<ResultadoDeImportacion> {
    return this.http
      .post<ApiResponse<ResultadoDeImportacion>>(this.base, archivo, {
        // El tipo que declara el navegador para un .ris o un .bib suele venir
        // vacío; el servidor decide el formato leyendo el contenido, así que
        // basta con que el tipo esté en su lista de aceptados.
        headers: { 'Content-Type': archivo.type || 'text/plain' },
      })
      .pipe(map((res) => res.data));
  }

  vaciar(): Observable<{ borradas: number }> {
    return this.http
      .delete<ApiResponse<{ borradas: number }>>(this.base)
      .pipe(map((res) => res.data));
  }
}
