/** La boleta vigente de un pago del cliente («Mis compras»). */
export interface BoletaDeCompra {
  paymentId: string;
  /** Id del comprobante, para pedir su PDF. */
  id: string;
  /** `B001-6`. */
  numero: string;
}

export type EstadoComprobante = 'PENDIENTE' | 'ACEPTADO' | 'OBSERVADO' | 'RECHAZADO' | 'REVISAR';

/** Estado del correo al cliente: null = aún no se resolvió. */
export type CorreoComprobante = 'ENVIADO' | 'NO_APLICA' | 'SIN_DESTINATARIO' | null;

/** Una boleta o nota de crédito, como la lista el panel. */
export interface Comprobante {
  id: string;
  /** `03` boleta, `07` nota de crédito. */
  tipo: '03' | '07';
  serie: string;
  numero: number;
  /** `PAGO:…`, `CARRITO:…`, `CODIGO:…`; `…|ANULADA:BC01-1` si se anuló; `ANULA:B001-1` en una nota. */
  origenClave: string;
  fechaEmision: string;
  clienteNombre: string;
  clienteTipoDoc: string;
  /** Solo en la ficha de una venta (`/sunat/de-venta`). */
  clienteNumDoc?: string;
  moneda?: string;
  valorCents?: number;
  igvCents?: number;
  /** Cuándo la aceptó SUNAT (o la rechazó). */
  enviadoEn?: string | null;
  totalCents: number;
  monedaOriginal: string;
  importeOriginalCents: number;
  items: { descripcion: string; precioUnitario: number; cantidad: number }[];
  estado: EstadoComprobante;
  codigoSunat: number | null;
  mensaje: string | null;
  intentos: number;
  correo: CorreoComprobante;
  correoEnviadoEn: string | null;
}

/** Las boletas y notas de una venta, para su ficha en Accesos. */
export interface ComprobantesDeVenta {
  comprobantes: Comprobante[];
  correoDestinatario: string | null;
}

export interface ResultadoAnulacion {
  /** `BC01-1`. */
  nota: string;
  estado: string;
}

/** Tipo de documento del cliente de un servicio (catálogo 06 de SUNAT). */
export type DocumentoServicio = '-' | '0' | '1' | '4' | '7';

/** Un servicio cobrado fuera de la web (asesoría…), registrado para que lleve boleta. */
export interface ServicioRegistrado {
  id: string;
  concepto: string;
  importeCents: number;
  moneda: 'PEN' | 'USD';
  pagadoEn: string;
  medio: string | null;
  clienteTipoDoc: DocumentoServicio;
  clienteNumDoc: string;
  clienteNombre: string;
  clientePais: string | null;
  clienteEmail: string | null;
  nota: string | null;
  /** ANULADO cuando se anula su boleta. */
  estado: 'VIGENTE' | 'ANULADO';
  creadoEn: string;
  /** Su boleta (y la nota que la anula, si la hay); vacío mientras se emite. */
  comprobantes: Comprobante[];
}

export interface NuevoServicio {
  concepto: string;
  importeCents: number;
  moneda: 'PEN' | 'USD';
  /** ISO con zona. */
  pagadoEn: string;
  medio?: string;
  clienteTipoDoc: DocumentoServicio;
  clienteNumDoc?: string;
  clienteNombre: string;
  clientePais?: string;
  clienteEmail?: string;
  nota?: string;
}
