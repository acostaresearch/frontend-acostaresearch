import { PasoDelTour } from '../../core/services/tour.service';

/** El nombre con el que se guarda que este recorrido ya se vio. */
export const TOUR_PANEL = 'panel';

/**
 * El recorrido del panel del comprador, en el orden en que se usa.
 *
 * Empieza por la puesta en marcha y acaba en la ayuda, que es el camino que
 * hace quien acaba de comprar: conectar, ver por dónde va, traer sus fuentes y,
 * si algo no sale, escribirnos. Cada paso cabe en dos frases: un recorrido que
 * hay que leer se salta.
 *
 * Las anclas son atributos `data-tour` puestos en el marcado de verdad. No se
 * usan clases: una clase se renombra el día que se retoca el CSS y el recorrido
 * se rompe en silencio, mientras que un `data-tour` solo está ahí para esto.
 */
export const TOUR_DEL_PANEL: PasoDelTour[] = [
  {
    titulo: 'Este es tu panel',
    texto:
      'Un minuto para enseñarte dónde está cada cosa. Puedes saltarlo cuando quieras y volver a ' +
      'verlo desde la tarjeta de ayuda.',
  },
  {
    ancla: '[data-tour="arranque"]',
    titulo: 'Por aquí se empieza',
    texto:
      'Estos pasos se marcan solos cuando ocurren de verdad, no cuando los das por hechos. Al ' +
      'completarlos, el recuadro desaparece.',
  },
  {
    ancla: '[data-tour="acceso"]',
    titulo: 'Tu acceso a Claude',
    texto:
      'Aquí está el acceso de la tesis que estás mirando y lo que llevas consultado hoy. La URL ' +
      'se pega una sola vez en Claude, en Configuración → Conectores.',
  },
  {
    ancla: '[data-tour="avance"]',
    titulo: 'Por dónde va tu tesis',
    texto:
      'Un tramo por fase. Lo va anotando Claude mientras trabajan: no tienes que apuntar nada ni ' +
      'volver a explicarle tu tema en cada conversación.',
  },
  {
    ancla: '[data-tour="retomar"]',
    titulo: 'Sigue donde lo dejaste',
    texto:
      'Este botón abre Claude en la fase que toca. Si prefieres retomar por otra, cámbiala aquí ' +
      'mismo y la respetará.',
  },
  {
    ancla: '[data-tour="herramientas"]',
    titulo: 'Tus herramientas',
    texto:
      'Scopus, Zotero, Mendeley, R, ATLAS.ti y el mapa. Cada pestaña trae fuentes o datos a tu ' +
      'tesis, y Claude los usa sin que tengas que copiar nada.',
  },
  {
    abrir: '[data-tour="pestana-zotero"]',
    ancla: '[data-tour="panel-zotero"]',
    titulo: 'Por ejemplo, tu Zotero',
    texto:
      'Eliges una colección y sus fuentes quedan listas para citar, al día cada noche. Las demás ' +
      'pestañas funcionan igual.',
  },
  {
    ancla: '[data-tour="ayuda"]',
    titulo: 'Si algo se atasca',
    texto:
      'El video, las guías en PDF y nuestro WhatsApp, con una persona al otro lado. Desde aquí ' +
      'también puedes repetir este recorrido.',
  },
];
