import { PasoDelTour } from '../../core/services/tour.service';

/** El nombre con el que se guarda que este recorrido ya se vio. */
export const TOUR_PANEL = 'panel';

/**
 * El recorrido del panel del comprador, en el orden en que se usa.
 *
 * Empieza por el video curso —desde el 8-oct es la primera sección de la
 * barra y la que se abre al entrar— y sigue por la puesta en marcha, que es el
 * camino que hace quien acaba de comprar: ver el video, conectar, ver por dónde
 * va y traer sus fuentes. Cada paso cabe en dos frases: un recorrido que hay
 * que leer se salta.
 *
 * En el perfil cada parte es una sección de la barra lateral, así que cada
 * paso pulsa antes la suya (`abrir: ir-…`). En el panel del administrador esos
 * botones no existen, no se pulsa nada y todo está ya a la vista.
 *
 * Van en el orden de la barra, y cada paso dice su `parte`: el recorrido que
 * se pide desde una sección empieza por ella (ver `RecorridoWeb`). «Invita» y
 * «Mis grupos» solo los ve quien los tiene; a los demás esos pasos se les caen
 * solos porque su ancla no está en la página.
 *
 * Las anclas son atributos `data-tour` puestos en el marcado de verdad. No se
 * usan clases: una clase se renombra el día que se retoca el CSS y el recorrido
 * se rompe en silencio, mientras que un `data-tour` solo está ahí para esto.
 */
export const TOUR_DEL_PANEL: PasoDelTour[] = [
  {
    ruta: '/perfil',
    titulo: 'Este es tu panel',
    texto:
      'Un minuto para enseñarte dónde está cada cosa. Puedes saltarlo cuando quieras y volver a ' +
      'verlo desde la tarjeta de ayuda.',
  },
  {
    ruta: '/perfil',
    parte: 'ayuda',
    abrir: '[data-tour="ir-ayuda"]',
    ancla: '[data-tour="ayuda-video"]',
    titulo: 'Empieza por el video curso',
    texto:
      'Te enseña paso a paso a conectar Claude y usar tus skills: tu primer capítulo, tus ' +
      'fuentes y qué hacer si algo falla.',
  },
  {
    ruta: '/perfil',
    parte: 'ayuda',
    abrir: '[data-tour="ir-ayuda"]',
    ancla: '[data-tour="ayuda-guias"]',
    titulo: 'Las guías en PDF',
    texto:
      'Lo mismo que el video, paso a paso y con capturas. Elige la de tu caso y tenla a mano ' +
      'mientras conectas.',
  },
  {
    ruta: '/perfil',
    parte: 'ayuda',
    abrir: '[data-tour="ir-ayuda"]',
    ancla: '[data-tour="ayuda-recorrido"]',
    titulo: 'Repite este recorrido',
    texto:
      'Si un día no encuentras algo, vuelve a pulsar aquí y te enseño otra vez dónde está cada ' +
      'cosa.',
  },
  {
    ruta: '/perfil',
    parte: 'ayuda',
    abrir: '[data-tour="ir-ayuda"]',
    ancla: '[data-tour="ayuda-whatsapp"]',
    titulo: 'Una persona al otro lado',
    texto:
      'Si el video y la guía no te sacan del apuro, escríbenos por WhatsApp y te ayudamos ' +
      'nosotros.',
  },
  {
    ruta: '/perfil',
    parte: 'ayuda',
    abrir: '[data-tour="ir-ayuda"]',
    ancla: '[data-tour="recordatorios"]',
    titulo: 'Recordatorios por correo',
    texto:
      'Te avisamos si llevas días sin avanzar, si falta el formato de tu universidad o si tu ' +
      'acceso está por terminar. Puedes apagarlos aquí.',
  },
  {
    ruta: '/perfil',
    parte: 'avance',
    abrir: '[data-tour="ir-avance"]',
    ancla: '[data-tour="arranque"]',
    titulo: 'Por aquí se empieza',
    texto:
      'Estos pasos se marcan solos cuando ocurren de verdad, no cuando los das por hechos. Al ' +
      'completarlos, el recuadro desaparece.',
  },
  {
    ruta: '/perfil',
    parte: 'avance',
    abrir: '[data-tour="ir-avance"]',
    ancla: '[data-tour="acceso"]',
    titulo: 'Tu acceso a Claude',
    texto:
      'Aquí está el acceso de la tesis que estás mirando y lo que llevas consultado hoy. La URL ' +
      'se pega una sola vez en Claude, en Configuración → Conectores.',
  },
  {
    ruta: '/perfil',
    parte: 'avance',
    abrir: '[data-tour="ir-avance"]',
    ancla: '[data-tour="avance"]',
    titulo: 'Por dónde va tu tesis',
    texto:
      'Un tramo por fase. Lo va anotando Claude mientras trabajan: no tienes que apuntar nada ni ' +
      'volver a explicarle tu tema en cada conversación.',
  },
  {
    ruta: '/perfil',
    parte: 'avance',
    abrir: '[data-tour="ir-avance"]',
    ancla: '[data-tour="retomar"]',
    titulo: 'Sigue donde lo dejaste',
    texto:
      'Este botón abre Claude en la fase que toca. Si prefieres retomar por otra, cámbiala aquí ' +
      'mismo y la respetará.',
  },
  {
    ruta: '/perfil',
    parte: 'herramientas',
    abrir: '[data-tour="ir-herramientas"]',
    ancla: '[data-tour="herramientas"]',
    titulo: 'Tus herramientas',
    texto:
      'Scopus, Zotero, Mendeley, R, ATLAS.ti y el mapa. Cada pestaña trae fuentes o datos a tu ' +
      'tesis, y Claude los usa sin que tengas que copiar nada.',
  },
  {
    ruta: '/perfil',
    parte: 'herramientas',
    abrir: '[data-tour="pestana-zotero"]',
    ancla: '[data-tour="panel-zotero"]',
    titulo: 'Por ejemplo, tu Zotero',
    texto:
      'Eliges una colección y sus fuentes quedan listas para citar, al día cada noche. Las demás ' +
      'pestañas funcionan igual.',
  },
  {
    ruta: '/perfil',
    parte: 'compras',
    abrir: '[data-tour="ir-compras"]',
    ancla: '[data-tour="compras"]',
    titulo: 'Mis compras',
    texto:
      'Todos tus pagos, del más reciente al más antiguo, con su estado. Los cobrados traen su ' +
      'constancia en PDF para descargar.',
  },
  {
    ruta: '/perfil',
    parte: 'invitar',
    abrir: '[data-tour="ir-invitar"]',
    ancla: '[data-tour="invitar"]',
    titulo: 'Invita y gana días',
    texto:
      'Comparte tu código con un compañero: cuando empieza el método con él, tú ganas días de ' +
      'acceso y él también recibe su regalo.',
  },
  {
    ruta: '/perfil',
    parte: 'grupos',
    abrir: '[data-tour="ir-grupos"]',
    ancla: '[data-tour="grupos"]',
    titulo: 'Tus grupos',
    texto:
      'Reparte el enlace de cada grupo a tus alumnos y mira aquí cómo avanzan, sin ver nunca el ' +
      'texto de su tesis.',
  },
];
