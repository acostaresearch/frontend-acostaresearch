import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { AdminService } from '../../core/services/admin.service';
import { PaymentService } from '../../core/services/payment.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { LicenciaAdmin } from '../../core/models/admin.model';
import { Acceso } from './accesos';
import { AccionesAccesosAdmin } from './acciones-accesos';

const acceso = { id: 'pago', canal: 'yape', licenseId: 'licencia', tieneComprobante: false,
  comprador: 'ana@example.com', productCode: 'TESIS' } as Acceso;
const licencia = { id: 'licencia', variasTesis: false, createdAt: '2026-01-01T00:00:00Z',
  expiresAt: '2026-01-31T00:00:00Z', user: { email: 'ana@example.com' } } as LicenciaAdmin;

describe('Acciones de accesos del administrador', () => {
  let acciones: AccionesAccesosAdmin;
  let api: { licenciaDe: ReturnType<typeof vi.fn>; cambiarDuracion: ReturnType<typeof vi.fn>;
    cambiarCorreo: ReturnType<typeof vi.fn>; reactivar: ReturnType<typeof vi.fn> };
  let confirmar: ReturnType<typeof vi.fn>;
  let recargar: () => void;

  beforeEach(() => {
    api = { licenciaDe: vi.fn(() => of(licencia)), cambiarDuracion: vi.fn(),
      cambiarCorreo: vi.fn(() => of({ email: 'nuevo@example.com', mensaje: 'Actualizado' })),
      reactivar: vi.fn(() => of({ id: 'licencia', status: 'ACTIVE' })) };
    confirmar = vi.fn(async () => true);
    recargar = vi.fn();
    TestBed.configureTestingModule({ providers: [
      { provide: AdminService, useValue: api }, { provide: PaymentService, useValue: {} },
      { provide: DialogoService, useValue: { confirmar } },
    ] });
    acciones = TestBed.runInInjectionContext(() => new AccionesAccesosAdmin(
      signal<string | null>(null), signal<string | null>(null), signal([]), signal([]),
      signal([]), signal([licencia]), () => recargar(), () => {}, () => {}, String,
    ));
  });
  afterEach(() => TestBed.resetTestingModule());

  it('descarta la consulta de una licencia cuando ya se abrió otra ficha', () => {
    const consulta = new Subject<LicenciaAdmin>();
    api.licenciaDe.mockReturnValueOnce(consulta);
    acciones.abrirAcceso(acceso);
    acciones.abrirAcceso({ ...acceso, licenseId: 'otra' });
    consulta.next({ ...licencia, variasTesis: true });
    expect(acciones.variasTesis()).toBe(false);
    expect(acciones.accesoAbierto()?.licenseId).toBe('otra');
  });

  it('valida duración y permite quitar la caducidad con un campo vacío', () => {
    acciones.abrirAcceso(acceso);
    expect(acciones.diasDuracion()).toBe('30');
    expect(acciones.duracionCambia()).toBe(false);
    for (const dias of ['0', '1.5', '3651']) {
      acciones.diasDuracion.set(dias);
      acciones.cambiarDuracionDelAcceso();
    }
    expect(api.cambiarDuracion).not.toHaveBeenCalled();
    api.cambiarDuracion.mockReturnValue(of({ license: { ...licencia, expiresAt: null }, mensaje: 'Sin caducidad' }));
    acciones.diasDuracion.set('');
    acciones.cambiarDuracionDelAcceso();
    expect(api.cambiarDuracion).toHaveBeenCalledWith('licencia', null);
    expect(acciones.vigencia()?.expiresAt).toBeNull();
  });

  it('evita enviar el cambio de correo si se cierra la ficha durante la confirmación', async () => {
    let resolver!: (valor: boolean) => void;
    confirmar.mockReturnValue(new Promise<boolean>(resolve => { resolver = resolve; }));
    acciones.abrirAcceso(acceso);
    acciones.correoNuevo.set('nuevo@example.com');
    const cambio = acciones.cambiarCorreoDelAcceso();
    acciones.cerrarAcceso();
    resolver(true);
    await cambio;
    expect(api.cambiarCorreo).not.toHaveBeenCalled();
  });

  it('normaliza el correo de la cuenta y conserva el destinatario original del código', async () => {
    acciones.abrirAcceso({ ...acceso, canal: 'codigo' });
    acciones.correoNuevo.set(' NUEVO@example.com ');
    await acciones.cambiarCorreoDelAcceso();
    expect(api.cambiarCorreo).toHaveBeenCalledWith('licencia', 'nuevo@example.com');
    expect(acciones.accesoAbierto()?.comprador).toBe('ana@example.com');
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('conserva el comprador al actualizar el estado de una licencia', () => {
    acciones.reactivar(licencia);
    expect(acciones.licencias()[0]).toEqual(expect.objectContaining({
      status: 'ACTIVE', user: licencia.user,
    }));
  });
});
