import { Balance, WordPack } from './rewrite.model';

/** Pasarela disponible. La lista la decide el servidor según sus credenciales. */
export interface PaymentProvider {
  code: string;
  label: string;
  /** Moneda en la que cobra esta pasarela. PayPal no admite soles: cobra en USD. */
  currency: string;
}

/** Descuento ya resuelto por el servidor para un plan concreto. */
export interface Descuento {
  code: string;
  /** Rebaja anunciada, en céntimos de sol. */
  amountCents: number;
  /** Rebaja equivalente en la moneda de la pasarela. */
  discountUsdCents: number;
  finalPriceCents: number;
  finalPriceUsdCents: number | null;
}

/** Orden abierta en la pasarela. Todavía no se ha cobrado nada. */
export interface PaymentOrder {
  paymentId: string;
  orderId: string;
  approveUrl: string | null;
  amountCents: number;
  currency: string;
  discount: { code: string; amountCents: number } | null;
  plan: { code: string; name: string; words: number };
}

/** Licencia del conector MCP. El token solo se ve en la URL, y solo una vez. */
/**
 * Por dónde va el comprador en su puesta en marcha.
 *
 * Cada campo se calcula en el servidor a partir de lo que OCURRIÓ, no de lo que
 * alguien marcó: `conectado` es cierto porque el servidor oyó una llamada de esa
 * licencia, que es la prueba de que la URL se pegó bien en Claude.
 */
export interface ProgresoDeArranque {
  cuenta: boolean;
  acceso: boolean;
  conectado: boolean;
  capitulo: boolean;
  fuentes: boolean;
}

export interface License {
  id: string;
  productCode: string;
  /**
   * El nombre de venta del producto.
   *
   * La licencia guarda el código porque es lo que no cambia aunque el plan se
   * renombre, pero eso no es lo que se le enseña a nadie: sin esto, el panel
   * decía «METODO_DE_TESIS_HUMANIZADOR» donde tenía que leerse el nombre.
   */
  productName?: string;
  /**
   * El producto ya no se vende.
   *
   * No quiere decir que la licencia no sirva: quien lo compró antes conserva su
   * acceso. Retirar un plan es dejar de venderlo, no quitarle lo pagado a nadie.
   */
  retirado?: boolean;
  tokenHint: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  callsTotal: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Solo cuando está revocada o suspendida. */
  revokedAt?: string | null;
  revokedReason?: string | null;
  /** Topes contratados. 0 = sin tope. */
  callsPerDay?: number;
  callsPerMonth?: number;
  costCentsPerMonth?: number;
  /** Consumo ya normalizado al día y mes en curso. */
  usage?: { callsToday: number; callsMonth: number; costCentsMonth: number };
}

export interface PaymentResult {
  /** true si el pago ya estaba confirmado: un reintento no entrega dos veces. */
  alreadyProcessed: boolean;
  /** Presente si se compró un plan de palabras. */
  pack?: WordPack | null;
  /** Presentes si se compró una licencia. La URL solo llega una vez. */
  license?: License | null;
  connectorUrl?: string | null;
  balance: Balance;
}

/** Datos del Yape que la web enseña junto al QR. Vacíos = solo el QR. */
export interface DatosYape {
  titular: string | null;
  numero: string | null;
  currency: string;
}

/** Comprobante recién enviado, a la espera de que un administrador lo mire. */
export interface ComprobanteEnviado {
  paymentId: string;
  reference: string;
  amountCents: number;
  currency: string;
  status: 'IN_REVIEW';
  plan: { code: string; name: string };
}

/** Una fila de la bandeja de comprobantes del panel de administración. */
export interface PagoPorRevisar {
  id: string;
  provider: string;
  providerOrderId: string;
  status: string;
  amountCents: number;
  discountCents: number;
  currency: string;
  createdAt: string;
  operationCode: string | null;
  proofMime: string | null;
  plan: { code: string; productCode: string | null; name: string; words: number; durationDays: number };
  user: { id: string; email: string; firstName: string; lastName: string };
}

/**
 * Una fila del historial de Yape: un comprobante que ya salió de la bandeja.
 *
 * Es casi lo mismo que `PagoPorRevisar` pero no lo extiende: aquí lo que
 * importa es cómo acabó —`status`, `reviewedAt`, `reviewNote`— y allí lo que
 * hace falta para decidir. Juntarlos obligaría a marcar como opcional media
 * interfaz en los dos sitios.
 */
export interface PagoRevisado {
  id: string;
  provider: string;
  providerOrderId: string;
  status: 'PENDING' | 'IN_REVIEW' | 'PAID' | 'FAILED' | 'REJECTED' | 'CANCELLED';
  amountCents: number;
  discountCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  operationCode: string | null;
  /** Cuándo se resolvió. Null en los que caducaron sin que nadie los mirara. */
  reviewedAt: string | null;
  /** Motivo del rechazo, tal como lo leyó el comprador. */
  reviewNote: string | null;
  /** Si queda imagen que abrir. Los que nunca subieron captura no la tienen. */
  tieneComprobante: boolean;
  /**
   * La licencia que entregó este cobro. Nula mientras no haya entregado nada.
   *
   * Se expone para poder moverla de producto desde el historial de accesos, que
   * es donde el administrador mira quién compró qué.
   */
  licenseId?: string | null;
  /**
   * La licencia que entregó este cobro, con el producto que tiene HOY.
   *
   * No es lo mismo que `plan`: el plan es lo que se compró y no cambia nunca
   * —reescribirlo falsearía la venta—, mientras que una licencia se puede mover
   * de producto después.
   */
  license?: { productCode: string } | null;
  plan: { code: string; productCode: string | null; name: string; words: number; durationDays: number };
  user: { id: string; email: string; firstName: string; lastName: string };
}

/** Resultado de aprobar un comprobante. Sin la URL del conector: es del comprador. */
export interface AprobacionManual {
  alreadyProcessed: boolean;
  payment: { id: string; status: string };
  entregado?:
    | { tipo: 'LICENSE'; licenseId: string; productCode: string }
    | { tipo: 'WORDS'; packId: string; words: number };
}

export interface Payment {
  id: string;
  provider: string;
  providerOrderId: string;
  status: 'PENDING' | 'IN_REVIEW' | 'PAID' | 'FAILED' | 'REJECTED' | 'CANCELLED';
  amountCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  /** Por qué se rechazó un pago manual. Se le enseña al comprador tal cual. */
  reviewNote?: string | null;
  plan: { code: string; productCode: string | null; name: string; words: number; durationDays: number };
}

/**
 * Cómo se llama cada medio de pago en pantalla.
 *
 * El servidor guarda el código en mayúsculas y sin acentos, que es lo correcto
 * para una columna y horrible para quien lee «WESTERN_UNION» donde esperaba el
 * nombre de algo que reconoce. Lo que no esté en la lista se enseña tal cual:
 * es preferible un código feo a un hueco.
 *
 * Vive aquí, y no en cada pantalla, porque lo usan el perfil del comprador y
 * los gráficos del panel: dos copias acabarían nombrando distinto lo mismo.
 */
export const MEDIOS_PAGO: Record<string, string> = {
  PAYPAL: 'PayPal',
  YAPE: 'Yape',
  PLIN: 'Plin',
  TRANSFERENCIA: 'Transferencia',
  WESTERN_UNION: 'Western Union',
  CORTESIA: 'Cortesía',
};
