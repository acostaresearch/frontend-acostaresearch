import { signal } from '@angular/core';
import { BusquedaDeScopus, ResultadoDeScopus } from '../../core/services/scopus.service';
import { ExportacionScopus } from './scopus-exportacion';

describe('Selección para exportar Scopus', () => {
  it('exporta la página o solo lo marcado, sin incluir marcas de otra página', () => {
    const resultados = [{ eid: 'uno' }, { eid: 'dos' }] as ResultadoDeScopus[];
    const busqueda = signal<BusquedaDeScopus | null>({ resultados } as BusquedaDeScopus);
    const marcados = signal<ReadonlySet<string>>(new Set());
    const exportacion = new ExportacionScopus(busqueda, marcados, () => {});
    expect(exportacion.aExportar()).toEqual(resultados);
    marcados.set(new Set(['dos', 'otra-pagina']));
    expect(exportacion.aExportar()).toEqual([resultados[1]]);
    busqueda.set(null);
    expect(exportacion.aExportar()).toEqual([]);
  });
});
