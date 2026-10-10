import { signal } from '@angular/core';
import { Plan } from '../../core/models/rewrite.model';
import { CatalogoCheckout } from './catalogo-checkout';

describe('Catálogo de checkout', () => {
  const plan = (code: string, extra: Partial<Plan> = {}) => ({ code, name: code,
    kind: 'LICENSE', durationDays: 90, ...extra } as Plan);
  const metodo = signal<Plan[]>([]);
  const catalogo = new CatalogoCheckout(metodo, signal([]), () => '3 meses',
    p => p.code === 'METODO_COMPLETO', () => null, () => false, () => false, () => false, () => null);

  it('distingue artículos de revisión de los empíricos y conserva sus fases', () => {
    expect(catalogo.nombreFila(plan('ARTICULOS_REVIEW'))).toBe('Artículos de Revisión');
    expect(catalogo.nombreFila(plan('ARTICULO_EMPIRICO'))).toContain('Empíricos');
    expect(catalogo.fasesDe(plan('ARTICULOS_REVIEW'))?.titulo).toContain('revisión');
    expect(catalogo.fasesDe(plan('HUMANIZADOR'))).toBeNull();
  });
  it('ordena las tarjetas y usa la caja mensual o trimestral de documentos', () => {
    metodo.set([plan('HUMANIZADOR'), plan('ARTICULO_EMPIRICO'), plan('METODO_COMPLETO')]);
    expect(catalogo.ordenSkills().map(p => p.code)).toEqual(['METODO_COMPLETO', 'ARTICULO_EMPIRICO', 'HUMANIZADOR']);
    expect(catalogo.imagenDe(plan('PREPARAR', { kind: 'DOCUMENTO', durationDays: 30 }))).toContain('mensual');
    expect(catalogo.imagenDe(plan('PREPARAR', { kind: 'DOCUMENTO', durationDays: 90 }))).toContain('trimestral');
  });
  it('separa el nombre de un extra de para qué sirve', () => {
    expect(catalogo.partirExtra('Bajar similitud: reduce el porcentaje de Turnitin'))
      .toEqual(['Bajar similitud', 'Reduce el porcentaje de Turnitin']);
    expect(catalogo.partirExtra('Análisis cualitativo')).toEqual(['Análisis cualitativo', '']);
  });
  it('abre la ventana de un paquete a la vez y la cierra si deja de venderse', () => {
    const tesis = plan('METODO_COMPLETO');
    const humanizador = plan('HUMANIZADOR');
    metodo.set([tesis, humanizador]);
    expect(catalogo.planAbierto()).toBeNull();

    catalogo.abrirFila(tesis);
    expect(catalogo.planAbierto()?.code).toBe('METODO_COMPLETO');
    catalogo.abrirFila(humanizador);
    expect(catalogo.planAbierto()?.code).toBe('HUMANIZADOR');
    expect(catalogo.estaAbierta(tesis)).toBe(false);

    metodo.set([tesis]);
    expect(catalogo.planAbierto()).toBeNull();

    catalogo.abrirFila(tesis);
    catalogo.cerrarFila();
    expect(catalogo.planAbierto()).toBeNull();
  });
});
