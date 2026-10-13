import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ActivationCode, PagoAdmin } from '../../core/models/admin.model';
import { Billetera, PagoPorRevisar, PagoRevisado } from '../../core/models/payment.model';
import { PaymentService } from '../../core/services/payment.service';
import { unirAccesos } from './accesos';
import { BilleterasAdmin } from './billeteras';

const deuna: Billetera = {
  id: 'b1',
  nombre: 'Deuna',
  pais: 'EC',
  moneda: 'USD',
  titular: 'Ana Paz',
  numero: '0991234567',
  instrucciones: null,
  active: true,
};

describe('Billeteras de país en el panel', () => {
  let api: {
    billeteras: ReturnType<typeof vi.fn>;
    crearBilletera: ReturnType<typeof vi.fn>;
    cambiarBilletera: ReturnType<typeof vi.fn>;
  };
  let panel: BilleterasAdmin;

  beforeEach(() => {
    TestBed.resetTestingModule();
    api = {
      billeteras: vi.fn(() => of([deuna])),
      crearBilletera: vi.fn(),
      cambiarBilletera: vi.fn(),
    };
    TestBed.configureTestingModule({ providers: [{ provide: PaymentService, useValue: api }] });
    panel = TestBed.runInInjectionContext(() => new BilleterasAdmin());
    panel.ngOnInit();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('carga las que hay al abrirse', () => {
    expect(panel.billeteras()).toEqual([deuna]);
    expect(panel.cargando()).toBe(false);
  });

  it('sin país, titular o número no se crea nada', () => {
    panel.form.patchValue({ nombre: 'Nequi' });
    panel.crear();
    expect(api.crearBilletera).not.toHaveBeenCalled();
  });

  it('crea la billetera con su país y su moneda, y la añade a la lista', () => {
    const nequi = { ...deuna, id: 'b2', nombre: 'Nequi', pais: 'CO' };
    api.crearBilletera.mockReturnValue(of(nequi));
    panel.form.setValue({
      nombre: ' Nequi ',
      pais: 'CO',
      moneda: 'USD',
      titular: 'Luis Rey',
      numero: '3001234567',
      instrucciones: '',
    });

    panel.crear();

    expect(api.crearBilletera).toHaveBeenCalledWith({
      nombre: 'Nequi',
      pais: 'CO',
      moneda: 'USD',
      titular: 'Luis Rey',
      numero: '3001234567',
      instrucciones: undefined,
    });
    expect(panel.billeteras().map((b) => b.nombre)).toEqual(['Deuna', 'Nequi']);
    expect(panel.aviso()).toContain('Colombia');
    expect(panel.abierto()).toBe(false);
  });

  it('apagar manda lo contrario de como estaba y cambia la fila', () => {
    api.cambiarBilletera.mockReturnValue(of({ ...deuna, active: false }));
    panel.encender(deuna);
    expect(api.cambiarBilletera).toHaveBeenCalledWith('b1', { active: false });
    expect(panel.billeteras()[0].active).toBe(false);
    expect(panel.cambiando()).toBeNull();
  });

  it('si el servidor falla, la fila se queda como estaba y se dice', () => {
    api.cambiarBilletera.mockReturnValue(throwError(() => new Error('caído')));
    panel.encender(deuna);
    expect(panel.billeteras()[0].active).toBe(true);
    expect(panel.error()).not.toBeNull();
  });
});

describe('Un pago por billetera en la lista de accesos', () => {
  const base = {
    providerOrderId: 'BW-ABCD1234',
    amountCents: 4900,
    discountCents: 0,
    currency: 'USD',
    createdAt: '2026-10-12T15:00:00Z',
    operationCode: 'AB1234',
    plan: { code: 'TESIS', productCode: 'TESIS', name: 'Método de Tesis', words: 0, durationDays: 90 },
    user: { id: 'u1', email: 'ana@example.com', firstName: 'Ana', lastName: 'Paz' },
  };
  const billetera = { id: 'b1', nombre: 'Deuna', pais: 'EC' };

  it('se llama como la billetera, esté esperando o ya resuelto', () => {
    const pendiente = {
      ...base, id: 'p1', provider: 'BILLETERA', status: 'IN_REVIEW', proofMime: 'image/png', billetera,
    } as unknown as PagoPorRevisar;
    const resuelto = {
      ...base, id: 'p2', provider: 'BILLETERA', status: 'PAID', paidAt: null, reviewedAt: null,
      tieneComprobante: true, billetera,
    } as unknown as PagoRevisado;

    const accesos = unirAccesos([] as ActivationCode[], [pendiente], [resuelto], [] as PagoAdmin[], new Map());

    expect(accesos.map((a) => a.canalNombre)).toEqual(['Deuna', 'Deuna']);
    expect(accesos.every((a) => a.canal === 'yape')).toBe(true);
    expect(accesos.every((a) => a.moneda === 'USD')).toBe(true);
  });

  it('no sale dos veces: el de la lista de cobros se descarta, como un Yape', () => {
    const resuelto = {
      ...base, id: 'p2', provider: 'BILLETERA', status: 'PAID', paidAt: null, reviewedAt: null,
      tieneComprobante: true, billetera,
    } as unknown as PagoRevisado;
    const cobro = { ...base, id: 'p2', provider: 'BILLETERA', status: 'PAID' } as unknown as PagoAdmin;

    const accesos = unirAccesos([] as ActivationCode[], [], [resuelto], [cobro], new Map());

    expect(accesos.length).toBe(1);
  });
});
