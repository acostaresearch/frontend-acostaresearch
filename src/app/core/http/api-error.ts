import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, ERROR_CODE } from '../models/api.model';

/**
 * Normaliza cualquier fallo de HttpClient a un `ApiError`. Los componentes
 * trabajan siempre con esta forma, sin inspeccionar `HttpErrorResponse`.
 */
export function toApiError(error: unknown): ApiError {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: ApiError } | null;
    if (body?.error?.code) {
      return body.error;
    }

    // Status 0: el servidor no respondió (API caída, CORS o sin red).
    if (error.status === 0) {
      return {
        code: ERROR_CODE.NETWORK_ERROR,
        message: 'No se pudo conectar con el servidor. Comprueba que la API esté levantada.',
      };
    }
  }

  return {
    code: ERROR_CODE.INTERNAL_ERROR,
    message: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
  };
}

/** Extrae los errores por campo indexados por nombre de control del formulario. */
export function fieldErrors(error: ApiError): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const detalle of error.details ?? []) {
    // El backend prefija el origen: `body.email` → `email`.
    const control = detalle.field.split('.').slice(1).join('.') || detalle.field;
    mapa[control] = detalle.message;
  }
  return mapa;
}
