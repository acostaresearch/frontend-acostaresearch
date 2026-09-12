/**
 * Contenido de las páginas públicas.
 *
 * Vive fuera de los componentes porque lo comparten varios: el detalle de un
 * capítulo se usa en «El método» y su entregable en la página de precios, y
 * duplicarlo sería garantizar que un día digan cosas distintas.
 *
 * Es texto de venta, no datos: los capítulos publicados los sirve la API
 * (`SkillService.catalogo`), y esto solo añade la descripción larga de los que
 * ya la tienen escrita.
 */

/** Descripción de venta de un capítulo, por encima del resumen del catálogo. */
export interface Detalle {
  descripcion: string;
  entregable: string;
}

/** Demostración grabada. `video` vacío ⇒ se enlaza al canal en vez de incrustar. */
export interface Demo {
  titulo: string;
  descripcion: string;
  video: string;
}

export interface Pregunta {
  pregunta: string;
  respuesta: string;
}

export const CIFRAS = [
  { valor: '+500', pie: 'tesistas ya lo usan' },
  { valor: '19', pie: 'fases entre las dos rutas' },
  { valor: 'APA 7 o IEEE Vancouver', pie: 'formato listo para tu asesor o tu revista' },
  { valor: '0', pie: 'autores inventados' },
];

/*
 * Las credenciales de quien firma, en la misma rejilla que las cifras del
 * inicio.
 *
 * No son números de producto sino hechos verificables sobre una persona, y por
 * eso van en «Quién te acompaña» y no en la portada: ahí el «+500» habla de
 * las Skills, aquí de quien las escribió. El registro Renacyt y la condición
 * de jurado se comprueban en los enlaces que están justo encima, que es lo que
 * las hace valer.
 *
 * Son tres y no cuatro a propósito: la rejilla las reparte por las que haya
 * (ver `.autor-cifras`), así que añadir o quitar una es tocar esta lista y
 * nada más. Una cuarta solo entra si se puede comprobar como las otras tres.
 */
export const CIFRAS_AUTOR = [
  { valor: 'Renacyt II', pie: 'investigador calificado' },
  { valor: 'Jurado y revisor', pie: 'de tesis y artículos' },
  { valor: '+500', pie: 'tesistas con las Skills' },
];

export const DEMOS: Demo[] = [
  {
    titulo: 'Tesis completa desde cero con Claude + Skills',
    descripcion:
      'Empezamos en blanco, como empiezas tú. Verás cómo se elige el tema, cómo va tomando ' +
      'forma el Capítulo I y cómo cada Skill cierra con un Word que puedes llevar a asesoría.',
    video: 'https://www.youtube.com/watch?v=A5UtR27hZw0',
  },
  {
    titulo: 'Análisis estadístico con Claude y Excel',
    descripcion:
      'Si la estadística es lo que más te asusta, este es tu video. Sin programar: subes tu ' +
      'base en Excel y salen los descriptivos, la confiabilidad, la normalidad y tus tablas ' +
      'en APA 7.',
    video: 'https://youtu.be/ACkSfVbB4Rk?si=ExzzhlKRvl0iTS7H',
  },
];

export const RAZONES = [
  {
    titulo: 'Trabaja con tus fuentes',
    texto:
      'El marco teórico se redacta únicamente con los artículos que tú subes de Scopus, ' +
      'SciELO o Google Académico. Aquí no aparecen autores que no existen, y eso te ahorra ' +
      'la peor de las vergüenzas frente al jurado.',
  },
  {
    titulo: 'Un entregable Word por fase',
    texto:
      'Cada Skill cierra con un documento concreto: el Capítulo I, el cuestionario validado, ' +
      'las tablas del análisis. Nada se queda perdido en una conversación de chat que después ' +
      'no encuentras.',
  },
  {
    titulo: 'Tú tomas las decisiones',
    texto:
      'La Skill te pregunta, te explica el porqué metodológico y te pone las opciones sobre ' +
      'la mesa. El diseño, la muestra y la interpretación las eliges tú, y por eso las puedes ' +
      'defender.',
  },
];

