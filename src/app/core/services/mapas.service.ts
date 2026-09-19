import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Los análisis del asistente «Create map» de VOSviewer. */
export type TipoDeAnalisis =
  | 'coocurrencia'
  | 'coautoria'
  | 'citacion'
  | 'acoplamiento'
  | 'cocitacion'
  | 'terminos';

export type UnidadDeAnalisis =
  | 'palabras-autor'
  | 'palabras-openalex'
  | 'autores'
  | 'instituciones'
  | 'paises'
  | 'fuentes'
  | 'documentos'
  | 'referencias'
  | 'titulo-resumen'
  | 'titulo';

export type Recuento = 'completo' | 'fraccionado' | 'binario';

/** Qué son los círculos, y por tanto qué columnas tiene la tabla. */
export type PerfilDelMapa = 'terminos' | 'unidades' | 'documentos' | 'referencias';

/** Lo que se pide para armar un mapa. Ver `mapas.schema.js` en el backend. */
export interface PedidoDeMapa {
  origen: 'openalex' | 'mis-fuentes';
  analisis: TipoDeAnalisis;
  unidad: UnidadDeAnalisis;
  tema?: string;
  desdeAnio?: number | null;
  hastaAnio?: number | null;
  cuantas?: number;
  recuento?: Recuento;
  /** Nulo: que lo elija el servidor, como el umbral de VOSviewer. */
  minimo?: number | null;
  minimoCitas?: number | null;
  maximo?: number;
  maxAutores?: number | null;
  relevancia?: number | null;
  excluir?: string;
  sinonimos?: string;
}

/** Una fila de la tabla: los números de un círculo del mapa. */
export interface FilaDelMapa {
  etiqueta: string;
  url: string | null;
  documentos: number;
  ocurrencias: number;
  citas: number;
  citasNorm: number;
  enlaces: number;
  fuerza: number;
  /** Año promedio, o el año del documento o de la referencia. */
  anio: number | null;
  citasProm: number;
  citasNormProm: number;
  /** La relevancia, en los mapas de términos. */
  extra?: number;
}

export interface MapaDeVosviewer {
  /** El JSON de VOSviewer tal cual: se le pasa al visor y se descarga. */
  vosviewer: unknown;
  analisis: TipoDeAnalisis;
  unidad: UnidadDeAnalisis;
  recuento: Recuento;
  perfil: PerfilDelMapa;
  resumen: {
    documentos: number;
    documentosConUnidades: number;
    unidadesDistintas: number;
    minimo: number;
    minimoAutomatico: boolean;
    minimoCitas: number;
    cumplenMinimo: number;
    enElMapa: number;
    sinEnlaces: number;
    enlaces: number;
    fuerzaTotal: number;
    conAnio: boolean;
    filas: FilaDelMapa[];
  };
  /** Lo que conviene contarle al tesista de cómo salió. */
  detalle: {
    conDoi?: number;
    encontradas?: number;
    sinDoi?: number;
    sinCitas?: boolean;
    referenciasDistintas?: number;
    terminos?: {
      distintos: number;
      minimo: number;
      candidatos: number;
      seleccionados: number;
      porcentaje: number;
      recuento: 'binario' | 'completo';
      conResumen: number;
    };
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

  crear(pedido: PedidoDeMapa): Observable<MapaDeVosviewer> {
    return this.http
      .post<ApiResponse<MapaDeVosviewer>>(`${this.base}/mapa`, pedido)
      .pipe(map((res) => res.data));
  }
}
