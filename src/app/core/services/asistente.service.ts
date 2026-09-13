import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Un turno de la conversación, en el formato que espera la API. */
export interface MensajeAsistente {
  rol: 'usuario' | 'asistente';
  texto: string;
}

export interface ConsultaAsistente {
  /** La historia entera: el servidor no guarda nada, así que viaja cada vez. */
  mensajes: MensajeAsistente[];
  /** Solo el camino, sin consulta ni fragmento. */
  pagina: string;
  conSesion: boolean;
}

@Injectable({ providedIn: 'root' })
export class AsistenteService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/asistente`;

  /** Si el servidor tiene el asistente encendido. Sin clave de Gemini, no. */
  activo(): Observable<boolean> {
    return this.http
      .get<ApiResponse<{ activo: boolean }>>(this.base)
      .pipe(map((res) => res.data.activo));
  }

  preguntar(consulta: ConsultaAsistente): Observable<string> {
    return this.http
      .post<ApiResponse<{ respuesta: string }>>(`${this.base}/mensaje`, consulta)
      .pipe(map((res) => res.data.respuesta));
  }
}
