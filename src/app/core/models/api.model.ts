/**
 * Contrato de respuestas del backend. Toda la API responde con esta forma,
 * así que el cliente siempre desenvuelve igual.
 */
export interface ApiResponse<T> {
  success: true;
  message?: string;
  data: T;
}

/** Error de validación por campo, tal como lo emite el middleware `validate`. */
export interface FieldError {
  /** Ruta del campo, p. ej. `body.email`. */
  field: string;
  message: string;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: FieldError[];
}

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

/**
 * Códigos estables definidos en `backend/src/config/constants.js`.
 * Se ramifica sobre el código, nunca sobre el texto del mensaje.
 */
export const ERROR_CODE = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_VERIFICATION_CODE: 'INVALID_VERIFICATION_CODE',
  REGISTRATION_PASSWORD_MISMATCH: 'REGISTRATION_PASSWORD_MISMATCH',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  NO_BALANCE: 'NO_BALANCE',
  TEXT_TOO_LONG: 'TEXT_TOO_LONG',
  REWRITE_UNAVAILABLE: 'REWRITE_UNAVAILABLE',
  REWRITE_REFUSED: 'REWRITE_REFUSED',
  REWRITE_FAILED: 'REWRITE_FAILED',
  PAYMENT_UNAVAILABLE: 'PAYMENT_UNAVAILABLE',
  PLAN_NOT_PURCHASABLE: 'PLAN_NOT_PURCHASABLE',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  /** El banco rechazó la tarjeta; la orden sigue abierta para probar otra. */
  PAYMENT_DECLINED: 'PAYMENT_DECLINED',
  DISCOUNT_INVALID: 'DISCOUNT_INVALID',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** La base de datos no responde: lo recoge la pantalla de mantenimiento. */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  /** El asistente no contesta. Propio para NO encender la pantalla de mantenimiento. */
  ASSISTANT_UNAVAILABLE: 'ASSISTANT_UNAVAILABLE',
  /** «Preparar documento» está apagado en el servidor. Tampoco tapa la web. */
  PREPARAR_UNAVAILABLE: 'PREPARAR_UNAVAILABLE',
  /** Sin membresía, caducada o sin documentos este mes. Ver `preparar.membresia`. */
  NO_DOCUMENTOS: 'NO_DOCUMENTOS',
  /** Solo del cliente: el servidor no respondió. */
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];
