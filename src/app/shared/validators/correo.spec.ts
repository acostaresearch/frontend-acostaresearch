import { leerListaDeCorreos, revisarCorreo } from './correo';

/**
 * Lo que se prueba es que `kelin@gamail.com` ya no llegue a generar un código,
 * sin bloquear dominios que existen. Las mismas reglas se prueban en el
 * servidor (`tests/correo.revisar.test.js`).
 */
describe('Revisar correo', () => {
  it('detecta la errata del 13 de septiembre y propone el arreglo', () => {
    const r = revisarCorreo('Kelingabrielne@gamail.com');

    expect(r.problema).not.toBeNull();
    expect(r.sugerencia).toBe('kelingabrielne@gmail.com');
  });

  it('corrige las erratas típicas', () => {
    expect(revisarCorreo('ana@gmial.com').sugerencia).toBe('ana@gmail.com');
    expect(revisarCorreo('ana@gmail.con').sugerencia).toBe('ana@gmail.com');
    expect(revisarCorreo('ana@hotmial.es').sugerencia).toBe('ana@hotmail.es');
    expect(revisarCorreo('ana@outlok.com').sugerencia).toBe('ana@outlook.com');
    expect(revisarCorreo('anagmail.com').sugerencia).toBe('ana@gmail.com');
  });

  it('deja pasar los dominios reales', () => {
    for (const correo of [
      'je.10130081@gmail.com',
      'jairolivaress@outlook.com',
      'ana@hotmail.es',
      'ana@yahoo.com.pe',
      'ana@ymail.com',
      'a20201234@unmsm.edu.pe',
    ]) {
      expect(revisarCorreo(correo).problema).toBeNull();
    }
  });
});

describe('Leer una lista de correos', () => {
  it('acepta líneas, comas y repetidos, y marca solo el que falla', () => {
    const { correos, repetidos } = leerListaDeCorreos(
      'mtotocayom@gmail.com\n  casta.rrhh@gmail.com, naycha0210@gmial.com;\nmtotocayom@gmail.com',
    );

    expect(correos.map((c) => c.correo)).toEqual([
      'mtotocayom@gmail.com',
      'casta.rrhh@gmail.com',
      'naycha0210@gmial.com',
    ]);
    expect(repetidos).toBe(1);
    expect(correos.filter((c) => c.problema).map((c) => c.sugerencia)).toEqual([
      'naycha0210@gmail.com',
    ]);
  });

  it('un texto vacío no tiene correos', () => {
    expect(leerListaDeCorreos('  \n ').correos).toEqual([]);
  });
});
