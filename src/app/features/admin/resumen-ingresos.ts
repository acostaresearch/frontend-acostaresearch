import { computed, signal, Signal } from '@angular/core';
import { ActivationCode, LicenciaAdmin, PagoAdmin } from '../../core/models/admin.model';
import { MEDIOS_PAGO as MEDIOS } from '../../core/models/payment.model';
import { SOLES_POR_DOLAR } from './productos-admin';
import { columnas, linea, lunes, porCategoria, porMes, porSemana } from './graficos';

/**
 * Semanas que abarcan los gráficos.
 *
 * Ocho es lo que cabe legible en una tarjeta del ancho del panel sin que las
 * etiquetas del eje se pisen, y a la vez suficiente para ver una tendencia en
 * un negocio que vende por trimestres.
 */
const SEMANAS = 8;
/** Meses del gráfico de ingresos: un año, el mes en curso incluido. */
const MESES = 12;

/** Importes cortos para los ejes: S/ 1,2k en vez de S/ 1.200. */
const MILES = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 });

/** Importe entero, con separador de miles: S/ 1,200. */
export function soles(cents: number): string {
  return `S/ ${MILES.format(cents / 100)}`;
}

/**
 * Lo mismo, abreviado, y SOLO para las marcas del eje.
 *
 * Ahí el hueco es de treinta píxeles y «S/ 1,200» no cabe sin comerse la
 * primera barra. La cifra grande y la pista sí van enteras: son las que se
 * leen, y un ingreso redondeado a «1,2k» esconde justo lo que se quiere ver.
 */
function solesCorto(cents: number): string {
  const valor = cents / 100;
  if (valor >= 1000) return `S/ ${(valor / 1000).toFixed(1).replace('.', ',')}k`;
  return `S/ ${Math.round(valor)}`;
}

/**
 * Un importe de la pasarela, en céntimos de sol.
 *
 * PayPal cobra en dólares y todo lo demás en soles. Los gráficos suman las dos
 * cosas, y sin convertir el resultado no es dinero de ninguna moneda: un dólar
 * contaba como un sol y PayPal salía casi cuatro veces más pequeño de lo que es.
 *
 * Es una conversión para MIRAR, no para cuadrar la contabilidad: usa el mismo
 * tipo con el que se ponen los precios, no el del día del cobro.
 */
function aCentimosDeSol(cents: number, moneda: string): number {
  return moneda === 'USD' ? Math.round(cents * SOLES_POR_DOLAR) : cents;
}

/**
 * Las vías por las que puede entrar dinero. Salen todas, incluso a cero.
 *
 * Son tres cosas distintas y ninguna sustituye a otra: PayPal cobra solo, Yape
 * necesita que alguien mire el comprobante, y el código de activación es lo que
 * se vende a mano por WhatsApp. Que una esté a cero es información, no un motivo
 * para esconderla.
 */
const VIAS_DE_COBRO = ['PayPal', 'Yape', 'Código de activación'];

/** Los meses con nombre entero, para las notas del resumen. */
const NOMBRE_DE_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Graficos calculados sobre los datos ya cargados en el panel. */
export class ResumenIngresosAdmin {
  constructor(
    readonly pagos: Signal<PagoAdmin[]>,
    readonly codigos: Signal<ActivationCode[]>,
    readonly licencias: Signal<LicenciaAdmin[]>,
  ) {}
  /**
   * Lo que se dice al pasar por encima de una barra.
   *
   * Lleva de qué gráfico es porque hay dos en la misma fila: sin eso, señalar
   * una semana de ingresos pintaba también una pista sobre los vencimientos.
   */
  readonly pista = signal<{ texto: string; centro: number; grafico: string } | null>(null);

  /** Cobros efectivos: los que fallaron o se cancelaron no son ingresos. */
  private readonly cobrados = computed(() => this.pagos().filter((p) => p.status === 'PAID'));

