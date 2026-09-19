import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/**
 * Cómo está su conexión con Scopus.
 *
 * `disponible` no es lo mismo que `conectado`: lo primero dice si este
 * servidor tiene la API de Scopus encendida y con credenciales, y si no la
 * tiene no se ofrece el botón. Una función a medio conectar enseña a
 * desconfiar del resto.
 */
export interface EstadoDeScopus {
  disponible: boolean;
  /** Con OAuth, «conectar» manda a Elsevier. Sin él, conecta en el momento. */
  conOauth: boolean;
  /**
   * Si las fichas van a traer resumen.
   *
   * Depende de que el servidor tenga token institucional de Elsevier. Sin él,
   * lo que devuelve Scopus es la vista reducida: sin resumen, sin palabras
   * clave y con un solo autor. Se puede citar, pero Claude no la encontrará
   * cuando redacte, así que hay que decirlo antes y no después.
   */
  conResumenes: boolean;
  conectado: boolean;
  estado?: 'ACTIVA' | 'CADUCADA' | 'REVOCADA';
  cuenta?: string | null;
  /** Cuántas fuentes ha traído por aquí en total. */
  importadas?: number;
  ultimaBusqueda?: string | null;
  error?: string | null;
}

/** Un artículo de la lista de resultados. */
export interface ResultadoDeScopus {
  /** Lo único que vuelve al importar. Ver `importar`. */
  eid: string;
  scopusId: string | null;
  titulo: string;
  autores: string;
  anio: number | null;
  revista: string | null;
  /**
   * Volumen, número y páginas, para el «26(1), 534» de debajo de la revista.
   * Opcionales porque un servidor anterior no los manda.
   */
  volumen?: string | null;
  numero?: string | null;
  paginas?: string | null;
  doi: string | null;
  tipo: string | null;
  citas: number;
  accesoAbierto: boolean;
  /** El registro en Scopus, para poder mirarlo antes de decidir. */
  enlace: string | null;
  conResumen: boolean;
  /** Ya está en su biblioteca. Se marca, no se esconde. */
  yaLaTienes: boolean;
}

export interface BusquedaDeScopus {
  total: number;
  pagina: number;
  paginas: number;
  /** El número del primer resultado de esta página, para poder numerarlos. */
  desde: number;
  porPagina: number;
  conResumenes: boolean;
  resultados: ResultadoDeScopus[];
}

export interface ImportacionDeScopus {
  pedidas: number;
  guardadas: number;
  repetidas: number;
  /** Las que Scopus ya no devuelve. */
  noEncontradas: number;
  sinResumen: number;
  total: number;
  sinResumenEnTotal: number;
}

/**
 * Buscar en Scopus e importar lo que elija.
 *
 * LO QUE NUNCA PASA POR AQUÍ
 * --------------------------
 * Ni la clave de Elsevier, ni el token institucional, ni los tokens de
 * autorización. Viven en el servidor y no salen: este servicio pide una
 * dirección a la que ir, manda una ecuación de búsqueda y devuelve
 * identificadores. Nada de eso se guarda en el navegador, ni en
 * `localStorage`, ni en ninguna cookie que este código escriba.
 *
 * Al importar viajan los EID de lo que marcó, no las fichas que se ven en
 * pantalla: el servidor vuelve a pedírselas a Scopus. Si mandara las fichas,
 * lo que acabaría en su bibliografía sería lo que dijera una petición del
 * navegador y no lo que dijo Elsevier.
 */
@Injectable({ providedIn: 'root' })
export class ScopusService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/mi-scopus`;

  estado(): Observable<EstadoDeScopus> {
    return this.http
      .get<ApiResponse<{ scopus: EstadoDeScopus }>>(`${this.base}/estado`)
      .pipe(map((res) => res.data.scopus));
  }

  /**
   * Conecta, o pide la dirección de autorización.
   *
   * `url` con valor = hay que mandar al tesista a Elsevier. Nulo = la conexión
   * quedó hecha aquí mismo, porque este servidor pregunta con su propia clave.
   * El panel no tiene que saber cuál de las dos es: mira si vino dirección.
   */
  conectar(): Observable<{ conectado: boolean; url: string | null }> {
    return this.http
      .post<ApiResponse<{ conectado: boolean; url: string | null }>>(`${this.base}/conectar`, {})
      .pipe(map((res) => res.data));
  }

  buscar(ecuacion: string, pagina = 1): Observable<BusquedaDeScopus> {
    return this.http
      .post<ApiResponse<BusquedaDeScopus>>(`${this.base}/buscar`, { ecuacion, pagina })
      .pipe(map((res) => res.data));
  }

  importar(eids: string[]): Observable<ImportacionDeScopus> {
    return this.http
      .post<ApiResponse<ImportacionDeScopus>>(`${this.base}/importar`, { eids })
      .pipe(map((res) => res.data));
  }

  desconectar(): Observable<{ ok: boolean }> {
    return this.http
      .delete<ApiResponse<{ ok: boolean }>>(this.base)
      .pipe(map((res) => res.data));
  }
}
