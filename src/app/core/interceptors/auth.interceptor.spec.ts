import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

/**
 * Qué pasa cuando el servidor dice que la sesión ya no vale.
 *
 * Suspender una cuenta o cambiarle el rol invalida sus sesiones en el
 * servidor. Lo delicado es no echar a nadie de más: el login devuelve los
 * mismos códigos a quien todavía no ha entrado, y ahí no hay sesión que cerrar.
 */
describe('Sesión invalidada', () => {
  let http: HttpTestingController;
  let cliente: HttpClient;
  let token: string | null;
  let cerradas: number;
  let destinos: unknown[][];

  const url = `${environment.apiUrl}/users/me`;

  beforeEach(() => {
    token = 'abc';
    cerradas = 0;
    destinos = [];

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            accessToken: () => token,
            clearSession: () => {
              cerradas += 1;
            },
          },
        },
        {
          provide: Router,
          useValue: {
            url: '/perfil',
            navigate: (...args: unknown[]) => {
              destinos.push(args);
              return Promise.resolve(true);
            },
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    cliente = TestBed.inject(HttpClient);
  });

  afterEach(() => http.verify());

  /** Lanza una petición a la API y la hace fallar con ese estado y código. */
  function fallar(destino: string, status: number, code: string): void {
    cliente.get(destino).subscribe({ error: () => undefined });
    http.expectOne(destino).flush({ error: { code } }, { status, statusText: 'x' });
  }

  it('un 401 de sesión invalidada cierra la sesión y lleva al login', () => {
    fallar(url, 401, 'INVALID_TOKEN');

    expect(cerradas).toBe(1);
    expect(destinos).toEqual([
      [['/auth/login'], { queryParams: { returnUrl: '/perfil', expirada: '1' } }],
    ]);
  });

  it('una cuenta suspendida con la sesión abierta también sale', () => {
    fallar(url, 403, 'ACCOUNT_SUSPENDED');

    expect(cerradas).toBe(1);
    expect(destinos.length).toBe(1);
  });

  it('sin sesión abierta no se echa a nadie: es el login contestando', () => {
    token = null;
    fallar(`${environment.apiUrl}/auth/google`, 403, 'ACCOUNT_SUSPENDED');

    expect(cerradas).toBe(0);
    expect(destinos).toEqual([]);
  });

  it('un 403 de permisos no es una sesión invalidada', () => {
    fallar(url, 403, 'FORBIDDEN');

    expect(cerradas).toBe(0);
    expect(destinos).toEqual([]);
  });
});
