import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  ActivarBolsa,
  ActivationCode,
  Alerta,
  CodigoDescuento,
  CrearDescuento,
  GenerarCodigos,
  LicenciaAdmin,
  MetodoDeCobro,
  PackAdmin,
  PagoAdmin,
} from '../models/admin.model';
import { ApiResponse } from '../models/api.model';

/** Lo que devuelve el servidor tras generar códigos. */
export interface CodigosGenerados {
  productCode: string;
  /** Los valores EN CLARO. Es la única vez que se pueden leer. */
  codes: string[];
  /** Identificadores de los códigos creados, para adjuntarles el comprobante. */
  ids: string[];
  /** Correo al que se enviaron, o null si no se indicó ninguno. */
  enviadoA: string | null;
  /** Cobro apuntado, o null si fue una cortesía. */
  cobro: { paymentMethod: MetodoDeCobro; amountCents: number } | null;
}

/**
 * Operaciones del administrador. Todas exigen rol ADMIN en el servidor; el
 * guard del cliente solo evita enseñar una pantalla que no va a funcionar.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly licencias = `${environment.apiUrl}/licenses`;
  private readonly facturacion = `${environment.apiUrl}/billing`;
  private readonly pagos = `${environment.apiUrl}/payments`;

  // ── Códigos de activación ──────────────────────────────────────────────

  /**
   * Genera códigos. La respuesta trae los valores EN CLARO y es la única vez
   * que se pueden leer: en la base de datos solo queda su hash.
   *
   * `enviadoA` dice a qué correo los mandó el servidor, o null si no se indicó
   * ninguno. Se enseña en pantalla para que quien genera sepa si le toca
   * dictarlos por WhatsApp o si el comprador ya los tiene en su bandeja.
   */
  generarCodigos(datos: GenerarCodigos): Observable<CodigosGenerados> {
    return this.http
      .post<ApiResponse<CodigosGenerados>>(`${this.licencias}/codes`, datos)
      .pipe(map((res) => res.data));
  }

  /**
   * Adjunta el comprobante de una venta cobrada fuera de la web.
   *
   * Va en una petición aparte porque la imagen viaja como cuerpo crudo: el
   * resto de la API está limitada a 100 KB, que es demasiado poco para la foto
   * de una pantalla.
   */
  subirComprobanteDeCodigo(id: string, imagen: File): Observable<void> {
    return this.http
      .post<ApiResponse<unknown>>(`${this.licencias}/codes/${id}/proof`, imagen, {
        headers: { 'Content-Type': imagen.type },
      })
      .pipe(map(() => undefined));
  }

  /** La imagen del comprobante. Se pide con el token, así que llega como blob. */
  comprobanteDeCodigo(id: string): Observable<Blob> {
    return this.http.get(`${this.licencias}/codes/${id}/proof`, { responseType: 'blob' });
  }

  codigos(): Observable<ActivationCode[]> {
    return this.http
      .get<ApiResponse<{ codes: ActivationCode[] }>>(`${this.licencias}/codes`)
      .pipe(map((res) => res.data.codes));
  }

  anularCodigo(id: string): Observable<void> {
    return this.http.delete<void>(`${this.licencias}/codes/${id}`);
  }

  /**
   * Lo borra de la lista. Anular es lo otro: deja la fila y su venta apuntada.
   *
   * La licencia que entregó no se toca. Va a una ruta aparte, no a la misma con
   * un parámetro, para que las dos decisiones no se confundan nunca.
   */
  eliminarCodigo(id: string): Observable<void> {
    return this.http.delete<void>(`${this.licencias}/codes/${id}/permanent`);
  }

  // ── Pagos ──────────────────────────────────────────────────────────────

  /**
   * Borra un apunte de pago y, con él, la captura que subió el comprador.
   *
   * Irreversible. Lo entregado NO se toca: si ese pago activó una licencia, la
   * licencia sigue viva; lo que desaparece es el registro del cobro.
   */
  eliminarPago(id: string): Observable<void> {
    return this.http.delete<void>(`${this.pagos}/${id}`);
  }
  // ── Licencias ──────────────────────────────────────────────────────────

  licenciasTodas(): Observable<LicenciaAdmin[]> {
    return this.http
      .get<ApiResponse<{ licenses: LicenciaAdmin[] }>>(this.licencias)
      .pipe(map((res) => res.data.licenses));
  }

  revocar(id: string, reason?: string): Observable<LicenciaAdmin> {
    return this.http
      .post<ApiResponse<{ license: LicenciaAdmin }>>(`${this.licencias}/${id}/revoke`, { reason })
      .pipe(map((res) => res.data.license));
  }

  reactivar(id: string): Observable<LicenciaAdmin> {
    return this.http
      .post<ApiResponse<{ license: LicenciaAdmin }>>(`${this.licencias}/${id}/reactivate`, {})
      .pipe(map((res) => res.data.license));
  }

  /**
   * Mueve una licencia a otro producto y avisa al comprador por correo.
   *
   * NO cambia la URL del conector: el token cuelga de la licencia y la licencia
   * sigue siendo la misma. Lo que cambia es qué capítulos le devuelve, y eso es
   * inmediato.
   */
  cambiarProducto(id: string, productCode: string): Observable<{ license: LicenciaAdmin; mensaje: string }> {
    return this.http
      .post<ApiResponse<{ license: LicenciaAdmin }>>(`${this.licencias}/${id}/product`, {
        productCode,
      })
      .pipe(map((res) => ({ license: res.data.license, mensaje: res.message ?? '' })));
  }

  alertas(): Observable<Alerta[]> {
    return this.http
      .get<ApiResponse<{ alerts: Alerta[] }>>(`${this.licencias}/alerts`)
      .pipe(map((res) => res.data.alerts));
  }

  // ── Bolsas de palabras ─────────────────────────────────────────────────

  /** Activación manual tras confirmar un Yape o una transferencia. */
  activarBolsa(datos: ActivarBolsa): Observable<{ pack: PackAdmin }> {
    return this.http
      .post<ApiResponse<{ pack: PackAdmin }>>(`${this.facturacion}/packs`, datos)
      .pipe(map((res) => res.data));
  }

  bolsasRecientes(): Observable<PackAdmin[]> {
    return this.http
      .get<ApiResponse<{ packs: PackAdmin[] }>>(`${this.facturacion}/packs`)
      .pipe(map((res) => res.data.packs));
  }

  // ── Códigos de descuento ───────────────────────────────────────────────

  crearDescuento(datos: CrearDescuento): Observable<CodigoDescuento> {
    return this.http
      .post<ApiResponse<{ discount: CodigoDescuento }>>(`${this.facturacion}/discounts`, datos)
      .pipe(map((res) => res.data.discount));
  }

  descuentos(): Observable<CodigoDescuento[]> {
    return this.http
      .get<ApiResponse<{ discounts: CodigoDescuento[] }>>(`${this.facturacion}/discounts`)
      .pipe(map((res) => res.data.discounts));
  }

  /** Apaga o vuelve a encender un código sin borrarlo. */
  activarDescuento(id: string, active: boolean): Observable<CodigoDescuento> {
    return this.http
      .patch<ApiResponse<{ discount: CodigoDescuento }>>(`${this.facturacion}/discounts/${id}`, {
        active,
      })
      .pipe(map((res) => res.data.discount));
  }

  // ── Pagos ──────────────────────────────────────────────────────────────

  pagosRecientes(): Observable<PagoAdmin[]> {
    return this.http
      .get<ApiResponse<{ payments: PagoAdmin[] }>>(`${this.pagos}/recent`)
      .pipe(map((res) => res.data.payments));
  }
}
