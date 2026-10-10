import { MENU, seccionDe } from './navegacion';

describe('Enlaces guardados del administrador', () => {
  it.each([
    ['avance-de-clientes', 'embudo'],
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
