import { signal } from '@angular/core';
import { ActivationCode, LicenciaAdmin, PagoAdmin } from '../../core/models/admin.model';
import { ResumenIngresosAdmin } from './resumen-ingresos';

describe('Resumen de ingresos del administrador', () => {
  const pagos = signal<PagoAdmin[]>([]);
  const codigos = signal<ActivationCode[]>([]);
  const licencias = signal<LicenciaAdmin[]>([]);
  let resumen: ResumenIngresosAdmin;
  const fecha = () => new Date(2026, 9, 1, 12).toISOString();
  const pago = (datos: Partial<PagoAdmin>) => ({ status: 'PAID', provider: 'YAPE',
    providerOrderId: 'directo', amountCents: 10000, currency: 'PEN', paidAt: fecha(), ...datos } as PagoAdmin);
  const codigo = (datos: Partial<ActivationCode>) => ({ id: 'codigo', status: 'AVAILABLE',
    paymentMethod: 'WESTERN_UNION', amountCents: 20000, createdAt: fecha(), ...datos } as ActivationCode);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 1, 12));
    pagos.set([]); codigos.set([]); licencias.set([]);
    resumen = new ResumenIngresosAdmin(pagos, codigos, licencias);
  });
  afterEach(() => vi.useRealTimers());

  it('convierte dólares y evita contar dos veces el canje de un código', () => {
    codigos.set([codigo({})]);
    pagos.set([pago({}), pago({ provider: 'PAYPAL', providerOrderId: 'paypal',
      currency: 'USD', amountCents: 1000 }), pago({ providerOrderId: 'codigo', amountCents: 20000 })]);
    expect(resumen.mesEnCurso().valor).toBe(33750);
    expect(resumen.semanaEnCurso().valor).toBe(33750);
    expect(resumen.ingresosPorMedio().reduce((total, canal) => total + canal.valor, 0)).toBe(33750);
  });

  it('excluye pagos fallidos, códigos anulados, cortesías y códigos sin cobro', () => {
    pagos.set([pago({ status: 'FAILED' }), pago({ status: 'CANCELLED' })]);
    codigos.set([codigo({ status: 'VOID' }), codigo({ id: 'cortesia', paymentMethod: 'CORTESIA' }),
      codigo({ id: 'gratis', amountCents: 0 }), codigo({ id: 'sin-medio', paymentMethod: null })]);
    expect(resumen.ingresosPorMes().total).toBe(0);
    expect(resumen.ingresosPorMedio().map(canal => canal.valor)).toEqual([0, 0, 0]);
  });

  it('cuenta una venta manual en su fecha de creación aunque se canjee después', () => {
    codigos.set([codigo({ createdAt: new Date(2026, 8, 30, 12).toISOString() })]);
    pagos.set([pago({ providerOrderId: 'codigo', paidAt: fecha(), amountCents: 20000 })]);
    expect(resumen.mesEnCurso().valor).toBe(0);
    expect(resumen.mesEnCurso().anterior).toBe(20000);
    expect(resumen.semanaEnCurso().valor).toBe(20000);
    expect(resumen.semanaCruzaMes()).toBe('del 28 al 30 de setiembre');
  });

  it('muestra los tres canales con cero y actualiza al llegar datos nuevos', () => {
    expect(resumen.ingresosPorMedio()).toHaveLength(3);
    expect(resumen.mesEnCurso().valor).toBe(0);
    pagos.set([pago({ amountCents: 2500 })]);
    expect(resumen.mesEnCurso().valor).toBe(2500);
    expect(resumen.mesesConCobros()).toBe(1);
  });

  it('cuenta solo licencias activas con vencimiento dentro de las próximas semanas', () => {
    licencias.set([
      { status: 'ACTIVE', expiresAt: fecha() },
      { status: 'REVOKED', expiresAt: fecha() },
      { status: 'ACTIVE', expiresAt: null },
      { status: 'ACTIVE', expiresAt: new Date(2027, 0, 1).toISOString() },
    ] as LicenciaAdmin[]);
    expect(resumen.vencimientos().total).toBe(1);
  });

  it('mantiene la pista únicamente en el gráfico señalado', () => {
    resumen.mostrarPista({ detalle: 'Octubre: S/ 100', centro: 50 }, 'ingresos');
    expect(resumen.pistaDe('ingresos')).toEqual(expect.objectContaining({ centro: 50 }));
    expect(resumen.pistaDe('vencimientos')).toBeNull();
    resumen.ocultarPista();
    expect(resumen.pistaDe('ingresos')).toBeNull();
  });
});
