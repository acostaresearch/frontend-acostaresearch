import { ResultadoDeScopus } from '../../core/services/scopus.service';

/**
 * Los resultados de Scopus, en un archivo que se lleve a otra parte.
 *
 * POR QUÉ, SI YA ESTÁ EL BOTÓN DE «AÑADIR A MIS FUENTES»
 * -----------------------------------------------------
 * Porque no es lo mismo. «Añadir a mis fuentes» deja los artículos donde Claude
 * los va a citar, dentro de esta casa. Esto se los da al tesista en la mano:
 * para pegarlos en la tabla de su matriz de antecedentes, para metérselos a su
 * asesor por correo, para abrirlos en su Zotero de la universidad o para
 * guardarse la búsqueda del día que la defienda. Quien exporta no está
 * redactando: está rindiendo cuentas de dónde salió su corpus.
 *
 * TRES FORMATOS Y NO UNO
 * ----------------------
 * CSV lo abre Excel y lo lee R, y es el que se pega en una tabla. RIS y BibTeX
 * no se leen: se importan, el primero en Zotero, Mendeley y EndNote, el segundo
 * en LaTeX y JabRef. Dar solo CSV obligaría a teclear a mano las referencias en
 * el gestor que ya usa.
 *
 * SE ARMA AQUÍ, CON LO QUE YA ESTÁ EN PANTALLA
 * --------------------------------------------
 * No se le vuelve a preguntar a Elsevier. Los datos de la página ya llegaron al
 * navegador, y recorrer la búsqueda entera gastaría cuota de la casa por un
 * archivo que se pide de golpe y a menudo por curiosidad. Por eso exporta lo
 * marcado, o la página que se ve si no hay nada marcado, y lo dice antes de
 * descargar.
 *
 * LO QUE SE EXPORTA ES LO QUE DIJO SCOPUS, no lo que arma esta web: ni los
 * resúmenes de OpenAlex ni los enlaces a copias abiertas entran en el archivo.
 * Un exporte que mezclara fuentes obligaría a explicar en la Metodología de
 * dónde salió cada columna.
 */

/** Los formatos que se ofrecen, en el orden del menú. */
export type FormatoDeExportacion = 'csv' | 'ris' | 'bib';

export interface Formato {
  valor: FormatoDeExportacion;
  texto: string;
  /** Para qué sirve, en el idioma de quien lo va a usar. */
  detalle: string;
  extension: string;
  /** El `type` del Blob. El juego de caracteres va siempre: todo sale en UTF-8. */
  mime: string;
}

export const FORMATOS: readonly Formato[] = [
  {
    valor: 'csv',
    texto: 'CSV',
    detalle: 'Excel o R',
    extension: 'csv',
    mime: 'text/csv;charset=utf-8',
  },
  {
    valor: 'ris',
    texto: 'RIS',
    detalle: 'Zotero, Mendeley, EndNote',
    extension: 'ris',
    mime: 'application/x-research-info-systems;charset=utf-8',
  },
  {
    valor: 'bib',
    texto: 'BibTeX',
    detalle: 'LaTeX o JabRef',
    extension: 'bib',
    mime: 'application/x-bibtex;charset=utf-8',
  },
];

/** Los autores, uno por uno. Scopus los manda «Apellido, N.; Apellido, N.». */
function autoresDe(resultado: ResultadoDeScopus): string[] {
  return resultado.autores
    .split(';')
    .map((autor) => autor.trim())
    .filter(Boolean);
}

/**
 * Las páginas partidas en primera y última.
 *
 * `paginas` viene como «534-547» cuando la revista pagina, y como «e0123456»
 * —el número de artículo— cuando es electrónica y no lo hace. En el segundo
 * caso solo hay primera página, y decir que el artículo acaba donde empieza
 * sería inventarse un dato.
 */
function paginasDe(resultado: ResultadoDeScopus): { desde: string; hasta: string } {
  const paginas = (resultado.paginas ?? '').trim();
  const partido = /^(.+?)\s*[–-]\s*(.+)$/.exec(paginas);
  if (partido) return { desde: partido[1].trim(), hasta: partido[2].trim() };
  return { desde: paginas, hasta: '' };
}

// ── CSV ────────────────────────────────────────────────────────────────────

/**
 * Las columnas, con el nombre en castellano.
 *
 * En castellano y no con las etiquetas de Scopus porque este archivo lo abre el
 * tesista en su Excel para mirarlo y pegarlo, no un programa que espere unos
 * nombres concretos: quien quiera que lo lea un programa exporta RIS o BibTeX.
 */
