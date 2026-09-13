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
  /** Minutos de acceso desde que se recoge. 0 = sin límite. */
  accessMinutes: number;
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
  /** Minutos de acceso desde que se recoge. 0 = sin límite. */
  accessMinutes: number;
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
  /** Minutos de acceso desde que se recoge. 0 = sin límite. */
  accessMinutes: number;
  callsPerDay: number;
}

/** El conector recién entregado. La URL solo existe en esta respuesta. */
export interface ConectorDePrueba {
  connectorUrl: string;
  numero: number;
  /** Nulo = sin límite. */
  expiresAt: string | null;
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

/**
 * El tiempo de acceso dicho como lo diría una persona: «90 minutos», «2 horas»,
 * «1 hora y 30 minutos», «7 días». 0 = «sin límite».
 *
 * Los días solo cuando son días justos: así los enlaces que se crearon en días
 * se siguen leyendo igual, y «25 horas» no se convierte en «1,04 días».
 */
export function duracionDeAcceso(minutos: number): string {
  const total = Math.max(0, Math.floor(minutos || 0));
  if (total === 0) return 'sin límite';

  const contar = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

  if (total % 1440 === 0) return contar(total / 1440, 'día', 'días');
  if (total < 60) return contar(total, 'minuto', 'minutos');

  const horas = Math.floor(total / 60);
  const resto = total % 60;
  return resto === 0
    ? contar(horas, 'hora', 'horas')
    : `${contar(horas, 'hora', 'horas')} y ${contar(resto, 'minuto', 'minutos')}`;
}
