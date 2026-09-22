import { ResultadoDeScopus } from '../../core/services/scopus.service';
import { comoBibtex, comoCsv, comoRis, nombreDelArchivo } from './scopus-exportar';

/**
 * Los tres formatos de «Exportar».
 *
 * Se prueban porque un archivo mal armado no falla: se descarga, se abre en
 * Zotero y entra sin autores, o se abre en Excel con una fila partida en dos, y
 * eso no se ve hasta que el tesista está montando su tabla de antecedentes.
 */
const ARTICULO: ResultadoDeScopus = {
  eid: '2-s2.0-85012345678',
  scopusId: '85012345678',
  titulo: 'Redes sociales, "engagement" y rendimiento en la educación PISA',
  autores: 'Pérez, A.M.; Gómez, L.; Ruiz, E.',
  anio: 2023,
  revista: 'Revista de Educación',
  volumen: '26',
  numero: '1',
  paginas: '534-547',
  doi: '10.1234/redes.2023.01',
  tipo: 'Article',
  citas: 12,
  accesoAbierto: true,
  enlace: 'https://www.scopus.com/inward/record.uri?eid=2-s2.0-85012345678',
  conResumen: true,
  yaLaTienes: false,
};

/** Uno cojo: sin DOI, sin revista, sin año y con número de artículo por página. */
const COJO: ResultadoDeScopus = {
  ...ARTICULO,
  eid: '2-s2.0-85099999999',
  titulo: 'Un estudio sin datos',
  autores: '',
  anio: null,
  revista: null,
  volumen: null,
  numero: null,
  paginas: 'e0123456',
  doi: null,
  tipo: 'Conference Paper',
  citas: 0,
  accesoAbierto: false,
  enlace: null,
};

describe('Exportar los resultados de Scopus', () => {
  describe('CSV', () => {
    it('entrecomilla todas las celdas y dobla las comillas de dentro', () => {
      const lineas = comoCsv([ARTICULO]).trim().split('\r\n');

      expect(lineas[0]).toContain('"Autores","Título","Año"');
      // El título trae comillas: doblarlas es lo que impide que parta la fila.
      expect(lineas[1]).toContain('"Redes sociales, ""engagement"" y rendimiento en la educación PISA"');
      expect(lineas[1]).toContain('"10.1234/redes.2023.01"');
      expect(lineas[1]).toContain('"Sí"');
      expect(lineas.length).toBe(2);
    });

    it('un artículo sin datos deja las celdas vacías, no huecos', () => {
      const [, fila] = comoCsv([COJO]).trim().split('\r\n');
      // Una fila tiene siempre tantas celdas como la cabecera.
      expect(fila.split('","').length).toBe(comoCsv([]).trim().split('","').length);
    });
  });

  describe('RIS', () => {
    it('reparte los autores y las páginas en sus etiquetas', () => {
      const ris = comoRis([ARTICULO]);

      expect(ris).toContain('TY  - JOUR');
      expect(ris).toContain('AU  - Pérez, A.M.');
      expect(ris).toContain('AU  - Gómez, L.');
      expect(ris).toContain('AU  - Ruiz, E.');
      expect(ris).toContain('SP  - 534');
      expect(ris).toContain('EP  - 547');
      expect(ris).toContain('DO  - 10.1234/redes.2023.01');
      expect(ris.trimEnd().endsWith('ER  -')).toBe(true);
    });

    it('sin rango de páginas no se inventa la última', () => {
      const ris = comoRis([COJO]);

      expect(ris).toContain('TY  - CPAPER');
      expect(ris).toContain('SP  - e0123456');
      expect(ris).not.toContain('EP  -');
      // Y lo que no tiene valor no deja la etiqueta vacía.
      expect(ris).not.toContain('DO  -');
      expect(ris).not.toContain('PY  -');
    });
  });

  describe('BibTeX', () => {
    it('junta los autores con «and» y protege el título de las mayúsculas', () => {
      const bib = comoBibtex([ARTICULO]);

      expect(bib).toContain('@article{perez2023redes,');
      expect(bib).toContain('author = {Pérez, A.M. and Gómez, L. and Ruiz, E.}');
      // Dobles llaves: sin ellas, BibTeX escribe «pisa» donde dice «PISA».
      expect(bib).toContain('title = {{Redes sociales, "engagement" y rendimiento en la educación PISA}}');
      expect(bib).toContain('pages = {534--547}');
    });

    it('dos artículos del mismo autor y año no comparten clave', () => {
      const bib = comoBibtex([ARTICULO, { ...ARTICULO, eid: '2-s2.0-85000000001' }]);

      expect(bib).toContain('@article{perez2023redes,');
      expect(bib).toContain('@article{perez2023redesa,');
    });
  });

  it('el archivo lleva la fecha, para no pisar la descarga de ayer', () => {
    expect(nombreDelArchivo('csv', new Date(2026, 8, 22))).toBe('scopus-2026-09-22.csv');
    expect(nombreDelArchivo('ris', new Date(2026, 8, 22))).toBe('scopus-2026-09-22.ris');
    expect(nombreDelArchivo('bib', new Date(2026, 8, 22))).toBe('scopus-2026-09-22.bib');
  });
});
