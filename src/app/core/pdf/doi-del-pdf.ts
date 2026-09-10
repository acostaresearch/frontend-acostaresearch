/**
 * Saca el DOI de un PDF, en el navegador y sin librerías.
 *
 * POR QUÉ AQUÍ Y NO EN EL SERVIDOR
 * --------------------------------
 * Porque así el PDF no sale del equipo del tesista. De él viaja el DOI —veinte
 * caracteres— en lugar de tres megas, y eso ahorra de golpe el ancho de banda,
 * el almacenamiento, el trabajo del servidor y tener allí copias de artículos
 * con copyright que él descargó con el acceso de su universidad.
 *
 * POR QUÉ SIN LIBRERÍA
 * --------------------
 * Extraer texto de un PDF de verdad son megabytes de dependencia. Pero para
 * esto no hace falta leer el PDF: hace falta encontrar veinte caracteres.
 *
 * Casi todas las editoriales —ACM, IEEE, Elsevier, Springer, Wiley, MDPI,
 * SciELO— escriben el DOI en el bloque XMP, que va dentro del archivo como XML
 * SIN COMPRIMIR. Se lee con una expresión regular sobre los bytes crudos.
 *
 * Lo que esto NO alcanza son los PDF sin XMP y los escaneados. Para esos, quien
 * llame tiene que ofrecer pegar el DOI a mano: son diez segundos, con el
 * artículo ya abierto en pantalla, y siguen siendo mejores que subir el PDF
 * entero a una conversación.
 */

/**
 * Cuánto se mira de cada extremo del archivo.
 *
 * El XMP va casi siempre al principio o al final, nunca en medio. Leer 400 KB
 * de cada punta en vez del archivo entero mantiene la memoria acotada cuando
 * alguien suelta veinte artículos de tres megas a la vez.
 */
const TROZO = 400 * 1024;

/**
 * SOLO se mira lo que el documento DECLARA de sí mismo. Nunca el texto suelto.
 *
 * Y esto está comprobado, no supuesto. La primera versión buscaba además
 * cualquier DOI que apareciera en el archivo, incluso inflando los streams
 * comprimidos para llegar al texto. Subía la cobertura de uno a dos de cada
 * tres artículos de prueba… y en el de SciELO devolvió
 * `10.1016/j.clindermatol.2013.05.033`: un trabajo CITADO en su bibliografía,
 * no el artículo.
 *
 * Eso no es un fallo menor, es el peor posible aquí: el tesista habría recibido
 * una ficha impecable —autores, año, revista, resumen— de un artículo que no es
 * el suyo, sin nada que se lo indicara. Y la habría citado.
 *
 * Estos campos son distintos: no son texto que aparece en el documento, son lo
 * que el documento afirma ser. Aciertan menos veces y no se equivocan.
 * Para lo que no alcanzan está pegar el DOI a mano, que son diez segundos con
 * el artículo ya abierto en pantalla.
 */
const CAMPOS = [
  /<prism:doi>\s*([^<]+?)\s*<\/prism:doi>/i,
  /<dc:identifier[^>]*>\s*(?:doi:)?\s*([^<]+?)\s*<\/dc:identifier>/i,
  /\/doi\s*\(\s*([^)]+?)\s*\)/i,
  /<xmp:Identifier[^>]*>\s*(?:doi:)?\s*([^<]+?)\s*<\/xmp:Identifier>/i,
];

/** Quita el envoltorio con el que suele venir escrito y comprueba la forma. */
export function normalizarDoi(crudo: string | null | undefined): string | null {
  const valor = String(crudo ?? '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    // Un DOI copiado del final de una frase se trae el punto de la frase.
    .replace(/[.,;]+$/, '');

  return /^10\.\d{4,9}\/\S+$/.test(valor) ? valor : null;
}

/** Los bytes de los extremos, como texto. No se decodifica: solo se mira. */
async function extremos(archivo: File): Promise<string> {
  const decodificar = (b: ArrayBuffer) => new TextDecoder('latin1').decode(b);

  if (archivo.size <= TROZO * 2) {
    return decodificar(await archivo.arrayBuffer());
  }

  const [cabeza, cola] = await Promise.all([
    archivo.slice(0, TROZO).arrayBuffer(),
    archivo.slice(archivo.size - TROZO).arrayBuffer(),
  ]);

  return `${decodificar(cabeza)}\n${decodificar(cola)}`;
}

/**
 * El DOI que el PDF declara de sí mismo, o null.
 *
 * Devolver null es un resultado correcto y frecuente, no un fallo: quiere decir
 * «este archivo no lo dice, pregúntaselo a la persona». Ver la nota de `CAMPOS`.
 */
export async function doiDelPdf(archivo: File): Promise<string | null> {
  let bytes: string;

  try {
    bytes = await extremos(archivo);
  } catch {
    // Un archivo que el navegador no puede leer no es un fallo de la página.
    return null;
  }

  for (const campo of CAMPOS) {
    const encontrado = normalizarDoi(campo.exec(bytes)?.[1]);
    if (encontrado) return encontrado;
  }

  return null;
}

/** Lo que sale de mirar un archivo: su DOI, o el archivo que se resistió. */
export interface Leido {
  archivo: string;
  doi: string | null;
}

/**
 * Mira varios PDF.
 *
 * Van de uno en uno y no en paralelo: leer veinte archivos a la vez levanta
 * veinte trozos en memoria del navegador de alguien que puede estar en un
 * portátil modesto, y la lectura es de disco, así que en paralelo tampoco
 * termina antes.
 */
export async function doisDeLosPdf(
  archivos: File[],
  alAvanzar?: (hechos: number, total: number) => void,
): Promise<Leido[]> {
  const leidos: Leido[] = [];

  for (const archivo of archivos) {
    leidos.push({ archivo: archivo.name, doi: await doiDelPdf(archivo) });
    alAvanzar?.(leidos.length, archivos.length);
  }

  return leidos;
}
