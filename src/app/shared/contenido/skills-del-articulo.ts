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
    titulo: '17 normas de citas',
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

// ── La Ruta del Artículo de Revisión ─────────────────────────────────────────
//
// El segundo producto de artículos (`ARTICULOS_REVIEW`). Se parece mucho al
// empírico y comparte los nombres de fase, pero sus skills son otras
// (`revision-fase*`) y no tiene fase 3: el protocolo de la fase 1 hace ese
// trabajo. No mezclar una lista con la otra.

export const SEÑAS_DE_LA_REVISION: Record<string, SeñaDeFase> = {
  'revision-fase0-tema-y-orientacion': { icono: 'diana' },
  'revision-fase1-matriz-de-estrategia': { icono: 'lineas' },
  'revision-fase2-introduccion': { icono: 'documento' },
  'revision-fase4-metodos': { icono: 'formulario' },
  'revision-fase5-resultados': { icono: 'barras' },
  'revision-fase6-discusion': { icono: 'ciclo' },
  'revision-fase7-conclusiones-abstract': { icono: 'check' },
  'revision-fase8-adaptacion-y-envio': { icono: 'avion' },
  'revision-fase9-respuesta-revisores': { icono: 'chat' },
  'humanizador-academico': {
    icono: 'lapiz',
    etiqueta: 'En cualquier momento',
    fuera: true,
  },
};

export const CIFRAS_DE_LA_REVISION = [
  { valor: '9', pie: 'fases en orden' },
  { valor: '3', pie: 'tipos de revisión' },
  { valor: '1', pie: 'de uso libre' },
];

export const GARANTIAS_DE_LA_REVISION = [
  {
    icono: 'buscar',
    titulo: 'Una búsqueda que se puede repetir',
    texto:
      'La ecuación literal de cada base —Scopus, Web of Science, PubMed, SciELO—, con su fecha y ' +
      'sus conteos, lista para el apartado de Métodos. Es lo primero que mira un revisor.',
  },
  {
    icono: 'check',
    titulo: 'Un diagrama PRISMA que cuadra',
    texto:
      'Se dibuja desde tus conteos de identificación, cribado e inclusión, y se niega a hacerlo ' +
      'si los números no suman. Un flujo que no cuadra es un rechazo seguro.',
  },
  {
    icono: 'red',
    titulo: 'Bibliometría sin instalar R',
    texto:
      'bibliometrix corre en el servidor: producción anual, Bradford, Lotka, países, ' +
      'coautoría y palabras clave, con las figuras y su interpretación escrita.',
  },
  {
    icono: 'marcador',
    titulo: 'Zotero y Mendeley integrado',
    texto:
      'Tus estudios incluidos y sus referencias se gestionan solos. Ninguna cita queda ' +
      'huérfana ni aparece un autor que no existe.',
  },
  {
    icono: 'lineas',
    titulo: '17 normas de citas',
    texto:
      'APA, Vancouver, IEEE, AMA, Nature, ACS, Chicago y más. Si la revista te pide otra, se lo ' +
      'dices a Claude y no reescribes una línea.',
  },
  {
    icono: 'formulario',
    titulo: 'Listo para el envío',
    texto:
      'Checklist PRISMA 2020 o PRISMA-ScR, registro del protocolo en PROSPERO u OSF y las ' +
      'ecuaciones como material suplementario: lo que una revista pide a una revisión.',
  },
];

// ── En qué se diferencian los dos productos de artículos ─────────────────────
//
// Lo usan /articulo y /planes. Cada fila compara lo mismo en los dos: si una
// cambia en un producto, se cambia aquí y se ve igual en las dos páginas.

export interface Diferencia {
  aspecto: string;
  empirico: string;
  revision: string;
}

export const DIFERENCIAS_ARTICULOS: Diferencia[] = [
  {
    aspecto: 'Qué publicas',
    empirico: 'Un estudio con datos que tú recoges: encuesta, experimento, entrevistas o registros.',
    revision:
      'Una síntesis de lo ya publicado: revisión sistemática (PRISMA), de alcance (scoping) o ' +
      'bibliométrica.',
  },
  {
    aspecto: 'Qué necesitas',
    empirico: 'Tu base de datos, o un estudio que vas a aplicar.',
    revision: 'Una pregunta y acceso a las bases. No recoges datos: los extraes de los estudios.',
  },
  {
    aspecto: 'Fases',
    empirico: '10 fases, de la idea a la respuesta a revisores, más la variante bibliométrica 3B.',
    revision: '9 fases. No hay fase 3: el protocolo de la fase 1 reemplaza a la revisión de la literatura.',
  },
  {
    aspecto: 'Métodos',
    empirico: 'Diseño, muestra, instrumento y la Tabla 1 sociodemográfica calculada desde tu base.',
    revision:
      'Protocolo reproducible: ecuación por base, cribado, acuerdo entre revisores y riesgo de sesgo.',
  },
  {
    aspecto: 'Resultados',
    empirico: 'Las tablas y figuras de tu análisis estadístico, con R en tu navegador.',
    revision:
      'Diagrama PRISMA, tabla de estudios incluidos o los indicadores bibliométricos de bibliometrix.',
  },
  {
    aspecto: 'Guía que sigue',
    empirico: 'IMRyD y la guía de autores de la revista destino.',
    revision: 'PRISMA 2020 o PRISMA-ScR, con registro del protocolo en PROSPERO u OSF.',
  },
  {
    aspecto: 'Elígelo si…',
    empirico: 'Tienes datos propios o vas a recogerlos.',
    revision: 'Quieres ordenar, sintetizar o mapear lo que ya se investigó sobre un tema.',
  },
];
