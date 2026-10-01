import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Una persona apuntada a un sorteo. */
export interface InscritoSorteo {
  id: string;
  email: string;
  nombre: string;
  /** En qué vuelta salió eliminado (1 o 2). Nulo = sigue en la ruleta. */
  eliminadoEn: number | null;
  createdAt: string;
}

/** Un sorteo, tal como lo ve el administrador. */
export interface Sorteo {
  id: string;
  slug: string;
  nombre: string;
  /** La página que se comparte para apuntarse. */
  url: string;
  productCode: string;
  /** El nombre del plan que se regala. */
  premio: string;
  duracionDias: number;
  abierto: boolean;
  /** Vueltas ya giradas. */
  ronda: number;
  /** Cuántas vueltas tiene: las primeras eliminan y la última da el ganador. */
  vueltas: number;
  inscritos: number;
  ganador: InscritoSorteo | null;
  sorteadoAt: string | null;
  correoEnviado: boolean;
  createdAt: string;
  /** Solo al abrir uno: la lista completa. */
  participantes?: InscritoSorteo[];
}

/** Una vuelta que elimina a alguien. */
export interface VueltaEliminado {
  tipo: 'ELIMINADO';
  ronda: number;
  /** La lista que gira, en el mismo orden con que se eligió. */
  participantes: InscritoSorteo[];
  indice: number;
  eliminado: InscritoSorteo;
  sorteo: Sorteo;
}

/** La vuelta que da el ganador. */
export interface VueltaGanador {
  tipo: 'GANADOR';
  ronda: number;
  participantes: InscritoSorteo[];
  indice: number;
  ganador: InscritoSorteo;
  /** «ACR-R7VC-PJWV-****»: el código entero solo le llega al ganador. */
  codigoOculto: string;
  correoEnviado: boolean;
  sorteo: Sorteo;
}

export type ResultadoSorteo = VueltaEliminado | VueltaGanador;

/** Lo que devuelve reenviar el premio. */
export interface Reenvio {
  ganador: InscritoSorteo;
  codigoOculto: string;
  correoEnviado: boolean;
  sorteo: Sorteo;
}

/** Lo que ve quien abre el enlace. */
export interface SorteoPublico {
  nombre: string;
  premio: string;
  duracionDias: number;
  abierto: boolean;
  sorteado: boolean;
  inscritos: number;
}

@Injectable({ providedIn: 'root' })
export class SorteoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/sorteos`;

  // ── Público ──

  verPublico(slug: string): Observable<SorteoPublico> {
    return this.http
      .get<ApiResponse<SorteoPublico>>(`${this.base}/publico/${encodeURIComponent(slug)}`)
      .pipe(map((r) => r.data));
  }

  inscribirse(slug: string, email: string, nombre: string): Observable<string> {
    return this.http
      .post<ApiResponse<{ email: string }>>(`${this.base}/publico/${encodeURIComponent(slug)}`, {
        email,
        nombre,
      })
      .pipe(map((r) => r.message ?? '¡Listo! Ya estás participando.'));
  }

  // ── Panel ──

  listar(): Observable<Sorteo[]> {
    return this.http
      .get<ApiResponse<{ sorteos: Sorteo[] }>>(this.base)
      .pipe(map((r) => r.data.sorteos));
  }

  ver(id: string): Observable<Sorteo> {
    return this.http
      .get<ApiResponse<{ sorteo: Sorteo }>>(`${this.base}/${id}`)
      .pipe(map((r) => r.data.sorteo));
  }

  crear(nombre: string): Observable<Sorteo> {
    return this.http
      .post<ApiResponse<{ sorteo: Sorteo }>>(this.base, { nombre })
      .pipe(map((r) => r.data.sorteo));
  }

  cambiar(id: string, abierto: boolean): Observable<Sorteo> {
    return this.http
      .patch<ApiResponse<{ sorteo: Sorteo }>>(`${this.base}/${id}`, { abierto })
      .pipe(map((r) => r.data.sorteo));
  }

  quitarInscrito(id: string, participanteId: string): Observable<Sorteo> {
    return this.http
      .delete<ApiResponse<{ sorteo: Sorteo }>>(`${this.base}/${id}/participantes/${participanteId}`)
      .pipe(map((r) => r.data.sorteo));
  }

  borrar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  sortear(id: string): Observable<ResultadoSorteo> {
    return this.http
      .post<ApiResponse<ResultadoSorteo>>(`${this.base}/${id}/sortear`, {})
      .pipe(map((r) => r.data));
  }

  /** Anula el código del ganador y le manda uno nuevo. */
  reenviar(id: string): Observable<Reenvio> {
    return this.http
      .post<ApiResponse<Reenvio>>(`${this.base}/${id}/reenviar`, {})
      .pipe(map((r) => r.data));
  }
}