export const DESCRIPCIONES: Record<string, Detalle> = {
  'tema-y-delimitacion': {
    descripcion:
      'De «no sé qué investigar» a un título tentativo de máximo 20 palabras, con variables, ' +
      'población, contexto y año definidos. Incluye ejemplos por carrera si recién empiezas.',
    entregable: 'Tabla resumen en Word para tu asesor',
  },
  'problema-y-objetivos': {
    descripcion:
      'Capítulo I completo: planteamiento con las cuatro realidades (internacional, nacional, ' +
      'local e institucional), pregunta general y específicas, objetivos, justificación e ' +
      'hipótesis.',
    entregable: 'Capítulo I en .docx, APA 7',
  },
  'marco-teorico': {
    descripcion:
      'Capítulo II con antecedentes internacionales y nacionales en fichas de lectura, bases ' +
      'teóricas por variable y marco conceptual. Solo con las fuentes reales que tú subes.',
    entregable: 'Capítulo II + lista de referencias',
  },
  metodologia: {
    descripcion:
      'Capítulo III: enfoque, tipo, nivel, diseño, población, muestra y muestreo, técnicas e ' +
      'instrumentos, operacionalización hasta indicadores y aspectos éticos.',
    entregable: 'Capítulo III en .docx, APA 7',
  },
  'instrumento-investigacion': {
    descripcion:
      'Adapta o construye tu cuestionario Likert (o la guía de entrevista si eres cualitativo), ' +
      'arma la V de Aiken para el juicio de expertos, prepara el pilotaje y calcula el alfa de ' +
      'Cronbach.',
    entregable: 'Cuestionario + tablas de validación',
  },
  'recoleccion-datos': {
    descripcion:
      'El kit operativo de campo: carta de presentación a la institución, consentimiento ' +
      'informado, permiso de grabación, matriz Excel para vaciar datos y bitácora. Cumple la ' +
      'Ley 29733.',
    entregable: 'Cartas, consentimientos y matriz de datos',
  },
  'analisis-datos-rstudio': {
    descripcion:
      'Dos vías, tú eliges: RStudio con código R comentado línea por línea, o Excel integrado ' +
      'con Claude si no quieres programar. En ambas: descriptivos, alfa de Cronbach, normalidad ' +
      'y la prueba inferencial que corresponda según el árbol de decisión.',
    entregable: 'Capítulo IV con tablas APA listas',
  },
  discusion: {
    descripcion:
      'Se redacta en prosa continua, objetivo por objetivo, con el mismo ejercicio en cada uno: ' +
      'recordar el objetivo, presentar el hallazgo, contrastarlo con los antecedentes y con la ' +
      'teoría de tu Capítulo II, y cerrar con la implicancia. Las hipótesis rechazadas se ' +
      'tratan con honestidad académica.',
    entregable: 'Capítulo V en prosa continua',
  },
  'conclusiones-abstract': {
    descripcion:
      'Capítulo VI: una conclusión por objetivo, recomendaciones a tres destinatarios (el lugar ' +
      'de estudio con plazos, otros profesionales y futuros investigadores), resumen de 150 a ' +
      '250 palabras y abstract en inglés académico con estructura IMRyD. Las palabras clave se ' +
      'seleccionan del Tesauro de la Unesco.',
    entregable: 'Cierre de tesis, resumen y abstract con palabras clave del Tesauro Unesco',
  },

  // ── Ruta del Artículo Científico ────────────────────────────────────────
  //
  // Otro producto, el mismo mapa: la clave es el código del capítulo, así que
  // conviven sin estorbarse y cada página pide su grupo al catálogo.
  'articulo-fase0-tema-y-orientacion': {
    descripcion:
      'De una inquietud a un tema con destino. Defines área, enfoque y tipo de estudio, y ' +
      'eliges la revista real donde puede salir publicado: se comprueban en la fuente su ' +
      'cuartil, su vigencia y cuánto cobra por publicar, y si es legítima o depredadora.',
    entregable: 'Ficha de Orientación y revista destino verificada',
  },
  'articulo-fase1-matriz-de-estrategia': {
    descripcion:
      'El esqueleto del estudio, antes de escribir una línea: diseño, objetivos, preguntas, ' +
      'hipótesis, cada variable hasta su instrumento y la muestra. El error más caro no es ' +
      'escribir mal, es escribir bien un estudio que no cuadra.',
    entregable: 'Matriz de Estrategia en Excel',
  },
  'articulo-fase2-introduccion': {
    descripcion:
      'La primera fase que escribe artículo, y la que crea el Word que crecerá hasta el envío. ' +
      'Te arma la ecuación de búsqueda lista para pegar en Scopus, Web of Science y Google ' +
      'Académico, y redacta los cinco bloques en el orden que espera un revisor.',
    entregable: 'Introducción, en el documento del artículo',
  },
  'articulo-fase3-revision-literatura': {
    descripcion:
      'Responde las tres preguntas que hará el revisor: qué teorías dan base a tus constructos, ' +
      'qué se sabe de cada uno y por qué es razonable esperar lo que planteas. Comprueba que la ' +
      'dirección de cada estudio citado coincida con la de tu hipótesis.',
    entregable: 'Revisión de la literatura y sustento de hipótesis',
  },
  'articulo-fase4-metodos': {
    descripcion:
      'La sección que permite que otro repita tu estudio: la más leída en revisión y la que más ' +
      'rechazos provoca, no por mal escrita sino por incompleta. La Tabla 1 sociodemográfica se ' +
      'calcula desde tu base de datos, no de memoria.',
    entregable: 'Métodos y Tabla 1 sociodemográfica',
  },
  'articulo-fase5-resultados': {
    descripcion:
      'Convierte las salidas de tu análisis en la sección que las reporta. Reporta, no ' +
      'interpreta: un resultado que ya viene explicado deja a la Discusión sin nada que decir. ' +
      'Cada cifra se traslada desde tu documento de análisis.',
    entregable: 'Resultados con sus tablas y figuras',
  },
  'articulo-fase6-discusion': {
    descripcion:
      'Donde el artículo dice qué significan tus hallazgos. Por cada uno se recuerda el ' +
      'resultado, se contrasta con cuatro o cinco citas y se explica qué implica. Una discusión ' +
      'que repite los resultados con otras palabras es la observación más frecuente del revisor.',
    entregable: 'Discusión en prosa continua',
  },
  'articulo-fase7-conclusiones-abstract': {
    descripcion:
      'Cierra el manuscrito y escribe las dos partes que más gente lee y casi nadie cuida: el ' +
      'título definitivo y el resumen. Un editor decide en esos dos si sigue leyendo. ' +
      'Conclusiones como síntesis integradora, no como una lista por hipótesis.',
    entregable: 'Conclusiones, título, resumen y abstract',
  },
  'articulo-fase8-adaptacion-y-envio': {
    descripcion:
      'El manuscrito está escrito; ahora hay que dejarlo como esa revista exige. De su guía de ' +
      'autores salen estructura, límite de palabras, estilo de cita y anonimización. Es la fase ' +
      'que más rechazos de escritorio evita.',
    entregable: 'Manuscrito adaptado y carta de presentación',
  },
  'articulo-fase9-respuesta-revisores': {
    descripcion:
      'Llega el correo con observaciones y no sabes si tienes que aceptarlas todas. No tienes. ' +
      'Se inventaría cada una con su decisión, se aplican los cambios con control de cambios ' +
      'real y se responde punto por punto, incluidas las que no atendiste y por qué.',
    entregable: 'Manuscrito revisado y carta de respuesta',
  },
  'humanizador-academico': {
    descripcion:
      'Para cuando te dicen que tu texto suena a IA. Primero un informe de diagnóstico con los ' +
      'patrones detectados y la medición estilométrica; después la reescritura. No te pide ' +
      'fuentes ni te llena el texto de citas pendientes: humanizar es restar.',
    entregable: 'Informe de diagnóstico y texto reescrito',
  },
  'bajar-similitud': {
    descripcion:
      'Parte del PDF de Turnitin y del .docx entregado. Separa el porcentaje en lo que es copia ' +
      'real, saturación temática y estructura obligatoria, porque solo la segunda se arregla ' +
      'reescribiendo. Localiza dónde se concentra, reescribe solo lo reescribible sin caer en ' +
      'tics de IA, y verifica que no se haya perdido ninguna cita ni cifra en el proceso.',
    entregable: 'Documento reescrito y reporte de diagnóstico',
  },
};

