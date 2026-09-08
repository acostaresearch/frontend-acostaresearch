/**
 * Los videos de uso del conector, en el orden en que hacen falta.
 *
 * POR QUÉ ESTOS CUATRO Y NO OTROS
 * -------------------------------
 * Salen de mirar qué hacen de verdad los compradores. Con dieciséis licencias
 * repartidas, tres no llegaron a abrir el conector NUNCA, y la mediana de los
 * que sí lo abrieron se quedó en siete llamadas. Con nueve capítulos por
 * delante, siete llamadas no es trabajar: es asomarse.
 *
 * Eso son dos fugas distintas y cada una tiene su video:
 *
 *   · No llegaron a conectarlo   → el 1, y por eso es el más corto y el más
 *                                  literal: pegar una URL, paso a paso.
 *   · Conectaron y no arrancaron → el 2, que es el importante. Quien ve un
 *                                  capítulo entero entiende que esto no es
 *                                  «pídele a Claude que te lo escriba», que es
 *                                  lo que ya hacía y por lo que no le llamaba.
 *
 * El 3 vende lo que nos diferencia y el 4 baja el soporte por WhatsApp.
 *
 * `video` vacío = todavía no está grabado. La tarjeta se ve igual, con su
 * contenido, y en el hueco del reproductor dice que está en camino. Así la
 * página sirve desde el primer día y el enlace del correo de entrega no lleva
 * a una pantalla vacía.
 */
export interface Tutorial {
  titulo: string;
  /** Para que se sepa si hay tiempo de verlo ahora o hay que dejarlo. */
  duracion: string;
  /** Qué problema resuelve. Una frase, en su idioma, no en el nuestro. */
  entrada: string;
  /** Lo que se ve, punto por punto. Es también el guion de la grabación. */
  puntos: string[];
  /** URL de YouTube. Vacía mientras no esté grabado. */
  video: string;
}

export const TUTORIALES: Tutorial[] = [
  {
    titulo: 'Conectarlo a Claude',
    duracion: '5 min',
    entrada:
      'Desde el correo de compra hasta ver «Herramientas cargadas» en tu pantalla. Es lo único ' +
      'que hay que hacer una vez, y no se vuelve a tocar.',
    puntos: [
      'Dónde está tu URL y qué es exactamente lo que se copia.',
      'Claude.ai → Configuración → Conectores → Añadir personalizado.',
      'Cómo saber que quedó bien: el conector aparece y responde.',
      'Funciona con el plan gratuito de Claude. No hace falta pagar nada más.',
      'Si pierdes la URL, generas otra desde tu perfil. La anterior deja de valer.',
      'Es tuya y de nadie más: compartirla puede revocar tu acceso.',
    ],
    video: '',
  },
  {
    titulo: 'Tu primer capítulo, de principio a fin',
    duracion: '12 min',
    entrada:
      'Un capítulo completo y sin cortes, con una tesis real. Si solo vas a ver uno, que sea ' +
      'este: aquí se entiende de qué va el método.',
    puntos: [
      'Cómo se pide el capítulo y qué te pregunta la Skill antes de escribir nada.',
      'Tú respondes con TU realidad: tu carrera, tu población, tu universidad.',
      'Por qué esto no es pedirle a Claude que te escriba el capítulo, y en qué se nota.',
      'La conversación se mantiene: si abres un chat nuevo a media faena, empieza de cero.',
      'El entregable en Word, y qué hacer con él antes de llevarlo a asesoría.',
    ],
    video: '',
  },
  {
    titulo: 'Tus fuentes, y por qué el DOI importa',
    duracion: '8 min',
    entrada:
      'Cómo pedir referencias reales, comprobarlas en un clic, y qué pasa cuando se las pides ' +
      'a una inteligencia artificial sin conector.',
    puntos: [
      'Pedir fuentes sobre tu tema y recibirlas con autor, año, revista y DOI.',
      'Abrir un DOI en doi.org y comprobar que el artículo existe de verdad.',
      'El contraste: la misma pregunta sin conector, y el DOI que no lleva a ninguna parte.',
      'Cómo traer tus propias fuentes cuando ya tienes bibliografía.',
      'Qué hacer cuando no hay nada sobre tu tema: decirlo, no rellenarlo.',
    ],
    video: '',
  },
  {
    titulo: 'El recorrido completo, y qué hacer si algo falla',
    duracion: '8 min',
    entrada:
      'El mapa de los capítulos, cuándo pasar al siguiente, y los tres tropiezos que le pasan ' +
      'a todo el mundo alguna vez.',
    puntos: [
      'Los capítulos en orden, y por cuál entrar si ya tienes parte hecha.',
      'Cuándo un capítulo está cerrado y toca seguir.',
      'Claude no ve las herramientas: abre una conversación nueva.',
      'Te sale una lista de capítulos antigua: lo mismo, conversación nueva.',
      'Se acabó el cupo del día: qué significa y cuándo vuelve.',
    ],
    video: '',
  },
];

/**
 * Los tropiezos, también escritos.
 *
 * Un video no se busca con Ctrl+F. Quien tiene el problema delante a las once
 * de la noche quiere leer la línea que lo arregla, no ver ocho minutos para
 * llegar al minuto seis. Y así la página vale desde hoy, antes de que exista
 * ninguna grabación.
 */
export const TROPIEZOS = [
  {
    problema: 'Claude no ve el conector, o dice que no tiene herramientas.',
    solucion:
      'Abre una conversación nueva. Claude guarda la lista de herramientas de la conversación ' +
      'en la que estás, así que si lo conectaste con el chat ya abierto, ahí no aparece.',
  },
  {
    problema: 'Me salen capítulos que ya no son, o falta uno nuevo.',
    solucion:
      'Lo mismo: conversación nueva. Cuando ampliamos tu acceso o publicamos un capítulo, la ' +
      'conversación en curso sigue con la lista que cargó al empezar.',
  },
  {
    problema: 'Perdí la URL del conector.',
    solucion:
      'Entra a tu perfil y genera una nueva. Solo guardamos su huella, no la URL, así que no ' +
      'podemos volver a enseñarte la anterior. Al generar una, la vieja deja de funcionar: ' +
      'acuérdate de cambiarla también en Claude.',
  },
  {
    problema: 'Me dice que se acabó el cupo.',
    solucion:
      'Cada licencia tiene un tope de consultas al día. Se reinicia a medianoche, hora de ' +
      'Lima. Puedes ver cuánto llevas en tu perfil.',
  },
  {
    problema: 'Me responde en general y no con el método.',
    solucion:
      'Pídeselo por su nombre: «trabaja el capítulo I con el método». Si le hablas sin ' +
      'mencionarlo, Claude contesta por su cuenta y no llama a la Skill.',
  },
];
