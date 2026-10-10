import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';

import { DialogoService } from '../../core/services/dialogo.service';
import { Guia, GuiaService } from '../../core/services/guia.service';
import { Tutorial, TutorialService } from '../../core/services/tutorial.service';
import { ContenidoAyudaAdmin } from './contenido-ayuda';

const video = (id: string, orden: number): Tutorial => ({
  id, orden, grupo: '', etiqueta: '', titulo: `Vídeo ${id}`, duracion: '',
  entrada: '', puntos: [], videoUrl: '', productos: [], active: true,
});
const guia: Guia = {
  id: 'guia', orden: 1, titulo: 'Guía de tesis', descripcion: '',
  archivoNombre: 'tesis.pdf', bytes: 100, productos: ['tesis'], active: true, updatedAt: '',
};

describe('Tutoriales y guías del administrador', () => {
  let ayuda: ContenidoAyudaAdmin;
  let tutoriales: { reordenar: ReturnType<typeof vi.fn>; borrar: ReturnType<typeof vi.fn> };
  let guias: {
    crear: ReturnType<typeof vi.fn>; actualizar: ReturnType<typeof vi.fn>;
    cambiarArchivo: ReturnType<typeof vi.fn>; todas: ReturnType<typeof vi.fn>;
  };
  let dialogos: { confirmar: ReturnType<typeof vi.fn> };
  const error = signal<string | null>(null);
  const aviso = signal<string | null>(null);

  beforeEach(() => {
    TestBed.resetTestingModule();
    error.set(null);
    aviso.set(null);
    tutoriales = { reordenar: vi.fn(), borrar: vi.fn() };
    guias = {
      crear: vi.fn(), actualizar: vi.fn(), cambiarArchivo: vi.fn(),
      todas: vi.fn(() => of([guia])),
    };
    dialogos = { confirmar: vi.fn(async () => false) };
    TestBed.configureTestingModule({ providers: [
      { provide: TutorialService, useValue: tutoriales },
      { provide: GuiaService, useValue: guias },
      { provide: DialogoService, useValue: dialogos },
    ] });
    ayuda = TestBed.runInInjectionContext(() => new ContenidoAyudaAdmin(error, aviso));
  });

  afterEach(() => TestBed.resetTestingModule());

  it('un vídeo y una guía nuevos heredan el producto de su pestaña', () => {
    ayuda.listaTutoriales.filtrar('informe');
    ayuda.editarTutorial(null);
    expect(ayuda.formTutorial.controls.productos.value).toEqual(['informe']);
    ayuda.listaGuias.filtrar('tsp');
    ayuda.editarGuia(null);
    expect(ayuda.formGuia.controls.productos.value).toEqual(['tsp']);
    ayuda.listaGuias.filtrar('todas');
    ayuda.editarGuia(null);
    expect(ayuda.formGuia.controls.productos.value).toEqual([]);
  });

  it('una guía nueva exige PDF; editar una existente permite conservarlo', () => {
    ayuda.editarGuia(null);
    ayuda.formGuia.controls.titulo.setValue('Nueva guía');
    ayuda.guardarGuia();
    expect(guias.crear).not.toHaveBeenCalled();
    expect(ayuda.puedeGuardarGuia()).toBe(false);
    ayuda.pdfElegido.set(new File(['pdf'], 'nueva.pdf', { type: 'application/pdf' }));
    expect(ayuda.puedeGuardarGuia()).toBe(true);
    ayuda.editarGuia(guia);
    expect(ayuda.pdfElegido()).toBeNull();
    expect(ayuda.puedeGuardarGuia()).toBe(true);
  });

  it('actualiza primero la ficha y después reemplaza el PDF, sin duplicar el envío', () => {
    const ficha = new Subject<Guia>();
    const archivo = new Subject<Guia>();
    guias.actualizar.mockReturnValue(ficha);
    guias.cambiarArchivo.mockReturnValue(archivo);
    ayuda.editarGuia(guia);
    const pdf = new File(['pdf'], 'nuevo.pdf', { type: 'application/pdf' });
    ayuda.pdfElegido.set(pdf);
    ayuda.guardarGuia();
    ayuda.guardarGuia();
    expect(guias.actualizar).toHaveBeenCalledTimes(1);
    expect(guias.cambiarArchivo).not.toHaveBeenCalled();
    ficha.next(guia);
    expect(guias.cambiarArchivo).toHaveBeenCalledWith(guia.id, pdf);
    archivo.next(guia);
    expect(ayuda.guardandoGuia()).toBe(false);
    expect(ayuda.formularioGuia()).toBe(false);
    expect(guias.todas).toHaveBeenCalledTimes(1);
  });

  it('si el servidor rechaza el nuevo orden restaura la lista completa', () => {
    const respuesta = new Subject<Tutorial[]>();
    tutoriales.reordenar.mockReturnValue(respuesta);
    const antes = [video('a', 1), video('b', 2), video('c', 3)];
    ayuda.tutoriales.set(antes);
    ayuda.listaTutoriales.busca.set('Vídeo b');
    ayuda.arrastrandoTutorial.set('c');
    ayuda.soltarTutorial({ preventDefault: vi.fn() } as unknown as DragEvent, antes[1]);
    expect(tutoriales.reordenar).toHaveBeenCalledWith(['a', 'c', 'b']);
    expect(ayuda.tutoriales().map((t) => t.id)).toEqual(['a', 'c', 'b']);
    respuesta.error(new Error('Sin conexión'));
    expect(ayuda.tutoriales()).toEqual(antes);
    expect(ayuda.arrastrandoTutorial()).toBeNull();
    expect(error()).not.toBeNull();
  });

  it('cancelar la confirmación de borrado evita llamar al servidor', async () => {
    await ayuda.borrarTutorial(video('a', 1));
    expect(dialogos.confirmar).toHaveBeenCalledTimes(1);
    expect(tutoriales.borrar).not.toHaveBeenCalled();
  });
});
