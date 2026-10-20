import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AnaliticaService, CLAVE_CONSENTIMIENTO, direccionLimpia } from './analitica.service';

/**
 * Google Analytics solo con permiso, y sin datos de la persona en la dirección.
 */
describe('Analítica', () => {
  const scriptsDeGoogle = () => document.querySelectorAll('script[src*="googletagmanager"]').length;

  beforeEach(() => {
    localStorage.clear();
    document.querySelectorAll('script[src*="googletagmanager"]').forEach((s) => s.remove());
    delete window.gtag;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('quita el correo y demás parámetros de la dirección, pero deja los de campaña', () => {
    expect(
      direccionLimpia('https://acostaresearch.com/auth/verificar-email?email=ana%40gmail.com&returnUrl=%2Fplanes'),
    ).toBe('https://acostaresearch.com/auth/verificar-email');
    expect(
      direccionLimpia('https://acostaresearch.com/planes?utm_source=tiktok&codigo=ABC&fbclid=x#precios'),
    ).toBe('https://acostaresearch.com/planes?utm_source=tiktok&fbclid=x');
  });

  it('sin aceptar no descarga gtag.js ni manda eventos', () => {
    const servicio = TestBed.inject(AnaliticaService);
    servicio.iniciar();
    servicio.evento('purchase', { value: 34 });

    expect(scriptsDeGoogle()).toBe(0);
    expect(window.gtag).toBeUndefined();
  });

  it('al rechazar, guarda la elección y no carga nada', () => {
    const servicio = TestBed.inject(AnaliticaService);
    servicio.rechazar();

    expect(localStorage.getItem(CLAVE_CONSENTIMIENTO)).toBe('no');
    expect(servicio.pendiente()).toBe(false);
    expect(scriptsDeGoogle()).toBe(0);
  });

  it('«Preferencias de cookies» borra la elección para volver a preguntar', () => {
    localStorage.setItem(CLAVE_CONSENTIMIENTO, 'no');
    const servicio = TestBed.inject(AnaliticaService);

    servicio.reabrir();

    expect(localStorage.getItem(CLAVE_CONSENTIMIENTO)).toBeNull();
  });
});
