import { PasoDelTour } from '../../core/services/tour.service';

/** El nombre con el que se guarda que este recorrido ya se vio. */
export const TOUR_PORTADA = 'portada';

/**
 * El recorrido de la portada, para cualquiera que llegue al sitio.
 *
 * A diferencia del panel, este no pide cuenta: es la primera pantalla que ve
 * quien no sabe todavía qué se vende aquí, y contarle en un minuto qué hace el
 * método es justo lo que la portada no alcanza a decir sola.
 *
 * El primer paso solo existe para quien ya entró —su banda de saludo no está si
 * no hay sesión— y se cae solo en los demás casos. Así el mismo recorrido sirve
 * para el visitante y para el cliente que vuelve, sin dos listas que mantener.
 */
export const TOUR_DE_LA_PORTADA: PasoDelTour[] = [
  {
    titulo: 'Te enseño el sitio',
    texto: 'Un minuto para saber qué hay aquí y por dónde entrar. Puedes saltarlo cuando quieras.',
  },
  {
    ancla: '[data-tour="saludo"]',
    titulo: 'Lo tuyo, arriba del todo',
    texto:
      'Como ya entraste, lo primero de la página es tu propio atajo: tu conector, tus compras y por ' +
      'dónde va tu tesis, a un clic.',
  },
  {
    ancla: '[data-tour="red"]',
    titulo: 'Así trabaja el método',
    texto:
      'Tú al centro, tus fuentes y los agentes de IA alrededor, y tu tesis saliendo en Word. No es ' +
      'un dibujo: es lo que hace cada herramienta que compras.',
  },
  {
    ancla: '[data-tour="menu"]',
    titulo: 'Todo está aquí arriba',
    texto:
      'Las 11 Skills es el método de la tesis; Artículos, la ruta para publicar; y Míralo en acción, ' +
      'dos demostraciones completas y sin cortes.',
  },
  {
    ancla: '[data-tour="rutas"]',
    titulo: 'Dos rutas, no una',
    texto:
      'Tesis y artículo científico son caminos distintos, con sus propias fases. Cada ficha enseña ' +
      'por dónde pasa la suya y con qué sales.',
  },
  {
    ancla: '[data-tour="arranque-web"]',
    titulo: 'Cómo se empieza',
    texto:
      'Cinco pasos, y el más técnico es pegar una URL en Claude una sola vez. Funciona también con ' +
      'el plan gratuito.',
  },
  {
    ancla: '[data-tour="asistente"]',
    titulo: 'Pregunta lo que sea',
    texto:
      'El asistente te responde aquí mismo sobre precios, normas de cita o qué skill te toca. Y si ' +
      'prefieres una persona, abajo está el WhatsApp.',
  },
  {
    ancla: '[data-tour="comprar"]',
    titulo: 'Cuando lo tengas claro',
    texto:
      'Los paquetes, con lo que trae cada uno y su precio. Sin suscripción: se paga una vez y se ' +
      'instala en tu cuenta de Claude.ai.',
  },
];
