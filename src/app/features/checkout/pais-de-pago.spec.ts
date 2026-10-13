import {
  billeteraSeOfreceEn,
  detectarPaisDePago,
  paisDePagoDe,
  yapeSeOfreceEn,
} from './pais-de-pago';

describe('Desde qué país se paga', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('un país de la lista se queda con su código; otro cualquiera es «Otro país»', () => {
    expect(paisDePagoDe('PE')).toBe('PE');
    expect(paisDePagoDe(' ec ')).toBe('EC');
    expect(paisDePagoDe('US')).toBe('');
  });

  it('lo que no es un país es «no se sabe»', () => {
    for (const raro of [null, undefined, '', 'XX', 'T1', 'PERU', 51]) {
      expect(paisDePagoDe(raro)).toBeNull();
    }
  });

  it('Yape sale en Perú y cuando no se sabe el país, y en ningún otro', () => {
    expect(yapeSeOfreceEn('PE')).toBe(true);
    expect(yapeSeOfreceEn(null)).toBe(true);
    expect(yapeSeOfreceEn('EC')).toBe(false);
    expect(yapeSeOfreceEn('')).toBe(false);
  });

  it('cada billetera sale solo en su país, y todas cuando no se sabe', () => {
    expect(billeteraSeOfreceEn('EC', 'EC')).toBe(true);
    expect(billeteraSeOfreceEn('PE', 'EC')).toBe(false);
    expect(billeteraSeOfreceEn('', 'EC')).toBe(false);
    expect(billeteraSeOfreceEn(null, 'EC')).toBe(true);
  });

  it('pregunta el país al Worker', async () => {
    const pedir = vi.fn(async () => ({ ok: true, json: async () => ({ pais: 'EC' }) }));
    vi.stubGlobal('fetch', pedir);
    await expect(detectarPaisDePago()).resolves.toBe('EC');
    expect(pedir).toHaveBeenCalledWith('/api/pais', expect.anything());
  });

  it('sin Worker, con error o con otra cosa por respuesta, no se sabe y no falla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    await expect(detectarPaisDePago()).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin red'); }));
    await expect(detectarPaisDePago()).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => null })));
    await expect(detectarPaisDePago()).resolves.toBeNull();
  });
});
