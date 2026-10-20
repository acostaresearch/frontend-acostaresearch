import {
  loQueLeToca,
  pestanaElegida,
  pestanasDeProducto,
  pestanasDelCurso,
  saleEnLaPestana,
} from './productos-de-ayuda';

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

describe('pestañas del video curso: producto, instalación y herramientas (21-oct)', () => {
  const CURSO = [
    { titulo: 'Crear tu cuenta de Claude', apartado: 'instalacion', productos: [] },
    { titulo: 'Zotero', apartado: 'herramientas', productos: ['tesis', 'articulo'] },
    { titulo: 'Skill 4: Metodología', apartado: 'producto', productos: ['tesis'] },
    { titulo: 'Fase 1 del informe', apartado: 'producto', productos: ['informe'] },
  ];
  const titulos = (pestana: string | null) =>
    CURSO.filter((e) => saleEnLaPestana(e, pestana)).map((e) => e.titulo);

  it('las de producto van primero y detrás «Instalación» y «Herramientas»', () => {
    expect(pestanasDelCurso(CURSO).map((p) => p.codigo)).toEqual([
      'tesis', 'informe', 'instalacion', 'herramientas',
    ]);
  });

  it('en la de Tesis salen solo sus skills, no la instalación ni Zotero', () => {
    expect(titulos('tesis')).toEqual(['Skill 4: Metodología']);
  });

  it('cada apartado trae lo suyo', () => {
    expect(titulos('instalacion')).toEqual(['Crear tu cuenta de Claude']);
    expect(titulos('herramientas')).toEqual(['Zotero']);
  });

  it('quien solo compró Informes no ve Zotero, que es de tesis y artículos', () => {
    const suyo = loQueLeToca(CURSO, ['informe']);
    expect(pestanasDelCurso(suyo).map((p) => p.codigo)).toEqual(['informe', 'instalacion']);
  });

  it('sin nada asignado a un producto, lo de uso va junto en «Tu curso»', () => {
    const sinAsignar = [{ apartado: 'producto', productos: [] }, { apartado: 'instalacion', productos: [] }];
    expect(pestanasDelCurso(sinAsignar).map((p) => p.codigo)).toEqual(['producto', 'instalacion']);
    expect(saleEnLaPestana(sinAsignar[0], 'producto')).toBe(true);
    expect(saleEnLaPestana(sinAsignar[1], 'producto')).toBe(false);
  });

  it('sin pestañas sale todo', () => {
    expect(titulos(null).length).toBe(4);
  });
});
