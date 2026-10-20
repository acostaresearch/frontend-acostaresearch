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

// ── Las pestañas del video curso (21-oct) ──
//
// Detrás de las de producto van «Instalación» y «Herramientas». Cada video y
// cada guía dice en cuál sale con su apartado: «producto» (la de cada producto
// marcado), «instalacion» o «herramientas». Así la de Tesis trae solo las
// skills de tesis y no también cómo crear la cuenta de Claude o usar Zotero.

/** Lo que va en una pestaña: su apartado y sus productos. */
export interface EnApartado {
  apartado: string;
  productos: readonly string[];
}

/** Las dos pestañas que no son de un producto, en su orden. */
export const APARTADOS_DEL_CURSO: readonly ProductoDeAyuda[] = [
  { codigo: 'instalacion', nombre: 'Instalación' },
  { codigo: 'herramientas', nombre: 'Herramientas' },
];

/** La pestaña de lo de uso cuando nada está asignado a un producto. */
export const SIN_PRODUCTO: ProductoDeAyuda = { codigo: 'producto', nombre: 'Tu curso' };

/**
 * Las pestañas que tiene: una por producto con algo de uso propio, y detrás
 * las de apartado que traigan algo. Sin nada asignado a un producto, lo de uso
 * va junto en una sola, para que no se quede sin pestaña.
 */
export function pestanasDelCurso(elementos: readonly EnApartado[]): readonly ProductoDeAyuda[] {
  const deUso = elementos.filter((e) => e.apartado === 'producto');
  const lista: ProductoDeAyuda[] = [...pestanasDeProducto(deUso)];
  if (lista.length === 0 && deUso.length > 0) lista.push(SIN_PRODUCTO);
  for (const apartado of APARTADOS_DEL_CURSO) {
    if (elementos.some((e) => e.apartado === apartado.codigo)) lista.push(apartado);
  }
  return lista;
}

/**
 * Si algo sale en esa pestaña. En «Instalación» y «Herramientas», lo de ese
 * apartado; en la de un producto, lo de uso de ese producto más lo de uso que
 * es de todos. Sin pestaña (null), todo.
 */
export function saleEnLaPestana(elemento: EnApartado, pestana: string | null): boolean {
  if (pestana === null) return true;
  if (APARTADOS_DEL_CURSO.some((a) => a.codigo === pestana)) return elemento.apartado === pestana;
  if (elemento.apartado !== 'producto') return false;
  return pestana === SIN_PRODUCTO.codigo || saleEn(elemento.productos, pestana);
}
