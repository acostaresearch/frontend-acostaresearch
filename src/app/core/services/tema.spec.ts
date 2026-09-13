import { TestBed } from '@angular/core/testing';

import { CLAVE_TEMA, TemaService } from './tema.service';

/**
 * Qué tema se ve: el del sistema mientras nadie elige, y el elegido después.
 */
describe('Tema', () => {
  let oyente: ((evento: { matches: boolean }) => void) | undefined;

  function simularSistema(oscuro: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: oscuro,
        addEventListener: (_: string, fn: typeof oyente) => (oyente = fn),
      }),
    });
  }

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['tema'];
    oyente = undefined;
    TestBed.resetTestingModule();
  });

  it('sin elección, sigue al sistema', () => {
    simularSistema(true);
    const servicio = TestBed.inject(TemaService);

    expect(servicio.tema()).toBe('oscuro');
    expect(document.documentElement.dataset['tema']).toBe('oscuro');
  });

  it('si el sistema cambia con la página abierta, cambia con él', () => {
    simularSistema(false);
    const servicio = TestBed.inject(TemaService);

    oyente?.({ matches: true });

    expect(servicio.tema()).toBe('oscuro');
    expect(document.documentElement.dataset['tema']).toBe('oscuro');
  });

  it('al alternar, guarda la elección y la pinta', () => {
    simularSistema(false);
    const servicio = TestBed.inject(TemaService);

    servicio.alternar();

    expect(servicio.tema()).toBe('oscuro');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro');
    expect(document.documentElement.dataset['tema']).toBe('oscuro');
  });

  it('la elección guardada gana al sistema, también cuando este cambia', () => {
    localStorage.setItem(CLAVE_TEMA, 'claro');
    simularSistema(true);
    const servicio = TestBed.inject(TemaService);

    expect(servicio.tema()).toBe('claro');

    oyente?.({ matches: true });
    expect(servicio.tema()).toBe('claro');
  });
});
