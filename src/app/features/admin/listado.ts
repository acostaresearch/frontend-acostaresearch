import { Signal, WritableSignal, computed, signal } from '@angular/core';

/** Filas que se enseñan de golpe, y que añade cada despliegue. */
export const POR_TANDA = 10;

export interface OpcionFiltro {
  /** El valor del primero se toma como «todos»: no cribia nada. */
  valor: string;
  etiqueta: string;
}

/** Lo que la barra de búsqueda necesita de un listado, sin saber de qué es. */
export interface ListadoFiltrable {
  readonly busca: Signal<string>;
  readonly filtro: Signal<string>;
  readonly filtros: readonly OpcionFiltro[];
  readonly conteo: Signal<Record<string, number>>;
  buscar(evento: Event): void;
  limpiar(): void;
  filtrar(valor: string): void;
}

/** Lo que necesita el pie de «ver más». Tampoco mira lo que hay dentro. */
export interface ListadoDesplegable {
  readonly visible: Signal<readonly unknown[]>;
  readonly filtrado: Signal<readonly unknown[]>;
  readonly restan: Signal<number>;
  readonly porTanda: number;
  verMas(): void;
  plegar(): void;
}

/**
 * Una tabla del panel que se busca, se filtra y se despliega a tandas.
 *
 * Las cinco listas del panel —licencias, alertas, pagos, bolsas y el historial
 * de Yape— hacían todas lo mismo, y ninguna lo hacía: se pintaban enteras. Esto
 * es ese comportamiento una sola vez, para que las cinco se comporten igual y
 * no haya que acordarse de arreglarlas por separado.
 *
 * No es un componente: es el estado. Lo que se pinta son `app-filtros-lista` y
 * `app-pie-lista`, que reciben esta misma instancia.
 *
 * El listado NO pagina contra el servidor. Los datos ya están todos en memoria
 * —el panel los carga de una vez al entrar—, así que buscar aquí es instantáneo
 * y no cuesta una espera por letra tecleada.
 */
export class Listado<T> implements ListadoFiltrable, ListadoDesplegable {
  readonly busca = signal('');
  readonly filtro: WritableSignal<string>;
  /** Cuántas filas se enseñan ahora mismo. */
  readonly visibles = signal(POR_TANDA);
  readonly filtros: readonly OpcionFiltro[];
  readonly porTanda = POR_TANDA;

  /** Solo lo que casa con el buscador. El filtro todavía no se aplica. */
  private readonly buscados: Signal<T[]>;
  readonly filtrado: Signal<T[]>;
  readonly visible: Signal<T[]>;
  readonly restan: Signal<number>;
  /**
   * Cuántos hay en cada pestaña.
   *
   * Se cuenta sobre lo que encontró el buscador, no sobre el total: buscar un
   * correo y leer «Revocadas 1» responde a la pregunta que se estaba haciendo.
   */
  readonly conteo: Signal<Record<string, number>>;

  constructor(
    fuente: Signal<readonly T[]>,
    opciones: {
      filtros: readonly OpcionFiltro[];
      /** Campos por los que se busca. Se juntan y se comparan en minúsculas. */
      texto: (item: T) => (string | null | undefined)[];
      /** Si el elemento entra en un filtro. Al primero de la lista no se le pregunta. */
      pasa?: (item: T, filtro: string) => boolean;
    },
  ) {
    this.filtros = opciones.filtros;
    this.filtro = signal(opciones.filtros[0]?.valor ?? 'todos');

    const todos = this.filtros[0]?.valor ?? 'todos';
    const pasa = (item: T, filtro: string) =>
      filtro === todos || (opciones.pasa?.(item, filtro) ?? true);

    this.buscados = computed(() => {
      const busca = this.busca().trim().toLowerCase();
      const items = [...fuente()];
      if (!busca) return items;

      return items.filter((item) =>
        opciones.texto(item).filter(Boolean).join(' ').toLowerCase().includes(busca),
      );
    });

    this.filtrado = computed(() => this.buscados().filter((item) => pasa(item, this.filtro())));
    this.visible = computed(() => this.filtrado().slice(0, this.visibles()));
    this.restan = computed(() => Math.max(0, this.filtrado().length - this.visibles()));

    this.conteo = computed(() => {
      const encontrados = this.buscados();
      const cuentas: Record<string, number> = {};
      for (const opcion of this.filtros) {
        cuentas[opcion.valor] = encontrados.filter((item) => pasa(item, opcion.valor)).length;
      }
      return cuentas;
    });
  }

  buscar(evento: Event): void {
    this.busca.set((evento.target as HTMLInputElement).value);
    // Cambiar la búsqueda con treinta filas abiertas dejaba el resultado nuevo
    // ya desplegado, sin que nadie lo hubiera pedido.
    this.visibles.set(POR_TANDA);
  }

  filtrar(valor: string): void {
    this.filtro.set(valor);
    this.visibles.set(POR_TANDA);
  }

  limpiar(): void {
    this.busca.set('');
    this.visibles.set(POR_TANDA);
  }

  verMas(): void {
    this.visibles.update((n) => n + POR_TANDA);
  }

  plegar(): void {
    this.visibles.set(POR_TANDA);
  }
}
