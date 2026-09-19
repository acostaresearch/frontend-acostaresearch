/**
 * La ficha de cada Skill del método, tal como se lee en «Las 11 Skills».
 *
 * No duplica a `DESCRIPCIONES`, que es el texto largo de venta y lo siguen
 * usando la ruta del artículo y el detalle de cada capítulo. Aquí el texto es
 * corto a propósito: son doce fichas en dos columnas y una descripción de seis
 * líneas convierte la página en un muro. Lo que sí es propio de esta página
 * —el icono, el capítulo que entrega y si está dentro de la ruta o al margen—
 * también vive aquí.
 *
 * La clave es el código del capítulo, el mismo que devuelve el catálogo. Un
 * capítulo que se publique y no tenga ficha no rompe la página: sale con su
 * nombre y su resumen del catálogo (ver el componente).
 */
export interface FichaSkill {
  /** El nombre corto. El del catálogo lleva delante «3 · Capítulo II ·». */
  nombre: string;
  /** El chip: «Capítulo II», «Vía alternativa a la 07», «En cualquier momento». */
  capitulo: string;
  /** Cuál de los doce iconos de la plantilla le toca. */
  icono: string;
  descripcion: string;
  entregable: string;
  /**
   * El video de esta Skill. Vacío mientras no esté grabado: la ficha se ve
   * igual y el enlace «Ver video» sencillamente no aparece, en vez de llevar a
   * una página que no es la suya.
   */
  video: string;
  /**
   * Fuera de la ruta: la vía cualitativa y las dos de uso libre. Van en gris
   * para que se vea de un vistazo que no son pasos que haya que dar en orden.
   */
  fuera?: boolean;
}