export const PASOS = [
  {
    titulo: 'Recibes las 11 Skills',
    texto:
      'Te llegan con una guía de instalación en Claude.ai. Toma menos de diez minutos, ' +
      'funciona con el plan gratuito y no necesitas saber nada de tecnología.',
  },
  {
    titulo: 'Entras por tu fase',
    texto:
      'Si aún no tienes tema, empiezas por la Skill 1. Si ya tienes el Capítulo III aprobado, ' +
      'saltas a la 5. La Skill te pregunta y tú respondes con tu realidad: tu carrera, tu ' +
      'población, tu universidad.',
  },
  {
    titulo: 'Sales con el documento',
    texto:
      'Cada fase cierra con un .docx en A4, Times New Roman 12, interlineado 1.5. Lo lees, lo ' +
      'ajustas con tus palabras y lo llevas a asesoría sabiendo qué dice cada párrafo.',
  },
];

export const OBJECIONES = [
  {
    pregunta: '«¿Y esto no es plagio? ¿Lo detecta Turnitin?»',
    respuesta:
      'Es la pregunta que más me hacen, y es sana. Plagio es tomar a otro autor sin citarlo. ' +
      'Aquí cada afirmación se apoya en las fuentes que tú mismo subes, se cita en APA 7 y se ' +
      'parafrasea con estructura propia; el texto se construye con tus datos, tu población y ' +
      'tus resultados, así que no existe en ninguna otra parte. Aun así te pido lo mismo que a ' +
      'mis asesorados: léelo, corrígelo, reescríbelo con tu voz y pásalo por el antiplagio de ' +
      'tu universidad antes de entregar.',
  },
  {
    pregunta: '«Mi asesor no me lo va a aceptar»',
    respuesta:
      'He sido jurado de tesis y sé qué se rechaza: un texto vago, sin sustento o con citas ' +
      'que no existen. Lo que tú vas a llevar a asesoría es un capítulo con la estructura que ' +
      'tu universidad pide (APA 7, matriz de consistencia, operacionalización, validación por ' +
      'jueces). Y como cada decisión metodológica la tomaste tú, cuando tu asesor pregunte por ' +
      'qué ese diseño y esa muestra, vas a tener la respuesta.',
  },
];

