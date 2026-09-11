import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

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
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class TutorialService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/tutoriales`;

  /** Público: lo que pinta la página. Solo lo activo. */
  publicos(): Observable<Tutorial[]> {
    return this.http
      .get<ApiResponse<{ tutoriales: Tutorial[] }>>(this.base)
      .pipe(map((res) => res.data.tutoriales));
  }

  /** Panel: todo, incluido lo apagado. */
  todos(): Observable<Tutorial[]> {
    return this.http
      .get<ApiResponse<{ tutoriales: Tutorial[] }>>(`${this.base}/todos`)
      .pipe(map((res) => res.data.tutoriales));
  }

  crear(datos: TutorialEnvio): Observable<Tutorial> {
    return this.http
      .post<ApiResponse<{ tutorial: Tutorial }>>(this.base, datos)
      .pipe(map((res) => res.data.tutorial));
  }

  actualizar(id: string, datos: Partial<TutorialEnvio>): Observable<Tutorial> {
    return this.http
      .patch<ApiResponse<{ tutorial: Tutorial }>>(`${this.base}/${id}`, datos)
      .pipe(map((res) => res.data.tutorial));
  }

  borrar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
