import { segmentar, trocear } from './asistente-texto';

/**
 * Cómo se pinta lo que escribe el asistente.
 *
 * Lo importante no es que quede bonito sino que un enlace solo lleve a una
 * página de la web: el texto lo genera una IA a la que cualquiera le puede
 * pedir que escriba una dirección.
 */
describe('Asistente · texto de la respuesta', () => {
  it('un enlace a una página de la web es un enlace', () => {
    expect(segmentar('Mira [los precios](/planes).')).toEqual([
      { tipo: 'texto', texto: 'Mira ' },
      { tipo: 'enlace', texto: 'los precios', ruta: '/planes' },
      { tipo: 'texto', texto: '.' },
    ]);
  });

  it('conserva el fragmento y descarta la consulta', () => {
    expect(segmentar('[panel](/metodo?x=1#skills)')).toEqual([
      { tipo: 'enlace', texto: 'panel', ruta: '/metodo', fragmento: 'skills' },
    ]);
  });

  it('un enlace externo o inventado queda como texto', () => {
    expect(segmentar('[pago](https://otra-web.com)')).toEqual([{ tipo: 'texto', texto: 'pago' }]);
    expect(segmentar('[admin](/admin)')).toEqual([{ tipo: 'texto', texto: 'admin' }]);
    expect(segmentar('[clic](javascript:alert(1))')[0].tipo).toBe('texto');
  });

  it('[WhatsApp](whatsapp) es el enlace de contacto', () => {
    expect(segmentar('Escribe por [WhatsApp](whatsapp)')).toEqual([
      { tipo: 'texto', texto: 'Escribe por ' },
      { tipo: 'whatsapp', texto: 'WhatsApp' },
    ]);
  });

  it('la negrita se reconoce', () => {
    expect(segmentar('Es **gratis** con Claude')).toEqual([
      { tipo: 'texto', texto: 'Es ' },
      { tipo: 'negrita', texto: 'gratis' },
      { tipo: 'texto', texto: ' con Claude' },
    ]);
  });

  it('las viñetas seguidas forman una lista y una línea en blanco separa párrafos', () => {
    const bloques = trocear('Incluye:\n- Las 12 Skills\n* Asesoría\n\n¿Te ayudo con algo más?');
    expect(bloques.map((b) => [b.tipo, b.lineas.length])).toEqual([
      ['parrafo', 1],
      ['lista', 2],
      ['parrafo', 1],
    ]);
    expect(bloques[1].lineas[0]).toEqual([{ tipo: 'texto', texto: 'Las 12 Skills' }]);
  });

  it('un título sale en negrita, sin almohadillas', () => {
    expect(trocear('## Precios')[0].lineas[0]).toEqual([{ tipo: 'negrita', texto: 'Precios' }]);
  });
});
