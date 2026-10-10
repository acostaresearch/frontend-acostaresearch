import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';

import { AprobacionManual, PagoPorRevisar } from '../../core/models/payment.model';
import { PaymentService } from '../../core/services/payment.service';
import { PagosManualesAdmin } from './pagos-manuales';

const pago: PagoPorRevisar = {
  id: 'pago', provider: 'YAPE', providerOrderId: 'orden', status: 'IN_REVIEW',
  amountCents: 2000, discountCents: 0, currency: 'PEN', createdAt: '',
  operationCode: '123', proofMime: 'image/png',
  plan: { code: 'TESIS', productCode: 'TESIS', name: 'Tesis', words: 0, durationDays: 90 },
  user: { id: 'usuario', email: 'ana@example.com', firstName: 'Ana', lastName: 'Pérez' },
};

describe('Revisión de pagos manuales', () => {
  let pagos: PagosManualesAdmin;
  let api: {
    aprobarComprobante: ReturnType<typeof vi.fn>; rechazarComprobante: ReturnType<typeof vi.fn>;
    historialManual: ReturnType<typeof vi.fn>; comprobante: ReturnType<typeof vi.fn>;
  };
  let recargar: () => void;
  let revocar: (url: string) => void;
  const error = signal<string | null>(null);
  const aviso = signal<string | null>(null);

  beforeEach(() => {
    TestBed.resetTestingModule();
    error.set(null);
    aviso.set(null);
    api = {
      aprobarComprobante: vi.fn(), rechazarComprobante: vi.fn(),
      historialManual: vi.fn(() => of([])), comprobante: vi.fn(),
    };
    recargar = vi.fn();
    revocar = vi.fn();
    vi.stubGlobal('URL', class extends URL {
      static override revokeObjectURL(url: string): void { revocar(url); }
    });
    TestBed.configureTestingModule({ providers: [{ provide: PaymentService, useValue: api }] });
    pagos = TestBed.runInInjectionContext(() => new PagosManualesAdmin(error, aviso, () => recargar()));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('aprobar un carrito retira todas sus filas y recarga el panel una sola vez', () => {
    const respuesta = new Subject<AprobacionManual>();
    api.aprobarComprobante.mockReturnValue(respuesta);
    const carrito = { ...pago, carrito: { productos: ['Tesis', 'Artículo'], pagos: ['pago', 'segundo'] } };
    pagos.porRevisar.set([carrito, { ...pago, id: 'segundo' }]);
    pagos.capturas.set({ pago: 'blob:comprobante' });
    pagos.aprobarComprobante(carrito);
    pagos.aprobarComprobante(carrito);
    expect(api.aprobarComprobante).toHaveBeenCalledTimes(1);
    respuesta.next({ alreadyProcessed: false, payment: { id: 'pago', status: 'PAID' } });
    expect(pagos.porRevisar()).toEqual([]);
    expect(pagos.revisando()).toBeNull();
    expect(revocar).toHaveBeenCalledWith('blob:comprobante');
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('un fallo al aprobar conserva el pago y libera el bloqueo', () => {
    const respuesta = new Subject<AprobacionManual>();
    api.aprobarComprobante.mockReturnValue(respuesta);
    pagos.porRevisar.set([pago]);
    pagos.aprobarComprobante(pago);
    respuesta.error(new Error('Sin conexión'));
    expect(pagos.porRevisar()).toEqual([pago]);
    expect(pagos.revisando()).toBeNull();
    expect(error()).not.toBeNull();
    expect(recargar).not.toHaveBeenCalled();
  });

  it('rechazar exige un motivo útil y luego actualiza el historial', () => {
    pagos.porRevisar.set([pago]);
    pagos.motivos.set({ pago: 'No' });
    pagos.rechazarComprobante(pago);
    expect(api.rechazarComprobante).not.toHaveBeenCalled();
    pagos.motivos.set({ pago: '  La operación no coincide  ' });
    api.rechazarComprobante.mockReturnValue(of(null));
    pagos.rechazarComprobante(pago);
    expect(api.rechazarComprobante).toHaveBeenCalledWith('pago', 'La operación no coincide');
    expect(pagos.porRevisar()).toEqual([]);
    expect(api.historialManual).toHaveBeenCalledTimes(1);
    expect(aviso()).toContain('ana@example.com');
  });

  it('reabrir una captura guardada no descarga de nuevo el comprobante', () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    pagos.capturas.set({ pago: 'blob:comprobante' });
    pagos.abrirComprobante('pago');
    expect(api.comprobante).not.toHaveBeenCalled();
    expect(abrir).toHaveBeenCalledWith('blob:comprobante', '_blank', 'noopener');
  });
});
