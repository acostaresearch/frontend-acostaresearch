import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Si el enlace que dio Claude sigue valiendo. */
export interface EnlaceDeSubida {
  caduca: string;
  /** Falso = el motor de R está apagado en el servidor. */
  disponible: boolean;
}

/** Lo que R leyó del archivo. Solo la forma: ningún valor de ninguna persona. */
export interface DatosSubidos {
  leido: boolean;
  /** «bibliografia» si subió el exporte de Scopus, WoS o PubMed: cada fila es un documento. */
  tipo?: 'matriz' | 'bibliografia';
  filas: number | null;
  columnas: string[];
  /** Cómo estaba escrito el archivo, si tuvo algo que decir (punto y coma, codificación). */
  aviso: string | null;
  /** Si R no pudo leerlo, las últimas líneas de su consola. */
  detalle: string | null;
}

/**
 * La subida de la matriz para el análisis que hace Claude.
 *
 * No lleva sesión: el token del enlace es la llave. Quien llega aquí viene de la
 * conversación con Claude y no tiene por qué haber entrado en la web.
 */
@Injectable({ providedIn: 'root' })
export class DatosRService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/r/subir`;

  comprobar(token: string): Observable<EnlaceDeSubida> {
    return this.http
      .get<ApiResponse<EnlaceDeSubida>>(`${this.base}/${encodeURIComponent(token)}`)
      .pipe(map((res) => res.data));
  }

  /** El archivo va tal cual, como bytes: el formato lo decide el servidor leyéndolo. */
  subir(token: string, archivo: File): Observable<DatosSubidos> {
    return this.http
      .post<ApiResponse<DatosSubidos>>(`${this.base}/${encodeURIComponent(token)}`, archivo, {
        headers: { 'Content-Type': 'application/octet-stream' },
      })
      .pipe(map((res) => res.data));
  }
}