  /**
   * Ventas cobradas al generar un código de activación.
   *
   * Van aparte de las barras de la pasarela porque no entran por el mismo sitio:
   * aquí el dinero ya está cobrado —por Yape, por Western Union, por donde sea—
   * y lo que se emite es la llave. Contarlas con el resto escondería el canal
   * que, en la práctica, mueve la mayor parte de lo que se vende a mano.
   *
   * Se cuentan desde el código y NO desde el pago, y esa es la diferencia que
   * importa: el pago no nace hasta que el comprador canjea, así que una venta
   * cobrada el lunes y canjeada el viernes —o nunca— era dinero invisible en
   * este gráfico. Un código anulado no cuenta: ese cobro se deshizo. Una
   * cortesía tampoco: no hubo dinero.
   */
  private readonly codigosVendidos = computed(() =>
    this.codigos().filter(
      (codigo) =>
        codigo.status !== 'VOID' &&
        codigo.paymentMethod !== null &&
        codigo.paymentMethod !== 'CORTESIA' &&
        (codigo.amountCents ?? 0) > 0,
    ),
  );

  /**
   * Cada entrada de dinero, ya normalizada: cuándo entró, cuánto y por dónde.
   *
   * Los dos gráficos de ingresos se calculan sobre esta misma lista, y eso es lo
   * que garantiza que digan lo mismo: antes uno sumaba solo pagos y el otro
   * sumaba pagos y códigos, así que los totales no cuadraban entre sí.
   *
   * Dos cosas se arreglan al normalizar aquí:
   *
   * 1. El canje de un código apunta su propio pago, con el medio con el que se
   *    cobró. Sin descartarlo, esa venta saldría dos veces —una en su código y
   *    otra en Yape—. Se reconoce porque el pago del canje lleva el
   *    identificador del código como número de orden.
   * 2. PayPal cobra en dólares y todo lo demás en soles. Sumar las dos cosas en
   *    una misma barra da un número que no es dinero de ninguna moneda, así que
   *    los dólares se pasan a soles al tipo con el que se ponen los precios.
   */
  private readonly entradasDeDinero = computed(() => {
    const deCodigos = new Set(this.codigos().map((codigo) => codigo.id));

    const entradas = this.cobrados()
      .filter((pago) => !deCodigos.has(pago.providerOrderId))
      .map((pago) => ({
        via: MEDIOS[pago.provider] ?? pago.provider,
        fecha: pago.paidAt ? new Date(pago.paidAt) : null,
        cents: aCentimosDeSol(pago.amountCents, pago.currency),
      }));

    for (const codigo of this.codigosVendidos()) {
      entradas.push({
        via: 'Código de activación',
        // La fecha es la de la venta, no la del canje: es cuando entró el dinero.
        fecha: new Date(codigo.createdAt),
        cents: codigo.amountCents ?? 0,
      });
    }

    return entradas;
  });

  /**
   * Ingresos por mes natural. Cada mes terminado tiene además su cierre en PDF
   * en «Ventas mensuales», calculado con la misma regla en el servidor.
   */
  readonly ingresosPorMes = computed(() =>
    columnas(
      porMes(
        this.entradasDeDinero(),
        (entrada) => entrada.fecha,
        (entrada) => entrada.cents,
        MESES,
      ).map((punto) => ({
        ...punto,
        detalle: `${punto.detalle}: ${soles(punto.valor)}`,
      })),
      solesCorto,
    ),
  );

  /**
   * Ingresos por semana, de lunes a domingo, con la semana en curso al final.
   *
   * La semana se cierra el domingo a medianoche y el lunes arranca otra barra
   * desde cero: es la misma regla de `lunes()` que usan los demás agrupados.
   */
  readonly ingresosPorSemana = computed(() =>
    linea(
      porSemana(
        this.entradasDeDinero(),
        (entrada) => entrada.fecha,
        (entrada) => entrada.cents,
        SEMANAS,
      ).map((punto) => ({
        ...punto,
        detalle: `${punto.detalle}: ${soles(punto.valor)}`,
      })),
      solesCorto,
    ),
  );

  /** Lo que va de la semana en curso y lo que cerró la anterior, para la cifra grande. */
  readonly semanaEnCurso = computed(() => {
    const barras = this.ingresosPorSemana().barras;
    const actual = barras[barras.length - 1];
    const anterior = barras[barras.length - 2];
    return {
      valor: actual?.valor ?? 0,
      desde: actual?.etiqueta ?? '',
      anterior: anterior?.valor ?? 0,
    };
  });

