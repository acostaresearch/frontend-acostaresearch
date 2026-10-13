import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { CodigoDescuento } from '../../core/models/admin.model';
import { AdminService } from '../../core/services/admin.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { DescuentosAdmin } from './descuentos-admin';

const descuento: CodigoDescuento = {
  id: 'promo', code: 'TALLER', amountCents: 2000, planCode: null, maxUses: 0,
  usedCount: 0, active: true, expiresAt: null, note: null, publico: false, createdAt: '',
};

describe('Descuentos del administrador', () => {
  let promociones: DescuentosAdmin;
  let api: {
    crearDescuento: ReturnType<typeof vi.fn>;
    publicarDescuento: ReturnType<typeof vi.fn>;
    borrarDescuento: ReturnType<typeof vi.fn>;
  };
  let dialogos: { confirmar: ReturnType<typeof vi.fn> };
  const trabajando = signal(false);
  const error = signal<string | null>(null);

  beforeEach(() => {
    TestBed.resetTestingModule();
    trabajando.set(false);
    api = { crearDescuento: vi.fn(), publicarDescuento: vi.fn(), borrarDescuento: vi.fn() };
    error.set(null);
    dialogos = { confirmar: vi.fn(async () => false) };
    TestBed.configureTestingModule({ providers: [
      { provide: AdminService, useValue: api },
      { provide: DialogoService, useValue: dialogos },
    ] });
    promociones = TestBed.runInInjectionContext(() =>
      new DescuentosAdmin(error, trabajando, signal(false)),
    );
  });

  afterEach(() => TestBed.resetTestingModule());

  it('rechaza descuentos menores a diez soles y vigencias mayores a un año', () => {
    promociones.formDescuento.patchValue({ soles: 9 });
    promociones.crearDescuento();
    promociones.formDescuento.patchValue({ soles: 20, expiraEnDias: 366 });
    promociones.crearDescuento();
    expect(api.crearDescuento).not.toHaveBeenCalled();
  });

  it('convierte soles a céntimos y mantiene el bloqueo hasta que se complete el alta', () => {
    const alta = new Subject<CodigoDescuento>();
    api.crearDescuento.mockReturnValue(alta);
    promociones.abrirFormularioDescuento();
    promociones.formDescuento.patchValue({ soles: 12.345, code: ' TALLER ' });
    promociones.crearDescuento();
    promociones.crearDescuento();
    promociones.cerrarFormularioDescuento();
    expect(promociones.formularioDescuentoAbierto()).toBe(true);
    expect(api.crearDescuento).toHaveBeenCalledTimes(1);
    expect(api.crearDescuento).toHaveBeenCalledWith({
      amountCents: 1235, code: 'TALLER', planCode: undefined, maxUses: 0,
      expiraEnDias: undefined, note: undefined,
    });
    alta.next(descuento);
    expect(trabajando()).toBe(false);
    expect(promociones.descuentoNuevo()).toBe(descuento);
    expect(promociones.descuentos()).toEqual([descuento]);
  });

  it('cancelar la publicación evita exponer un código privado; ocultarlo no pide confirmación', async () => {
    await promociones.alternarPublicacion(descuento);
    expect(api.publicarDescuento).not.toHaveBeenCalled();
    expect(dialogos.confirmar).toHaveBeenCalledTimes(1);
    api.publicarDescuento.mockReturnValue(of(descuento));
    promociones.descuentos.set([{ ...descuento, publico: true }]);
    await promociones.alternarPublicacion({ ...descuento, publico: true });
    expect(dialogos.confirmar).toHaveBeenCalledTimes(1);
    expect(api.publicarDescuento).toHaveBeenCalledWith(descuento.id, false);
    expect(promociones.descuentos()[0].publico).toBe(false);
  });

  it('un código marcado activo pero vencido o agotado queda fuera del filtro de activos', () => {
    promociones.descuentos.set([
      descuento,
      { ...descuento, id: 'agotado', maxUses: 1, usedCount: 1 },
      { ...descuento, id: 'vencido', expiresAt: '2000-01-01T00:00:00Z' },
      { ...descuento, id: 'apagado', active: false },
    ]);
    promociones.listaDescuentos.filtrar('activos');
    expect(promociones.listaDescuentos.filtrado().map((d) => d.id)).toEqual(['promo']);
    promociones.listaDescuentos.filtrar('agotados');
    expect(promociones.listaDescuentos.filtrado().map((d) => d.id)).toEqual(['agotado']);
    promociones.listaDescuentos.filtrar('caducados');
    expect(promociones.listaDescuentos.filtrado().map((d) => d.id)).toEqual(['vencido']);
  });

  it('eliminar pregunta antes, y sin confirmación no borra nada', async () => {
    promociones.descuentos.set([descuento]);
    await promociones.eliminarDescuento(descuento);
    expect(dialogos.confirmar).toHaveBeenCalledTimes(1);
    expect(api.borrarDescuento).not.toHaveBeenCalled();
    expect(promociones.descuentos()).toHaveLength(1);
  });

  it('al confirmar lo borra y lo quita de la lista; si ya se usó, lo avisa', async () => {
    const usado = { ...descuento, usedCount: 3 };
    promociones.descuentos.set([usado, { ...descuento, id: 'otro' }]);
    dialogos.confirmar.mockResolvedValue(true);
    api.borrarDescuento.mockReturnValue(of(undefined));

    await promociones.eliminarDescuento(usado);

    expect(dialogos.confirmar.mock.calls[0][0].mensaje).toContain('3 veces');
    expect(api.borrarDescuento).toHaveBeenCalledWith('promo');
    expect(promociones.descuentos().map((d) => d.id)).toEqual(['otro']);
    expect(promociones.borrandoDescuento()).toBeNull();
  });

  it('si el servidor no lo borra, se queda en la lista y se dice', async () => {
    promociones.descuentos.set([descuento]);
    dialogos.confirmar.mockResolvedValue(true);
    api.borrarDescuento.mockReturnValue(throwError(() => new Error('No encontramos ese código.')));

    await promociones.eliminarDescuento(descuento);

    expect(promociones.descuentos()).toHaveLength(1);
    expect(error()).not.toBeNull();
    expect(promociones.borrandoDescuento()).toBeNull();
  });
});
