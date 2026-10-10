/**
 * Los productos por los que se separan los videos y las guías en PDF.
 *
 * Un video o una guía puede estar en VARIOS, y sin ninguno sale en todos: el
 * de conectar Claude vale para cualquiera que compre.
 *
 * Los códigos son los del servidor (`shared/utils/productosDeAyuda.js` en el
 * backend). Si se añade uno, en los dos sitios.
 */
export interface ProductoDeAyuda {
  codigo: string;
  /** Como sale en las pestañas y en las pastillas del panel. */
  nombre: string;
}

export const PRODUCTOS_DE_AYUDA: readonly ProductoDeAyuda[] = [
  { codigo: 'tesis', nombre: 'Tesis' },
  { codigo: 'articulo', nombre: 'Artículos empíricos' },
  { codigo: 'revision', nombre: 'Artículos de revisión' },
  { codigo: 'tsp', nombre: 'Suficiencia Profesional' },
  { codigo: 'informe', nombre: 'Informes' },
  { codigo: 'humanizador', nombre: 'Humanizador' },
  { codigo: 'edicion', nombre: 'Edición y Traducción' },
];

/** El nombre de un código, o el propio código si el servidor manda uno nuevo. */
export function nombreDeProducto(codigo: string): string {
  return PRODUCTOS_DE_AYUDA.find((p) => p.codigo === codigo)?.nombre ?? codigo;
}

/** Si eso (un video, una guía) sale al elegir ese producto. Sin productos, sale en todos. */
export function saleEn(productos: readonly string[], codigo: string): boolean {
  return productos.length === 0 || productos.includes(codigo);
}

/**
 * Las pestañas que tiene sentido enseñar: solo los productos con algo propio.
 *
 * Mientras nada esté asignado a un producto no sale ninguna, y la página se ve
 * como antes de separar.
 */
export function pestanasDeProducto(
  elementos: readonly { productos: readonly string[] }[],
): readonly ProductoDeAyuda[] {
  return PRODUCTOS_DE_AYUDA.filter((p) => elementos.some((e) => e.productos.includes(p.codigo)));
}

/**
 * Lo que le toca ver a alguien según lo que compró.
 *
 * `suyos` en null es «sin filtro»: el visitante, quien todavía no compró nada y
 * el administrador lo ven todo. Con productos, solo lo de esos productos y lo
 * que es de todos.
 */
export function loQueLeToca<T extends { productos: readonly string[] }>(
  elementos: readonly T[],
  suyos: readonly string[] | null,
): T[] {
  if (suyos === null) return [...elementos];
  return elementos.filter(
    (e) => e.productos.length === 0 || e.productos.some((c) => suyos.includes(c)),
  );
}

/**
 * La pestaña que queda elegida. Solo hay pestañas con dos productos o más, y
 * siempre hay una marcada —la pedida, o la primera—: no existe «Todos», que
 * era justo la mezcla que se quería evitar.
 */
export function pestanaElegida(
  pestanas: readonly ProductoDeAyuda[],
  pedida: string | null,
): string | null {
  if (pestanas.length < 2) return null;
  return pestanas.some((p) => p.codigo === pedida) ? pedida : pestanas[0].codigo;
}
