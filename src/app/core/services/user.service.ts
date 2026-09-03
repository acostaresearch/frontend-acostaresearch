import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { User } from '../models/user.model';

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
