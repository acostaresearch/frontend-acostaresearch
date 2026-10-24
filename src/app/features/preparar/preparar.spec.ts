import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { PanelPreparar } from '../../core/models/preparar.model';
import { PrepararService } from '../../core/services/preparar.service';
import { Preparar } from './preparar';

/**
 * «Humanizar» en «Edición y Traducción» (20-oct-2026), en prueba: la pestaña
 * solo sale a quien el panel le dice `humanizar`, y deja subir sin membresía.
 */
function panel(extra: Partial<PanelPreparar> = {}): PanelPreparar {
  return {
    disponible: true,
    membresia: null,
    cupo: null,
    motivo: 'Necesitas una membresía para mandar documentos.',
    idiomas: [],
    maxPalabras: 25000,
    trabajos: [],
    ...extra,
  } as PanelPreparar;
}

function crear(datos: PanelPreparar, api: Record<string, unknown> = {}): Preparar {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PrepararService, useValue: { panel: () => of(datos), ...api } },
    ],
  });
  const fixture = TestBed.createComponent(Preparar);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('Humanizar en Edición y Traducción', () => {
  it('a un cliente no le sale la pestaña', () => {
    const pagina = crear(panel());
    expect(pagina.pestanas().map((p) => p.id)).toEqual(['EDICION', 'TRADUCCION']);
  });

  it('a un admin o beta le sale, y puede subir aunque no tenga membresía', () => {
    const pagina = crear(panel({ humanizar: true }));
    expect(pagina.pestanas().map((p) => p.id)).toContain('HUMANIZAR');

    expect(pagina.puede()).toBe(false);
    pagina.elegir('HUMANIZAR');
    expect(pagina.puede()).toBe(true);
  });

  it('el trabajo terminado se llama «humanizado» en la tabla y en los pasos', () => {
    const pagina = crear(panel({ humanizar: true }));
    const trabajo = { servicio: 'HUMANIZAR' } as Parameters<Preparar['servicioCorto']>[0];
    expect(pagina.servicioCorto(trabajo)).toBe('Humanizado');
    expect(pagina.pasoEditar(trabajo)).toBe('Humanizando el texto');
    expect(pagina.hechoDe(trabajo)).toBe('humanizados');
  });

  it('el reporte de IA se sube, se manda con el Word y se quita después', () => {
    const encargos: unknown[][] = [];
    const pagina = crear(panel({ humanizar: true }), {
      subirReporte: () => of({ reporteId: 'r-1', porcentaje: 57, palabrasMarcadas: 1200 }),
      encargar: (...args: unknown[]) => {
        encargos.push(args);
        return of({ preparacion: { id: 'p-1', servicio: 'HUMANIZAR', estado: 'EN_COLA' }, cupo: null });
      },
    });
    pagina.elegir('HUMANIZAR');

    const pdf = new File(['%PDF-'], 'reporte.pdf', { type: 'application/pdf' });
    pagina.desdeElReporte({ target: { files: [pdf], value: '' } } as unknown as Event);
    expect(pagina.reporte()?.reporteId).toBe('r-1');
    expect(pagina.nombreReporte()).toBe('reporte.pdf');

    const word = new File(['x'], 'tesis.docx');
    pagina.desdeElBoton({ target: { files: [word], value: '' } } as unknown as Event);
    expect(encargos[0][3]).toBe('r-1');
    expect(pagina.reporte()).toBeNull();
  });

  it('un reporte que no es PDF no se sube', () => {
    let subidos = 0;
    const pagina = crear(panel({ humanizar: true }), { subirReporte: () => (subidos++, of(null)) });
    pagina.desdeElReporte({ target: { files: [new File(['x'], 'reporte.docx')], value: '' } } as unknown as Event);
    expect(subidos).toBe(0);
    expect(pagina.error()).toContain('PDF');
  });
});
