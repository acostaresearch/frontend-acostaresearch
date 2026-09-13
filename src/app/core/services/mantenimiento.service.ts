import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
import { ApiError, ERROR_CODE } from '../models/api.model';

/** Cada cuánto se pregunta si el servicio volvió. Es el `Retry-After` del backend. */
export const COMPROBAR_CADA_MS = 30 * 1000;

/**
 * ¿Este fallo significa que el servicio no está, y no que la petición esté mal?
 *
 * Dos casos:
 * - El backend responde 503 con `SERVICE_UNAVAILABLE`: la base no contesta.
 *   Hay otros 503 con su propio código —el pago o la reescritura sin configurar—
 *   y esos NO son mantenimiento: el resto del sitio funciona.
 * - 502, 503 o 504 sin cuerpo de la API: el proceso del backend no está, y quien
 *   contesta es Caddy o Cloudflare.
 *
 * El estado 0 se deja fuera a propósito. Es también lo que se ve cuando se le
 * cae el wifi a quien navega, y decirle entonces que el sitio está en
 * mantenimiento sería mentirle.
 */
export function esCaidaDelServicio(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) return false;

  const codigo = (error.error as { error?: ApiError } | null)?.error?.code;
  if (codigo) return codigo === ERROR_CODE.SERVICE_UNAVAILABLE;

  return error.status === 502 || error.status === 503 || error.status === 504;
}

/**
 * La pantalla de «estamos en mantenimiento».
 *
 * Se enciende sola cuando una petición a la API vuelve con una caída (lo decide
 * el interceptor) y se apaga sola cuando `/health/bd` vuelve a contestar. No hay
 * cuenta atrás: no sabemos cuándo vuelve la base, y un contador que llega a cero
 * sin que pase nada enseña a no creerse la pantalla.
 */
@Injectable({ providedIn: 'root' })
export class MantenimientoService {
  private readonly http = inject(HttpClient);

  private readonly activoSignal = signal(false);
  private readonly comprobandoSignal = signal(false);

  readonly activo = this.activoSignal.asReadonly();
  readonly comprobando = this.comprobandoSignal.asReadonly();

  private temporizador: ReturnType<typeof setTimeout> | null = null;

  /**
   * Si la caída pilló al arrancar, la sesión no llegó a restaurarse y la página
   * que hay debajo se montó sin datos. Al volver no basta con quitar la
   * pantalla: hay que recargar. A mitad de sesión, en cambio, no se recarga,
   * para no llevarse lo que la persona tuviera escrito.
   */
  private recargarAlVolver = false;

  activar(): void {
    if (this.activoSignal()) return;
    this.activoSignal.set(true);
    this.programar();
  }

  /** Lo llama el arranque cuando la caída le impidió restaurar la sesión. */
  recargarCuandoVuelva(): void {
    this.recargarAlVolver = true;
  }

  comprobarAhora(): void {
    if (this.comprobandoSignal()) return;
    this.cancelar();
    this.comprobandoSignal.set(true);

    this.http.get(`${environment.apiUrl}/health/bd`).subscribe({
      next: () => {
        this.comprobandoSignal.set(false);
        this.volvio();
      },
      error: () => {
        this.comprobandoSignal.set(false);
        this.programar();
      },
    });
  }

  private volvio(): void {
    this.cancelar();
    this.activoSignal.set(false);
    if (this.recargarAlVolver) location.reload();
  }

  private programar(): void {
    this.cancelar();
    this.temporizador = setTimeout(() => this.comprobarAhora(), COMPROBAR_CADA_MS);
  }

  private cancelar(): void {
    if (this.temporizador !== null) clearTimeout(this.temporizador);
    this.temporizador = null;
  }
}
