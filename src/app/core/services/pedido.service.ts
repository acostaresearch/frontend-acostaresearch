import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { Convocatoria, Opcion } from './asesor.service';

export type EstadoDePedido = 'RECIBIDO' | 'EN_REVISION' | 'ENTREGADO' | 'CANCELADO';
export type NivelDeTesis = 'PREGRADO' | 'MAESTRIA' | 'DOCTORADO';

/** Las listas que necesita el formulario del tesista. */
export interface CatalogosDePedido {
  areas: Opcion[];
  metodos: Opcion[];
  capitulos: Opcion[];
  niveles: Opcion[];
}

/** Lo que ve quien abre el enlace del formulario. */
export interface ConvocatoriaDeRevision {
  slug: string;
  nombre: string;
  intro: string;
  abierta: boolean;
  catalogos: CatalogosDePedido;
}

/** Lo que acompaña al Word. Viaja en la query, no en el cuerpo. */
export interface DatosDelPedido {
  nombre: string;
  email: string;
  telefono: string;
  universidad: string;
  nivel: NivelDeTesis;
  area: string;
  metodo: string;
  capitulo: string;
  tema: string;
  mensaje: string;
}

/**
 * Lo que el tesista ve de su propio pedido.
 *
 * No trae quién lo está revisando ni las notas internas: durante el piloto el
 * asesor es anónimo para él.
 */
export interface Seguimiento {
  codigo: string;
  nombre: string;
  universidad: string;
  capitulo: string;
  nivel: string;
  estado: EstadoDePedido;
  archivoNombre: string;
  /** Solo llega con valor cuando el pedido está entregado. */
  enlaceObservaciones: string;
  createdAt: string;
  entregadoAt: string | null;
}

/** Un pedido, como lo lee el panel. */
export interface Pedido {
  id: string;
  codigo: string;
  nombre: string;
  email: string;
  telefono: string;
  universidad: string;
  nivel: NivelDeTesis;
  nivelNombre: string;
  area: string;
  areaNombre: string;
  metodo: string;
  metodoNombre: string;
  capitulo: string;
  capituloNombre: string;
  tema: string;
  mensaje: string;
  archivoNombre: string;
  bytes: number;
  estado: EstadoDePedido;
  asesorId: string | null;
  asesor: { id: string; nombre: string; estado: string } | null;
  enlaceObservaciones: string;
  notas: string | null;
  asignadoAt: string | null;
  entregadoAt: string | null;
  createdAt: string;
}

export const NOMBRE_DEL_ESTADO_PEDIDO: Record<EstadoDePedido, string> = {
  RECIBIDO: 'Recibido',
  EN_REVISION: 'En revisión',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

/** Lo que se le dice al tesista en cada estado, en su idioma y no en el nuestro. */
export const PASO_DEL_PEDIDO: Record<EstadoDePedido, string> = {
  RECIBIDO: 'Tenemos tu trabajo y estamos asignándotelo.',
  EN_REVISION: 'Un asesor lo está revisando ahora mismo.',
  ENTREGADO: 'Tus observaciones están listas.',
  CANCELADO: 'Este pedido se canceló.',
};

/**
 * Los encargos de revisión, por los dos lados.
 *
 * El documento va en crudo con su ficha en la query, igual que las guías en
 * PDF: el servidor lo espera así para no montar `multipart` por un solo
 * archivo.
 */
@Injectable({ providedIn: 'root' })
export class PedidoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/pedidos`;

  // ── Público ────────────────────────────────────────────────────────────

  verConvocatoria(slug: string): Observable<ConvocatoriaDeRevision> {
    return this.http
      .get<ApiResponse<{ convocatoria: ConvocatoriaDeRevision }>>(
        `${this.base}/convocatoria/${slug}`,
      )
      .pipe(map((res) => res.data.convocatoria));
  }

  publica(): Observable<ConvocatoriaDeRevision | null> {
    return this.http
      .get<ApiResponse<{ convocatoria: ConvocatoriaDeRevision | null }>>(
        `${this.base}/convocatoria/publica`,
      )
      .pipe(map((res) => res.data.convocatoria));
  }

  enviar(slug: string, datos: DatosDelPedido, archivo: File): Observable<string> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(datos)) {
      params = params.set(clave, String(valor));
    }

    return this.http
      .post<ApiResponse<{ codigo: string }>>(`${this.base}/convocatoria/${slug}`, archivo, {
        params,
        headers: {
          'Content-Type': 'application/octet-stream',
          // Codificado: una cabecera HTTP no admite tildes tal cual.
          'X-Nombre-Archivo': encodeURIComponent(archivo.name),
        },
      })
      .pipe(map((res) => res.data.codigo));
  }

  seguimiento(codigo: string): Observable<Seguimiento> {
    return this.http
      .get<ApiResponse<{ pedido: Seguimiento }>>(`${this.base}/${codigo}`)
      .pipe(map((res) => res.data.pedido));
  }

  // ── Administrador ──────────────────────────────────────────────────────

  listar(): Observable<Pedido[]> {
    return this.http
      .get<ApiResponse<{ pedidos: Pedido[] }>>(`${this.base}/admin/todos`)
      .pipe(map((res) => res.data.pedidos));
  }

  cambiar(
    id: string,
    cambios: Partial<Pick<Pedido, 'estado' | 'asesorId' | 'enlaceObservaciones' | 'notas'>>,
  ): Observable<{ pedido: Pedido; mensaje: string }> {
    return this.http
      .patch<ApiResponse<{ pedido: Pedido }>>(`${this.base}/admin/${id}`, cambios)
      .pipe(map((res) => ({ pedido: res.data.pedido, mensaje: res.message ?? '' })));
  }

  /**
   * El Word que subió el tesista.
   *
   * No puede ser un enlace normal: el documento se sirve por la API y exige el
   * token, que un `target="_blank"` no manda. Se baja con la sesión puesta y se
   * guarda desde el blob, como el comprobante de un código.
   */
  documento(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/admin/${id}/documento`, { responseType: 'blob' });
  }

  convocatorias(): Observable<Convocatoria[]> {
    return this.http
      .get<ApiResponse<{ convocatorias: Convocatoria[] }>>(`${this.base}/admin/convocatorias`)
      .pipe(map((res) => res.data.convocatorias));
  }

  crearConvocatoria(nombre: string, intro: string): Observable<Convocatoria> {
    return this.http
      .post<ApiResponse<{ convocatoria: Convocatoria }>>(`${this.base}/admin/convocatorias`, {
        nombre,
        intro,
      })
      .pipe(map((res) => res.data.convocatoria));
  }

  cambiarConvocatoria(
    id: string,
    cambios: Partial<Pick<Convocatoria, 'nombre' | 'intro' | 'abierta' | 'publica'>>,
  ): Observable<{ convocatoria: Convocatoria; mensaje: string }> {
    return this.http
      .patch<ApiResponse<{ convocatoria: Convocatoria }>>(
        `${this.base}/admin/convocatorias/${id}`,
        cambios,
      )
      .pipe(map((res) => ({ convocatoria: res.data.convocatoria, mensaje: res.message ?? '' })));
  }
}