const COLUMNAS: readonly { titulo: string; valor: (r: ResultadoDeScopus) => string }[] = [
  { titulo: 'Autores', valor: (r) => r.autores },
  { titulo: 'Título', valor: (r) => r.titulo },
  { titulo: 'Año', valor: (r) => (r.anio === null ? '' : String(r.anio)) },
  { titulo: 'Fuente', valor: (r) => r.revista ?? '' },
  { titulo: 'Volumen', valor: (r) => r.volumen ?? '' },
  { titulo: 'Número', valor: (r) => r.numero ?? '' },
  { titulo: 'Páginas', valor: (r) => r.paginas ?? '' },
  { titulo: 'Tipo de documento', valor: (r) => r.tipo ?? '' },
  { titulo: 'Citas', valor: (r) => String(r.citas) },
  { titulo: 'DOI', valor: (r) => r.doi ?? '' },
  { titulo: 'Acceso abierto', valor: (r) => (r.accesoAbierto ? 'Sí' : 'No') },
  { titulo: 'EID', valor: (r) => r.eid },
  { titulo: 'Enlace en Scopus', valor: (r) => r.enlace ?? '' },
];

/**
 * Una celda entrecomillada SIEMPRE.
 *
 * Aunque no lleve comas: los títulos traen comas, comillas y dos puntos, y
 * entrecomillar solo a veces es la forma segura de que un día se cuele una
 * fila partida en dos. Las comillas de dentro se doblan, que es como lo
 * escribe el propio Scopus.
 */
function celda(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

/**
 * El CSV, con salto de Windows.
 *
 * Sin el BOM que le dice a Excel que esto es UTF-8, «Gestión» se abre como
 * «GestiÃ³n» en el Excel de Windows, que es el que tiene casi todo el mundo.
 * Lo pone quien construye el archivo, no esta función, para que las pruebas
 * comparen texto y no bytes.
 */
export function comoCsv(resultados: readonly ResultadoDeScopus[]): string {
  const lineas = [COLUMNAS.map((c) => celda(c.titulo)).join(',')];
  for (const r of resultados) lineas.push(COLUMNAS.map((c) => celda(c.valor(r))).join(','));
  return `${lineas.join('\r\n')}\r\n`;
}

// ── RIS ────────────────────────────────────────────────────────────────────

/**
 * El tipo de referencia de RIS. Lo que no se reconozca va como artículo de
 * revista, que es lo que es casi todo lo que sale de una búsqueda de Scopus.
 */
function tipoRis(tipo: string | null): string {
  const nombre = (tipo ?? '').toLowerCase();
  if (nombre.includes('conference')) return 'CPAPER';
  if (nombre.includes('chapter')) return 'CHAP';
  if (nombre.includes('book')) return 'BOOK';
  return 'JOUR';
}

/**
 * Un registro RIS por artículo.
 *
 * Las etiquetas son las que importan Zotero, Mendeley y EndNote sin pedir
 * nada: dos letras, dos espacios, un guion y un espacio. `ER  -` cierra el
 * registro y tiene que estar aunque el artículo venga cojo. El salto es el de
 * Windows, como el que reparte Scopus.
 */
export function comoRis(resultados: readonly ResultadoDeScopus[]): string {
  const registros = resultados.map((r) => {
    const { desde, hasta } = paginasDe(r);
    const lineas: [string, string][] = [['TY', tipoRis(r.tipo)]];

    for (const autor of autoresDe(r)) lineas.push(['AU', autor]);
    lineas.push(['TI', r.titulo]);
    if (r.anio !== null) lineas.push(['PY', String(r.anio)]);
    if (r.revista) lineas.push(['JO', r.revista]);
    if (r.volumen) lineas.push(['VL', r.volumen]);
    if (r.numero) lineas.push(['IS', r.numero]);
    if (desde) lineas.push(['SP', desde]);
    if (hasta) lineas.push(['EP', hasta]);
    if (r.doi) lineas.push(['DO', r.doi]);
    if (r.enlace) lineas.push(['UR', r.enlace]);
    // El identificador de Scopus, en la nota: es lo que permite volver al
    // registro exacto cuando el DOI falta o la editorial lo cambió.
    lineas.push(['N1', `EID: ${r.eid}`]);
    lineas.push(['DB', 'Scopus']);
    lineas.push(['ER', '']);

    return lineas.map(([etiqueta, valor]) => `${etiqueta}  - ${sinSaltos(valor)}`).join('\r\n');
  });

  return registros.length === 0 ? '' : `${registros.join('\r\n\r\n')}\r\n`;
}

/** Un salto dentro de un valor parte el registro: se queda en espacio. */
function sinSaltos(valor: string): string {
  return valor.replace(/[\r\n]+/g, ' ').trim();
}

// ── BibTeX ─────────────────────────────────────────────────────────────────

/** Sin acentos y sin nada que no sea letra o número: para la clave de la entrada. */
function soloLetras(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '');
}

