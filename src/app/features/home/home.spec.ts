import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { User } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { Home } from './home';

/**
 * La banda de saludo, que es lo único de la portada que decide algo.
 *
 * Lo que se prueba es a quién se le enseña qué: al administrador su panel, al
 * comprador su conector y a quien todavía no ha comprado la invitación. Las
 * tres salían iguales antes, y la de en medio era la única cierta.
 */
describe('Home · banda de saludo', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  const usuario = (role: User['role']): User => ({
    id: 'u1',
    email: 'quien@sea.pe',
    firstName: 'S’teban',
    lastName: 'Dioses',
    role,
    status: 'ACTIVE',
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  /** Monta la portada con la sesión ya puesta, como la deja el arranque. */
  function montar(user: User | null): Home {
    auth.setUser(user);
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    // El catálogo se pide siempre; no es lo que se prueba aquí.
    http
      .expectOne((peticion) => peticion.url.endsWith('/billing/plans'))
      .flush({
        success: true,
        data: { plans: [] },
      });

    return fixture.componentInstance;
  }

  /** La consulta de licencias, que solo se hace para quien no es administrador. */
  function responderLicencias(licenses: unknown[]) {
    http
      .expectOne((peticion) => peticion.url.endsWith('/licenses/mine'))
      .flush({
        success: true,
        data: { licenses, progreso: {} },
      });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  it('no saluda a quien no ha entrado', () => {
    const home = montar(null);
    expect(home.saludo()).toBeNull();
  });

  it('manda al administrador a su panel sin preguntar por licencias', () => {
    const home = montar(usuario('ADMIN'));
    expect(home.saludo()).toBe('admin');
  });

  it('manda a su perfil a quien ya tiene conector', () => {
    const home = montar(usuario('USER'));
    expect(home.saludo()).toBe('cargando');

    responderLicencias([{ id: 'l1' }]);
    expect(home.saludo()).toBe('cliente');
  });

  it('invita a comprar a quien no tiene ninguna licencia', () => {
    const home = montar(usuario('USER'));
    responderLicencias([]);
    expect(home.saludo()).toBe('nuevo');
  });

  it('si la consulta falla no empuja a comprar a quien quizá ya compró', () => {
    const home = montar(usuario('USER'));
    http
      .expectOne((peticion) => peticion.url.endsWith('/licenses/mine'))
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(home.saludo()).toBe('cliente');
  });
});
