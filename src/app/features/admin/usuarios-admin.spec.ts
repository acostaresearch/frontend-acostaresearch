import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';

import { User } from '../../core/models/user.model';
import { DialogoService } from '../../core/services/dialogo.service';
import { AdminCreado, UserService } from '../../core/services/user.service';
import { UsuariosAdmin } from './usuarios-admin';

describe('Usuarios del administrador', () => {
  let cuentas: UsuariosAdmin;
  let api: {
    list: ReturnType<typeof vi.fn>;
    crearAdministrador: ReturnType<typeof vi.fn>;
    cambiarEstado: ReturnType<typeof vi.fn>;
  };
  let dialogos: { confirmar: ReturnType<typeof vi.fn> };
  const aviso = signal<string | null>(null);
  const error = signal<string | null>(null);

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
    error.set(null);
    api = {
      list: vi.fn(() => of({ users: [], meta: { totalPages: 3, total: 120 } })),
      crearAdministrador: vi.fn(),
      cambiarEstado: vi.fn(),
    };
    dialogos = { confirmar: vi.fn(() => Promise.resolve(true)) };
    aviso.set(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: UserService, useValue: api },
        { provide: DialogoService, useValue: dialogos },
      ],
    });
    cuentas = TestBed.runInInjectionContext(() => new UsuariosAdmin(error, aviso));
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
  it('suspender pide confirmación, cambia la fila y avisa', async () => {
    const ana = { id: 'u1', email: 'ana@example.com', status: 'ACTIVE' } as User;
    cuentas.usuarios.set([ana, { id: 'u2', email: 'luis@example.com', status: 'ACTIVE' } as User]);
    api.cambiarEstado.mockReturnValue(
      of({ user: { ...ana, status: 'SUSPENDED' }, mensaje: 'Cuenta suspendida.' }),
    );

    await cuentas.cambiarEstadoDe(ana);

    expect(dialogos.confirmar).toHaveBeenCalledWith(
      expect.objectContaining({ confirmar: 'Suspender la cuenta' }),
    );
    expect(api.cambiarEstado).toHaveBeenCalledWith('u1', 'SUSPENDED');
    expect(cuentas.usuarios().map((u) => u.status)).toEqual(['SUSPENDED', 'ACTIVE']);
    expect(aviso()).toBe('Cuenta suspendida.');
    expect(cuentas.cambiandoEstado()).toBeNull();
  });

  it('una cuenta suspendida se reactiva, y sin confirmar no se toca nada', async () => {
    const ana = { id: 'u1', email: 'ana@example.com', status: 'SUSPENDED' } as User;
    cuentas.usuarios.set([ana]);

    dialogos.confirmar.mockResolvedValueOnce(false);
    await cuentas.cambiarEstadoDe(ana);
    expect(api.cambiarEstado).not.toHaveBeenCalled();

    api.cambiarEstado.mockReturnValue(of({ user: { ...ana, status: 'ACTIVE' }, mensaje: '' }));
    await cuentas.cambiarEstadoDe(ana);
    expect(api.cambiarEstado).toHaveBeenCalledWith('u1', 'ACTIVE');
    expect(cuentas.usuarios()[0].status).toBe('ACTIVE');
    expect(aviso()).toBe('Cuenta reactivada.');
  });

  it('si el servidor rechaza el cambio, la fila se queda como estaba', async () => {
    const ana = { id: 'u1', email: 'ana@example.com', status: 'ACTIVE' } as User;
    cuentas.usuarios.set([ana]);
    const cambio = new Subject<{ user: User; mensaje: string }>();
    api.cambiarEstado.mockReturnValue(cambio);

    await cuentas.cambiarEstadoDe(ana);
    expect(cuentas.cambiandoEstado()).toBe('u1');
    cambio.error(new Error('No puedes suspender tu propia cuenta.'));

    expect(cuentas.usuarios()[0].status).toBe('ACTIVE');
    expect(error()).not.toBeNull();
    expect(cuentas.cambiandoEstado()).toBeNull();
  });
});
