import { trocear } from './comparar-texto';

describe('trocear (vista «Lado a lado»)', () => {
  it('marca en rojo lo quitado y en verde lo nuevo, palabra a palabra (un tramo seguido sale junto)', () => {
    const { original, resultado } = trocear(
      'The results shows a effect.',
      'The results show an effect.',
      [],
      [],
      true,
    );
    expect(original.filter((t) => t.tipo === 'quitado').map((t) => t.texto)).toEqual(['shows a']);
    expect(resultado.filter((t) => t.tipo === 'nuevo').map((t) => t.texto)).toEqual(['show an']);
    expect(original.map((t) => t.texto).join('')).toBe('The results shows a effect.');
  });

  it('pinta las citas en azul en los dos lados', () => {
    const cita = '(Pérez & Gómez, 2020)';
    const { original, resultado } = trocear(
      `It grew ${cita}.`,
      `It grows ${cita}.`,
      [cita],
      [cita],
      true,
    );
    expect(original.find((t) => t.tipo === 'cita')?.texto).toContain('Pérez');
    expect(resultado.find((t) => t.tipo === 'cita')?.texto).toContain('2020');
  });

  it('traduciendo no compara palabra a palabra: solo las citas', () => {
    const { original, resultado } = trocear(
      'The model works (Ruiz, 2021).',
      'El modelo funciona (Ruiz, 2021).',
      ['(Ruiz, 2021)'],
      ['(Ruiz, 2021)'],
      false,
    );
    expect(original.some((t) => t.tipo === 'quitado')).toBe(false);
    expect(resultado.some((t) => t.tipo === 'nuevo')).toBe(false);
    expect(resultado.some((t) => t.tipo === 'cita')).toBe(true);
  });

  it('un tramo de varias palabras cambiadas sale como un solo trozo', () => {
    const { resultado } = trocear('A b c d.', 'A x y d.', [], [], true);
    expect(resultado.filter((t) => t.tipo === 'nuevo').map((t) => t.texto)).toEqual(['x y']);
  });
});
