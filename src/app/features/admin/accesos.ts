import { ActivationCode, PagoAdmin } from '../../core/models/admin.model';
import { MEDIOS_PAGO, PagoPorRevisar, PagoRevisado } from '../../core/models/payment.model';

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
export type Canal = 'codigo' | 'yape' | 'paypal';

export interface Acceso {
  /** Id de la fila de origen. Único dentro de su canal, no entre canales. */
  id: string;
  canal: Canal;
  canalNombre: string;
  /** ISO. Se usa para ordenar y se formatea en la plantilla. */
  fecha: string;
  comprador: string;
  /** El nombre que se enseña: el del plan si lo hay, y si no el del producto. */
  producto: string;
  /**
   * El producto de verdad, que no siempre se llama como el plan.
   *
   * Se guarda aparte del nombre porque es con lo que se compara al ofrecer los
   * destinos: sin esto, en un cobro por Yape la lista incluía el producto que
   * la licencia YA tiene, porque comparaba «Método completo · 9 Skills» con
   * «METODO_9_SKILLS» y nunca coincidían.
   */
  productCode: string | null;
  /** Nulo en una cortesía: no es que valga cero, es que no hubo cobro. */
  amountCents: number | null;
  moneda: string;
  estado: string;
  /** Cómo se pinta la pastilla, con las clases que ya usa el panel. */
  tono: 'buena' | 'espera' | 'mala';
  /** Nº de operación, final del código, referencia de la pasarela. */
  referencia: string | null;
  /** Si queda una imagen que abrir. Decide si se ofrece «Ver captura». */
  tieneComprobante: boolean;
  /** Solo un código sin canjear se puede anular. */
  anulable: boolean;
  /**
   * La licencia que entregó este acceso, si llegó a entregarse.
   *
   * Nula en lo que todavía no entregó nada —un código sin canjear, un
   * comprobante en revisión, un pago fallido—, y por eso decide si se ofrece
   * moverla de producto: no se puede ampliar lo que no existe.
   */
  licenseId: string | null;
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
    productCode: codigo.productCode,
    amountCents: codigo.amountCents,
    moneda: 'PEN',
    referencia: `…${codigo.hint}`,
    tieneComprobante: Boolean(codigo.proofMime),
    anulable: codigo.status === 'AVAILABLE',
    licenseId: codigo.license?.id ?? null,
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
    canal: 'yape',
    canalNombre: 'Yape',
    fecha: pago.createdAt,
    comprador: pago.user.email,
    producto: pago.plan.name,
    productCode: pago.plan.productCode,
    amountCents: pago.amountCents,
    moneda: pago.currency,
    referencia: pago.operationCode,
    tieneComprobante: pago.tieneComprobante,
    anulable: false,
    licenseId: pago.licenseId ?? null,
    estado: pago.status === 'PAID' ? 'Aprobado' : base.estado,
    tono: base.tono,
  };
}

/**
 * Un comprobante que todavía espera revisión.
 *
 * Va en la tabla aunque no esté resuelto, y es el arreglo de un despiste que se
 * notaba justo cuando más molesta: el historial se pedía con los comprobantes
 * YA revisados, así que lo de hoy —que es lo que está esperando— no salía, y la
 * tabla parecía empezar anteayer. Quien abre esto suele venir de un «pagué esta
 * mañana y no me llega nada», y esa fila era la única que no estaba.
 *
 * No se duplica con `deComprobante`: el historial del servidor excluye
 * expresamente los que están en revisión, que son exactamente estos.
 */
function dePendiente(pago: PagoPorRevisar): Acceso {
  return {
    id: pago.id,
    canal: 'yape',
    canalNombre: 'Yape',
    fecha: pago.createdAt,
    comprador: pago.user.email,
    producto: pago.plan.name,
    productCode: pago.plan.productCode,
    amountCents: pago.amountCents,
    moneda: pago.currency,
    referencia: pago.operationCode,
    licenseId: null,
    tieneComprobante: Boolean(pago.proofMime),
    anulable: false,
    estado: 'En revisión',
    tono: 'espera',
  };
}

function dePasarela(pago: PagoAdmin): Acceso {
  return {
    id: pago.id,
    canal: 'paypal',
    // El nombre sale del propio cobro, no del canal: si algún día entra otra
    // pasarela, la fila dirá «Culqi» en vez de mentir con «PayPal».
    canalNombre: MEDIOS_PAGO[pago.provider] ?? pago.provider,
    fecha: pago.createdAt,
    comprador: pago.user.email,
    producto: pago.plan.name,
    productCode: pago.plan.productCode,
    amountCents: pago.amountCents,
    moneda: pago.currency,
    referencia: pago.providerCaptureId ?? pago.providerOrderId,
    tieneComprobante: false,
    anulable: false,
    licenseId: pago.licenseId ?? null,
    ...estadoDe(ESTADO_PAGO, pago.status),
  };
}

/**
 * Junta las cuatro fuentes en una sola lista, de la más reciente a la más
 * antigua.
 *
 * Los pagos por Yape se excluyen del canal de pasarela a propósito: ya entran
 * por su comprobante, y contarlos dos veces era exactamente el problema que
 * tenía el panel —la misma venta aparecía en dos pantallas y borrarla en una la
 * dejaba viva en la otra—.
 */
export function unirAccesos(
  codigos: readonly ActivationCode[],
  porRevisar: readonly PagoPorRevisar[],
  comprobantes: readonly PagoRevisado[],
  pagos: readonly PagoAdmin[],
): Acceso[] {
  return [
    ...codigos.map(deCodigo),
    ...porRevisar.map(dePendiente),
    ...comprobantes.map(deComprobante),
    ...pagos.filter((pago) => pago.provider !== 'YAPE').map(dePasarela),
    // Fechas ISO en UTC: se comparan como cadenas y salen en orden. La más
    // reciente primero, que es por donde se empieza a mirar.
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}
