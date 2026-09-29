import { UrlSegment } from '@angular/router';

import {
  asegurarRutas,
  casaPrivada,
  olvidarRutas,
  rotarRutas,
  rutaDeSeccion,
  rutaLegible,
  rutaPrivada,
  rutaReal,
} from './rutas-privadas';

const tramos = (url: string) =>
  url.split('/').filter(Boolean).map((path) => new UrlSegment(path, {}));

/** Las direcciones de las páginas con sesión, sorteadas en cada ingreso. */
describe('Rutas privadas', () => {
  beforeEach(() => {
    olvidarRutas();
    localStorage.clear();
  });

  it('sin sesión, los enlaces llevan a la puerta', () => {
    expect(rutaPrivada('perfil')).toBe('/perfil');
    expect(rutaPrivada('preparar')).toBe('/preparar-documento');
    expect(casaPrivada('perfil')(tramos('/perfil'), null as never, null as never)).toBeNull();
  });

  it('cada ingreso sortea direcciones nuevas que no dicen qué hay', () => {
    rotarRutas();
    const perfil = rutaPrivada('perfil');
    const admin = rutaDeSeccion('pagos');
    expect(perfil).toMatch(/^\/[A-Za-z0-9]{12}$/);
    expect(admin).toMatch(/^\/[A-Za-z0-9]{12}\/[A-Za-z0-9]{8}$/);
    expect(admin).not.toContain('pagos');

    rotarRutas();
    expect(rutaPrivada('perfil')).not.toBe(perfil);
    expect(rutaDeSeccion('pagos')).not.toBe(admin);
  });

  it('la de antes deja de casar y la de ahora casa', () => {
    rotarRutas();
    const vieja = rutaPrivada('perfil');
    rotarRutas();
    const casa = casaPrivada('perfil');
    expect(casa(tramos(vieja), null as never, null as never)).toBeNull();
    expect(casa(tramos(rutaPrivada('perfil')), null as never, null as never)).not.toBeNull();
    // La clave de una página no abre otra.
    expect(casaPrivada('admin', true)(tramos(rutaPrivada('perfil')), null as never, null as never)).toBeNull();
  });

  it('al recargar con sesión se conservan las mismas', () => {
    rotarRutas();
    const perfil = rutaPrivada('perfil');
    // Lo que pasa al recargar: la memoria se pierde y queda lo guardado.
    const guardado = localStorage.getItem('ar.rutas');
    olvidarRutas();
    localStorage.setItem('ar.rutas', guardado!);
    asegurarRutas();
    expect(rutaPrivada('perfil')).toBe(perfil);
  });

  it('para volver tras iniciar sesión se usa la puerta, y el panel no se nombra', () => {
    rotarRutas();
    const perfil = `${rutaPrivada('perfil')}?codigo=X1`;
    const admin = rutaDeSeccion('licencias');
    olvidarRutas();
    expect(rutaLegible(perfil)).toBe('/perfil?codigo=X1');
    expect(rutaLegible(admin)).toBe('/');
    expect(rutaLegible('/planes')).toBe('/planes');
  });

  it('el recorrido traduce sus pasos a la dirección de la sesión', () => {
    rotarRutas();
    expect(rutaReal('/perfil')).toBe(rutaPrivada('perfil'));
    expect(rutaReal('/admin/resumen')).toBe(rutaDeSeccion('resumen'));
    expect(rutaReal('/planes')).toBe('/planes');
  });
});
