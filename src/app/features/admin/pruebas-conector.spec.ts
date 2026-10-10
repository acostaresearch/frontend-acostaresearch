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
      name: 'Taller', productCode: 'TESIS', seats: 30, callsPerDay: 20, accessMinutes: 1440,
    });
    alta.next(enlace);
    expect(trabajando()).toBe(false);
    expect(pruebas.formularioPruebaAbierto()).toBe(false);
    expect(pruebas.pruebaNueva()).toBe(enlace);
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
});
