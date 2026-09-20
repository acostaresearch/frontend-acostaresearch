import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

export type TipoDeDocumento = 'DNI' | 'CE' | 'PASAPORTE';
export type GradoDeAsesor = 'BACHILLER' | 'MAGISTER' | 'DOCTOR';
export type EstadoDeFicha = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

/** Una opción del catálogo: se guarda el código y se lee el nombre. */
export interface Opcion {
  codigo: string;
  nombre: string;
}

/**
 * Las listas que el formulario necesita para pintarse.
 *
 * Vienen del servidor y no escritas aquí: así abrir un área nueva es tocar un
 * archivo del backend y no dos repositorios.
 */
export interface CatalogosDeAsesor {
  areas: Opcion[];
  metodos: Opcion[];
  grados: Opcion[];
  documentos: Opcion[];
}

/** Lo que ve quien abre el enlace de la convocatoria. */
export interface ConvocatoriaPublica {
  slug: string;
  nombre: string;
  intro: string;
  /** Cerrada, la página se ve igual pero sin formulario. */
  abierta: boolean;
  catalogos: CatalogosDeAsesor;
}

/** La ficha que se envía. */
export interface FichaDeAsesor {
  nombre: string;
  tipoDocumento: TipoDeDocumento;
  numeroDocumento: string;
  email: string;
  telefono: string;
  grado: GradoDeAsesor;
  gradoUniversidad: string;
  gradoAnio: number | string | null;
  registroSunedu: string;
  enlaceCv: string;
  areas: string[];
  metodos: string[];
  especialidad: string;
  universidades: string;
  anosExperiencia: number;
  presentacion: string;
  aceptaReglas: boolean;
}

/** Una ficha recibida, como la lee el panel. */
export interface Asesor {
  id: string;
  convocatoriaId: string;
  nombre: string;
  tipoDocumento: TipoDeDocumento;
  documentoNombre: string;
  numeroDocumento: string;
  email: string;
  telefono: string;
  grado: GradoDeAsesor;
  gradoNombre: string;
  gradoUniversidad: string;
  gradoAnio: number | null;
  registroSunedu: string;
  enlaceCv: string;
  /** Ya traducidas: ['Educación', 'Salud']. */
  areas: string[];
  metodos: string[];
  especialidad: string;
  universidades: string;
  anosExperiencia: number;
  presentacion: string;
  aceptaReglas: boolean;
  estado: EstadoDeFicha;
  notas: string | null;
  revisadoAt: string | null;
  createdAt: string;
}

/** Una convocatoria, vista desde el panel. */
export interface Convocatoria {
  id: string;
  slug: string;
  nombre: string;
  intro: string;
  /** ¿Admite fichas? */
  abierta: boolean;
  /** ¿Se llega sin el enlace? Falso = solo con el slug. */
  publica: boolean;
  /** La página que se reparte a los candidatos. */
  url: string;
  fichas: number;
  pendientes: number;
  createdAt: string;
}

export const NOMBRE_DEL_ESTADO: Record<EstadoDeFicha, string> = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobada',
  RECHAZADO: 'Rechazada',
};

/**
 * El registro de asesores.
 *
 * Tres públicas —la convocatoria por su enlace, la pública si la hay, y
 * postular— y el resto del administrador. Van juntas porque son la misma cosa
 * vista desde los dos lados, como en `PruebaService`.
 */
@Injectable({ providedIn: 'root' })
export class AsesorService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/asesores`;

  // ── Público ────────────────────────────────────────────────────────────

  verConvocatoria(slug: string): Observable<ConvocatoriaPublica> {
    return this.http
      .get<ApiResponse<{ convocatoria: ConvocatoriaPublica }>>(`${this.base}/convocatoria/${slug}`)
      .pipe(map((res) => res.data.convocatoria));
  }

  /**
   * La convocatoria abierta al público, si alguna lo está.
   *
   * Nula mientras el registro siga siendo solo por enlace, y la página se
   * comporta entonces como si no existiera.
   */
  publica(): Observable<ConvocatoriaPublica | null> {
    return this.http
      .get<ApiResponse<{ convocatoria: ConvocatoriaPublica | null }>>(
        `${this.base}/convocatoria/publica`,
      )
      .pipe(map((res) => res.data.convocatoria));
  }

  postular(slug: string, ficha: FichaDeAsesor): Observable<string> {
    return this.http
      .post<ApiResponse<{ recibida: boolean }>>(`${this.base}/convocatoria/${slug}`, ficha)
      .pipe(map((res) => res.message ?? ''));
  }

  // ── Administrador ──────────────────────────────────────────────────────

  listar(): Observable<Asesor[]> {
    return this.http
      .get<ApiResponse<{ asesores: Asesor[] }>>(this.base)
      .pipe(map((res) => res.data.asesores));
  }

  revisar(
    id: string,
    estado: EstadoDeFicha,
    notas: string,
  ): Observable<{ asesor: Asesor; mensaje: string }> {
    return this.http
      .patch<ApiResponse<{ asesor: Asesor }>>(`${this.base}/${id}`, { estado, notas })
      .pipe(map((res) => ({ asesor: res.data.asesor, mensaje: res.message ?? '' })));
  }

  convocatorias(): Observable<Convocatoria[]> {
    return this.http
      .get<ApiResponse<{ convocatorias: Convocatoria[] }>>(`${this.base}/convocatorias`)
      .pipe(map((res) => res.data.convocatorias));
  }

  crearConvocatoria(nombre: string, intro: string): Observable<Convocatoria> {
    return this.http
      .post<ApiResponse<{ convocatoria: Convocatoria }>>(`${this.base}/convocatorias`, {
        nombre,
        intro,
      })
      .pipe(map((res) => res.data.convocatoria));
  }

  /** Abrir, cerrar o hacerla pública. Lo que no se manda, no se toca. */
  cambiarConvocatoria(
    id: string,
    cambios: Partial<Pick<Convocatoria, 'nombre' | 'intro' | 'abierta' | 'publica'>>,
  ): Observable<{ convocatoria: Convocatoria; mensaje: string }> {
    return this.http
      .patch<ApiResponse<{ convocatoria: Convocatoria }>>(
        `${this.base}/convocatorias/${id}`,
        cambios,
      )
      .pipe(map((res) => ({ convocatoria: res.data.convocatoria, mensaje: res.message ?? '' })));
  }
}
