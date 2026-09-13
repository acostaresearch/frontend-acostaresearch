import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { MantenimientoService, esCaidaDelServicio } from '../services/mantenimiento.service';

/**
 * Enciende la pantalla de mantenimiento cuando la API dice que no está.
 *
 * No se traga el error: la petición sigue fallando para quien la hizo, que ya
 * sabe qué hacer con un fallo. Esto solo añade la pantalla por encima.
 *
 * Va el primero de la cadena para ver el error después de que el interceptor
 * de sesión haya intentado su refresh.
 */
export const mantenimientoInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const mantenimiento = inject(MantenimientoService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (esCaidaDelServicio(error)) mantenimiento.activar();
      return throwError(() => error);
    }),
  );
};
