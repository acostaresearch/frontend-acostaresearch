import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiError, ERROR_CODE } from '../models/api.model';
import { AuthService } from '../services/auth.service';
import { esCaidaDelServicio } from '../services/mantenimiento.service';

/** Rutas que no deben reintentarse tras un refresh: son las que lo gestionan. */
const RUTAS_SIN_REINTENTO = ['/auth/login', '/auth/register', '/auth/refresh'];

function esRutaDeSesion(req: HttpRequest<unknown>): boolean {
  return RUTAS_SIN_REINTENTO.some((ruta) => req.url.includes(ruta));
}

function codigoDeError(error: unknown): string | null {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: ApiError } | null;
    return body?.error?.code ?? null;
  }
  return null;
}

/**
 * Adjunta el access token, envía la cookie de refresh y, cuando el token
 * caduca, lo renueva y reintenta la petición original una sola vez.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // No tocar peticiones a terceros: nunca se les manda el token ni las cookies.
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  const autorizar = (request: HttpRequest<unknown>, token: string | null) =>
    // `withCredentials` es imprescindible: sin él el navegador no envía la
    // cookie httpOnly del refresh en peticiones a otro origen.
    request.clone({
      withCredentials: true,
      setHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    });

  const peticion = autorizar(req, auth.accessToken());

  return next(peticion).pipe(
    catchError((error: unknown) => {
      const expirado =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        codigoDeError(error) === ERROR_CODE.TOKEN_EXPIRED;

      if (!expirado || esRutaDeSesion(req)) {
        return throwError(() => error);
      }

      // Un solo refresh compartido para todas las peticiones que fallen a la vez.
      return auth.refreshAccessToken().pipe(
        switchMap((token) => next(autorizar(req, token))),
        catchError((errorDeRefresh: unknown) => {
          // Con la base caída el refresh falla aunque la sesión esté bien. Echar
          // a la persona al login sería perderle la sesión por un corte de
          // cinco minutos: se deja como está y la pantalla de mantenimiento
          // cubre el rato.
          if (esCaidaDelServicio(errorDeRefresh)) {
            return throwError(() => errorDeRefresh);
          }

          // El refresh también falló: la sesión murió de verdad.
          auth.clearSession();
          void router.navigate(['/auth/login'], {
            queryParams: { returnUrl: router.url, expirada: '1' },
          });
          return throwError(() => errorDeRefresh);
        }),
      );
    }),
  );
};
