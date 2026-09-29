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

const casa = (pagina: Parameters<typeof casaPrivada>[0], url: string) =>
  casaPrivada(pagina)(tramos(url), null as never, null as never);

/** Las direcciones de las páginas con sesión, con una clave por ingreso. */
describe('Rutas privadas', () => {
  beforeEach(() => {
    olvidarRutas();
    localStorage.clear();
  });

  it('sin sesión, los enlaces llevan a la puerta y nada casa', () => {
    expect(rutaPrivada('perfil')).toBe('/perfil');
    expect(rutaPrivada('preparar')).toBe('/preparar-documento');
    expect(rutaPrivada('admin')).toBe('/admin');
    expect(casa('perfil', '/perfil/fDvxinjld3Wv')).toBeNull();
  });

  it('dice qué página es y detrás lleva una clave que cambia en cada ingreso', () => {
    rotarRutas();
    const perfil = rutaPrivada('perfil');
    const pagos = rutaDeSeccion('pagos');
    expect(perfil).toMatch(/^\/perfil\/[A-Za-z0-9]{12}$/);
    expect(rutaPrivada('preparar')).toMatch(/^\/preparar-documento\/[A-Za-z0-9]{12}$/);
    expect(pagos).toMatch(/^\/admin\/[A-Za-z0-9]{12}$/);
    expect(pagos).not.toContain('pagos');
    expect(rutaDeSeccion('usuarios')).not.toBe(pagos);

    rotarRutas();
    expect(rutaPrivada('perfil')).not.toBe(perfil);
    expect(rutaDeSeccion('pagos')).not.toBe(pagos);
  });

  it('la clave de antes deja de casar y la de ahora casa', () => {
    rotarRutas();
    const vieja = rutaPrivada('perfil');
    rotarRutas();
    expect(casa('perfil', vieja)).toBeNull();
    expect(casa('perfil', rutaPrivada('perfil'))).not.toBeNull();
    // La puerta a secas no es la página, y la clave de una no abre otra.
    expect(casa('perfil', '/perfil')).toBeNull();
    const clave = rutaPrivada('perfil').split('/')[2];
    expect(casa('preparar', `/preparar-documento/${clave}`)).toBeNull();
  });

  it('el panel entrega el código de la sección como parámetro', () => {
    rotarRutas();
    const resumen = rutaDeSeccion('resumen');
    const casado = casa('admin', resumen);
    expect(casado?.posParams?.['seccion'].path).toBe(resumen.split('/')[2]);
    expect(casa('admin', '/admin')).toBeNull();
  });

  it('al recargar con sesión se conservan las mismas', () => {
    rotarRutas();
    const perfil = rutaPrivada('perfil');
    const resumen = rutaDeSeccion('resumen');
    // Lo que pasa al recargar: la memoria se pierde y queda lo guardado.
    const guardado = localStorage.getItem('ar.rutas');
    olvidarRutas();
    localStorage.setItem('ar.rutas', guardado!);
    asegurarRutas();
    expect(rutaPrivada('perfil')).toBe(perfil);
    expect(rutaDeSeccion('resumen')).toBe(resumen);
  });

  it('para volver tras iniciar sesión se usa la puerta', () => {
    rotarRutas();
    const perfil = `${rutaPrivada('perfil')}?codigo=X1`;
    const admin = rutaDeSeccion('licencias');
    olvidarRutas();
    expect(rutaLegible(perfil)).toBe('/perfil?codigo=X1');
    expect(rutaLegible(admin)).toBe('/admin');
    expect(rutaLegible('/planes')).toBe('/planes');
  });

  it('el recorrido traduce sus pasos a la dirección de la sesión', () => {
    rotarRutas();
    expect(rutaReal('/perfil')).toBe(rutaPrivada('perfil'));
    expect(rutaReal('/admin/resumen')).toBe(rutaDeSeccion('resumen'));
    expect(rutaReal('/planes')).toBe('/planes');
  });
});
