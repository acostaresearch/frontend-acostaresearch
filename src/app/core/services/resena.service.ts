import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

export type EstadoDeResena = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export const NOMBRE_DEL_ESTADO: Record<EstadoDeResena, string> = {
  PENDIENTE: 'Esperando revisión',
  APROBADA: 'Publicada',
  RECHAZADA: 'No publicada',
};

/** Una reseña como la ve cualquiera. Sin correo y sin de quién es la cuenta. */
export interface ResenaPublica {
  id: string;
  estrellas: number;
  comentario: string;
  /** Con lo que quiso firmar. Nunca es el correo. */
  nombre: string;
  /** Vacío = no puso a qué se dedica. */
  oficio: string;
  createdAt: string;
}

/** La suya, con en qué punto está. */
export interface MiResena extends ResenaPublica {
  estado: EstadoDeResena;
  /** Por qué no se publicó. Vacío mientras no se haya rechazado. */
  motivo: string;
  destacada: boolean;
  updatedAt: string;
}

/** La misma, como la ve el panel: añade de quién es. */
export interface ResenaDelPanel extends MiResena {
  revisadaAt: string | null;
  user: { id: string; email: string; firstName: string; lastName: string };
}

/** Lo que se escribe al dejar una. */
export interface ResenaEnvio {
  estrellas: number;
  comentario: string;
  nombre: string;
  oficio: string;
}

/** Las aprobadas, con el resumen. */
export interface Resenas {
  resenas: ResenaPublica[];
  /** Cuántas hay aprobadas EN TOTAL, aunque se hayan pedido solo las destacadas. */
  total: number;
  /** La media, con un decimal. Null cuando todavía no hay ninguna. */
  nota: number | null;
}

/** Las cinco estrellas, llenas hasta la nota. Para leerlo de un vistazo. */
export function estrellas(nota: number): string {
  const llenas = Math.round(nota);
  return '★★★★★'.slice(0, llenas) + '☆☆☆☆☆'.slice(0, 5 - llenas);
}

/** «4,5». Con coma, que es como se escribe un decimal en español. */
export function nota(valor: number): string {
  return valor.toFixed(1).replace('.', ',');
}

@Injectable({ providedIn: 'root' })
export class ResenaService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/resenas`;

  /**
   * Público: las aprobadas.
   *
   * `destacadas` es lo que pide la portada, que enseña unas pocas elegidas a
   * mano. La media que vuelve es la de TODAS las aprobadas en los dos casos.
   */
  publicas(destacadas = false): Observable<Resenas> {
    const url = destacadas ? `${this.base}?destacadas=1` : this.base;
    return this.http.get<ApiResponse<Resenas>>(url).pipe(map((res) => res.data));
  }

  /** La suya. Null si todavía no ha escrito ninguna. */
  mia(): Observable<MiResena | null> {
    return this.http
      .get<ApiResponse<{ resena: MiResena | null }>>(`${this.base}/mia`)
      .pipe(map((res) => res.data.resena));
  }

  /** Deja la suya, o reescribe la que tenía. Vuelve a quedar pendiente. */
  guardar(datos: ResenaEnvio): Observable<MiResena> {
    return this.http
      .post<ApiResponse<{ resena: MiResena }>>(this.base, datos)
      .pipe(map((res) => res.data.resena));
  }

  /** Panel: todas, o las de un estado, con cuántas están esperando. */
  listar(
    estado: EstadoDeResena | 'TODAS' = 'TODAS',
  ): Observable<{ resenas: ResenaDelPanel[]; pendientes: number }> {
    return this.http
      .get<
        ApiResponse<{ resenas: ResenaDelPanel[]; pendientes: number }>
      >(`${this.base}/panel?estado=${estado}`)
      .pipe(map((res) => res.data));
  }

  /** Panel: aprobar, rechazar o destacar. */
  revisar(
    id: string,
    cambios: { estado?: EstadoDeResena; destacada?: boolean; motivo?: string },
  ): Observable<ResenaDelPanel> {
    return this.http
      .patch<ApiResponse<{ resena: ResenaDelPanel }>>(`${this.base}/panel/${id}`, cambios)
      .pipe(map((res) => res.data.resena));
  }
}
