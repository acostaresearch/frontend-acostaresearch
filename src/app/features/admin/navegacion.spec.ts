import { MENU, SECCIONES_DE_PAIS, seccionDe } from './navegacion';

describe('Enlaces guardados del administrador', () => {
  it.each([

    ['bibliografia', 'corpus'],
    ['productos', 'grupos'],
    ['administradores', 'admins'],
    ['reclamaciones', 'reclamos'],
  ])('mantiene el enlace /admin/%s', (direccion, seccion) => {
    expect(seccionDe(direccion)).toBe(seccion);
  });

  it('conserva los enlaces del piloto aunque no estén en el menú', () => {
    expect(seccionDe('revisiones')).toBe('pedidos');
    expect(seccionDe('asesores')).toBe('asesores');
    const visibles = MENU.flatMap((grupo) => grupo.entradas.map((entrada) => entrada.seccion));
    expect(visibles).not.toContain('pedidos');
    expect(visibles).not.toContain('asesores');
  });

  it('al administrador de país no se le enseña lo que no es suyo', () => {
    for (const cerrada of ['billeteras', 'instituciones', 'sorteos', 'whatsapp', 'corpus', 'admins', 'pedidos', 'asesores']) {
      expect(SECCIONES_DE_PAIS).not.toContain(cerrada);
    }
    for (const abierta of ['resumen', 'accesos', 'descuentos', 'pruebas', 'grupos', 'tutoriales', 'guias', 'alertas', 'resenas', 'reclamos', 'usuarios', 'perfil']) {
      expect(SECCIONES_DE_PAIS).toContain(abierta);
    }
  });

  it('las licencias viven en «Usuarios»: su enlace antiguo abre ahí y ya no están en el menú', () => {
    expect(seccionDe('licencias')).toBe('usuarios');
    const visibles = MENU.flatMap((grupo) => grupo.entradas.map((entrada) => entrada.texto));
    expect(visibles).not.toContain('Licencias');
  });

  it('«Avance de clientes» se quitó: ni está en el menú ni su enlace abre nada', () => {
    expect(seccionDe('avance-de-clientes')).toBeUndefined();
    const visibles = MENU.flatMap((grupo) => grupo.entradas.map((entrada) => entrada.texto));
    expect(visibles).not.toContain('Avance de clientes');
  });

  it('«Formatos de universidad» (28-oct) tiene su dirección y su entrada, y no es del administrador de país', () => {
    expect(seccionDe('formatos-de-universidad')).toBe('formatos');
    const visibles = MENU.flatMap((grupo) => grupo.entradas.map((entrada) => entrada.seccion));
    expect(visibles).toContain('formatos');
    // El servidor solo deja entrar al ADMIN: al de país no se le enseña.
    expect(SECCIONES_DE_PAIS).not.toContain('formatos');
  });

  it('una sección desconocida queda sin resolver para que el panel vuelva al resumen', () => {
    expect(seccionDe('no-existe')).toBeUndefined();
    expect(seccionDe('toString')).toBeUndefined();
  });

  it('las pestañas de una misma página mantienen activa su entrada de menú', () => {
    const entradas = MENU.flatMap((grupo) => grupo.entradas);
    expect(entradas.find((e) => e.seccion === 'tutoriales')?.enciende).toContain('guias');
    expect(entradas.find((e) => e.seccion === 'usuarios')?.enciende).toContain('admins');
    const vigilancia = entradas.find((e) => e.seccion === 'alertas');
    expect(vigilancia?.enciende).toContain('resenas');
    expect(vigilancia?.enciende).toContain('reclamos');
  });
});
