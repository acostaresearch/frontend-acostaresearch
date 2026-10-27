import { ActivationCode, PagoAdmin } from '../../core/models/admin.model';
import { unirAccesos } from './accesos';

describe('Órdenes de pasarela en la lista de accesos', () => {
  const base = {
    amountCents: 22000,
    discountCents: 0,
    currency: 'PEN',
    createdAt: '2026-10-27T16:55:00Z',
    plan: { code: 'ART', productCode: 'ART', name: 'Artículos', words: 0, durationDays: 365 },
    user: { id: 'u1', email: 'ana@example.com', firstName: 'Ana', lastName: 'Paz' },
  };
  const pago = (id: string, provider: string, status: string) =>
    ({ ...base, id, providerOrderId: `x_${id}`, provider, status }) as unknown as PagoAdmin;
  const ids = (pagos: PagoAdmin[]) =>
    unirAccesos([] as ActivationCode[], [], [], pagos, new Map()).map((a) => a.id);

  it('una orden de Hotmart sin pagar no sale: se abre con solo mirar la pestaña', () => {
    expect(ids([pago('h1', 'HOTMART', 'PENDING')])).toEqual([]);
  });

  it('pagada por Hotmart sí sale', () => {
    expect(ids([pago('h2', 'HOTMART', 'PAID')])).toEqual(['h2']);
  });

  it('una de Culqi sin pagar sigue saliendo: esa sí es alguien que intentó pagar', () => {
    expect(ids([pago('c1', 'CULQI', 'PENDING')])).toEqual(['c1']);
  });
});
