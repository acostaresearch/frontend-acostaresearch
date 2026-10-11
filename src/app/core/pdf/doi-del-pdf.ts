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
 *
 * Y LOS QUE NO TIENEN DOI (11-oct-2026)
 * -------------------------------------
 * Una tesis de repositorio, un libro o un informe no tienen DOI que pegar. Para
 * esos se devuelve además lo que el PDF declara de su título y sus autores,
 * como propuesta para una ficha que la persona completa a mano.
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
  return (await mirar(archivo)).doi;
}

/**
 * El XMP va en UTF-8 y los bytes se leyeron como latin1 (para buscar en ellos
 * sin decodificar megas): un título con tildes sale como «AnÃ¡lisis». Se
 * devuelve a bytes y se lee como lo que es. Si no era UTF-8, se deja como vino.
 */
function comoUtf8(latin1: string): string {
  try {
    const bytes = Uint8Array.from(latin1, (c) => c.charCodeAt(0) & 0xff);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return latin1;
  }
}

/** Texto de un campo XMP: sin etiquetas, sin entidades y en una línea. */
function limpio(crudo: string | undefined): string {
  return comoUtf8(crudo ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Un título que no es un título: lo que el procesador de textos puso solo.
 * «Microsoft Word - cap2_final.docx» es lo más común en una tesis de repositorio.
 */
const NO_ES_TITULO = /microsoft word|\.docx?\b|\.pdf\b|\.indd\b|^untitled|^sin t[ií]tulo|^document\d*$/i;

/**
 * El título y los autores que el PDF DECLARA de sí mismo, para proponerlos.
 *
 * Solo el XMP, por lo mismo que el DOI: es lo que el documento afirma ser, no
 * texto suelto. Aquí además el riesgo es menor —se PROPONE en un formulario que
 * la persona revisa, no se guarda solo—, pero una propuesta mala cuesta más de
 * corregir que un campo vacío. Si no hay nada fiable, el título propuesto es el
 * nombre del archivo, que casi siempre lo puso quien lo descargó.
 */
function sugerencia(bytes: string, archivo: string): { titulo: string; autores: string } {
  const bloqueTitulo = /<dc:title>([\s\S]{0,2000}?)<\/dc:title>/i.exec(bytes)?.[1];
  const declarado = limpio(bloqueTitulo);

  const bloqueAutores = /<dc:creator>([\s\S]{0,3000}?)<\/dc:creator>/i.exec(bytes)?.[1] ?? '';
  const autores = [...bloqueAutores.matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/gi)]
    .map((m) => limpio(m[1]))
    // El «autor» de muchos PDF es el usuario de Windows o el programa.
    .filter((a) => a.length > 2 && a.length < 80 && !/^(user|usuario|admin|owner|pc)\b/i.test(a))
    .slice(0, 12)
    .join('; ');

  const delArchivo = archivo
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const sirve = declarado.length >= 12 && declarado.length <= 400 && !NO_ES_TITULO.test(declarado);
  return { titulo: sirve ? declarado : delArchivo, autores };
}

/** Una sola lectura del archivo para las dos cosas: el DOI y la propuesta. */
async function mirar(archivo: File): Promise<Leido> {
  let bytes: string;

  try {
    bytes = await extremos(archivo);
  } catch {
    // Un archivo que el navegador no puede leer no es un fallo de la página.
    return { archivo: archivo.name, doi: null, titulo: archivo.name.replace(/\.pdf$/i, ''), autores: '' };
  }

  let doi: string | null = null;
  for (const campo of CAMPOS) {
    doi = normalizarDoi(campo.exec(bytes)?.[1]);
    if (doi) break;
  }

  return { archivo: archivo.name, doi, ...sugerencia(bytes, archivo.name) };
}

/**
 * Lo que sale de mirar un archivo: su DOI, o el archivo que se resistió.
 *
 * `titulo` y `autores` son la propuesta para la ficha a mano de los que no
 * tienen DOI (una tesis, un libro, un informe). Ver `sugerencia`.
 */
export interface Leido {
  archivo: string;
  doi: string | null;
  titulo: string;
  autores: string;
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
    leidos.push(await mirar(archivo));
    alAvanzar?.(leidos.length, archivos.length);
  }

  return leidos;
}
