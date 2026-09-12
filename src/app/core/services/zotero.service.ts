import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/** Una colección de su Zotero, con el camino delante si está anidada. */
export interface ColeccionDeZotero {
  clave: string;
  /** «Tesis › Antecedentes». El servidor arma el camino. */
  nombre: string;
  cuantas: number;
}

/**
 * Cómo está su conexión.
 *
 * `disponible` no es lo mismo que `conectado`: lo primero dice si el servidor
 * tiene configurada la aplicación de Zotero, y si no la tiene no se ofrece el
 * botón. Una función a medio conectar enseña a desconfiar del resto.
 */
export interface EstadoDeZotero {
  disponible: boolean;
  conectado: boolean;
  usuario?: string | null;
  coleccion?: { clave: string; nombre: string | null } | null;
  /** Cuántas fuentes suyas vinieron de esta colección. */
  fuentes?: number;
  ultima?: string | null;
  /** Hay una pasada en marcha ahora mismo. */
  trayendo?: boolean;
  /** Lo último que falló, en sus palabras. Nulo si la última pasada fue bien. */
  error?: string | null;
}

/**
 * Lo que se puede elegir: sus colecciones y la biblioteca entera.
 *
 * La entera va aparte y no como una colección más de la lista porque no lo es:
 * no tiene clave propia —se pide con un asterisco— y no aparece en el Zotero de
 * nadie. Mezclarla en el array obligaría a distinguirla por su nombre.
 */
export interface QuePuedeTraer {
  biblioteca: { clave: string; cuantas: number | null };
  colecciones: ColeccionDeZotero[];
}

export interface ResultadoDeSincronizar {
  guardadas: number;
  retiradas: number;
  total: number;
}

/**
 * El Zotero del propio comprador.
 *
 * Ojo con no confundirlo con `/referencias`, que es el corpus de la casa: aquel
 * lo administra Acosta y este lo conecta cada tesista con su cuenta.
 *
 * La clave de Zotero NUNCA pasa por aquí. El intercambio ocurre entre el
 * navegador, zotero.org y el servidor; lo que este servicio pide es la
 * dirección a la que mandar al tesista, y lo que vuelve es el estado.
 */
@Injectable({ providedIn: 'root' })
export class ZoteroService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/mi-zotero`;

  estado(): Observable<EstadoDeZotero> {
    return this.http
      .get<ApiResponse<{ zotero: EstadoDeZotero }>>(`${this.base}/estado`)
      .pipe(map((res) => res.data.zotero));
  }

  /**
   * Pide la dirección de autorización.
   *
   * No redirige el servidor: devuelve la URL y la abre el navegador. Una
   * redirección dentro de una llamada de datos la seguiría el propio cliente
   * HTTP, sin que el tesista vea nunca a dónde va.
   */
  conectar(): Observable<{ url: string }> {
    return this.http
      .post<ApiResponse<{ url: string }>>(`${this.base}/conectar`, {})
      .pipe(map((res) => res.data));
  }

  colecciones(): Observable<QuePuedeTraer> {
    return this.http
      .get<ApiResponse<QuePuedeTraer>>(`${this.base}/colecciones`)
      .pipe(map((res) => res.data));
  }

  elegir(clave: string): Observable<{ coleccion: ColeccionDeZotero }> {
    return this.http
      .put<ApiResponse<{ coleccion: ColeccionDeZotero }>>(`${this.base}/coleccion`, { clave })
      .pipe(map((res) => res.data));
  }

  sincronizar(): Observable<ResultadoDeSincronizar> {
    return this.http
      .post<ApiResponse<ResultadoDeSincronizar>>(`${this.base}/sincronizar`, {})
      .pipe(map((res) => res.data));
  }

  desconectar(): Observable<{ ok: boolean }> {
    return this.http
      .delete<ApiResponse<{ ok: boolean }>>(this.base)
      .pipe(map((res) => res.data));
  }
}
