import { FuenteGuardada } from '../../core/services/mis-fuentes.service';
import { comoBibtex, comoCsv, comoRis, contenido, nombreDelArchivo } from './mis-fuentes-exportar';

/** «Descargar» de mis fuentes: un archivo mal armado no falla, entra cojo en Zotero o en Excel. */
const ARTICULO: FuenteGuardada = {
  clave: 'AR1A2B3C4D',
  tipo: 'journalArticle',
  titulo: 'Redes sociales, "engagement" y rendimiento',
  autores: 'Pérez, A.M.; Gómez, L.',
  anio: 2023,
  fuente: 'Revista de Educación',
  volumen: '26',
  numero: '1',
  paginas: '534-547',
  doi: '10.1234/redes.2023.01',
  enlace: null,
  resumen: 'Primera línea.\nSegunda línea.',
  origen: 'SCOPUS',
};

const TESIS: FuenteGuardada = {
  ...ARTICULO,
  clave: 'AR9Z8Y7X6W',
  tipo: 'thesis',
  titulo: 'Una tesis sin datos',
  autores: '',
  anio: null,
  fuente: null,
  volumen: null,
  numero: null,
  paginas: null,
  doi: null,
  resumen: null,
  origen: 'ZOTERO',
};

describe('Descargar mis fuentes', () => {
  it('CSV: una fila por fuente, comillas dobladas, resumen en una línea y BOM para Excel', () => {
    const csv = comoCsv([ARTICULO, TESIS]);
    const filas = csv.trimEnd().split('\r\n');
    expect(filas.length).toBe(3);
    expect(filas[0]).toContain('"Clave","Autores","Título"');
    expect(filas[1]).toContain('"Redes sociales, ""engagement"" y rendimiento"');
    expect(filas[1]).toContain('"Primera línea. Segunda línea."');
    expect(filas[2]).toContain('"Zotero"');
    expect(contenido('csv', [ARTICULO]).charCodeAt(0)).toBe(0xfeff);
  });

  it('RIS: tipo, autores uno por uno, páginas partidas, resumen y clave', () => {
    const ris = comoRis([ARTICULO, TESIS]);
    expect(ris).toContain('TY  - JOUR');
    expect(ris).toContain('AU  - Pérez, A.M.\r\nAU  - Gómez, L.');
    expect(ris).toContain('SP  - 534\r\nEP  - 547');
    expect(ris).toContain('AB  - Primera línea. Segunda línea.');
    expect(ris).toContain('N1  - Clave: AR1A2B3C4D');
    expect(ris).toContain('TY  - THES');
    expect(ris.match(/ER {2}- /g)?.length).toBe(2);
  });

  it('BibTeX: claves legibles y sin repetir', () => {
    const bib = comoBibtex([ARTICULO, ARTICULO, TESIS]);
    expect(bib).toContain('@article{perez2023redes,');
    expect(bib).toContain('@article{perez2023redesa,');
    expect(bib).toContain('@phdthesis{anonimosfuna,');
    expect(bib).toContain('pages = {534--547}');
  });

  it('el nombre lleva la fecha', () => {
    expect(nombreDelArchivo('ris', new Date(2026, 9, 14))).toBe('mis-fuentes-2026-10-14.ris');
  });
});
