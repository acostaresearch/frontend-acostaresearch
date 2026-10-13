import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';

import { Plan } from '../../core/models/rewrite.model';
import { DialogoService } from '../../core/services/dialogo.service';
import { EnlacePrueba, PruebaService } from '../../core/services/prueba.service';
import { PruebasConectorAdmin } from './pruebas-conector';

const enlace: EnlacePrueba = {
  id: 'prueba', slug: 'taller', name: 'Taller', productCode: 'TESIS', productName: 'Tesis',
  url: 'https://example.com/prueba/taller', seats: 30, claimed: 5, accessMinutes: 1440,
  callsPerDay: 20, active: true, estado: 'ABIERTO', terminaAt: null,
  conectados: 2, consultas: 10, createdAt: '',
};

describe('Enlaces de prueba del administrador', () => {
  let pruebas: PruebasConectorAdmin;
  let api: {
    crear: ReturnType<typeof vi.fn>; encender: ReturnType<typeof vi.fn>;
    borrar: ReturnType<typeof vi.fn>;
  };
  let dialogos: { confirmar: ReturnType<typeof vi.fn> };
  const error = signal<string | null>(null);
  const aviso = signal<string | null>(null);
  const trabajando = signal(false);

  beforeEach(() => {
    TestBed.resetTestingModule();
    error.set(null);
    aviso.set(null);
    trabajando.set(false);
    api = { crear: vi.fn(), encender: vi.fn(), borrar: vi.fn() };
    dialogos = { confirmar: vi.fn(async () => false) };
    TestBed.configureTestingModule({ providers: [
      { provide: PruebaService, useValue: api },
      { provide: DialogoService, useValue: dialogos },
    ] });
    pruebas = TestBed.runInInjectionContext(() =>
      new PruebasConectorAdmin(error, aviso, trabajando, signal<Plan[]>([])),
    );
  });

  afterEach(() => TestBed.resetTestingModule());

  it('cancelar la confirmación impide apagar o borrar un enlace', async () => {
    await pruebas.alternarPrueba(enlace);
    await pruebas.borrarPrueba(enlace);
    expect(dialogos.confirmar).toHaveBeenCalledTimes(2);
    expect(api.encender).not.toHaveBeenCalled();
    expect(api.borrar).not.toHaveBeenCalled();
  });

  it('encender un enlace apagado actualiza su fila sin pedir confirmación', async () => {
    pruebas.pruebas.set([{ ...enlace, active: false, estado: 'APAGADO' }]);
    api.encender.mockReturnValue(of({ enlace, mensaje: 'Encendido' }));
    await pruebas.alternarPrueba({ ...enlace, active: false, estado: 'APAGADO' });
    expect(dialogos.confirmar).not.toHaveBeenCalled();
    expect(api.encender).toHaveBeenCalledWith(enlace.id, true);
    expect(pruebas.pruebas()?.[0].active).toBe(true);
    expect(aviso()).toBe('Encendido');
  });

  it('convierte horas a minutos y evita duplicar el alta o cerrar mientras espera', () => {
    const alta = new Subject<EnlacePrueba>();
    api.crear.mockReturnValue(alta);
    pruebas.abrirFormularioPrueba();
    pruebas.formPrueba.patchValue({ name: 'Taller', productCode: 'TESIS' });
    pruebas.crearPrueba();
    pruebas.crearPrueba();
    pruebas.cerrarFormularioPrueba();
    expect(pruebas.formularioPruebaAbierto()).toBe(true);
    expect(api.crear).toHaveBeenCalledTimes(1);
    expect(api.crear).toHaveBeenCalledWith({
      name: 'Taller', productCode: 'TESIS', seats: 30, callsPerDay: 15, accessMinutes: 1440,
    });
    alta.next(enlace);
    expect(trabajando()).toBe(false);
    expect(pruebas.formularioPruebaAbierto()).toBe(false);
    expect(pruebas.pruebaNueva()).toBe(enlace);
  });

  it('descarga el QR del enlace como PNG con el nombre del grupo', async () => {
    const pintado = { fillStyle: '', fillRect: vi.fn() };
    const lienzo = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(pintado as unknown as CanvasRenderingContext2D);
    const imagen = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((listo) => listo(new Blob(['png'], { type: 'image/png' })));
    const descargas: string[] = [];
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) { descargas.push(this.download); });
    const crearUrl = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:qr');

    await pruebas.descargarQrPrueba(enlace);

    expect(descargas).toEqual(['qr-taller.png']);
    // Un QR tiene cientos de módulos negros: si no se pintó casi nada, no es un QR.
    expect(pintado.fillRect.mock.calls.length).toBeGreaterThan(100);
    expect(error()).toBeNull();
    URL.createObjectURL = crearUrl;
    lienzo.mockRestore();
    imagen.mockRestore();
    clic.mockRestore();
  });

  it('si el navegador no deja dibujar el QR, lo dice y no descarga nada', async () => {
    const lienzo = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await pruebas.descargarQrPrueba(enlace);

    expect(clic).not.toHaveBeenCalled();
    expect(error()).toBe('No pudimos crear el QR. Copia el enlace y compártelo así.');
    lienzo.mockRestore();
    clic.mockRestore();
  });

  it('rechaza una duración mayor de un año después de convertir las horas', () => {
    pruebas.formPrueba.patchValue({ name: 'Taller', productCode: 'TESIS', accesoCantidad: 9000 });
    pruebas.crearPrueba();
    expect(api.crear).not.toHaveBeenCalled();
    expect(error()).toBe('Como mucho un año de acceso.');
    expect(trabajando()).toBe(false);
  });

  it('un fallo al crear libera el bloqueo y conserva el formulario para reintentar', () => {
    const alta = new Subject<EnlacePrueba>();
    api.crear.mockReturnValue(alta);
    pruebas.abrirFormularioPrueba();
    pruebas.formPrueba.patchValue({ name: 'Taller', productCode: 'TESIS' });
    pruebas.crearPrueba();
    alta.error(new Error('Sin conexión'));
    expect(trabajando()).toBe(false);
    expect(pruebas.formularioPruebaAbierto()).toBe(true);
    expect(error()).not.toBeNull();
    api.crear.mockReturnValue(of(enlace));
    pruebas.crearPrueba();
    expect(api.crear).toHaveBeenCalledTimes(2);
  });

  describe('el nombre propuesto', () => {
    const planes = [
      { productCode: 'TESIS', name: 'Método de Tesis · 9 Capítulos + Humanizador' },
      { productCode: 'ARTICULO', name: 'Artículo científico' },
    ] as Plan[];
    let conPlanes: PruebasConectorAdmin;

    beforeEach(() => {
      conPlanes = TestBed.runInInjectionContext(() =>
        new PruebasConectorAdmin(error, aviso, trabajando, signal(planes)),
      );
    });

    it('al abrir, «Para quién es» viene escrito con el producto y un grupo', () => {
      conPlanes.abrirFormularioPrueba();
      expect(conPlanes.formPrueba.controls.name.value).toMatch(/^Prueba Método de Tesis · grupo \S+ \d{2}$/);
      expect(conPlanes.formPrueba.valid).toBe(true);
    });

    it('al cambiar de producto cambia el propuesto, pero respeta el escrito a mano', () => {
      conPlanes.abrirFormularioPrueba();
      conPlanes.formPrueba.patchValue({ productCode: 'ARTICULO' });
      conPlanes.sugerirNombre();
      expect(conPlanes.formPrueba.controls.name.value).toMatch(/^Prueba Artículo científico · grupo /);

      conPlanes.formPrueba.patchValue({ name: 'Taller UNMSM', productCode: 'TESIS' });
      conPlanes.sugerirNombre();
      expect(conPlanes.formPrueba.controls.name.value).toBe('Taller UNMSM');

      // «Pedir otro nombre» sí lo cambia.
      conPlanes.sugerirNombre(true);
      expect(conPlanes.formPrueba.controls.name.value).toMatch(/^Prueba Método de Tesis · grupo /);
    });
  });

  it('las consultas al día van de 1 a 15', () => {
    pruebas.abrirFormularioPrueba();
    pruebas.formPrueba.patchValue({ name: 'Taller', productCode: 'TESIS' });
    expect(pruebas.formPrueba.controls.callsPerDay.value).toBe(15);
    for (const fuera of [0, 16, 20]) {
      pruebas.formPrueba.patchValue({ callsPerDay: fuera });
      pruebas.crearPrueba();
    }
    expect(api.crear).not.toHaveBeenCalled();
  });
});
