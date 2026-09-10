import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { Descuento } from '../models/payment.model';
import { Balance, Plan } from '../models/rewrite.model';

/**
 * Un grupo de skills, tal como lo administra el panel.
 *
 * Es un producto vendible: sus capítulos, su precio y su duración. En la base
 * de datos es un plan de tipo LICENSE; aquí se le llama grupo porque es como lo
 * piensa quien lo crea.
 */
export interface Grupo {
  id: string;
  code: string;
  productCode: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  priceUsdCents: number | null;
  /** Precio tachado. Nulo = sin oferta. No se cobra nunca. */
  listPriceCents: number | null;
  currency: string;
  durationDays: number;
  active: boolean;
  sortOrder: number;
  mcpCallsPerDay: number;
  mcpDelivery: string;
  /** Cuántos capítulos cuelgan de él. Lo calcula el servidor. */
  skills: number;
}

export interface DatosGrupo {
  code?: string;
  name?: string;
  description?: string;
  priceCents?: number;
  priceUsdCents?: number;
  /** Nulo = quitar la oferta; ausente = no tocarla. */
  listPriceCents?: number | null;
  durationDays?: number;
  mcpCallsPerDay?: number;
  active?: boolean;
}

/**
 * Un código anunciado en la página de precios.
 *
 * Lleva lo justo: el código, cuánto rebaja y a qué plan. Ni los usos que quedan
 * —eso invita a correr y es una urgencia que nadie ha comprobado— ni la nota,
 * que es del administrador y suele decir de qué campaña salió.
 */
export interface Promo {
  code: string;
  amountCents: number;
  /** Nulo = vale para cualquier plan. */
  planCode: string | null;
}

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

  /**
   * Los códigos que se anuncian junto a cada plan.
   *
   * Público por lo mismo que los precios: quien mira cuánto cuesta todavía no
   * tiene cuenta, y es a quien hay que enseñarle que existe un código. El
   * servidor solo devuelve los marcados como públicos y utilizables hoy.
   */
  promos(): Observable<Promo[]> {
    return this.http
      .get<ApiResponse<{ promos: Promo[] }>>(`${this.base}/promos`)
      .pipe(map((res) => res.data.promos));
  }

  // ── Grupos de skills (administración) ────────────────────────────────────
  //
  // `plans()` devuelve solo los activos porque es lo que ve un comprador. El
  // panel necesita también los retirados, así que van por su propia ruta.

  grupos(): Observable<Grupo[]> {
    return this.http
      .get<ApiResponse<{ products: Grupo[] }>>(`${this.base}/products`)
      .pipe(map((res) => res.data.products));
  }

  crearGrupo(datos: DatosGrupo): Observable<Grupo> {
    return this.http
      .post<ApiResponse<{ product: Grupo }>>(`${this.base}/products`, datos)
      .pipe(map((res) => res.data.product));
  }

  actualizarGrupo(code: string, cambios: DatosGrupo): Observable<Grupo> {
    return this.http
      .patch<ApiResponse<{ product: Grupo }>>(`${this.base}/products/${code}`, cambios)
      .pipe(map((res) => res.data.product));
  }

  /**
   * Borra un grupo. El servidor se niega —y dice por qué— si tiene licencias,
   * pagos o capítulos: para eso está «Retirar», que lo saca de la venta sin
   * tocar lo ya vendido.
   */
  eliminarGrupo(code: string): Observable<{ code: string; name: string }> {
    return this.http
      .delete<ApiResponse<{ product: { code: string; name: string } }>>(
        `${this.base}/products/${code}`,
      )
      .pipe(map((res) => res.data.product));
  }

  /**
   * Comprueba un código promocional. El precio final lo calcula el servidor:
   * aquí solo viaja el código.
   */
  validarDescuento(code: string, planCode: string): Observable<Descuento> {
    return this.http
      .post<ApiResponse<{ discount: Descuento }>>(`${this.base}/discounts/validate`, {
        code,
        planCode,
      })
      .pipe(map((res) => res.data.discount));
  }

  balance(): Observable<Balance> {
    return this.http
      .get<ApiResponse<{ balance: Balance }>>(`${this.base}/balance`)
      .pipe(map((res) => res.data.balance));
  }
}