/**
 * La clave de la entrada: «perez2023redes».
 *
 * Es la que se teclea en el `\cite{}`, así que se arma como la arma todo el
 * mundo —primer apellido, año y primera palabra del título— y no con el EID,
 * que nadie sabría de memoria. Repetidas se distinguen con una letra detrás.
 */
function claveDe(resultado: ResultadoDeScopus, usadas: Set<string>): string {
  const apellido = soloLetras(autoresDe(resultado)[0]?.split(',')[0] ?? '').toLowerCase();
  const palabra = soloLetras(resultado.titulo.split(/\s+/)[0] ?? '').toLowerCase();
  const base = `${apellido || 'anonimo'}${resultado.anio ?? 'sf'}${palabra}` || 'fuente';

  let clave = base;
  let letra = 'a';
  while (usadas.has(clave)) {
    clave = `${base}${letra}`;
    letra = String.fromCharCode(letra.charCodeAt(0) + 1);
  }
  usadas.add(clave);
  return clave;
}

/** Las llaves y la barra son la sintaxis de BibTeX: dentro de un valor, sobran. */
function valorBib(texto: string): string {
  return sinSaltos(texto).replace(/[{}\\]/g, '');
}

function tipoBib(tipo: string | null): string {
  const nombre = (tipo ?? '').toLowerCase();
  if (nombre.includes('conference')) return 'inproceedings';
  if (nombre.includes('chapter')) return 'incollection';
  if (nombre.includes('book')) return 'book';
  return 'article';
}

/**
 * Las entradas de BibTeX.
 *
 * El título va entre dobles llaves a propósito: sin ellas, BibTeX pasa a
 * minúsculas los nombres propios y las siglas —«PISA» acaba en «pisa»— y el
 * asesor lo ve en la lista de referencias.
 */
export function comoBibtex(resultados: readonly ResultadoDeScopus[]): string {
  const usadas = new Set<string>();

  return resultados
    .map((r) => {
      const { desde, hasta } = paginasDe(r);
      const campos: [string, string][] = [];

      const autores = autoresDe(r);
      if (autores.length > 0) campos.push(['author', autores.map(valorBib).join(' and ')]);
      campos.push(['title', `{${valorBib(r.titulo)}}`]);
      if (r.revista) campos.push(['journal', valorBib(r.revista)]);
      if (r.anio !== null) campos.push(['year', String(r.anio)]);
      if (r.volumen) campos.push(['volume', valorBib(r.volumen)]);
      if (r.numero) campos.push(['number', valorBib(r.numero)]);
      if (desde) campos.push(['pages', hasta ? `${valorBib(desde)}--${valorBib(hasta)}` : valorBib(desde)]);
      if (r.doi) campos.push(['doi', valorBib(r.doi)]);
      if (r.enlace) campos.push(['url', valorBib(r.enlace)]);
      campos.push(['note', `Scopus EID: ${valorBib(r.eid)}`]);

      const cuerpo = campos.map(([nombre, valor]) => `  ${nombre} = {${valor}}`).join(',\n');
      return `@${tipoBib(r.tipo)}{${claveDe(r, usadas)},\n${cuerpo}\n}`;
    })
    .join('\n\n');
}

// ── El archivo ─────────────────────────────────────────────────────────────

/** El contenido del archivo, ya en el formato pedido. */
export function contenido(
  formato: FormatoDeExportacion,
  resultados: readonly ResultadoDeScopus[],
): string {
  if (formato === 'ris') return comoRis(resultados);
  if (formato === 'bib') return comoBibtex(resultados);
  // El BOM solo en el CSV: es lo que le dice a Excel que esto es UTF-8. En un
  // .ris o un .bib estorbaría al gestor que los importa.
  return `﻿${comoCsv(resultados)}`;
}

/** «scopus-2026-09-22.csv»: la fecha para no pisar la descarga de ayer. */
export function nombreDelArchivo(formato: FormatoDeExportacion, hoy = new Date()): string {
  const extension = FORMATOS.find((f) => f.valor === formato)?.extension ?? 'txt';
  const dia = [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('-');
  return `scopus-${dia}.${extension}`;
}
