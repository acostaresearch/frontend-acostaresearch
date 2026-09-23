/**
 * Lo propio de la Ruta del Artículo Científico en su página.
 *
 * Aquí no se repiten las descripciones: las de cada fase ya están escritas en
 * `DESCRIPCIONES`, se usan tal cual y siguen siendo las mismas dentro de
 * Claude. Lo que vive aquí es cómo se presenta la fase en el listado: su icono
 * y, cuando la tiene, la etiqueta que dice que no es un paso en orden.
 *
 * La clave es el código del capítulo, el mismo que devuelve el catálogo.
 */
export interface SeñaDeFase {
  icono: string;
  /** El chip: solo lo llevan las que no son un paso de la ruta. */
  etiqueta?: string;
  /** Fuera de la ruta: la variante bibliométrica y el Humanizador. */
  fuera?: boolean;
}

export const SEÑAS_DEL_ARTICULO: Record<string, SeñaDeFase> = {
  'articulo-fase0-tema-y-orientacion': { icono: 'diana' },
  'articulo-fase1-matriz-de-estrategia': { icono: 'lineas' },
  'articulo-fase2-introduccion': { icono: 'documento' },
  'articulo-fase3-revision-literatura': { icono: 'libro' },
  'articulo-fase3b-mapeo-bibliometrico': {
    icono: 'red',
    etiqueta: 'En lugar de la fase 3',
    fuera: true,
  },
  'articulo-fase4-metodos': { icono: 'formulario' },
  'articulo-fase5-resultados': { icono: 'barras' },
  'articulo-fase6-discusion': { icono: 'ciclo' },
  'articulo-fase7-conclusiones-abstract': { icono: 'check' },
  'articulo-fase8-adaptacion-y-envio': { icono: 'avion' },
  'articulo-fase9-respuesta-revisores': { icono: 'chat' },
  'humanizador-academico': {
    icono: 'lapiz',
    etiqueta: 'En cualquier momento',
    fuera: true,
  },
};

/** Las tres cifras del encabezado, en su orden. */
export const CIFRAS_DEL_ARTICULO = [
  { valor: '10', pie: 'fases en orden' },
  { valor: '1', pie: 'variante de revisión' },
  { valor: '1', pie: 'de uso libre' },
];

/**
 * Cómo trabaja la ruta. Cada tarjeta es algo que el panel hace hoy por el
 * manuscrito: si una función se retira, se retira su tarjeta.
 */
export const GARANTIAS_DEL_ARTICULO = [
  {
    icono: 'buscar',
    titulo: 'Con tus propias fuentes',
    texto:
      'Scopus integrado, tu export de Web of Science, SciELO o PubMed, tus PDF, y lo que tu agente encuentra ' +
      'en la literatura publicada. Siempre con DOI real: aquí no aparecen autores que no existen.',
  },
  {
    icono: 'marcador',
    titulo: 'Zotero y Mendeley integrado',
    texto:
      'Tus citas y referencias se gestionan solas. Ahorras horas de ' +
      'trabajo, y ninguna cita queda huérfana.',
  },
  {
    icono: 'documento',
    titulo: 'Tu manuscrito, citado',
    texto:
      '¿Ya lo escribiste? Sube tu Word y el sistema pone cada cita y la lista de referencias dentro ' +
      'de tu mismo documento, con fuentes de tu Zotero, Mendeley, Scopus y OpenAlex. Su formato no se toca.',
  },
  {
    icono: 'lineas',
    titulo: '15 normas de citas',
    texto:
      'APA, Vancouver, IEEE, AMA, Nature, ACS, Chicago y más. Si la revista te pide otra, se lo ' +
      'dices a Claude y no reescribes una línea.',
  },
  {
    icono: 'barras',
    titulo: 'Cifras que no se inventan',
    texto:
      'Se trasladan desde tu análisis, nunca se producen. Un tamaño de muestra o una aprobación ' +
      'de comité que no existan te comprometen ante el editor.',
  },
  {
    icono: 'check',
    titulo: 'Un repaso antes de enviar',
    texto:
      'La IA coteja tu manuscrito consigo mismo: objetivos sin conclusión, citas rotas y ' +
      'afirmaciones sin fuente, antes de que los encuentre el revisor.',
  },
];
