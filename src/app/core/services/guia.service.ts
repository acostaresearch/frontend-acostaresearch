import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/**
 * El bloque en el que sale una guía. Los mismos códigos que el servidor
 * (`guia.schema.js`). Los videos usan los mismos para su pestaña (`apartado`).
 */
export type GrupoDeGuia = 'instalacion' | 'herramientas' | 'producto';

/** Los bloques, en el orden en que se enseñan. */
export const GRUPOS_DE_GUIA: readonly { codigo: GrupoDeGuia; nombre: string }[] = [
  { codigo: 'instalacion', nombre: 'Guías de instalación' },
  { codigo: 'herramientas', nombre: 'Guías de herramientas' },
  { codigo: 'producto', nombre: 'Guías de uso' },
];

/** Las pestañas de un video en el panel, con el nombre corto que se ve en la ficha (21-oct). */
export const APARTADOS_DE_VIDEO: readonly { codigo: GrupoDeGuia; nombre: string }[] = [
  { codigo: 'producto', nombre: 'Del producto' },
  { codigo: 'instalacion', nombre: 'Instalación' },
  { codigo: 'herramientas', nombre: 'Herramientas' },
];

/** Un código que no se conoce (un servidor anterior no lo manda) queda en `porDefecto`. */
export function grupoConocido(codigo: unknown, porDefecto: GrupoDeGuia): GrupoDeGuia {
  return GRUPOS_DE_GUIA.some((g) => g.codigo === codigo) ? (codigo as GrupoDeGuia) : porDefecto;
}

/** Una guía en PDF de la página de guías. */
export interface Guia {
  id: string;
  orden: number;
  titulo: string;
  /** Qué trae, en una o dos frases. */
  descripcion: string;
  /** Cómo se llamaba el archivo al subirlo. */
  archivoNombre: string;
  /** Lo que pesa el PDF. Cero = todavía sin archivo. */
  bytes: number;
  /** A qué productos les sirve (códigos de `productos-de-ayuda.ts`). Vacío = a todos. */
  productos: string[];
  /** Su bloque. Un servidor anterior no lo manda: entonces es de instalación. */
  grupo: GrupoDeGuia;
  active: boolean;
  updatedAt: string;
}

/** La ficha que se escribe en el panel. */
export interface GuiaEnvio {
  orden: number;
  titulo: string;
  descripcion: string;
  productos: string[];
  grupo: GrupoDeGuia;
  active: boolean;
}

/** Un servidor anterior a separar por producto no manda la lista: vacía = en todos. */
const conProductos = (guia: Guia): Guia => ({
  ...guia,
  productos: guia.productos ?? [],
  grupo: grupoConocido(guia.grupo, 'instalacion'),
});

@Injectable({ providedIn: 'root' })
export class GuiaService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/guias`;

  /** Público: solo las visibles y con PDF. */
  publicas(): Observable<Guia[]> {
    return this.http.get<ApiResponse<{ guias: Guia[] }>>(this.base).pipe(map((r) => r.data.guias.map(conProductos)));
  }

  /** Panel: todas, incluidas las ocultas. */
  todas(): Observable<Guia[]> {
    return this.http
      .get<ApiResponse<{ guias: Guia[] }>>(`${this.base}/todas`)
      .pipe(map((r) => r.data.guias.map(conProductos)));
  }

  /** Dónde se descarga. Un enlace normal: el servidor la manda como adjunto. */
  enlace(guia: Guia): string {
    return `${this.base}/${guia.id}/pdf`;
  }

  /**
   * Sube una guía nueva. El PDF va en crudo, sin `FormData`, con la ficha en la
   * query y el nombre del archivo en una cabecera.
   */
  crear(datos: GuiaEnvio, archivo: File): Observable<Guia> {
    const params = new HttpParams()
      .set('orden', String(datos.orden))
      .set('titulo', datos.titulo)
      .set('descripcion', datos.descripcion)
      // En la query no cabe una lista: van con comas y el servidor las separa.
      .set('productos', datos.productos.join(','))
      .set('grupo', datos.grupo)
      .set('active', String(datos.active));

    return this.http
      .post<ApiResponse<{ guia: Guia }>>(this.base, archivo, {
        params,
        headers: this.cabeceras(archivo),
      })
      .pipe(map((r) => conProductos(r.data.guia)));
  }

  actualizar(id: string, datos: Partial<GuiaEnvio>): Observable<Guia> {
    return this.http
      .patch<ApiResponse<{ guia: Guia }>>(`${this.base}/${id}`, datos)
      .pipe(map((r) => conProductos(r.data.guia)));
  }

  /** Cambia el PDF de una guía que ya existe, sin tocar su ficha. */
  cambiarArchivo(id: string, archivo: File): Observable<Guia> {
    return this.http
      .put<ApiResponse<{ guia: Guia }>>(`${this.base}/${id}/pdf`, archivo, {
        headers: this.cabeceras(archivo),
      })
      .pipe(map((r) => conProductos(r.data.guia)));
  }

  borrar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  private cabeceras(archivo: File): Record<string, string> {
    return {
      'Content-Type': 'application/pdf',
      // Codificado: una cabecera HTTP no admite tildes tal cual.
      'X-Nombre-Archivo': encodeURIComponent(archivo.name),
    };
  }
}
