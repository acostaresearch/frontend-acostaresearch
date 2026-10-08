import { UrlSegment } from '@angular/router';

import {
  casaPrivada,
  esDelPerfil,
  rutaDeSeccion,
  rutaDelPerfil,
  rutaPrivada,
  rutaReal,
} from './rutas-privadas';

const tramos = (url: string) =>
  url.split('/').filter(Boolean).map((path) => new UrlSegment(path, {}));

const casa = (pagina: Parameters<typeof casaPrivada>[0], url: string) =>
  casaPrivada(pagina)(tramos(url), null as never, null as never);

/** Las direcciones de las páginas con sesión, limpias desde el 8-oct. */
describe('Rutas privadas', () => {
  it('las direcciones son limpias, sin clave detrás', () => {
    expect(rutaPrivada('perfil')).toBe('/perfil/ayuda');
    expect(rutaPrivada('preparar')).toBe('/preparar-documento');
    expect(rutaPrivada('admin')).toBe('/admin');
    expect(rutaDelPerfil('herramientas')).toBe('/perfil/herramientas');
    expect(rutaDeSeccion('licencias')).toBe('/admin/licencias');
  });

  it('cada sección del perfil casa y entrega su nombre', () => {
    expect(casa('perfil', '/perfil/compras')?.posParams?.['seccion'].path).toBe('compras');
    expect(casa('perfil', '/perfil')).toBeNull();
    expect(casa('perfil', '/perfil/inventada')).toBeNull();
    // Una dirección vieja con clave no casa aquí: la redirige app.routes.
    expect(casa('perfil', '/perfil/ayuda/kFZ5mTnQBH0j')).toBeNull();
    expect(esDelPerfil('/perfil/compras?zotero=ok')).toBe(true);
    expect(esDelPerfil(rutaPrivada('preparar'))).toBe(false);
  });

  it('el panel entrega el nombre de la sección como parámetro', () => {
    expect(casa('admin', '/admin/resumen')?.posParams?.['seccion'].path).toBe('resumen');
    expect(casa('admin', '/admin')).toBeNull();
  });

  it('el recorrido traduce sus pasos a la dirección real', () => {
    expect(rutaReal('/perfil')).toBe('/perfil/ayuda');
    expect(rutaReal('/admin/resumen')).toBe('/admin/resumen');
    expect(rutaReal('/planes')).toBe('/planes');
  });
});
