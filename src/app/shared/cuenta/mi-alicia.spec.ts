import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { MiAlicia } from './mi-alicia';
import { AliciaService, BusquedaDeAlicia } from '../../core/services/alicia.service';
import { AvisosService } from '../../core/services/avisos.service';
import { MisFuentesService } from '../../core/services/mis-fuentes.service';

describe('Resultados nacionales en segundo plano', () => {
  const lista = (fuente: 'alicia' | 'lareferencia', vacia = false): BusquedaDeAlicia => ({
    consulta: 'tema',
    desde: null,
    hasta: null,
    fuente,
    aliciaEnCamino: fuente === 'lareferencia',
    total: vacia ? 0 : 1,
    pagina: 1,
    paginas: 1,
    porPagina: 20,
    resultados: vacia
      ? []
      : [
          {
            id: fuente,
            titulo: 'Una tesis',
            autores: 'Autora',
            anio: 2026,
            tipo: 'Tesis',
            universidad: null,
            revista: null,
            asesor: null,
            url: null,
            resumen: null,
            yaLaTienes: false,
          },
        ],
  });

  function preparar(vacia = false) {
    const actualizacion = new Subject<BusquedaDeAlicia | null>();
    const info = vi.fn();
    TestBed.configureTestingModule({
      imports: [MiAlicia],
      providers: [
        {
          provide: AliciaService,
          useValue: {
            buscar: () => of(lista('lareferencia', vacia)),
            esperar: () => actualizacion,
          },
        },
        { provide: AvisosService, useValue: { info } },
        { provide: MisFuentesService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(MiAlicia);
    fixture.componentRef.setInput('ecuacion', 'TITLE(tema)');
    fixture.detectChanges();
    return { fixture, componente: fixture.componentInstance, actualizacion, info };
  }

  it('conserva la lista visible hasta elegir la actualización y no muestra aviso flotante', () => {
    const { fixture, componente, actualizacion, info } = preparar();
    actualizacion.next(lista('alicia'));
    fixture.detectChanges();
    expect(componente.busqueda()?.fuente).toBe('lareferencia');
    expect(componente.listaDeAlicia()?.fuente).toBe('alicia');
    expect(fixture.nativeElement.textContent).not.toMatch(/ALICIA|LA Referencia/);
    componente.ponerLaDeAlicia();
    expect(componente.busqueda()?.fuente).toBe('alicia');
    expect(info).not.toHaveBeenCalled();
  });

  it('actualiza automáticamente una lista vacía', () => {
    const { componente, actualizacion } = preparar(true);
    actualizacion.next(lista('alicia'));
    expect(componente.busqueda()?.fuente).toBe('alicia');
    expect(componente.listaDeAlicia()).toBeNull();
  });
});
