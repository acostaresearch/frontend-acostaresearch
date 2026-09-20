import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Role, User } from '../models/user.model';
import { AuthService } from './auth.service';
import { PasoDelTour, TourService } from './tour.service';

/**
 * El recorrido guiado: a quién se le ofrece, cuántas veces y qué pasos sobreviven.
 */
describe('Tour', () => {
  const usuario = signal<Pick<User, 'id'> | null>({ id: 'u-1' });
  const rol = signal<Role>('USER');

  const PASOS: PasoDelTour[] = [
    { titulo: 'Hola', texto: 'Sin ancla: este siempre está.' },
    { ancla: '[data-tour="existe"]', titulo: 'Esto', texto: 'Está en la pantalla.' },
    { ancla: '[data-tour="no-existe"]', titulo: 'Aquello', texto: 'No está.' },
  ];

  function servicio(): TourService {
    return TestBed.inject(TourService);
  }

  beforeEach(() => {
    localStorage.clear();
    usuario.set({ id: 'u-1' });
    rol.set('USER');

    const ancla = document.createElement('div');
    ancla.dataset['tour'] = 'existe';
    document.body.appendChild(ancla);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { user: usuario, hasRole: (r: Role) => rol() === r },
        },
      ],
    });
  });

  afterEach(() => {
    document.querySelector('[data-tour="existe"]')?.remove();
  });

  it('deja fuera los pasos que señalan algo que no está en la pantalla', () => {
    const tour = servicio();
    tour.empezar('panel', PASOS);

    expect(tour.total()).toBe(2);
    expect(tour.paso()?.titulo).toBe('Hola');
  });

  it('no empieza nada si no sobrevive ningún paso', () => {
    const tour = servicio();
    tour.empezar('panel', [PASOS[2]]);

    expect(tour.activo()).toBe(false);
  });

  it('se ofrece una sola vez: al terminarlo queda visto', () => {
    const tour = servicio();

    tour.ofrecer('panel', PASOS);
    expect(tour.activo()).toBe(true);

    tour.terminar();
    expect(tour.activo()).toBe(false);

    tour.ofrecer('panel', PASOS);
    expect(tour.activo()).toBe(false);
  });

  it('saltarlo cuenta como verlo: no vuelve a salir', () => {
    const tour = servicio();

    tour.ofrecer('panel', PASOS);
    tour.terminar(); // Es lo que hace el botón «Saltar».

    expect(tour.visto('panel')).toBe(true);
  });

  it('a mano se enseña otra vez, aunque ya esté visto', () => {
    const tour = servicio();

    tour.ofrecer('panel', PASOS);
    tour.terminar();

    tour.empezar('panel', PASOS);
    expect(tour.activo()).toBe(true);
  });

  it('lo visto es de cada persona, no del equipo', () => {
    const tour = servicio();

    tour.ofrecer('panel', PASOS);
    tour.terminar();

    usuario.set({ id: 'u-2' });
    expect(tour.visto('panel')).toBe(false);
  });

  it('sin sesión se enseña igual: el visitante es quien más lo necesita', () => {
    usuario.set(null);
    const tour = servicio();

    tour.ofrecer('portada', PASOS);
    expect(tour.activo()).toBe(true);

    tour.terminar();
    tour.ofrecer('portada', PASOS);
    expect(tour.activo()).toBe(false);
  });

  // El interruptor `SIEMPRE_AL_ADMINISTRADOR` está apagado: mientras estuvo
  // encendido, al administrador se le enseñaba en cada entrada para poder
  // revisarlo sin borrar el almacenamiento.
  it('al administrador se le enseña una sola vez, como a todos', () => {
    rol.set('ADMIN');
    const tour = servicio();

    tour.ofrecer('panel', PASOS);
    tour.terminar();

    tour.ofrecer('panel', PASOS);
    expect(tour.activo()).toBe(false);
  });

  it('un recorrido puede dar por vistos otros: el de la web incluye el del panel', () => {
    const tour = servicio();

    tour.empezar('web', PASOS, { tambien: ['panel'] });
    tour.terminar();

    expect(tour.visto('web')).toBe(true);
    expect(tour.visto('panel')).toBe(true);
  });

  it('un paso puede ofrecer otro recorrido: aceptarlo acaba este y arranca aquel', () => {
    const tour = servicio();
    let arrancado = false;

    tour.empezar('pagina', [{ titulo: 'Fin', texto: '.', oferta: { texto: 'Ver el sitio' } }], {
      alAceptar: () => (arrancado = true),
    });

    expect(tour.oferta()?.texto).toBe('Ver el sitio');

    tour.aceptar();
    expect(arrancado).toBe(true);
    expect(tour.activo()).toBe(false);
    expect(tour.visto('pagina')).toBe(true);
  });

  it('el contador va por tandas: vuelve a empezar en cada página', () => {
    const tour = servicio();
    tour.empezar('web', [
      { seccion: 'La portada', titulo: 'Uno', texto: '.' },
      { seccion: 'La portada', titulo: 'Dos', texto: '.' },
      { seccion: 'Las 11 Skills', titulo: 'Tres', texto: '.' },
    ]);

    expect(tour.seccion()).toBe('La portada');
    expect(tour.numeroEnTanda()).toBe(1);
    expect(tour.totalDeTanda()).toBe(2);

    tour.siguiente();
    expect(tour.numeroEnTanda()).toBe(2);

    // Nueva página, contador a cero.
    tour.siguiente();
    expect(tour.seccion()).toBe('Las 11 Skills');
    expect(tour.numeroEnTanda()).toBe(1);
    expect(tour.totalDeTanda()).toBe(1);
  });

  it('un paso de otra página se guarda: desde aquí no se puede saber si está', () => {
    const tour = servicio();
    tour.empezar('web', [
      { ancla: '[data-tour="no-existe"]', titulo: 'De esta página', texto: 'Se cae.' },
      {
        ruta: '/preguntas',
        ancla: '[data-tour="no-existe"]',
        titulo: 'De otra página',
        texto: 'Se queda: ya se verá al llegar.',
      },
    ]);

    expect(tour.total()).toBe(1);
    expect(tour.paso()?.titulo).toBe('De otra página');
  });

  it('un paso que señala algo escondido se cae, salvo si él mismo lo abre', () => {
    const escondido = document.createElement('div');
    escondido.dataset['tour'] = 'oculto';
    escondido.hidden = true;
    document.body.appendChild(escondido);

    const tour = servicio();
    tour.empezar('panel', [
      { ancla: '[data-tour="oculto"]', titulo: 'Se cae', texto: 'Nadie lo ve.' },
      {
        abrir: '[data-tour="existe"]',
        ancla: '[data-tour="oculto"]',
        titulo: 'Se queda',
        texto: 'Lo destapa él mismo.',
      },
    ]);

    expect(tour.total()).toBe(1);
    expect(tour.paso()?.titulo).toBe('Se queda');

    escondido.remove();
  });

  it('el último paso acaba el recorrido', () => {
    const tour = servicio();
    tour.empezar('panel', PASOS);

    tour.siguiente();
    expect(tour.esElUltimo()).toBe(true);

    tour.siguiente();
    expect(tour.activo()).toBe(false);
  });

  it('un paso que se cae sigue en el sentido en que se venía', () => {
    const tour = servicio();
    tour.empezar('panel', PASOS);

    // Hacia delante: del primero al segundo.
    tour.siguiente();
    expect(tour.numero()).toBe(2);

    // Hacia atrás, y si ese se cayera, al anterior; aquí ya no hay anterior,
    // así que se acaba en vez de rebotar contra el primero para siempre.
    tour.anterior();
    expect(tour.numero()).toBe(1);

    tour.saltarPaso();
    expect(tour.activo()).toBe(false);
  });
});
