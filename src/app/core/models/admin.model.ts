import { License } from './payment.model';
import { WordPack } from './rewrite.model';

/** Resumen de un comprador, tal como lo devuelven los listados de admin. */
export interface Comprador {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

/** Código de activación. El valor en claro solo existe al generarlo. */
export interface ActivationCode {
  id: string;
  /** Últimos caracteres, para reconocerlo sin poder reconstruirlo. */
  hint: string;
  productCode: string;
  status: 'AVAILABLE' | 'REDEEMED' | 'VOID';
  buyerEmail: string | null;
  note: string | null;
  redeemedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  license: { id: string; status: string } | null;
}

export interface LicenciaAdmin extends License {
  user: Comprador;
}

export type NivelAlerta = 'ALERTA' | 'SOSPECHA_ALTA';

export interface Alerta {
  id: string;
  kind: 'VOLUMEN' | 'SESIONES_SOLAPADAS' | 'CONSULTAS_INCOHERENTES' | 'EXTRACCION';
  level: NivelAlerta;
  action: 'NINGUNA' | 'NOTIFICADO' | 'REVOCADO';
  detalle: string | null;
  createdAt: string;
  license: {
    id: string;
    productCode: string;
    status: string;
    tokenHint: string;
    user: Comprador;
  };
}

/** Bolsa de palabras activada, con el rastro de quién la pagó y cómo. */
export interface PackAdmin extends WordPack {
  paymentMethod: string | null;
  paymentRef: string | null;
  amountCents: number | null;
  note: string | null;
  user: Comprador;
}

export interface PagoAdmin {
  id: string;
  provider: string;
  providerOrderId: string;
  providerCaptureId: string | null;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  amountCents: number;
  currency: string;
  payerEmail: string | null;
  errorCode: string | null;
  createdAt: string;
  paidAt: string | null;
  plan: { code: string; name: string; words: number; durationDays: number };
  user: Comprador;
}

/** Código promocional. A diferencia del de activación, este sí se relee. */
export interface CodigoDescuento {
  id: string;
  code: string;
  amountCents: number;
  planCode: string | null;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface CrearDescuento {
  code?: string;
  amountCents: number;
  planCode?: string;
  maxUses?: number;
  expiraEnDias?: number;
  note?: string;
}

export interface GenerarCodigos {
  cantidad: number;
  productCode?: string;
  buyerEmail?: string;
  note?: string;
  expiraEnDias?: number;
}

export interface ActivarBolsa {
  email: string;
  planCode: string;
  paymentMethod: string;
  paymentRef?: string;
  note?: string;
}
