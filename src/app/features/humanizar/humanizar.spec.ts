import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { PanelPreparar, Preparacion } from '../../core/models/preparar.model';
import { PrepararService } from '../../core/services/preparar.service';
import { Humanizar } from './humanizar';

/**
 * «Humanizar» como conversación (24-oct-2026): empezar uno con o sin reporte
 * y con capítulos que no se tocan, los pasos, y otra ronda.
 */
function panel(extra: Partial<PanelPreparar> = {}): PanelPreparar {
  return {
    disponible: true,
    humanizar: true,
    membresia: null,
    cupo: null,
    motivo: null,
    idiomas: [],
    maxPalabras: 60000,
    trabajos: [],
    ...extra,
  } as PanelPreparar;
}

const LISTO = {
  id: 'p-1',
  servicio: 'HUMANIZAR',
  nombre: 'tesis.docx',
  palabras: 12000,
  estado: 'LISTO',
  tocados: 138,
  intactos: 0,
  avisos: [],
  createdAt: new Date().toISOString(),
  detalle: { conReporte: true, noTocar: ['RESULTADOS'], parrafo: false, deId: null },
} as unknown as Preparacion;

function crear(datos: PanelPreparar, api: Record<string, unknown> = {}): Humanizar {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: PrepararService,
        useValue: {
          panel: () => of(datos),
          ver: () => of(LISTO),
          capitulos: () => of({ palabras: 100, capitulos: [{ clave: '3', titulo: 'RESULTADOS', palabras: 40 }] }),
          ...api,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(Humanizar);
  fixture.detectChanges();
  return fixture.componentInstance;
}

const evento = (archivo: File) => ({ target: { files: [archivo], value: '' } }) as unknown as Event;

describe('Humanizar como conversación', () => {
  it('a quien no puede encargarlo no le deja mandar', () => {
    const pagina = crear(panel({ humanizar: false }));
    expect(pagina.puede()).toBe(false);
  });

  it('con el Word lee los capítulos y manda los que no se tocan', () => {
    const encargos: unknown[][] = [];
    const pagina = crear(panel(), {
      encargar: (...args: unknown[]) => {
        encargos.push(args);
        return of({ preparacion: { ...LISTO, estado: 'EN_COLA' }, cupo: null });
      },
    });
    expect(pagina.listoParaMandar()).toBe(false);
    pagina.desdeElBoton(evento(new File(['x'], 'tesis.docx')));
    expect(pagina.capitulos().map((c) => c.titulo)).toEqual(['RESULTADOS']);
    pagina.alternarCapitulo('3');
    expect(pagina.listoParaMandar()).toBe(true);
    pagina.mandar();
    expect(encargos[0][0]).toBe('HUMANIZAR');
    expect(encargos[0][3]).toBeUndefined();
    expect(encargos[0][4]).toEqual(['3']);
    expect(pagina.archivo()).toBeNull();
  });

  it('«solo lo marcado» no deja mandar sin el reporte, y con él lo manda', () => {
    const encargos: unknown[][] = [];
    const pagina = crear(panel(), {
      subirReporte: () => of({ reporteId: 'r-1', porcentaje: 57, palabrasMarcadas: 1200 }),
      encargar: (...args: unknown[]) => {
        encargos.push(args);
        return of({ preparacion: LISTO, cupo: null });
      },
    });
    pagina.elegirModo('MARCADO');
    pagina.desdeElBoton(evento(new File(['x'], 'tesis.docx')));
    expect(pagina.listoParaMandar()).toBe(false);
    pagina.desdeElReporte(evento(new File(['%PDF-'], 'reporte.pdf')));
    expect(pagina.listoParaMandar()).toBe(true);
    pagina.mandar();
    expect(encargos[0][3]).toBe('r-1');
  });

  it('un Word que no es .docx no se acepta', () => {
    const pagina = crear(panel());
    pagina.desdeElBoton(evento(new File(['x'], 'tesis.pdf')));
    expect(pagina.archivo()).toBeNull();
    expect(pagina.error()).toContain('.docx');
  });

  it('la conversación dice lo que se pidió y los pasos hechos', () => {
    const pagina = crear(panel({ trabajos: [LISTO] }));
    expect(pagina.pedidoDe(LISTO)).toBe('Humaniza solo lo marcado. No toques: RESULTADOS.');
    expect(pagina.pasosDe(LISTO).map((p) => p.estado)).toEqual(['hecho', 'hecho', 'hecho', 'hecho']);
    const enCurso = { ...LISTO, estado: 'EN_CURSO', progreso: { paso: 'EDITANDO', hechas: 3, total: 12 } } as Preparacion;
    expect(pagina.pasosDe(enCurso).map((p) => p.estado)).toEqual(['hecho', 'hecho', 'actual', 'pendiente']);
    expect(pagina.seccionDe(enCurso)).toBe('sección 4 de 12');
  });

  it('un reporte nuevo en «*%» ofrece humanizar todo otra vez', async () => {
    const rondas: unknown[][] = [];
    const pagina = crear(panel({ trabajos: [LISTO] }), {
      subirReporte: () =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: 400,
              error: { error: { code: 'VALIDATION_ERROR', message: 'Ese reporte no trae nada resaltado. Cuando Turnitin da «*%»…' } },
            }),
        ),
      ronda: (...args: unknown[]) => {
        rondas.push(args);
        return of({ preparacion: { ...LISTO, id: 'p-2', estado: 'EN_COLA' }, cupo: null });
      },
    });
    await TestBed.inject(Router).navigate([], { queryParams: { doc: 'p-1' } });
    TestBed.tick();
    pagina.desdeElReporteDeRonda(evento(new File(['%PDF-'], 'nuevo.pdf')));
    expect(pagina.sinMarcas()).toBe(true);
    pagina.todoOtraVez();
    expect(rondas[0]).toEqual(['p-1', {}]);
  });

  it('rehacer un párrafo manda su clave', async () => {
    const rondas: unknown[][] = [];
    const pagina = crear(panel({ trabajos: [LISTO] }), {
      ronda: (...args: unknown[]) => {
        rondas.push(args);
        return of({ preparacion: { ...LISTO, id: 'p-3', estado: 'EN_COLA' }, cupo: null });
      },
    });
    await TestBed.inject(Router).navigate([], { queryParams: { doc: 'p-1' } });
    TestBed.tick();
    pagina.rehacer({ clave: '12' } as Parameters<Humanizar['rehacer']>[0]);
    expect(rondas[0]).toEqual(['p-1', { clave: '12' }]);
  });
});
