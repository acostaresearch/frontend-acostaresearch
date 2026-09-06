import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Una fuente del corpus, tal como la ve el panel. */
export interface Referencia {
  id: string;
  zoteroKey: string;
  title: string;
  authors: string;
  year: number | null;
  source: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  notes: string | null;
  tags: string;
  /** A qué productos pertenece. Vacío = la ven todas las licencias. */
  groups: { productCode: string }[];
}

/**
 * Cómo va la sincronización en curso.
 *
 * Vive en el proceso del servidor, no en la base: si el servidor se reinicia a
 * media pasada, esto desaparece y volver a pulsar el botón retoma. Cada fila se
 * escribe con `ON DUPLICATE KEY`, así que repetir una pasada no duplica nada.
 */
export interface TrabajoDeCorpus {
  activo: boolean;
  /** `fuentes`, `notas` o `retiradas`. Null cuando no hay nada en marcha. */
  fase: string | null;
  hechas: number;
  total: number;
  guardadas: number;
  notas: number;
  retiradas: number;
  empezado: string | null;
  terminado: string | null;
  error: string | null;
}

export interface EstadoCorpus {
  configurado: boolean;
  biblioteca: string | null;
  total: number;
  libraryVersion: number;
  lastRunAt: string | null;
  trabajo: TrabajoDeCorpus;
}

export interface PaginaDeReferencias {
  total: number;
  filas: Referencia[];
  pagina: number;
  tamano: number;
}

/**
 * Lo que contesta el servidor al arrancar una sincronización.
 *
 * No es el resultado, es el acuse de recibo: la primera pasada son unas 450
 * peticiones a Zotero y varios minutos, y ninguna petición HTTP aguanta eso. El
 * resultado se mira preguntando por el estado.
 */
export type ArranqueDeSincronizacion = TrabajoDeCorpus & { completa: boolean };

/**
 * El corpus bibliográfico de la casa.
 *
 * Todo aquí es de administrador. El comprador nunca ve la biblioteca entera:
 * le llegan las fuentes por el conector, de una en una y según lo que pregunte.
 */
@Injectable({ providedIn: 'root' })
export class ReferenceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/referencias`;

  estado(): Observable<EstadoCorpus> {
    return this.http
      .get<ApiResponse<EstadoCorpus>>(`${this.base}/estado`)
      .pipe(map((res) => res.data));
  }

  listar(opciones: { pagina?: number; texto?: string } = {}): Observable<PaginaDeReferencias> {
    let params = new HttpParams();
    if (opciones.pagina) params = params.set('pagina', opciones.pagina);
    if (opciones.texto) params = params.set('texto', opciones.texto);

    return this.http
      .get<ApiResponse<PaginaDeReferencias>>(this.base, { params })
      .pipe(map((res) => res.data));
  }

  /**
   * Trae de Zotero lo que haya cambiado.
   *
   * `completa` ignora el marcador y vuelve a leerlo todo. Hace falta cuando se
   * corrigen fichas viejas en bloque, porque Zotero no siempre sube la versión
   * de la biblioteca al mismo ritmo que uno espera.
   */
  sincronizar(
    completa = false,
  ): Observable<{ arranque: ArranqueDeSincronizacion; mensaje: string }> {
    return this.http
      .post<ApiResponse<ArranqueDeSincronizacion>>(`${this.base}/sincronizar`, { completa })
      .pipe(map((res) => ({ arranque: res.data, mensaje: res.message ?? '' })));
  }
}
