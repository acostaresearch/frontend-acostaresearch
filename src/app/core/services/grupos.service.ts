import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

export type EstadoGrupo = 'ABIERTO' | 'LLENO' | 'CERRADO' | 'APAGADO';

/** Medios con los que se cobra un grupo, como los de un código de activación. */
export const MEDIOS_DE_GRUPO = [
  { valor: 'TRANSFERENCIA', texto: 'Transferencia bancaria' },
  { valor: 'YAPE', texto: 'Yape' },
  { valor: 'PLIN', texto: 'Plin' },
  { valor: 'PAYPAL', texto: 'PayPal' },
  { valor: 'WESTERN_UNION', texto: 'Western Union' },
  { valor: 'CORTESIA', texto: 'Cortesía (sin cobro)' },
] as const;

/** Un grupo, tal como lo ve el administrador. */
export interface Grupo {
  id: string;
  slug: string;
  nombre: string;
  productCode: string;
  productName: string;
  /** La página que el coordinador reparte a sus alumnos. */
  url: string;
  cupos: number;
  ocupados: number;
  quedan: number;
  /** 0 = los días del plan. */
  duracionDias: number;
  cierraAt: string | null;
  activo: boolean;
  estado: EstadoGrupo;
  paymentMethod: string;
  amountCents: number | null;
  note: string | null;
  createdAt: string;
  coordinador: { id: string; email: string; firstName: string; lastName: string };
}

export interface CrearGrupo {
  nombre: string;
  productCode: string;
  cupos: number;
  duracionDias: number;
  /** AAAA-MM-DD o nulo. */
  cierraAt: string | null;
  coordinadorEmail: string;
  paymentMethod: string;
  paymentRef: string | null;
  amountCents: number | null;
  note: string | null;
}

/** Cómo va un alumno, para su coordinador. Nada del texto. */
export interface AlumnoDelGrupo {
  nombre: string;
  email: string;
  seUnio: string;
  activo: boolean;
  conecto: boolean;
  ultimoUso: string | null;
  fasesTerminadas: number;
  faseActual: string | null;
  tema: string | null;
  formatoSubido: boolean;
}

export interface GrupoQueCoordino extends Grupo {
  alumnos: AlumnoDelGrupo[];
}

/** Lo que ve el alumno antes de unirse. */
export interface GrupoPublico {
  nombre: string;
  productName: string;
  estado: EstadoGrupo;
  quedan: number;
  coordinador: string;
  duracionDias: number;
}

export interface Union {
  yaEstaba: boolean;
  /** Solo la primera vez: después se saca del panel con «Nueva URL». */
  connectorUrl: string | null;
  expiresAt?: string | null;
  productName: string | null;
}

/**
 * Grupos: cupos del método para una universidad o un asesor. El alumno se une
 * con su cuenta; el coordinador ve el avance desde su perfil; el alta la hace
 * el administrador después de cerrar la venta.
 */
@Injectable({ providedIn: 'root' })
export class GruposService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/grupos`;

  ver(slug: string): Observable<GrupoPublico> {
    return this.http
      .get<ApiResponse<GrupoPublico>>(`${this.base}/publico/${slug}`)
      .pipe(map((res) => res.data));
  }

  unirse(slug: string): Observable<Union> {
    return this.http
      .post<ApiResponse<Union>>(`${this.base}/publico/${slug}/unirse`, {})
      .pipe(map((res) => res.data));
  }

  mios(): Observable<GrupoQueCoordino[]> {
    return this.http
      .get<ApiResponse<{ grupos: GrupoQueCoordino[] }>>(`${this.base}/mios`)
      .pipe(map((res) => res.data.grupos));
  }

  listar(): Observable<Grupo[]> {
    return this.http
      .get<ApiResponse<{ grupos: Grupo[] }>>(this.base)
      .pipe(map((res) => res.data.grupos));
  }

  crear(datos: CrearGrupo): Observable<Grupo> {
    return this.http
      .post<ApiResponse<{ grupo: Grupo }>>(this.base, datos)
      .pipe(map((res) => res.data.grupo));
  }

  cambiar(
    id: string,
    cambios: Partial<{ nombre: string; cupos: number; cierraAt: string | null; activo: boolean }>,
  ): Observable<Grupo> {
    return this.http
      .patch<ApiResponse<{ grupo: Grupo }>>(`${this.base}/${id}`, cambios)
      .pipe(map((res) => res.data.grupo));
  }
}