/*
 * Qué se lleva quien compra el método.
 *
 * El orden no es el de antes: delante van las tres que deciden la compra —las
 * Skills, la asesoría y los doce meses—, porque son las tres que la tarjeta
 * destaca. La guía y la compatibilidad siguen ahí, detrás, que es el peso que
 * tienen: está bien saberlas, pero nadie compra por ellas.
 */
export const INCLUYE = [
  'Las 11 Skills instalables en tu cuenta de Claude.ai',
  '30 minutos de asesoría personalizada conmigo, para resolver la duda que te tenga trabado',
  'Doce meses de acceso, renovables cuando los necesites',
  'Guía de instalación paso a paso',
  'Compatible con el plan gratuito de Claude',
];

export const FAQ: Pregunta[] = [
  {
    pregunta: '¿Necesito pagar Claude Pro?',
    respuesta:
      'No. Las Skills funcionan con el plan gratuito de Claude.ai. Con el plan de pago tendrás ' +
      'más conversaciones seguidas antes de que te pida esperar, que es cómodo si trabajas ' +
      'varias horas del tirón, pero no es un requisito para nada de lo que aquí se ofrece.',
  },
  {
    pregunta: '¿Sirve para investigación cualitativa?',
    respuesta:
      'Sí. La Skill 5 construye guías de entrevista además de cuestionarios Likert, y la 7 ' +
      'acompaña el análisis por categorías. Donde el método está más desarrollado es en ' +
      'cuantitativo, así que si tu tesis es cualitativa pura tendrás más trabajo propio en el ' +
      'Capítulo IV. Te lo digo antes de que pagues, no después.',
  },
  {
    pregunta: '¿Puedo usarlas si mi tesis ya está avanzada?',
    respuesta:
      'Para eso están pensadas. No hay que empezar por la Skill 1: entras por donde estés. Si ' +
      'ya tienes el Capítulo III aprobado, empiezas por el instrumento; si vienes con los datos ' +
      'recogidos, por el análisis. Cada Skill te pregunta primero qué traes.',
  },
  {
    pregunta: '¿Sirven para mi universidad y mi carrera?',
    respuesta:
      'La estructura es la que piden las universidades peruanas (UCV, UNT, UPAO y similares) y ' +
      'se adapta a otros países ajustando los organismos oficiales que se citan. La carrera no ' +
      'la fija el método: tú aportas el tema, la población y las fuentes. Si tu universidad usa ' +
      'una plantilla propia, el .docx se ajusta sin rehacer el contenido.',
  },
  {
    pregunta: '¿Escriben la tesis por mí?',
    respuesta:
      'No, y no querrías que lo hicieran. Las Skills preguntan, explican el criterio y ordenan ' +
      'lo que tú decides; el tema, el diseño, la muestra y la interpretación salen de tus ' +
      'respuestas. Por eso el día de la sustentación puedes defender cada decisión: porque la ' +
      'tomaste tú.',
  },
];

