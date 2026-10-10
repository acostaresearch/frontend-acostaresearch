import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { EstadoCorpus, ReferenceService } from '../../core/services/reference.service';
import { BibliografiaAdmin } from './bibliografia';

describe('Bibliografía del administrador', () => {
  let estado: EstadoCorpus;
  let api: {
    estado: ReturnType<typeof vi.fn>;
    listar: ReturnType<typeof vi.fn>;
    sincronizar: ReturnType<typeof vi.fn>;
  };
  let bibliografia: BibliografiaAdmin;
  const error = signal<string | null>(null);
  const aviso = signal<string | null>(null);

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
    error.set(null);
    aviso.set(null);
    estado = {
      configurado: true, biblioteca: 'Biblioteca', total: 42,
      libraryVersion: 1, lastRunAt: null,
      trabajo: {
        activo: true, fase: 'fuentes', hechas: 10, total: 42,
        guardadas: 10, notas: 0, retiradas: 0,
        empezado: null, terminado: null, error: null,
      },
    };
    api = {
      estado: vi.fn(() => of(estado)),
      listar: vi.fn(() => of({ filas: [], total: 42, pagina: 1, tamano: 20 })),
      sincronizar: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ReferenceService, useValue: api },
      ],
    });
    bibliografia = TestBed.runInInjectionContext(() => new BibliografiaAdmin(error, aviso));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('reanuda una sincronización existente sin duplicar el seguimiento al recargar', () => {
    bibliografia.buscadorCorpus.setValue('educación');
    bibliografia.cargarCorpus(2);
    bibliografia.cargarCorpus(2);
    expect(api.listar).toHaveBeenLastCalledWith({ pagina: 2, texto: 'educación' });
    vi.advanceTimersByTime(3000);
    expect(api.estado).toHaveBeenCalledTimes(3);
    expect(api.sincronizar).not.toHaveBeenCalled();
  });

  it('al terminar actualiza la lista y los avisos del panel, y deja de consultar', () => {
    bibliografia.cargarCorpus(2);
    estado = { ...estado, trabajo: { ...estado.trabajo, activo: false, retiradas: 2 } };
    vi.advanceTimersByTime(3000);
    expect(bibliografia.paginaReferencias()).toBe(1);
    expect(aviso()).toBe('Corpus al día: 42 fuentes, 2 retiradas.');
    const consultas = api.estado.mock.calls.length;
    vi.advanceTimersByTime(9000);
    expect(api.estado).toHaveBeenCalledTimes(consultas);
  });

  it('al destruir el panel cancela el temporizador', () => {
    bibliografia.cargarCorpus();
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(9000);
    expect(api.estado).toHaveBeenCalledTimes(1);
  });

  it('si falla una consulta de seguimiento deja de pedir el estado en bucle', () => {
    bibliografia.cargarCorpus();
    api.estado.mockReturnValue(throwError(() => new Error('Sin conexión')));
    vi.advanceTimersByTime(9000);
    expect(api.estado).toHaveBeenCalledTimes(2);
  });
});
