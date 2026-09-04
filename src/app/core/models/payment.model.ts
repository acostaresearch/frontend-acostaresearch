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
export interface License {
  id: string;
  productCode: string;
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

export interface Payment {
  id: string;
  provider: string;
  providerOrderId: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  amountCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  plan: { code: string; name: string; words: number; durationDays: number };
}
