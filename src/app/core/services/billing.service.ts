import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { Balance, Plan } from '../models/rewrite.model';

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/billing`;

  /** Público: no hace falta sesión para ver los precios. */
  plans(): Observable<Plan[]> {
    return this.http
      .get<ApiResponse<{ plans: Plan[] }>>(`${this.base}/plans`)
      .pipe(map((res) => res.data.plans));
  }

  balance(): Observable<Balance> {
    return this.http
      .get<ApiResponse<{ balance: Balance }>>(`${this.base}/balance`)
      .pipe(map((res) => res.data.balance));
  }
}
