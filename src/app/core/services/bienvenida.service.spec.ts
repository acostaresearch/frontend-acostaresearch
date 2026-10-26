import { BienvenidaService } from './bienvenida.service';

// El canje tras entrar: solo el código que se pulsó antes, y una sola vez.
describe('BienvenidaService · canje tras entrar', () => {
  it('sin haber pulsado Canjear no canjea nada (abrir el enlace no gasta el código)', () => {
    const servicio = new BienvenidaService();
    expect(servicio.tomarCanje('ACR-AAAA-BBBB-CCCC')).toBe(false);
  });

  it('canjea el código que se pulsó, y solo una vez', () => {
    const servicio = new BienvenidaService();
    servicio.recordarCanje('ACR-AAAA-BBBB-CCCC');
    expect(servicio.tomarCanje('ACR-AAAA-BBBB-CCCC')).toBe(true);
    expect(servicio.tomarCanje('ACR-AAAA-BBBB-CCCC')).toBe(false);
  });

  it('otro código en la dirección no se canjea solo', () => {
    const servicio = new BienvenidaService();
    servicio.recordarCanje('ACR-AAAA-BBBB-CCCC');
    expect(servicio.tomarCanje('ACR-ZZZZ-YYYY-XXXX')).toBe(false);
  });
});
