import { PasoDelTour } from '../../core/services/tour.service';
import { desdeAqui, recorridoDeLaWeb } from './tour-de-la-web';
import { TOUR_DEL_PANEL } from './tour-del-panel';

/**
 * El recorrido pedido desde una página empieza ahí y sigue por todo lo que
 * falta, sin volver nunca a la portada a empezar (pedido del 8-oct).
 */
describe('Recorrido desde donde se está', () => {
  const paso = (seccion: string, ruta: string, parte?: string): PasoDelTour => ({
    seccion,
    ruta,
    parte,
    titulo: `${ruta} ${parte ?? ''}`,
    texto: '.',
  });

  const todos = [
    paso('Bienvenida', '/'),
    paso('La portada', '/'),
    paso('Tesis', '/metodo'),
    paso('Preguntas', '/preguntas'),
    paso('Tu panel', '/perfil', 'ayuda'),
    paso('Tu panel', '/perfil', 'avance'),
    paso('Tu panel', '/perfil', 'compras'),
    paso('Para terminar', '/'),
  ];

  const titulos = (lista: PasoDelTour[]) => lista.map((p) => p.titulo.trim());

  it('empieza por la página de ahora y sigue HACIA DELANTE, sin volver a lo de antes', () => {
    const lista = desdeAqui(todos, (p) => p.ruta === '/preguntas');
    expect(titulos(lista)).toEqual([
      '/preguntas',
      '/perfil ayuda',
      '/perfil avance',
      '/perfil compras',
      '/',
    ]);
    // Ni la bienvenida ni una vuelta a empezar.
    expect(lista.filter((p) => p.seccion === 'Bienvenida')).toEqual([]);
  });

  it('en el perfil empieza por la sección que se mira y acaba en la última', () => {
    const lista = desdeAqui(
      todos,
      (p) => p.ruta === '/perfil',
      (p) => p.parte === 'avance',
    );
    expect(titulos(lista)).toEqual(['/perfil avance', '/perfil compras', '/']);
  });

  it('el cierre se enseña donde se esté, sin volver a la portada', () => {
    const lista = desdeAqui(todos, (p) => p.ruta === '/perfil');
    expect(lista.at(-1)?.seccion).toBe('Para terminar');
    expect(lista.at(-1)?.ruta).toBeUndefined();
  });

  it('en una página sin pasos devuelve la lista tal cual', () => {
    expect(desdeAqui(todos, (p) => p.ruta === '/terminos')).toBe(todos);
  });

  it('cada paso del panel dice su página y su sección, salvo la bienvenida', () => {
    for (const p of TOUR_DEL_PANEL) {
      expect(p.ruta).toBe('/perfil');
      if (p.ancla) expect(p.parte).toBeTruthy();
    }
  });

  it('el recorrido de la web lleva todas las secciones del panel', () => {
    const partes = new Set(
      recorridoDeLaWeb({ conSesion: true, esAdmin: false, tieneConector: true })
        .map((p) => p.parte)
        .filter(Boolean),
    );
    for (const seccion of ['ayuda', 'avance', 'herramientas', 'compras', 'invitar', 'grupos']) {
      expect(partes.has(seccion)).toBe(true);
    }
  });
});
