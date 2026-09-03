import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { Rewrite, RewriteRequest } from '../models/rewrite.model';

@Injectable({ providedIn: 'root' })
export class RewriteService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/rewrites`;

  /** Puede tardar bastante: el modelo reescribe el texto completo. */
  create(payload: RewriteRequest): Observable<Rewrite> {
    return this.http
      .post<ApiResponse<{ rewrite: Rewrite }>>(this.base, payload)
      .pipe(map((res) => res.data.rewrite));
  }

  list(page = 1, perPage = 10) {
    const params = new HttpParams().set('page', page).set('perPage', perPage);
    return this.http
      .get<ApiResponse<{ rewrites: Rewrite[]; meta: unknown }>>(this.base, { params })
      .pipe(map((res) => res.data.rewrites));
  }

  get(id: string): Observable<Rewrite> {
    return this.http
      .get<ApiResponse<{ rewrite: Rewrite }>>(`${this.base}/${id}`)
      .pipe(map((res) => res.data.rewrite));
  }
}
