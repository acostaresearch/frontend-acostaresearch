import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Lo que se pide para armar un mapa. Ver `mapas.schema.js` en el backend. */
export interface PedidoDeMapa {
  origen: 'openalex' | 'mis-fuentes';
  tema?: string;
  desdeAnio?: number | null;
  hastaAnio?: number | null;
  cuantas?: number;
  /** Nulo: que lo elija el servidor, como el umbral de VOSviewer. */
  minimo?: number | null;
  maximo?: number;
  excluir?: string;
  sinonimos?: string;
}

/** Una fila de la tabla de términos. */
export interface TerminoDelMapa {
  termino: string;
  ocurrencias: number;
  enlaces: number;
  fuerza: number;
  anioPromedio: number | null;
  citasPromedio: number;
}

export interface MapaDeCoocurrencia {
  /** El JSON de VOSviewer tal cual: se le pasa al visor y se descarga. */
  vosviewer: unknown;
  resumen: {
    documentos: number;
    documentosConTerminos: number;
    terminosDistintos: number;
    minimo: number;
    minimoAutomatico: boolean;
    cumplenMinimo: number;
    enElMapa: number;
    sinEnlaces: number;
    enlaces: number;
    conAnio: boolean;
    terminos: TerminoDelMapa[];
  };
  /** El par de archivos del VOSviewer de escritorio. */
  archivos: { mapa: string; red: string };
  origen: {
    tipo: 'openalex' | 'mis-fuentes';
    total: number;
    analizados: number;
    tema?: string;
    desdeAnio?: number | null;
    hastaAnio?: number | null;
  };
}

@Injectable({ providedIn: 'root' })
export class MapasService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/mis-mapas`;

  coocurrencia(pedido: PedidoDeMapa): Observable<MapaDeCoocurrencia> {
    return this.http
      .post<ApiResponse<MapaDeCoocurrencia>>(`${this.base}/coocurrencia`, pedido)
      .pipe(map((res) => res.data));
  }
}
