import { PasoDelTour } from '../../core/services/tour.service';
import { TOUR_DEL_PANEL } from './tour-del-panel';

/** El nombre con el que se guarda que este recorrido ya se vio. */
export const TOUR_WEB = 'web';

/** Lo que hace falta saber de quien mira para armarle su recorrido. */
export interface QuienMira {
  conSesion: boolean;
  esAdmin: boolean;
  /** Si ha comprado alguna vez. Es lo que decide si tiene panel que enseñar. */
  tieneConector: boolean;
}

/**
 * El recorrido de la web entera, página por página.
 *
 * Cruza el sitio de verdad: cada paso vive en su página y el recorrido navega
 * solo hasta ella. Antes eran dos recorridos sueltos —la portada y el panel— y
 * el resto no se enseñaba nunca, que es justo donde está lo que nadie
 * encuentra: las guías en PDF, las preguntas frecuentes, dónde mirar si algo
 * falla.
 *
 * NO ES LA MISMA LISTA PARA TODOS. Se arma con lo que se sabe de quien mira: el
 * panel solo si hay algo que enseñar en él, y el de administración solo al
 * administrador. Un paso que señala algo ausente se cae al empezar, pero eso no
 * vale para los de otra página —desde aquí no se pueden mirar—, así que esos se
 * deciden antes, aquí.
 *
 * Termina donde empezó, en la portada, señalando el botón que lo repite.
 */
export function recorridoDeLaWeb(quien: QuienMira): PasoDelTour[] {
  return [
    {
      ruta: '/',
      titulo: 'Te enseño el sitio entero',
      texto:
        'Vamos a recorrerlo página por página: qué hay, dónde está y para qué sirve. Puedes salir ' +
        'cuando quieras con la X de arriba.',
    },
    ...(quien.conSesion
      ? [
          {
            ruta: '/',
            ancla: '[data-tour="saludo"]',
            titulo: 'Lo tuyo, arriba del todo',
            texto:
              'Como ya entraste, lo primero de la página es tu propio atajo, sin buscarlo en el menú.',
          },
        ]
      : []),
    {
      ruta: '/',
      ancla: '[data-tour="red"]',
      titulo: 'Así trabaja el método',
      texto:
        'Tú al centro, tus fuentes y los agentes de IA alrededor, y tu tesis saliendo en Word. No ' +
        'es un dibujo: es lo que hace cada herramienta.',
    },
    {
      ruta: '/',
      ancla: '[data-tour="menu"]',
      titulo: 'Todo está aquí arriba',
      texto: 'Estas cinco entradas son el sitio entero. Ahora las vemos una por una.',
    },
    {
      ruta: '/',
      ancla: '[data-tour="rutas"]',
      titulo: 'Dos rutas, no una',
      texto:
        'Tesis y artículo científico son caminos distintos, con sus propias fases. Cada ficha ' +
        'enseña por dónde pasa la suya y con qué sales.',
    },
    {
      ruta: '/',
      ancla: '[data-tour="arranque-web"]',
      titulo: 'Cómo se empieza',
      texto:
        'Cinco pasos, y el más técnico es pegar una URL en Claude una sola vez. Funciona también ' +
        'con el plan gratuito.',
    },

    // ── Las páginas del método ─────────────────────────────────────────────
    {
      ruta: '/metodo',
      ancla: '[data-tour="skills"]',
      titulo: 'Las 11 Skills, en orden',
      texto:
        'Esta es la ruta de la tesis: una skill por fase, desde elegir el tema hasta el abstract. ' +
        'Cada una dice qué te pide y qué te devuelve.',
    },
    {
      ruta: '/articulo',
      ancla: '[data-tour="fases-articulo"]',
      titulo: 'Y la ruta del artículo',
      texto:
        'La otra ruta, para publicar en una revista: de la idea al manuscrito enviado, con la ' +
        'respuesta a los revisores incluida.',
    },
    {
      ruta: '/en-accion',
      ancla: '[data-tour="demos"]',
      titulo: 'Míralo trabajar antes de decidir',
      texto: 'Demostraciones completas y sin cortes, con el conector funcionando de verdad.',
    },
    {
      ruta: '/en-accion',
      ancla: '[data-tour="dudas"]',
      titulo: 'Las dos dudas de siempre',
      texto:
        'Si esto lo detecta el Turnitin y si el jurado lo acepta. Están contestadas aquí, sin rodeos.',
    },
    {
      ruta: '/quien-soy',
      ancla: '[data-tour="credenciales"]',
      titulo: 'Quién te acompaña',
      texto:
        'Quién está detrás del método y con qué credenciales: investigador Renacyt, docente ' +
        'universitario y jurado de tesis.',
    },
    {
      ruta: '/preguntas',
      ancla: '[data-tour="faq"]',
      titulo: 'Lo que preguntan antes de decidirse',
      texto: 'Precio, normas, universidades, devoluciones. Si tu duda es común, está aquí.',
    },
    {
      ruta: '/planes',
      ancla: '[data-tour="paquetes"]',
      titulo: 'Los paquetes',
      texto:
        'Lo que trae cada uno y su precio. Sin suscripción: se paga una vez y se instala en tu ' +
        'cuenta de Claude.ai.',
    },

    // ── Lo que hace falta DESPUÉS de comprar ───────────────────────────────
    {
      ruta: '/tutoriales',
      ancla: '[data-tour="videos"]',
      titulo: 'Los videos guía',
      texto:
        'Del correo de compra al primer capítulo, en video. Es la página a la que vuelve quien ' +
        'compró y no sabe seguir.',
    },
    {
      ruta: '/tutoriales',
      ancla: '#fallas',
      titulo: 'Cuando algo no sale',
      texto:
        'Lo que le pasa a todo el mundo alguna vez, con su arreglo. Míralo aquí antes de pensar ' +
        'que se rompió algo.',
    },
    {
      ruta: '/guias-de-instalacion',
      ancla: '[data-tour="guias-pdf"]',
      titulo: 'Las guías en PDF',
      texto: 'Lo mismo, paso a paso y con capturas, para tenerlo a mano sin conexión.',
    },

    // ── El panel, solo si hay algo que enseñar en él ───────────────────────
    ...(quien.tieneConector
      ? TOUR_DEL_PANEL.filter((paso) => paso.ancla).map((paso) => ({ ...paso, ruta: '/perfil' }))
      : []),

    // ── Y el de administración, solo al administrador ──────────────────────
    ...(quien.esAdmin
      ? [
          {
            ruta: '/admin',
            ancla: '[data-tour="admin-menu"]',
            titulo: 'El panel de administración',
            texto:
              'Las ventas, las cuentas, los grupos, los capítulos y los tutoriales. Cada sección ' +
              'es una entrada de esta columna.',
          },
          {
            ruta: '/admin',
            ancla: '[data-tour="admin-cifras"]',
            titulo: 'Cómo va el negocio',
            texto: 'Lo vendido, lo cobrado y lo que está esperando revisión, de un vistazo.',
          },
        ]
      : []),

    // ── El cierre, de vuelta en la portada ─────────────────────────────────
    {
      ancla: '[data-tour="asistente"]',
      titulo: 'Y si algo no queda claro',
      texto:
        'El asistente te responde aquí mismo, en cualquier página. Y si prefieres una persona, en ' +
        'el pie está el WhatsApp.',
    },
    {
      ruta: '/',
      ancla: '[data-tour="recorrido"]',
      titulo: 'Eso es todo',
      texto: 'Este recorrido vuelve a salir desde aquí, cuando quieras y desde cualquier página.',
    },
  ];
}
