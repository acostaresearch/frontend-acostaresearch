import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Un video de la página de tutoriales. */
export interface Tutorial {
  id: string;
  orden: number;
  /** El bloque de la lista: «Para empezar», «Una por Skill». */
  grupo: string;
  /** Lo que va en el círculo en lugar del número, como «S4». Vacío = su número. */
  etiqueta: string;
  titulo: string;
  duracion: string;
  entrada: string;
  /** Ya en lista: el servidor lo guarda como texto y lo parte al devolverlo. */
  puntos: string[];
  /** Vacío = todavía no grabado. La tarjeta lo dice en lugar de dejar un hueco. */
  videoUrl: string;
  /** A qué productos les sirve (códigos de `productos-de-ayuda.ts`). Vacío = a todos. */
  productos: string[];
  active: boolean;
}

/** Lo que se manda al crear o editar. `puntos` va como texto, uno por línea. */
export interface TutorialEnvio {
  orden: number;
  grupo: string;
  etiqueta: string;
  titulo: string;
  duracion: string;
  entrada: string;
  puntos: string;
  videoUrl: string;
  productos: string[];
  active: boolean;
}

/** Un servidor anterior a separar por producto no manda la lista: vacía = en todos. */
const conProductos = (tutorial: Tutorial): Tutorial => ({
  ...tutorial,
  productos: tutorial.productos ?? [],
});

@Injectable({ providedIn: 'root' })
export class TutorialService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/tutoriales`;

  /** Público: lo que pinta la página. Solo lo activo. */
  publicos(): Observable<Tutorial[]> {
    return this.http
      .get<ApiResponse<{ tutoriales: Tutorial[] }>>(this.base)
      .pipe(map((res) => res.data.tutoriales.map(conProductos)));
  }

  /**
   * Los productos que compró quien tiene la sesión, para enseñarle solo sus
   * videos y sus guías. Null = sin filtro: el administrador, quien no compró
   * nada todavía, o un fallo (antes verlo todo que quedarse sin ayuda).
   * Pide sesión: sin ella no se llama.
   */
  misProductos(): Observable<string[] | null> {
    return this.http
      .get<ApiResponse<{ todos: boolean; productos: string[] }>>(`${this.base}/mis-productos`)
      .pipe(
        map((res) =>
          res.data.todos || res.data.productos.length === 0 ? null : res.data.productos,
        ),
        catchError(() => of(null)),
      );
  }

  /** Panel: todo, incluido lo apagado. */
  todos(): Observable<Tutorial[]> {
    return this.http
      .get<ApiResponse<{ tutoriales: Tutorial[] }>>(`${this.base}/todos`)
      .pipe(map((res) => res.data.tutoriales.map(conProductos)));
  }

  crear(datos: TutorialEnvio): Observable<Tutorial> {
    return this.http
      .post<ApiResponse<{ tutorial: Tutorial }>>(this.base, datos)
      .pipe(map((res) => conProductos(res.data.tutorial)));
  }

  actualizar(id: string, datos: Partial<TutorialEnvio>): Observable<Tutorial> {
    return this.http
      .patch<ApiResponse<{ tutorial: Tutorial }>>(`${this.base}/${id}`, datos)
      .pipe(map((res) => conProductos(res.data.tutorial)));
  }

  /** El título del video según YouTube (oEmbed, por el servidor). Null si no contesta. */
  tituloDeYouTube(videoId: string): Observable<string | null> {
    return this.http
      .get<ApiResponse<{ titulo: string | null }>>(`${this.base}/youtube/${videoId}`)
      .pipe(map((res) => res.data.titulo));
  }

  /** «De qué va» y los puntos, escritos por la IA viendo el video (unos segundos). */
  resumenDeYouTube(videoId: string): Observable<{ entrada: string; puntos: string[] }> {
    return this.http
      .post<
        ApiResponse<{ entrada: string; puntos: string[] }>
      >(`${this.base}/youtube/${videoId}/resumen`, {})
      .pipe(map((res) => res.data));
  }

  /** Guarda el orden de arrastrar: todos los ids, como quedan. Devuelve la lista renumerada. */
  reordenar(ids: string[]): Observable<Tutorial[]> {
    return this.http
      .put<ApiResponse<{ tutoriales: Tutorial[] }>>(`${this.base}/orden`, { ids })
      .pipe(map((res) => res.data.tutoriales.map(conProductos)));
  }

  borrar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
