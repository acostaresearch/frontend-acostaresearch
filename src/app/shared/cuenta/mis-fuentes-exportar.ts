import { FuenteGuardada } from '../../core/services/mis-fuentes.service';
import { FORMATOS, FormatoDeExportacion } from './scopus-exportar';

/**
 * Las fuentes guardadas, en un archivo que el tesista se lleva.
 *
 * Lo pidió un cliente el 14-oct: las fuentes que guardó desde Scopus se quedaban
 * aquí y no había forma de sacarlas para su Zotero, su matriz en Excel o el
 * correo al asesor. Los mismos tres formatos que «Exportar» de la búsqueda de
 * Scopus (ver `scopus-exportar`), pero con lo que hay en SU biblioteca: aquí sí
 * va el resumen, y la clave con la que Claude la cita.
 */

const ORIGENES: Record<string, string> = {
  SCOPUS: 'Subida o Scopus',
  ZOTERO: 'Zotero',
  MENDELEY: 'Mendeley',
};

function origenDe(fuente: FuenteGuardada): string {
  return ORIGENES[fuente.origen] ?? fuente.origen;
}

function autoresDe(fuente: FuenteGuardada): string[] {
  return fuente.autores
    .split(';')
    .map((autor) => autor.trim())
    .filter(Boolean);
}

/** «534-547» se parte; «e0123456» es solo la primera página. */
function paginasDe(fuente: FuenteGuardada): { desde: string; hasta: string } {
  const paginas = (fuente.paginas ?? '').trim();
  const partido = /^(.+?)\s*[–-]\s*(.+)$/.exec(paginas);
  if (partido) return { desde: partido[1].trim(), hasta: partido[2].trim() };
  return { desde: paginas, hasta: '' };
}

function sinSaltos(valor: string): string {
  return valor.replace(/[\r\n]+/g, ' ').trim();
}

// ── CSV ────────────────────────────────────────────────────────────────────

const COLUMNAS: readonly { titulo: string; valor: (f: FuenteGuardada) => string }[] = [
  { titulo: 'Clave', valor: (f) => f.clave ?? '' },
  { titulo: 'Autores', valor: (f) => f.autores },
  { titulo: 'Título', valor: (f) => f.titulo },
  { titulo: 'Año', valor: (f) => (f.anio === null ? '' : String(f.anio)) },
  { titulo: 'Fuente', valor: (f) => f.fuente ?? '' },
  { titulo: 'Volumen', valor: (f) => f.volumen ?? '' },
  { titulo: 'Número', valor: (f) => f.numero ?? '' },
  { titulo: 'Páginas', valor: (f) => f.paginas ?? '' },
  { titulo: 'DOI', valor: (f) => f.doi ?? '' },
  { titulo: 'Enlace', valor: (f) => f.enlace ?? '' },
  { titulo: 'Resumen', valor: (f) => sinSaltos(f.resumen ?? '') },
  { titulo: 'Origen', valor: origenDe },
];

/** Entrecomillada siempre, con las comillas de dentro dobladas. */
function celda(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

export function comoCsv(fuentes: readonly FuenteGuardada[]): string {
  const lineas = [COLUMNAS.map((c) => celda(c.titulo)).join(',')];
  for (const f of fuentes) lineas.push(COLUMNAS.map((c) => celda(c.valor(f))).join(','));
  return `${lineas.join('\r\n')}\r\n`;
}

// ── RIS ────────────────────────────────────────────────────────────────────

/** El tipo de Zotero, en RIS. Lo que no se reconoce va como artículo. */
function tipoRis(tipo: string): string {
  const nombre = tipo.toLowerCase();
  if (nombre.includes('thesis')) return 'THES';
  if (nombre.includes('conference')) return 'CPAPER';
  if (nombre.includes('section') || nombre.includes('chapter')) return 'CHAP';
  if (nombre.includes('book')) return 'BOOK';
  if (nombre.includes('report')) return 'RPRT';
  if (nombre.includes('webpage')) return 'ELEC';
  return 'JOUR';
}

export function comoRis(fuentes: readonly FuenteGuardada[]): string {
  const registros = fuentes.map((f) => {
    const { desde, hasta } = paginasDe(f);
    const lineas: [string, string][] = [['TY', tipoRis(f.tipo)]];

    for (const autor of autoresDe(f)) lineas.push(['AU', autor]);
    lineas.push(['TI', f.titulo]);
    if (f.anio !== null) lineas.push(['PY', String(f.anio)]);
    if (f.fuente) lineas.push(['JO', f.fuente]);
    if (f.volumen) lineas.push(['VL', f.volumen]);
    if (f.numero) lineas.push(['IS', f.numero]);
    if (desde) lineas.push(['SP', desde]);
    if (hasta) lineas.push(['EP', hasta]);
    if (f.doi) lineas.push(['DO', f.doi]);
    if (f.enlace) lineas.push(['UR', f.enlace]);
    if (f.resumen) lineas.push(['AB', f.resumen]);
    if (f.clave) lineas.push(['N1', `Clave: ${f.clave}`]);
    lineas.push(['ER', '']);

    return lineas.map(([etiqueta, valor]) => `${etiqueta}  - ${sinSaltos(valor)}`).join('\r\n');
  });

  return registros.length === 0 ? '' : `${registros.join('\r\n\r\n')}\r\n`;
}

// ── BibTeX ─────────────────────────────────────────────────────────────────

function soloLetras(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '');
}

