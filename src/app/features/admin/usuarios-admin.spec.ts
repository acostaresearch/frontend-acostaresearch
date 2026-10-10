import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';

import { AdminCreado, UserService } from '../../core/services/user.service';
import { UsuariosAdmin } from './usuarios-admin';

describe('Usuarios del administrador', () => {
  let cuentas: UsuariosAdmin;
  let api: { list: ReturnType<typeof vi.fn>; crearAdministrador: ReturnType<typeof vi.fn> };
  const error = signal<string | null>(null);

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
    error.set(null);
    api = {
      list: vi.fn(() => of({ users: [], meta: { totalPages: 3, total: 120 } })),
      crearAdministrador: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: UserService, useValue: api }] });
    cuentas = TestBed.runInInjectionContext(() => new UsuariosAdmin(error));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('agrupa las pulsaciones en una sola búsqueda y vuelve a la primera página', () => {
    cuentas.paginaDeUsuarios.set(3);
    cuentas.buscarUsuarios('a');
    vi.advanceTimersByTime(200);
    cuentas.buscarUsuarios('  alumno@example.com  ');
    vi.advanceTimersByTime(299);
    expect(api.list).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.list).toHaveBeenCalledWith({ page: 1, perPage: 50, search: 'alumno@example.com' });
    expect(cuentas.paginaDeUsuarios()).toBe(1);
  });

  it('salir del panel cancela una búsqueda pendiente', () => {
    cuentas.buscarUsuarios('alumno');
    TestBed.resetTestingModule();
    vi.advanceTimersByTime(1000);
    expect(api.list).not.toHaveBeenCalled();
  });

  it('respeta los límites de paginación del servidor', () => {
    cuentas.cargarUsuarios();
    api.list.mockClear();
    cuentas.irAPaginaDeUsuarios(0);
    cuentas.irAPaginaDeUsuarios(4);
    expect(api.list).not.toHaveBeenCalled();
    cuentas.irAPaginaDeUsuarios(2);
    expect(api.list).toHaveBeenCalledWith({ page: 2, perPage: 50, search: undefined });
  });

  it('no crea cuentas si el formulario es inválido', () => {
    cuentas.abrirFormularioAdmin();
    cuentas.crearAdministrador();
    expect(api.crearAdministrador).not.toHaveBeenCalled();
    expect(cuentas.formAdmin.controls.email.touched).toBe(true);
    expect(error()).not.toBeNull();
  });

  it('evita enviar dos altas simultáneas y conserva el resultado hasta cerrar la ventana', () => {
    const alta = new Subject<AdminCreado>();
    api.crearAdministrador.mockReturnValue(alta);
    cuentas.abrirFormularioAdmin();
    cuentas.formAdmin.patchValue({ firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.com' });
    cuentas.crearAdministrador();
    cuentas.crearAdministrador();
    expect(api.crearAdministrador).toHaveBeenCalledTimes(1);
    expect(api.crearAdministrador).toHaveBeenCalledWith({
      firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.com', password: undefined,
    });
    const creado = { password: 'clave-de-prueba', emailSent: false } as AdminCreado;
    alta.next(creado);
    expect(cuentas.creandoAdmin()).toBe(false);
    expect(cuentas.adminCreado()).toBe(creado);
    expect(cuentas.formularioAdminAbierto()).toBe(true);
    expect(api.list).toHaveBeenCalledTimes(1);
    cuentas.cerrarFormularioAdmin();
    expect(cuentas.adminCreado()).toBeNull();
  });

  it('un fallo en el alta permite corregir los datos y volver a intentarlo', () => {
    const alta = new Subject<AdminCreado>();
    api.crearAdministrador.mockReturnValue(alta);
    cuentas.formAdmin.patchValue({ firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.com' });
    cuentas.crearAdministrador();
    alta.error(new Error('Sin conexión'));
    expect(cuentas.creandoAdmin()).toBe(false);
    expect(error()).not.toBeNull();
    api.crearAdministrador.mockReturnValue(new Subject<AdminCreado>());
    cuentas.crearAdministrador();
    expect(api.crearAdministrador).toHaveBeenCalledTimes(2);
  });
});
