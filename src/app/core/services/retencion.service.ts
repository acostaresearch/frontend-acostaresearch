import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Un paso del embudo de venta, con su porcentaje respecto al anterior. */
export interface PasoDelEmbudo {
  id: 'planes' | 'cuenta' | 'pago' | 'pagaron' | 'conectaron' | 'fase';
  texto: string;
  valor: number;
  /** Nulo en el primero. Puede pasar de 100 (entradas por código o grupo). */
  tasa: number | null;
}

export interface Embudo {
  dias: number;
  desde: string;
  hasta: string;
  pasos: PasoDelEmbudo[];
  porVia: { web: number; codigo: number; grupo: number };
  /** De los que recibieron el método, % que conectó Claude. */
  activacion: number | null;
  /** De los que recibieron el método, % que cerró una fase. */
  avance: number | null;
  referidos: Partial<Record<EstadoReferido, number>>;
  avisos: Partial<Record<TipoDeAviso, number>>;
}

export type EstadoReferido = 'PENDIENTE' | 'PREMIADO' | 'ANULADO';
export type TipoDeAviso = 'SIN_CONECTAR' | 'SIN_AVANZAR' | 'FALTA_FORMATO' | 'VENCE_PRONTO';

export const NOMBRE_DEL_AVISO: Record<TipoDeAviso, string> = {
  SIN_CONECTAR: 'Aún no conecta Claude',
  SIN_AVANZAR: '7 días sin avanzar',
  FALTA_FORMATO: 'Falta el formato',
  VENCE_PRONTO: 'Vence en 5 días',
};

/** Lo que ve el tesista en su perfil. */
export interface MisReferidos {
  /** Sin el método no hay código que repartir. */
  disponible: boolean;
  codigo: string | null;
  enlace: string | null;
  diasPorInvitado: number;
  diasParaElInvitado: number;
  diasGanados: number;
  diasPorAplicar: number;
  invitados: { nombre: string; estado: EstadoReferido; createdAt: string; premiadoAt: string | null }[];
  meInvito: { nombre: string; estado: EstadoReferido } | null;
}

/** Un referido, en el panel. */
export interface ReferidoDelPanel {
  id: string;
  estado: EstadoReferido;
  diasInvitador: number;
  diasInvitado: number;
  diasPorAplicar: number;
  createdAt: string;
  premiadoAt: string | null;
  invitador: { email: string; firstName: string; lastName: string; codigoReferido: string | null };
  invitado: { email: string; firstName: string; lastName: string };
}

/**
 * Medir y retener: el embudo de venta, los referidos y los recordatorios de
 * avance. Van juntos porque son la misma pregunta —¿llega, se queda, vuelve?—
 * vista desde tres sitios.
 */
@Injectable({ providedIn: 'root' })
export class RetencionService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  // ── Embudo ─────────────────────────────────────────────────────────────

  /** Público: /planes avisa de que la vieron. Silencioso si falla. */
  visita(visitante: string, origen: string | null): Observable<void> {
    return this.http
      .post<void>(`${this.api}/embudo/visita`, { visitante, pagina: 'planes', origen: origen ?? undefined })
      .pipe(map(() => undefined));
  }

  embudo(dias: number): Observable<Embudo> {
    return this.http
      .get<ApiResponse<Embudo>>(`${this.api}/embudo`, { params: { dias } })
      .pipe(map((res) => res.data));
  }

  // ── Referidos ──────────────────────────────────────────────────────────

  misReferidos(): Observable<MisReferidos> {
    return this.http
      .get<ApiResponse<MisReferidos>>(`${this.api}/referidos/mio`)
      .pipe(map((res) => res.data));
  }

  /** Público: de quién es un código, para saludar al que llega con él. */
  deQuienEs(codigo: string): Observable<{ nombre: string; dias: number }> {
    return this.http
      .get<ApiResponse<{ nombre: string; dias: number }>>(
        `${this.api}/referidos/codigo/${encodeURIComponent(codigo)}`,
      )
      .pipe(map((res) => res.data));
  }

  apuntarse(codigo: string): Observable<{ nombre: string; dias: number; yaEstaba: boolean }> {
    return this.http
      .post<ApiResponse<{ nombre: string; dias: number; yaEstaba: boolean }>>(
        `${this.api}/referidos/apuntarse`,
        { codigo },
      )
      .pipe(map((res) => res.data));
  }

  referidosDelPanel(): Observable<ReferidoDelPanel[]> {
    return this.http
      .get<ApiResponse<{ referidos: ReferidoDelPanel[] }>>(`${this.api}/referidos`)
      .pipe(map((res) => res.data.referidos));
  }

  anularReferido(id: string): Observable<void> {
    return this.http
      .post<ApiResponse<{ id: string }>>(`${this.api}/referidos/${id}/anular`, {})
      .pipe(map(() => undefined));
  }

  // ── Recordatorios de avance ────────────────────────────────────────────

  recordatorios(): Observable<boolean> {
    return this.http
      .get<ApiResponse<{ activos: boolean }>>(`${this.api}/avisos/preferencia`)
      .pipe(map((res) => res.data.activos));
  }

  cambiarRecordatorios(activos: boolean): Observable<boolean> {
    return this.http
      .put<ApiResponse<{ activos: boolean }>>(`${this.api}/avisos/preferencia`, { activos })
      .pipe(map((res) => res.data.activos));
  }
}
