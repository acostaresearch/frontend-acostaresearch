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

export interface ResultadoAnulacion {
  /** `BC01-1`. */
  nota: string;
  estado: string;
}
