import { loQueLeToca, pestanaElegida, pestanasDeProducto } from './productos-de-ayuda';

const VIDEOS = [
  { titulo: 'Conectar Claude', productos: [] },
  { titulo: 'Marco teórico', productos: ['tesis', 'tsp'] },
  { titulo: 'Fase 1 del informe', productos: ['informe'] },
  { titulo: 'Humanizar por bloques', productos: ['humanizador'] },
];

describe('videos y guías según lo comprado', () => {
  it('sin filtro se ve todo: visitante, quien no compró y administrador', () => {
    expect(loQueLeToca(VIDEOS, null).length).toBe(4);
  });

  it('quien compró Informes ve lo suyo y lo común, no lo de la tesis', () => {
    const titulos = loQueLeToca(VIDEOS, ['informe', 'humanizador']).map((v) => v.titulo);
    expect(titulos).toEqual(['Conectar Claude', 'Fase 1 del informe', 'Humanizar por bloques']);
  });

  it('un video de dos productos le sale a quien compró cualquiera de los dos', () => {
    expect(loQueLeToca(VIDEOS, ['tsp']).map((v) => v.titulo)).toContain('Marco teórico');
  });

  it('con un solo producto no hay pestaña elegida: no hay pestañas', () => {
    const pestanas = pestanasDeProducto(loQueLeToca(VIDEOS, ['informe']));
    expect(pestanaElegida(pestanas.filter((p) => p.codigo === 'informe'), null)).toBeNull();
  });

  it('con varias siempre hay una marcada: la pedida, o la primera', () => {
    const pestanas = pestanasDeProducto(VIDEOS);
    expect(pestanaElegida(pestanas, 'informe')).toBe('informe');
    expect(pestanaElegida(pestanas, null)).toBe('tesis');
    expect(pestanaElegida(pestanas, 'inventado')).toBe('tesis');
  });
});
