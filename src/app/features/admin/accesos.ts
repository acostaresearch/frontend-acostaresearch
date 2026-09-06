import { ActivationCode, PagoAdmin } from '../../core/models/admin.model';
import { PagoRevisado } from '../../core/models/payment.model';

/**
 * Una fila del historial de accesos.
 *
 * Las tres pantallas del panel —códigos, comprobantes y pagos por pasarela—
 * cuentan la misma historia desde tres sitios distintos: alguien pagó (o no) y
 * recibió (o no) el método. Aquí se juntan en una sola tabla que responde a la
 * pregunta que uno se hace de verdad, «¿qué pasó con este correo?», sin tener
 * que acordarse de por dónde entró.
 *
 * Lo que las distingue es el CANAL, y por eso es una columna y un filtro en vez
 * de tres pestañas: la vía por la que entró el dinero es un dato de la venta,
 * no una sección del programa.
 */
export type Canal = 'codigo' | 'comprobante' | 'pasarela';

export interface Acceso {
  /** Id de la fila de origen. Único dentro de su canal, no entre canales. */
  id: string;
  canal: Canal;
  canalNombre: string;
  /** ISO. Se usa para ordenar y se formatea en la plantilla. */
  fecha: string;
  comprador: string;
  producto: string;
  /** Nulo en una cortesía: no es que valga cero, es que no hubo cobro. */
  amountCents: number | null;
  moneda: string;
  estado: string;
  /** Cómo se pinta la pastilla, con las clases que ya usa el panel. */
  tono: 'buena' | 'espera' | 'mala';
  /** Nº de operación, final del código, referencia de la pasarela. */
  referencia: string | null;
}

const ESTADO_CODIGO: Record<string, { estado: string; tono: Acceso['tono'] }> = {
  AVAILABLE: { estado: 'Disponible', tono: 'espera' },
  REDEEMED: { estado: 'Canjeado', tono: 'buena' },
  VOID: { estado: 'Anulado', tono: 'mala' },
};

const ESTADO_PAGO: Record<string, { estado: string; tono: Acceso['tono'] }> = {
  PAID: { estado: 'Pagado', tono: 'buena' },
  IN_REVIEW: { estado: 'En revisión', tono: 'espera' },
  PENDING: { estado: 'Pendiente', tono: 'espera' },
  REJECTED: { estado: 'Rechazado', tono: 'mala' },
  FAILED: { estado: 'Fallido', tono: 'mala' },
  CANCELLED: { estado: 'Cancelado', tono: 'mala' },
};

function estadoDe(mapa: Record<string, { estado: string; tono: Acceso['tono'] }>, clave: string) {
  return mapa[clave] ?? { estado: clave, tono: 'espera' as const };
}

function deCodigo(codigo: ActivationCode): Acceso {
  return {
    id: codigo.id,
    canal: 'codigo',
    canalNombre: 'Código',
    fecha: codigo.createdAt,
    comprador: codigo.buyerEmail ?? '—',
    producto: codigo.productCode,
    amountCents: codigo.amountCents,
    moneda: 'PEN',
    referencia: `…${codigo.hint}`,
    ...estadoDe(ESTADO_CODIGO, codigo.status),
  };
}

function deComprobante(pago: PagoRevisado): Acceso {
  // Un Yape aprobado se dice «Aprobado» y no «Pagado»: lo que ocurrió es que
  // una persona miró la captura y la dio por buena, y esa diferencia importa
  // cuando alguien reclama.
  const base = estadoDe(ESTADO_PAGO, pago.status);

  return {
    id: pago.id,
    canal: 'comprobante',
    canalNombre: 'Comprobante',
    fecha: pago.createdAt,
    comprador: pago.user.email,
    producto: pago.plan.name,
    amountCents: pago.amountCents,
    moneda: pago.currency,
    referencia: pago.operationCode,
    estado: pago.status === 'PAID' ? 'Aprobado' : base.estado,
    tono: base.tono,
  };
}

function dePasarela(pago: PagoAdmin): Acceso {
  return {
    id: pago.id,
    canal: 'pasarela',
    canalNombre: 'Pasarela',
    fecha: pago.createdAt,
    comprador: pago.user.email,
    producto: pago.plan.name,
    amountCents: pago.amountCents,
    moneda: pago.currency,
    referencia: pago.providerCaptureId ?? pago.providerOrderId,
    ...estadoDe(ESTADO_PAGO, pago.status),
  };
}

/**
 * Junta las tres fuentes en una sola lista, de la más reciente a la más
 * antigua.
 *
 * Los pagos por Yape se excluyen de «pasarela» a propósito: ya entran por su
 * comprobante, y contarlos dos veces era exactamente el problema que tenía el
 * panel —la misma venta aparecía en dos pantallas y borrarla en una la dejaba
 * viva en la otra—.
 */
export function unirAccesos(
  codigos: readonly ActivationCode[],
  comprobantes: readonly PagoRevisado[],
  pagos: readonly PagoAdmin[],
): Acceso[] {
  return [
    ...codigos.map(deCodigo),
    ...comprobantes.map(deComprobante),
    ...pagos.filter((pago) => pago.provider !== 'YAPE').map(dePasarela),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
}
