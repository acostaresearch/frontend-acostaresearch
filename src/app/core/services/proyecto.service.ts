import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

export type EstadoDeEtapa = 'PENDIENTE' | 'EN_CURSO' | 'LISTO';

/** Un capítulo del método, con lo que el tesista lleva hecho de él. */
export interface EtapaDelProyecto {
  code: string;
  displayName: string;
  estado: EstadoDeEtapa;
  /** Qué quedó decidido, en dos o tres frases. Nulo si no se guardó nada. */
  resumen: string | null;
  /** Palabras del capítulo escrito. Cero = todavía no hay texto guardado. */
  palabras: number;
  updatedAt: string | null;
}

/**
 * Lo que el servidor recuerda de una tesis.
 *
 * Viene ya cruzado con el catálogo: la lista de etapas trae TODOS los capítulos
 * del método, no solo los que el tesista ha tocado. Saber lo que falta es la
 * mitad de saber por dónde va.
 */
export interface Proyecto {
  id: string;
  productCode: string;
  tema: string | null;
  carrera: string | null;
  universidad: string | null;
  updatedAt: string;
  etapas: EtapaDelProyecto[];
  avance: { listos: number; total: number };
  /** El primer capítulo sin dar por bueno. Nulo cuando ya no queda ninguno. */
  siguiente: EtapaDelProyecto | null;
}

@Injectable({ providedIn: 'root' })
export class ProyectoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/proyectos`;

  /**
   * Los proyectos del comprador.
   *
   * Devuelve una lista vacía mientras no haya nada guardado, y eso es lo normal
   * al principio: el proyecto nace la primera vez que hay algo que recordar, no
   * al comprar.
   */
  mios(): Observable<Proyecto[]> {
    return this.http
      .get<ApiResponse<Proyecto[]>>(this.base)
      .pipe(map((r) => r.data ?? []));
  }

  /**
   * La tesis en Word, con todo lo escrito hasta ahora.
   *
   * Se pide en crudo porque no es JSON: llega el archivo. El nombre lo manda el
   * servidor en la cabecera —lleva la fecha, que es lo que distingue una
   * descarga de la siguiente— y se respeta en vez de inventarlo aquí.
   */
  word(productCode: string): Observable<{ archivo: Blob; nombre: string }> {
    return this.http
      .get(`${this.base}/${encodeURIComponent(productCode)}/word`, {
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        map((respuesta) => ({
          archivo: respuesta.body as Blob,
          nombre: nombreDeLaCabecera(respuesta.headers.get('Content-Disposition')),
        })),
      );
  }
}

/** Saca el nombre del archivo de la cabecera, con un respaldo si no viene. */
function nombreDeLaCabecera(cabecera: string | null): string {
  const encontrado = cabecera?.match(/filename="?([^"]+)"?/);
  return encontrado?.[1] ?? 'tesis.docx';
}
