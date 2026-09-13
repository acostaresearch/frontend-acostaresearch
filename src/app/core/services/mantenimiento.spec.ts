import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { mantenimientoInterceptor } from '../interceptors/mantenimiento.interceptor';
import { MantenimientoService } from './mantenimiento.service';

/**
 * Cuándo sale la pantalla de mantenimiento y cuándo se va.
 *
 * Lo delicado es no sacarla de más: un 503 del pago sin configurar o un
 * formulario mal rellenado no son un corte, y tapar el sitio por eso sería
 * peor que no tener pantalla.
 */
describe('Mantenimiento', () => {
  let http: HttpTestingController;
  let cliente: HttpClient;
  let mantenimiento: MantenimientoService;

  const url = `${environment.apiUrl}/billing/plans`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([mantenimientoInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    cliente = TestBed.inject(HttpClient);
    mantenimiento = TestBed.inject(MantenimientoService);
  });

  /** Lanza una petición a la API y la hace fallar con lo que se le pase. */
  function fallar(status: number, cuerpo: object | null): void {
    cliente.get(url).subscribe({ error: () => undefined });
    http.expectOne(url).flush(cuerpo, { status, statusText: 'x' });
  }

  /** Deja el servicio como estaba: sin pantalla y sin comprobación pendiente. */
  function volver(): void {
    mantenimiento.comprobarAhora();
    http.expectOne(`${environment.apiUrl}/health/bd`).flush({ success: true, data: {} });
  }

  afterEach(() => http.verify());

  it('sale con el 503 de la base caída', () => {
    fallar(503, { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: '' } });
    expect(mantenimiento.activo()).toBe(true);
    volver();
  });

  it('sale cuando el backend no está y contesta el proxy, sin cuerpo de la API', () => {
    fallar(502, null);
    expect(mantenimiento.activo()).toBe(true);
    volver();
  });

  it('no sale con un 503 que es de otra cosa: el resto del sitio funciona', () => {
    fallar(503, { success: false, error: { code: 'PAYMENT_UNAVAILABLE', message: '' } });
    expect(mantenimiento.activo()).toBe(false);
  });

  it('no sale con un error de la petición', () => {
    fallar(400, { success: false, error: { code: 'VALIDATION_ERROR', message: '' } });
    expect(mantenimiento.activo()).toBe(false);
  });

  it('sigue puesta mientras la base no contesta y se quita cuando vuelve', () => {
    fallar(503, { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: '' } });

    mantenimiento.comprobarAhora();
    http
      .expectOne(`${environment.apiUrl}/health/bd`)
      .flush(
        { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: '' } },
        { status: 503, statusText: 'x' },
      );
    expect(mantenimiento.activo()).toBe(true);

    volver();
    expect(mantenimiento.activo()).toBe(false);
  });
});
