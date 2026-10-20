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

function crear(datos: PanelPreparar): Preparar {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: PrepararService, useValue: { panel: () => of(datos) } },
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
});
