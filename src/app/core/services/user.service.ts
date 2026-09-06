import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { User } from '../models/user.model';

/** Lo que devuelve el servidor al crear una cuenta de administrador. */
export interface AdminCreado {
  user: User;
  /** false si la cuenta se creó pero el correo con las claves no salió. */
  emailSent: boolean;
  /**
   * La contraseña EN CLARO, y solo si la generó el servidor. Es la única vez
   * que se puede leer: quien creó la cuenta necesita poder dictarla si el correo
   * no llega.
   */
  password: string | null;
}

export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/users`;

  /** Perfil del usuario autenticado. */
  me(): Observable<User> {
    return this.http
      .get<ApiResponse<{ user: User }>>(`${this.base}/me`)
      .pipe(map((res) => res.data.user));
  }

  /**
   * Cambia el nombre y el apellido. El correo no se toca desde aquí: es el
   * identificador con el que se entra y cambiarlo es otra operación.
   */
  actualizarPerfil(datos: { firstName: string; lastName: string }): Observable<User> {
    return this.http
      .patch<ApiResponse<{ user: User }>>(`${this.base}/me`, datos)
      .pipe(map((res) => res.data.user));
  }

  /** Manda al correo de la cuenta el código para cambiar la contraseña. */
  pedirCodigoDeClave(): Observable<{ email: string; expiresInMinutes: number }> {
    return this.http
      .post<ApiResponse<{ email: string; expiresInMinutes: number }>>(
        `${this.base}/me/password/code`,
        {},
      )
      .pipe(map((res) => res.data));
  }

  /**
   * Cambia la contraseña con el código del correo.
   *
   * Devuelve cuántas sesiones se cerraron: al cambiarla se echa a todos los
   * demás dispositivos, y decirlo es la única forma de que se note.
   */
  cambiarClave(datos: { code: string; newPassword: string }): Observable<number> {
    return this.http
      .post<ApiResponse<{ sesionesCerradas: number }>>(`${this.base}/me/password`, datos)
      .pipe(map((res) => res.data.sesionesCerradas));
  }

  /** Crea una cuenta de administrador. Solo ADMIN. */
  crearAdministrador(datos: {
    firstName: string;
    lastName: string;
    email: string;
    password?: string;
  }): Observable<AdminCreado> {
    return this.http
      .post<ApiResponse<AdminCreado>>(`${this.base}/admins`, datos)
      .pipe(map((res) => res.data));
  }

  /** Listado paginado. Solo accesible con rol ADMIN. */
  list(options: { page?: number; perPage?: number; search?: string } = {}) {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page);
    if (options.perPage) params = params.set('perPage', options.perPage);
    if (options.search) params = params.set('search', options.search);

    return this.http
      .get<ApiResponse<{ users: User[]; meta: PageMeta }>>(this.base, { params })
      .pipe(map((res) => res.data));
  }
}