export const FICHAS_DEL_METODO: Record<string, FichaSkill> = {
  'tema-y-delimitacion': {
    nombre: 'Tema y delimitación',
    capitulo: '',
    icono: 'diana',
    descripcion:
      'De «no sé qué investigar» a un título tentativo de máximo 20 palabras, con variables, ' +
      'población, contexto y año definidos.',
    entregable: 'Tabla resumen en Word para tu asesor',
    video: '',
  },
  'problema-y-objetivos': {
    nombre: 'Problema y objetivos',
    capitulo: 'Capítulo I',
    icono: 'estrella',
    descripcion:
      'Planteamiento con las cuatro realidades, pregunta general y específicas, objetivos, ' +
      'justificación e hipótesis.',
    entregable: 'Capítulo I, guardado en tu tesis en Word',
    video: '',
  },
  'marco-teorico': {
    nombre: 'Marco teórico',
    capitulo: 'Capítulo II',
    icono: 'libro',
    descripcion:
      'Antecedentes en fichas de lectura, bases teóricas por variable y marco conceptual, con ' +
      'tus fuentes y siempre con DOI real.',
    entregable: 'Capítulo II, con las referencias armadas en tu norma',
    video: '',
  },
  metodologia: {
    nombre: 'Metodología',
    capitulo: 'Capítulo III',
    icono: 'lineas',
    descripcion:
      'Enfoque, tipo, nivel, diseño, población, muestra, técnicas e instrumentos, ' +
      'operacionalización y aspectos éticos.',
    entregable: 'Capítulo III, guardado en tu tesis en Word',
    video: '',
  },
  'instrumento-investigacion': {
    nombre: 'Instrumento de recolección',
    capitulo: '',
    icono: 'formulario',
    descripcion:
      'Cuestionario Likert y guía de entrevista, V de Aiken para el juicio de expertos, ' +
      'pilotaje y alfa de Cronbach.',
    entregable: 'Cuestionario + tablas de validación',
    video: '',
  },
  'recoleccion-datos': {
    nombre: 'Trabajo de campo',
    capitulo: '',
    icono: 'pin',
    descripcion:
      'Carta de presentación, consentimiento informado, permiso de grabación, matriz Excel y ' +
      'bitácora. Cumple la Ley 29733.',
    entregable: 'Cartas, consentimientos y matriz de datos',
    video: '',
  },
  'analisis-datos-rstudio': {
    nombre: 'Resultados',
    capitulo: 'Capítulo IV',
    icono: 'barras',
    descripcion:
      'Claude corre el análisis en R en la conversación, sin instalar nada; o RStudio, SPSS o ' +
      'Claude for Excel. Cada cifra sale del análisis guardado.',
    entregable: 'Capítulo IV con sus tablas y cifras comprobadas',
    video: '',
  },
  'analisis-cualitativo': {
    nombre: 'Análisis cualitativo',
    capitulo: 'Vía alternativa a la 07',
    icono: 'chat',
    descripcion:
      'Para entrevistas o grupos focales: de las transcripciones al capítulo de Resultados, con ' +
      'libro de códigos y citas comprobadas letra por letra.',
    entregable: 'Capítulo IV cualitativo, con su libro de códigos',
    video: '',
    fuera: true,
  },
  discusion: {
    nombre: 'Discusión',
    capitulo: 'Capítulo V',
    icono: 'ciclo',
    descripcion:
      'Prosa continua, objetivo por objetivo: recordar el objetivo, presentar el hallazgo, ' +
      'contrastarlo con los antecedentes y cerrar con la implicancia.',
    entregable: 'Capítulo V en prosa continua',
    video: '',
  },
  'conclusiones-abstract': {
    nombre: 'Conclusiones y resumen',
    capitulo: 'Capítulo VI',
    icono: 'check',
    descripcion:
      'Una conclusión por objetivo, recomendaciones a tres destinatarios, resumen y abstract ' +
      'IMRyD con palabras clave del Tesauro de la Unesco.',
    entregable: 'Cierre de tesis, resumen y abstract',
    video: '',
  },
  'bajar-similitud': {
    nombre: 'Bajar similitud',
    capitulo: 'En cualquier momento',
    icono: 'escudo',
    descripcion:
      'Parte del PDF de Turnitin y del .docx; reescribe solo lo reescribible sin tics de IA y ' +
      'verifica que no se pierda ninguna cita ni cifra.',
    entregable: 'Documento reescrito y reporte de diagnóstico',
    video: '',
    fuera: true,
  },
  'humanizador-academico': {
    nombre: 'Humanizador académico',
    capitulo: 'En cualquier momento',
    icono: 'lapiz',
    descripcion:
      'Informe de diagnóstico con los patrones detectados y la medición estilométrica; después ' +
      'la reescritura. Humanizar es restar.',
    entregable: 'Informe de diagnóstico y texto reescrito',
    video: '',
    fuera: true,
  },
};

/** Las tres cifras del encabezado, en su orden. */
export const CIFRAS_DEL_METODO = [
  { valor: '10', pie: 'fases en orden' },
  { valor: '1', pie: 'vía cualitativa' },
  { valor: '2', pie: 'de uso libre' },
];

/** Lo que trae el panel, fuera de la conversación. */
export const PANEL_DEL_METODO = [
  {
    icono: 'pulso',
    titulo: 'Por dónde vas',
    texto:
      'Claude anota lo que vas decidiendo y tu panel te muestra qué fases están terminadas. En ' +
      'una conversación nueva no tienes que volver a explicarle tu tema.',
  },
  {
    icono: 'archivo',
    titulo: 'Tus fuentes y tu Zotero',
    texto:
      'Sube tu export de Scopus, Web of Science, SciELO o PubMed, o tus PDF. Si usas Zotero, ' +
      'conéctalo y tus referencias se mantienen al día solas.',
  },
  {
    icono: 'barras',
    titulo: 'Analiza tus datos en R',
    texto:
      'Claude corre el análisis en R contigo, en la misma conversación y sin instalar nada. Te ' +
      'entrega el informe en Word, y las cifras del Capítulo IV salen de ahí.',
  },
  {
    icono: 'documento',
    titulo: 'Tu tesis en un solo Word',
    texto:
      'Portada, índice y todos tus capítulos, en la norma de citas que te pidan entre quince. Y ' +
      'en BibTeX, si escribes en LaTeX.',
  },
];
