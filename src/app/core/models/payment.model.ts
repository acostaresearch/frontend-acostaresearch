import { Balance, WordPack } from './rewrite.model';

/** Pasarela disponible. La lista la decide el servidor según sus credenciales. */
export interface PaymentProvider {
  code: string;
  label: string;
  /** Moneda en la que cobra esta pasarela. PayPal no admite soles: cobra en USD. */
  currency: string;
}

/** Orden abierta en la pasarela. Todavía no se ha cobrado nada. */
export interface PaymentOrder {
  paymentId: string;
  orderId: string;
  approveUrl: string | null;
  amountCents: number;
  currency: string;
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
