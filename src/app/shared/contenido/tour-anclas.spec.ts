import { TOUR_DEL_PANEL } from './tour-del-panel';
import { recorridoDeLaWeb } from './tour-de-la-web';

/** `import.meta.glob` es cosa del empaquetador; TypeScript no lo conoce. */
declare global {
  interface ImportMeta {
    glob: (patron: string, opciones: object) => Record<string, string>;
  }
}

/**
 * Que cada paso señale algo que existe DE VERDAD en el marcado.
 *
 * Esta prueba existe porque ya pasó: en una tanda de cambios, siete anclas se
 * perdieron y dos quedaron escritas FUERA de su etiqueta, como texto suelto en
 * mitad de la página. Nada falló —el recorrido esperaba unos segundos y se
 * saltaba el paso—, así que no se vio hasta recorrerlo entero a mano, en
 * producción.
 *
 * Un `data-tour` no se renombra por descuido si al renombrarlo se cae una
 * prueba.
 */
describe('Anclas del recorrido', () => {
  /**
   * Todas las plantillas del proyecto, en un solo texto.
   *
   * Se leen con `import.meta.glob` y no del disco: las pruebas no corren en
   * Node a secas y no tienen `fs` a mano. La llamada va entera y literal
   * —el empaquetador la sustituye al transformar el archivo, y guardada en una
   * variable no la reconoce—.
   */
  const plantillas = (() => {
    const ficheros = import.meta.glob('/src/app/**/*.html', {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    return Object.values(ficheros).join('\n');
  })();

  /** Los pasos de todos: el recorrido más largo posible. */
  const pasos = [
    ...recorridoDeLaWeb({ conSesion: true, esAdmin: true, tieneConector: true }),
    ...TOUR_DEL_PANEL,
  ];

  const anclas = [...new Set(pasos.map((paso) => paso.ancla).filter((a): a is string => !!a))];

  it('se leyeron las plantillas y el recorrido tiene pasos', () => {
    expect(plantillas.length).toBeGreaterThan(1000);
    expect(anclas.length).toBeGreaterThan(20);
  });

  it.each(anclas)('%s está en alguna plantilla, y dentro de su etiqueta', (ancla) => {
    if (ancla.startsWith('#')) {
      expect(plantillas).toContain(`id="${ancla.slice(1)}"`);
      return;
    }

    const nombre = ancla.replace(/^\[data-tour="(.+)"\]$/, '$1');
    expect(nombre).not.toBe(ancla); // Solo se usan anclas `[data-tour]` o `#id`.
    expect(plantillas).toContain(`data-tour="${nombre}"`);

    // Y DENTRO de la etiqueta: suelto, el atributo se lee como texto en la
    // página y el paso no encuentra a quién señalar.
    const suelto = new RegExp(`(^|\\n)\\s*data-tour="${nombre}"\\s*(\\n\\s*)?<`);
    expect(suelto.test(plantillas)).toBe(false);
  });
});
