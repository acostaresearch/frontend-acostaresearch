import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** En qué punto está un enlace. APAGADO corta además todos sus conectores. */
export type EstadoPrueba = 'ABIERTO' | 'LLENO' | 'APAGADO';

/** Un enlace de prueba, tal como lo ve el administrador. */
export interface EnlacePrueba {
  id: string;
  slug: string;
  name: string;
  productCode: string;
  productName: string;
  /** La página que se comparte con el grupo. */
  url: string;
  seats: number;
  claimed: number;
  accessDays: number;
  /** 0 = sin tope. */
  callsPerDay: number;
  active: boolean;
  estado: EstadoPrueba;
  /** Cuántos de los entregados llegaron a usar el conector. */
  conectados: number;
  /** Consultas de todos sus conectores juntos. */
  consultas: number;
  createdAt: string;
}

export interface CrearPrueba {
  name: string;
  productCode: string;
  seats: number;
  accessDays: number;
  callsPerDay: number;
}

/** Un conector entregado por un enlace. */
export interface InvitadoPrueba {
  numero: number | null;
  recibidoAt: string;
  tokenHint: string | null;
  consultas: number;
  ultimoUso: string | null;
  expiresAt: string | null;
}

/** Lo que ve quien abre el enlace, antes de pedir su conector. */
export interface PruebaPublica {
  name: string;
  productName: string;
  estado: EstadoPrueba;
  quedan: number;
  seats: number;
  accessDays: number;
  callsPerDay: number;
}

/** El conector recién entregado. La URL solo existe en esta respuesta. */
export interface ConectorDePrueba {
  connectorUrl: string;
  numero: number;
  expiresAt: string;
  productName: string;
}

/**
 * Enlaces de prueba del conector.
 *
 * Dos públicos —ver el enlace y pedir un conector, sin sesión— y el resto del
 * administrador. Van juntos porque son la misma cosa vista desde los dos lados.
 */
@Injectable({ providedIn: 'root' })
export class PruebaService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/pruebas`;

  // ── Público ────────────────────────────────────────────────────────────

  ver(slug: string): Observable<PruebaPublica> {
    return this.http
      .get<ApiResponse<{ prueba: PruebaPublica }>>(`${this.base}/enlace/${slug}`)
      .pipe(map((res) => res.data.prueba));
  }

  pedirConector(slug: string): Observable<ConectorDePrueba> {
    return this.http
      .post<ApiResponse<ConectorDePrueba>>(`${this.base}/enlace/${slug}/conector`, {})
      .pipe(map((res) => res.data));
  }

  // ── Administrador ──────────────────────────────────────────────────────

  enlaces(): Observable<EnlacePrueba[]> {
    return this.http
      .get<ApiResponse<{ enlaces: EnlacePrueba[] }>>(this.base)
      .pipe(map((res) => res.data.enlaces));
  }

  crear(datos: CrearPrueba): Observable<EnlacePrueba> {
    return this.http
      .post<ApiResponse<{ enlace: EnlacePrueba }>>(this.base, datos)
      .pipe(map((res) => res.data.enlace));
  }

  /** Apagar corta a la vez todos sus conectores; encender los devuelve. */
  encender(id: string, active: boolean): Observable<{ enlace: EnlacePrueba; mensaje: string }> {
    return this.http
      .patch<ApiResponse<{ enlace: EnlacePrueba }>>(`${this.base}/${id}`, { active })
      .pipe(map((res) => ({ enlace: res.data.enlace, mensaje: res.message ?? '' })));
  }

  /** Irreversible: se lleva los conectores y lo que guardaron los invitados. */
  borrar(id: string): Observable<string> {
    return this.http
      .delete<ApiResponse<{ id: string }>>(`${this.base}/${id}`)
      .pipe(map((res) => res.message ?? ''));
  }

  invitados(id: string): Observable<InvitadoPrueba[]> {
    return this.http
      .get<ApiResponse<{ invitados: InvitadoPrueba[] }>>(`${this.base}/${id}/invitados`)
      .pipe(map((res) => res.data.invitados));
  }
}