  /** Lo cobrado en el mes en curso, para la primera cifra del resumen. */
  readonly mesEnCurso = computed(() => {
    const barras = this.ingresosPorMes().barras;
    const actual = barras[barras.length - 1];
    const anterior = barras[barras.length - 2];
    return {
      valor: actual?.valor ?? 0,
      mes: (actual?.etiqueta ?? '').toLowerCase(),
      // Al empezar el mes la cifra es pequeña y la semana, que viene del mes
      // anterior, sale mayor. Con lo que cerró el anterior al lado se entiende.
      anterior: anterior?.valor ?? 0,
      mesAnterior: ((m) => m[0].toUpperCase() + m.slice(1))(
        NOMBRE_DE_MES[(new Date().getMonth() + 11) % 12],
      ),
      dias: new Date().getDate(),
    };
  });

  /**
   * Los días de la semana en curso que caen en el mes anterior, o null.
   *
   * La semana va de lunes a domingo y no se corta al cambiar de mes: el 1 de
   * octubre la semana incluye del 28 al 30 de setiembre, que en la cifra del
   * mes no están. Sin decirlo, la semana sale mayor que el mes y parece un error.
   */
  readonly semanaCruzaMes = computed(() => {
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    if (lunes.getMonth() === hoy.getMonth()) return null;
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate();
    const mes = NOMBRE_DE_MES[lunes.getMonth()];
    return lunes.getDate() === ultimo
      ? `el ${ultimo} de ${mes}`
      : `del ${lunes.getDate()} al ${ultimo} de ${mes}`;
  });

  /** Cuántos meses del gráfico tienen algún cobro, para su frase de pie. */
  readonly mesesConCobros = computed(
    () => this.ingresosPorMes().barras.filter((barra) => barra.valor > 0).length,
  );

  /**
   * Por dónde entra el dinero.
   *
   * Categorías sin orden natural —PayPal, Yape, código de activación—, así que
   * todas las barras van del mismo color: la longitud ya dice cuál es mayor, y
   * teñir cada una de un tono distinto gastaría el color en repetir eso mismo.
   *
   * Las tres vías salen SIEMPRE, aunque una esté a cero. Enseñar solo las que
   * tienen dinero deja un gráfico que engaña por omisión: una semana sin ventas
   * por PayPal se leía como si PayPal no existiera, cuando lo que dice de verdad
   * es que está abierto y no entró nada por ahí. Un cero también es una cifra.
   */
  readonly ingresosPorMedio = computed(() => {
    const vias = VIAS_DE_COBRO.map((via) => ({ via, cents: 0 }));
    const entradas = this.entradasDeDinero().map(({ via, cents }) => ({ via, cents }));

    return porCategoria(
      [...vias, ...entradas],
      (entrada) => entrada.via,
      (entrada) => entrada.cents,
    );
  });

  /**
   * Licencias que caducan en las próximas semanas.
   *
   * Es el único sitio del panel que mira hacia adelante. Una licencia vencida
   * es un cliente que se va sin avisar; verlas con semanas de margen es lo que
   * permite escribirle antes y no después.
   */
  readonly vencimientos = computed(() =>
    columnas(
      porSemana(
        this.licencias().filter((l) => l.status === 'ACTIVE'),
        (licencia) => (licencia.expiresAt ? new Date(licencia.expiresAt) : null),
        () => 1,
        SEMANAS,
        lunes(new Date()),
        false,
      ).map((punto) => ({
        ...punto,
        detalle: `${punto.detalle}: ${punto.valor} ${punto.valor === 1 ? 'licencia' : 'licencias'}`,
      })),
      (valor) => `${Math.round(valor)}`,
    ),
  );

  mostrarPista(barra: { detalle: string; centro: number }, grafico: string): void {
    this.pista.set({ texto: barra.detalle, centro: barra.centro, grafico });
  }

  /** La pista, solo si es de este gráfico. */
  pistaDe(grafico: string): { texto: string; centro: number } | null {
    const actual = this.pista();
    return actual && actual.grafico === grafico ? actual : null;
  }

  ocultarPista(): void {
    this.pista.set(null);
  }

  /** Importes en soles, para las etiquetas de los gráficos. */
  soles(cents: number): string {
    return soles(cents);
  }

}
