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

    // Las reseñas destacadas de la banda de «Lo que dicen», por lo mismo.
    responderResenas([]);

    return fixture.componentInstance;
  }

  /** Las reseñas de la portada. Vacías salvo que una prueba diga otra cosa. */
  function responderResenas(resenas: unknown[], total = resenas.length, nota: number | null = null) {
    http
      .expectOne((peticion) => peticion.url.includes('/resenas'))
      .flush({ success: true, data: { resenas, total, nota } });
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

/**
 * La banda de «Lo que dicen».
 *
 * Lo que se prueba son las dos reglas que la hacen creíble: que no se pinte
 * con las manos vacías, y que el «4,8 de 5» no se anuncie con dos reseñas
 * detrás, donde eso no es una media sino una coincidencia.
 */
describe('Home · reseñas de la portada', () => {
  let http: HttpTestingController;

  /** Monta la portada y contesta a las dos consultas que hace siempre. */
  function montarCon(resenas: unknown[], total: number, nota: number | null): Home {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();

    http
      .expectOne((peticion) => peticion.url.endsWith('/billing/plans'))
      .flush({ success: true, data: { plans: [] } });
    http
      .expectOne((peticion) => peticion.url.includes('/resenas'))
      .flush({ success: true, data: { resenas, total, nota } });

    return fixture.componentInstance;
  }

  const resena = (id: string) => ({
    id,
    estrellas: 5,
    comentario: 'Terminé el capítulo IV en una semana.',
    autor: 'anaq***@gmail.com',
    oficio: '',
    createdAt: '2026-09-01T00:00:00.000Z',
    video: false,
    destacada: false,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).setUser(null);
  });

  afterEach(() => http.verify());

  it('sin ninguna aprobada no hay banda que pintar', () => {
    const home = montarCon([], 0, null);
    expect(home.resenas().length).toBe(0);
    expect(home.resumenDeResenas()).toBeNull();
  });

  it('no anuncia una media con dos reseñas detrás', () => {
    const home = montarCon([resena('r1'), resena('r2')], 2, 5);
    expect(home.resenas().length).toBe(2);
    expect(home.resumenDeResenas()).toBeNull();
  });

  it('a partir de cinco sí la anuncia, y es la de todas las aprobadas', () => {
    // Tres en la banda, pero la media sale de las doce aprobadas.
    const home = montarCon([resena('r1'), resena('r2'), resena('r3')], 12, 4.8);
    expect(home.resumenDeResenas()).toEqual({ media: 4.8, total: 12 });
  });

  it('la portada enseña tres como mucho, vengan las que vengan', () => {
    const cinco = ['r1', 'r2', 'r3', 'r4', 'r5'].map(resena);
    const home = montarCon(cinco, 20, 4.9);
    expect(home.resenas().length).toBe(3);
  });

  it('las estrellas se parten en llenas y vacías, y siempre suman cinco', () => {
    const home = montarCon([resena('r1')], 1, 5);
    expect(home.llenas(4) + home.vacias(4)).toBe('★★★★☆');
    // Una nota imposible no pinta seis estrellas ni repite un número negativo.
    expect(home.llenas(9) + home.vacias(9)).toBe('★★★★★');
    expect(home.llenas(-2) + home.vacias(-2)).toBe('☆☆☆☆☆');
  });

  it('la firma junta oficio y fecha, y calla el punto cuando falta el oficio', () => {
    const home = montarCon([resena('r1')], 1, 5);
    // A mediodía UTC: a medianoche, la hora de Lima la echaría al mes anterior.
    const r = { ...resena('r1'), createdAt: '2026-09-15T12:00:00.000Z' };
    // «setiembre», sin p: es como escribe el mes el español de Perú, que es la
    // región con la que se formatea.
    expect(home.pieDeFirma(r)).toBe('setiembre de 2026');
    expect(home.pieDeFirma({ ...r, oficio: 'Tesista de maestría' })).toBe(
      'Tesista de maestría · setiembre de 2026',
    );
  });

  it('el redondel de la firma lleva la inicial del correo tapado', () => {
    const home = montarCon([resena('r1')], 1, 5);
    expect(home.inicial('anaq***@gmail.com')).toBe('A');
    expect(home.inicial('   ')).toBe('·');
  });
});
