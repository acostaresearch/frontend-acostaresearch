import { environment } from '../../../environments/environment';
import { esListadoPorPais } from './pais.interceptor';

describe('Filtro por país del panel', () => {
  const api = environment.apiUrl;

  it.each([
    '/licenses',
    '/licenses/codes',
    '/licenses/alerts',
    '/payments/recent',
    '/payments/manual/pending',
    '/payments/manual/history',
    '/billing/discounts',
    '/pruebas',
    '/embudo',
    '/resenas/panel',
    '/reclamos',
  ])('filtra el listado %s', (ruta) => {
    expect(esListadoPorPais('GET', `${api}${ruta}`)).toBe(true);
  });

  it('respeta la consulta que ya trae la petición', () => {
    expect(esListadoPorPais('GET', `${api}/embudo?dias=30`)).toBe(true);
  });

  it('no toca lo del cliente ni lo que no es un listado', () => {
    expect(esListadoPorPais('GET', `${api}/licenses/mine`)).toBe(false);
    expect(esListadoPorPais('GET', `${api}/payments`)).toBe(false);
    expect(esListadoPorPais('GET', `${api}/billing/plans`)).toBe(false);
    expect(esListadoPorPais('GET', `${api}/users`)).toBe(false);
    expect(esListadoPorPais('GET', `${api}/resenas`)).toBe(false);
  });

  it('no toca las escrituras ni lo que va a otro servidor', () => {
    expect(esListadoPorPais('POST', `${api}/licenses/codes`)).toBe(false);
    expect(esListadoPorPais('POST', `${api}/billing/discounts`)).toBe(false);
    expect(esListadoPorPais('GET', 'https://otro.example/licenses')).toBe(false);
  });
});