/** «perez2023redes», con una letra detrás si se repite. */
function claveBib(fuente: FuenteGuardada, usadas: Set<string>): string {
  const apellido = soloLetras(autoresDe(fuente)[0]?.split(',')[0] ?? '').toLowerCase();
  const palabra = soloLetras(fuente.titulo.split(/\s+/)[0] ?? '').toLowerCase();
  const base = `${apellido || 'anonimo'}${fuente.anio ?? 'sf'}${palabra}` || 'fuente';

  let clave = base;
  let letra = 'a';
  while (usadas.has(clave)) {
    clave = `${base}${letra}`;
    letra = String.fromCharCode(letra.charCodeAt(0) + 1);
  }
  usadas.add(clave);
  return clave;
}

function valorBib(texto: string): string {
  return sinSaltos(texto).replace(/[{}\\]/g, '');
}

function tipoBib(tipo: string): string {
  const nombre = tipo.toLowerCase();
  if (nombre.includes('thesis')) return 'phdthesis';
  if (nombre.includes('conference')) return 'inproceedings';
  if (nombre.includes('section') || nombre.includes('chapter')) return 'incollection';
  if (nombre.includes('book')) return 'book';
  if (nombre.includes('report')) return 'techreport';
  if (nombre.includes('journal')) return 'article';
  return 'misc';
}

export function comoBibtex(fuentes: readonly FuenteGuardada[]): string {
  const usadas = new Set<string>();

  return fuentes
    .map((f) => {
      const { desde, hasta } = paginasDe(f);
      const campos: [string, string][] = [];

      const autores = autoresDe(f);
      if (autores.length > 0) campos.push(['author', autores.map(valorBib).join(' and ')]);
      campos.push(['title', `{${valorBib(f.titulo)}}`]);
      if (f.fuente) campos.push(['journal', valorBib(f.fuente)]);
      if (f.anio !== null) campos.push(['year', String(f.anio)]);
      if (f.volumen) campos.push(['volume', valorBib(f.volumen)]);
      if (f.numero) campos.push(['number', valorBib(f.numero)]);
      if (desde) campos.push(['pages', hasta ? `${valorBib(desde)}--${valorBib(hasta)}` : valorBib(desde)]);
      if (f.doi) campos.push(['doi', valorBib(f.doi)]);
      if (f.enlace) campos.push(['url', valorBib(f.enlace)]);
      if (f.resumen) campos.push(['abstract', valorBib(f.resumen)]);
      if (f.clave) campos.push(['note', `Clave: ${valorBib(f.clave)}`]);

      const cuerpo = campos.map(([nombre, valor]) => `  ${nombre} = {${valor}}`).join(',\n');
      return `@${tipoBib(f.tipo)}{${claveBib(f, usadas)},\n${cuerpo}\n}`;
    })
    .join('\n\n');
}

// ── El archivo ─────────────────────────────────────────────────────────────

export function contenido(formato: FormatoDeExportacion, fuentes: readonly FuenteGuardada[]): string {
  if (formato === 'ris') return comoRis(fuentes);
  if (formato === 'bib') return comoBibtex(fuentes);
  // El BOM solo en el CSV, para que Excel lo abra en UTF-8.
  return `\uFEFF${comoCsv(fuentes)}`;
}

/** «mis-fuentes-2026-10-14.ris». */
export function nombreDelArchivo(formato: FormatoDeExportacion, hoy = new Date()): string {
  const extension = FORMATOS.find((f) => f.valor === formato)?.extension ?? 'txt';
  const dia = [
    hoy.getFullYear(),
    String(hoy.getMonth() + 1).padStart(2, '0'),
    String(hoy.getDate()).padStart(2, '0'),
  ].join('-');
  return `mis-fuentes-${dia}.${extension}`;
}
