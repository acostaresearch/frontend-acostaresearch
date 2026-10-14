import { doisDelTexto } from './dois-del-texto';

describe('DOI de un .md de referencias', () => {
  it('saca los DOI en sus formas habituales, sin lo que les pega el Markdown', () => {
    const md = [
      '# Referencias',
      '',
      '- Pérez, A. (2023). Redes sociales. *Revista de Educación*, 26(1), 534-547. https://doi.org/10.1234/redes.2023.01',
      '- Gómez, L. (2021). Otro estudio. doi:10.5678/abc.2021.9.',
      '- [Ruiz (2020)](https://doi.org/10.1016/S0140-6736(20)30183-5)',
      '- **DOI:** 10.1145/3770762.3772598**',
      '- Repetido: https://doi.org/10.1234/REDES.2023.01',
    ].join('\n');

    expect(doisDelTexto(md).dois).toEqual([
      '10.1234/redes.2023.01',
      '10.5678/abc.2021.9',
      '10.1016/S0140-6736(20)30183-5',
      '10.1145/3770762.3772598',
    ]);
  });

  it('cuenta las referencias que no traen DOI, sin contar títulos ni renglones cortos', () => {
    const md = [
      '# Referencias 2024',
      '',
      'Hernández, R., y Mendoza, C. (2018). Metodología de la investigación. McGraw-Hill.',
      'Creswell, J. (2014). Research design. Sage. https://doi.org/10.4135/9781452230153',
      'Nota corta 2020',
    ].join('\n');

    expect(doisDelTexto(md)).toEqual({ dois: ['10.4135/9781452230153'], sinDoi: 1 });
  });

  it('un .md sin referencias no da nada', () => {
    expect(doisDelTexto('Hola, esto es una nota.')).toEqual({ dois: [], sinDoi: 0 });
  });
});