/* ── Las dos secciones con imagen de «El método» ───────────────────────────
 *
 * Los archivos viven en `public/`, que Angular sirve desde la raíz: una ruta
 * `asesoria/01.jpg` aquí es `https://…/asesoria/01.jpg` en el navegador. No
 * llevan `/` delante a propósito, igual que el retrato de «Quién te acompaña».
 */

/** Foto de una sesión de asesoría. */
export interface Foto {
  src: string;
  alt: string;
}

export const ASESORIA: Foto[] = [
  { src: 'asesoria/01.jpg', alt: 'Benicio Acosta en una sesión de asesoría de tesis' },
  { src: 'asesoria/02.jpg', alt: 'Revisión del capítulo de metodología con una tesista' },
  { src: 'asesoria/03.jpg', alt: 'Sesión de asesoría por videollamada' },
];

/** Libro de metodología en el que se apoya la estructura de las Skills. */
export interface Libro {
  portada: string;
  titulo: string;
  autores: string;
}

export const LIBROS: Libro[] = [
  {
    portada: 'libros/sampieri.jpg',
    titulo: 'Metodología de la Investigación',
    autores: 'Hernández-Sampieri y Mendoza Torres (2018)',
  },
  {
    portada: 'libros/carrasco.jpg',
    titulo: 'Metodología de la Investigación Científica',
    autores: 'Carrasco Díaz (2019)',
  },
  {
    portada: 'libros/sanchez-reyes.jpg',
    titulo: 'Metodología y Diseños de la Investigación Científica',
    autores: 'Sánchez y Reyes (2021)',
  },
];
