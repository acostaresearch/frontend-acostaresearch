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
 * VA POR TANDAS. Los pasos seguidos que comparten `seccion` son una tanda, y el
 * contador del globo cuenta DENTRO de ella: «2 de 5 · Las 11 Skills» y no «9 de
 * 39». Un contador corrido hasta cuarenta no informa, desanima; por tandas se
 * ve que cada página se despacha en cuatro o cinco pasos.
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
    // ── La portada ─────────────────────────────────────────────────────────
    {
      seccion: 'Bienvenida',
      ruta: '/',
      titulo: 'Te enseño el sitio entero',
      texto:
        'Vamos página por página: qué hay, dónde está y para qué sirve. Puedes salir cuando ' +
        'quieras con la X de arriba.',
    },
    ...(quien.conSesion
      ? [
          {
            seccion: 'La portada',
            ruta: '/',
            ancla: '[data-tour="saludo"]',
            titulo: 'Lo tuyo, arriba del todo',
            texto:
              'Como ya entraste, lo primero de la página es tu propio atajo, sin buscarlo en el menú.',
          },
        ]
      : []),
    {
      seccion: 'La portada',
      ruta: '/',
      ancla: '[data-tour="red"]',
      titulo: 'Así trabaja el método',
      texto:
        'Tú al centro, tus fuentes y los agentes de IA alrededor, y tu tesis saliendo en Word. No ' +
        'es un dibujo: es lo que hace cada herramienta.',
    },
    {
      seccion: 'La portada',
      ruta: '/',
      ancla: '[data-tour="menu"]',
      titulo: 'Todo está aquí arriba',
      texto: 'Estas cinco entradas son el sitio entero. Ahora las vemos una por una.',
    },
    {
      seccion: 'La portada',
      ruta: '/',
      ancla: '[data-tour="rutas"]',
      titulo: 'Dos rutas, no una',
      texto:
        'Tesis y artículo científico son caminos distintos, con sus propias fases. Cada ficha ' +
        'enseña por dónde pasa la suya y con qué sales.',
    },
    {
      seccion: 'La portada',
      ruta: '/',
      ancla: '[data-tour="arranque-web"]',
      titulo: 'Cómo se empieza',
      texto:
        'Cinco pasos, y el más técnico es pegar una URL en Claude una sola vez. Funciona también ' +
        'con el plan gratuito.',
    },

    // ── Las 11 Skills ──────────────────────────────────────────────────────
    {
      seccion: 'Las 11 Skills',
      ruta: '/metodo',
      ancla: '[data-tour="metodo-cifras"]',
      titulo: 'La ruta de la tesis, en cifras',
      texto:
        'Once skills, diez fases en orden, una vía cualitativa aparte y dos que se usan en ' +
        'cualquier momento. Esto es lo que compras.',
    },
    {
      seccion: 'Las 11 Skills',
      ruta: '/metodo',
      ancla: '[data-tour="metodo-skills"]',
      titulo: 'Una skill por fase, en orden',
      texto:
        'De «no sé qué investigar» al abstract. Cada ficha dice qué te pide, qué te devuelve y en ' +
        'qué capítulo de tu Word queda.',
    },
    {
      seccion: 'Las 11 Skills',
      ruta: '/metodo',
      ancla: '[data-tour="metodo-panel"]',
      titulo: 'Y lo que viene además',
      texto:
        'Las skills son el método; esto es lo que traen de propina: tus fuentes, tu Zotero, tu ' +
        'análisis en R y tu documento en Word.',
    },
    {
      seccion: 'Las 11 Skills',
      ruta: '/metodo',
      ancla: '[data-tour="metodo-libros"]',
      titulo: 'De dónde sale el método',
      texto:
        'No está improvisado: detrás hay libros publicados y el criterio metodológico con el que ' +
        'se evalúa una tesis de verdad.',
    },
    {
      seccion: 'Las 11 Skills',
      ruta: '/metodo',
      ancla: '[data-tour="metodo-precio"]',
      titulo: 'Y cuánto cuesta',
      texto: 'El paquete completo, con su precio, al final de la misma página. Sin suscripción.',
    },

    // ── Ruta del artículo ──────────────────────────────────────────────────
    {
      seccion: 'Ruta del artículo',
      ruta: '/articulo',
      ancla: '[data-tour="articulo-cifras"]',
      titulo: 'La otra ruta, para publicar',
      texto:
        'Si lo tuyo no es sustentar sino publicar en una revista indexada, esta es tu ruta y ' +
        'estas sus cifras.',
    },
    {
      seccion: 'Ruta del artículo',
      ruta: '/articulo',
      ancla: '[data-tour="articulo-fases"]',
      titulo: 'Doce fases hasta el envío',
      texto:
        'De la idea al manuscrito enviado, con la carta de presentación y la respuesta a los ' +
        'revisores incluidas.',
    },
    {
      seccion: 'Ruta del artículo',
      ruta: '/articulo',
      ancla: '[data-tour="articulo-como"]',
      titulo: 'Escribe contigo, no por ti',
      texto:
        'Cómo trabaja en cada fase: te pregunta, te explica el criterio y ordena lo que tú ' +
        'decides. La firma del artículo sigue siendo tuya.',
    },
    {
      seccion: 'Ruta del artículo',
      ruta: '/articulo',
      ancla: '[data-tour="articulo-precio"]',
      titulo: 'Y su precio',
      texto: 'La ruta completa, al final de la página, con lo que incluye.',
    },

    // ── Míralo en acción ───────────────────────────────────────────────────
    {
      seccion: 'Míralo en acción',
      ruta: '/en-accion',
      ancla: '[data-tour="demos-pasos"]',
      titulo: 'Hoy mismo puedes empezar',
      texto: 'Lo que pasa desde que compras hasta tu primer capítulo, paso a paso.',
    },
    {
      seccion: 'Míralo en acción',
      ruta: '/en-accion',
      ancla: '[data-tour="demos-videos"]',
      titulo: 'Verlo trabajar antes de decidir',
      texto:
        'Demostraciones completas y sin cortes, con el conector funcionando de verdad. Nada está ' +
        'montado.',
    },
    {
      seccion: 'Míralo en acción',
      ruta: '/en-accion',
      ancla: '[data-tour="demos-dudas"]',
      titulo: 'Las dos dudas de siempre',
      texto:
        'Si esto lo detecta el Turnitin y si el jurado lo acepta. Contestadas aquí, sin rodeos.',
    },

    // ── Quién te acompaña ──────────────────────────────────────────────────
    {
      seccion: 'Quién te acompaña',
      ruta: '/quien-soy',
      ancla: '[data-tour="qs-quien"]',
      titulo: 'Quién está detrás',
      texto: 'No es una empresa sin cara: hay una persona que responde y da la suya.',
    },
    {
      seccion: 'Quién te acompaña',
      ruta: '/quien-soy',
      ancla: '[data-tour="qs-enlaces"]',
      titulo: 'Compruébalo tú',
      texto: 'Sus perfiles académicos, para que no haya que creerse nada: se abren y se miran.',
    },
    {
      seccion: 'Quién te acompaña',
      ruta: '/quien-soy',
      ancla: '[data-tour="qs-credenciales"]',
      titulo: 'Las credenciales',
      texto:
        'Investigador Renacyt, docente universitario y jurado de tesis. Quien hizo el método ha ' +
        'estado al otro lado de la mesa.',
    },

    // ── Preguntas ──────────────────────────────────────────────────────────
    {
      seccion: 'Preguntas',
      ruta: '/preguntas',
      ancla: '[data-tour="faq"]',
      titulo: 'Lo que preguntan antes de decidirse',
      texto: 'Precio, normas de cita, universidades, devoluciones. Si tu duda es común, está aquí.',
    },

    // ── Los paquetes ───────────────────────────────────────────────────────
    {
      seccion: 'Los paquetes',
      ruta: '/planes',
      ancla: '[data-tour="planes-lista"]',
      titulo: 'Lo que se vende, y a cuánto',
      texto:
        'Cada tarjeta dice qué te llevas y cuánto cuesta. Se paga una vez: no hay suscripción ni ' +
        'cobros automáticos.',
    },
    {
      seccion: 'Los paquetes',
      ruta: '/planes',
      ancla: '[data-tour="planes-canje"]',
      titulo: 'Si ya pagaste por Yape',
      texto:
        'Aquí se canjea el código que te llega al correo. Es el único sitio donde se hace, y no ' +
        'hay que recorrer los paquetes para encontrarlo.',
    },

    // ── Lo que hace falta DESPUÉS de comprar ───────────────────────────────
    {
      seccion: 'Los videos',
      ruta: '/tutoriales',
      ancla: '[data-tour="videos"]',
      titulo: 'Los videos guía',
      texto:
        'Del correo de compra al primer capítulo, en video. Es la página a la que vuelve quien ' +
        'compró y no sabe seguir.',
    },
    {
      seccion: 'Los videos',
      ruta: '/tutoriales',
      ancla: '#fallas',
      titulo: 'Cuando algo no sale',
      texto:
        'Lo que le pasa a todo el mundo alguna vez, con su arreglo. Míralo aquí antes de pensar ' +
        'que se rompió algo.',
    },
    {
      seccion: 'Guías en PDF',
      ruta: '/guias-de-instalacion',
      ancla: '[data-tour="guias-pdf"]',
      titulo: 'Las guías en PDF',
      texto: 'Lo mismo, paso a paso y con capturas, para tenerlo a mano sin conexión.',
    },

    // ── El panel, solo si hay algo que enseñar en él ───────────────────────
    ...(quien.tieneConector
      ? TOUR_DEL_PANEL.filter((paso) => paso.ancla).map((paso) => ({
          ...paso,
          ruta: '/perfil',
          seccion: 'Tu panel',
        }))
      : []),

    // ── Y el de administración, solo al administrador ──────────────────────
    ...(quien.esAdmin
      ? [
          {
            seccion: 'Administración',
            ruta: '/admin',
            ancla: '[data-tour="admin-menu"]',
            titulo: 'El panel de administración',
            texto:
              'Las ventas, las cuentas, los grupos, los capítulos y los tutoriales. Cada sección ' +
              'es una entrada de esta columna.',
          },
          {
            seccion: 'Administración',
            ruta: '/admin',
            ancla: '[data-tour="admin-cifras"]',
            titulo: 'Cómo va el negocio',
            texto: 'Lo vendido, lo cobrado y lo que está esperando revisión, de un vistazo.',
          },
        ]
      : []),

    // ── El cierre, de vuelta en la portada ─────────────────────────────────
    {
      seccion: 'Para terminar',
      ruta: '/',
      ancla: '[data-tour="asistente"]',
      titulo: 'Y si algo no queda claro',
      texto:
        'El asistente te responde aquí mismo, en cualquier página. Y si prefieres una persona, en ' +
        'el pie está el WhatsApp.',
    },
    {
      seccion: 'Para terminar',
      ruta: '/',
      ancla: '[data-tour="recorrido"]',
      titulo: 'Eso es todo',
      texto: 'Este recorrido vuelve a salir desde aquí, cuando quieras y desde cualquier página.',
    },
  ];
}
