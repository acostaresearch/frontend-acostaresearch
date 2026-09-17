import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
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

/** Qué pasó al pedir fuentes por DOI. */
export interface ImportacionPorDoi {
  pedidos: number;
  guardadas: number;
  repetidas: number;
  /** Los que el catálogo abierto no conoce. Se nombran para poder decirlo. */
  noEncontrados: string[];
  total: number;
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

  /**
   * Un contador que sube cada vez que entran fuentes por OTRA puerta.
   *
   * La biblioteca del tesista tiene ya tres entradas —el archivo, los PDF por
   * DOI y la búsqueda en Scopus— y cada una vive en un componente distinto. Sin
   * esto, importar tres artículos desde Scopus dejaba la cifra de «fuentes
   * tuyas» de la tarjeta de abajo con el número viejo hasta recargar la página,
   * y lo que parece entonces es que la importación no funcionó.
   *
   * Es un contador y no un booleano porque lo que hace falta es que CAMBIE: dos
   * importaciones seguidas tienen que disparar dos recargas, y un `true` puesto
   * dos veces no cambia nada.
   */
  private readonly cambioSignal = signal(0);

  /** Para vigilarlo con un `effect` y volver a pedir el recuento. */
  readonly cambio = this.cambioSignal.asReadonly();

  /**
   * «Entraron fuentes». Lo llama quien las mete sin pasar por este servicio.
   *
   * No lo llaman los métodos de aquí abajo a propósito: el panel que sube un
   * archivo ya recarga su propio recuento al terminar, y avisarse a sí mismo
   * sería pedir el mismo dato dos veces por cada subida.
   */
  avisarDeCambio(): void {
    this.cambioSignal.update((n) => n + 1);
  }

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

  /**
   * Fuentes a partir de los DOI que se sacaron de unos PDF.
   *
   * Viaja la lista de DOI, no los archivos: el PDF no sale del equipo del
   * tesista. Ver `doi-del-pdf.ts`.
   */
  porDoi(dois: string[]): Observable<ImportacionPorDoi> {
    return this.http
      .post<ApiResponse<ImportacionPorDoi>>(`${this.base}/doi`, { dois })
      .pipe(map((res) => res.data));
  }

  /** `conservadas`: las que se quedan porque están citadas en sus capítulos. */
  vaciar(): Observable<{ borradas: number; conservadas: number }> {
    return this.http
      .delete<ApiResponse<{ borradas: number; conservadas: number }>>(this.base)
      .pipe(map((res) => res.data));
  }
}
