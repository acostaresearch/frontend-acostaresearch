import { MapaDeVosviewer, TipoDeAnalisis, UnidadDeAnalisis } from '../../core/services/mapas.service';

/**
 * Los análisis de VOSviewer, contados para un tesista.
 *
 * Son los mismos del asistente «Create map» del programa de escritorio, en el
 * mismo orden, y cada uno con una frase que dice QUÉ PREGUNTA RESPONDE: es lo
 * que el tesista necesita para elegir, y lo que luego escribe en su tesis.
 */
export interface Analisis {
  valor: TipoDeAnalisis;
  nombre: string;
  /** El nombre en el VOSviewer de escritorio, para quien lo conoce. */
  enVosviewer: string;
  pregunta: string;
  unidades: UnidadDeAnalisis[];
  /** Los métodos de recuento que admite; el primero es el de por defecto. */
  recuentos: ('completo' | 'fraccionado' | 'binario')[];
}

export const ANALISIS: Analisis[] = [
  {
    valor: 'coocurrencia',
    nombre: 'Coocurrencia de palabras clave',
    enVosviewer: 'Co-occurrence',
    pregunta: 'Qué temas se estudian juntos y en qué líneas se reparte el campo.',
    unidades: ['palabras-autor', 'palabras-openalex'],
    recuentos: ['completo', 'fraccionado'],
  },
  {
    valor: 'coautoria',
    nombre: 'Coautoría',
    enVosviewer: 'Co-authorship',
    pregunta: 'Quién publica con quién: las redes de colaboración entre autores, instituciones o países.',
    unidades: ['autores', 'instituciones', 'paises'],
    recuentos: ['completo', 'fraccionado'],
  },
  {
    valor: 'citacion',
    nombre: 'Citación',
    enVosviewer: 'Citation',
    pregunta: 'Quién cita a quién dentro de los artículos analizados, y qué trabajos son los más influyentes.',
    unidades: ['documentos', 'fuentes', 'autores', 'instituciones', 'paises'],
    recuentos: ['completo'],
  },
  {
    valor: 'acoplamiento',
    nombre: 'Acoplamiento bibliográfico',
    enVosviewer: 'Bibliographic coupling',
    pregunta: 'Qué trabajos se parecen porque citan las mismas fuentes: los frentes de investigación actuales.',
    unidades: ['documentos', 'fuentes', 'autores', 'instituciones', 'paises'],
    recuentos: ['completo'],
  },
  {
    valor: 'cocitacion',
    nombre: 'Cocitación',
    enVosviewer: 'Co-citation',
    pregunta: 'Qué obras se citan juntas: la base teórica del campo, sus clásicos.',
    unidades: ['referencias'],
    recuentos: ['completo', 'fraccionado'],
  },
  {
    valor: 'terminos',
    nombre: 'Términos del título y el resumen',
    enVosviewer: 'Text data',
    pregunta: 'Los conceptos más específicos de lo que se escribe, no solo de las palabras clave.',
    unidades: ['titulo-resumen', 'titulo'],
    recuentos: ['binario', 'completo'],
  },
];

/** Cómo se llama cada unidad, en singular y plural, y cómo se escribe su mínimo. */
export const UNIDADES: Record<UnidadDeAnalisis, { nombre: string; plural: string; minimo: string }> = {
  'palabras-autor': {
    nombre: 'Palabras clave de autor',
    plural: 'palabras clave de autor',
    minimo: 'Mínimo de ocurrencias de una palabra',
  },
  'palabras-openalex': {
    nombre: 'Palabras clave de OpenAlex',
    plural: 'palabras clave',
    minimo: 'Mínimo de ocurrencias de una palabra',
  },
  autores: { nombre: 'Autores', plural: 'autores', minimo: 'Mínimo de documentos de un autor' },
  instituciones: {
    nombre: 'Instituciones',
    plural: 'instituciones',
    minimo: 'Mínimo de documentos de una institución',
  },
  paises: { nombre: 'Países', plural: 'países', minimo: 'Mínimo de documentos de un país' },
  fuentes: { nombre: 'Fuentes (revistas)', plural: 'fuentes', minimo: 'Mínimo de documentos de una fuente' },
  documentos: { nombre: 'Documentos', plural: 'documentos', minimo: '' },
  referencias: {
    nombre: 'Referencias citadas',
    plural: 'referencias citadas',
    minimo: 'Mínimo de citas de una referencia',
  },
  'titulo-resumen': {
    nombre: 'Título y resumen',
    plural: 'términos',
    minimo: 'Mínimo de ocurrencias de un término',
  },
  titulo: { nombre: 'Solo el título', plural: 'términos', minimo: 'Mínimo de ocurrencias de un término' },
};

export const NOMBRE_DEL_RECUENTO = {
  completo: 'Completo',
  fraccionado: 'Fraccionado',
  binario: 'Binario',
} as const;

const REFERENCIAS = {
  vosviewer:
    'van Eck, N. J., & Waltman, L. (2010). Software survey: VOSviewer, a computer program for bibliometric mapping. Scientometrics, 84(2), 523–538. https://doi.org/10.1007/s11192-009-0146-3',
  openalex:
    'Priem, J., Piwowar, H., & Orr, R. (2022). OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts. arXiv. https://doi.org/10.48550/arXiv.2205.01833',
  textos:
    'van Eck, N. J., & Waltman, L. (2011). Text mining and visualization using VOSviewer. ISSI Newsletter, 7(3), 50–54. https://doi.org/10.48550/arXiv.1109.2058',
  fraccionado:
    'Perianes-Rodriguez, A., Waltman, L., & van Eck, N. J. (2016). Constructing bibliometric networks: A comparison between full and fractional counting. Journal of Informetrics, 10(4), 1178–1195. https://doi.org/10.1016/j.joi.2016.10.006',
};

const n = (x: number) => x.toLocaleString('es-PE');

/**
 * El párrafo para la metodología, con las cifras de ESTE mapa, y sus
 * referencias.
 *
 * Es lo primero que pide un asesor de un mapa de VOSviewer: de dónde salieron
 * los datos, cuántos documentos, qué análisis, qué recuento, qué umbral y
 * cuántas unidades. Escrito así se pega y se ajusta, y las cifras no se copian
 * a mano. Las referencias son solo las que el párrafo cita.
 */
export function metodoDelMapa(m: MapaDeVosviewer, maxAutores: number | null): { parrafo: string; referencias: string[] } {
  const r = m.resumen;
  const o = m.origen;
  const u = UNIDADES[m.unidad];
  const referencias = [REFERENCIAS.vosviewer];
  const anioActual = new Date().getFullYear();

  let datos: string;
  if (o.tipo === 'openalex') {
    referencias.push(REFERENCIAS.openalex);
    datos =
      `Se recuperaron de OpenAlex (Priem et al., 2022) los ${n(o.analizados)} artículos más citados de los ` +
      `${n(o.total)} que contenían «${o.tema}» en el título o el resumen` +
      (o.desdeAnio || o.hastaAnio
        ? `, publicados entre ${o.desdeAnio ?? 'el inicio del registro'} y ${o.hastaAnio ?? anioActual}`
        : '') +
      '.';
  } else if (m.detalle.encontradas !== undefined) {
    referencias.push(REFERENCIAS.openalex);
    datos =
      `Se analizaron ${n(m.detalle.encontradas)} de los ${n(o.total)} documentos recuperados de las bases de ` +
      `datos consultadas, cuyos metadatos se completaron en OpenAlex (Priem et al., 2022) a partir del DOI.`;
  } else {
    datos = `Se analizaron ${n(r.documentosConUnidades)} documentos recuperados de las bases de datos consultadas.`;
  }

  const recuento = m.recuento === 'fraccionado' ? 'fraccionado' : m.recuento === 'binario' ? 'binario' : 'completo';
  if (m.recuento === 'fraccionado') referencias.push(REFERENCIAS.fraccionado);
  const conRecuento =
    m.recuento === 'fraccionado' ? ` mediante recuento fraccionado (Perianes-Rodriguez et al., 2016)` : ` mediante recuento ${recuento}`;
  const citas = r.minimoCitas > 0 ? ` y al menos ${n(r.minimoCitas)} citas` : '';
  const cierre =
    ` El mapa final muestra ${n(r.enElMapa)} ${u.plural} y ${n(r.enlaces)} enlaces (fuerza total de enlace de ` +
    `${n(r.fuerzaTotal)}); los clústeres se identificaron con el algoritmo de agrupamiento del propio programa.`;

  let analisis: string;
  switch (m.analisis) {
    case 'coocurrencia':
      analisis =
        `Con VOSviewer (van Eck y Waltman, 2010) se construyó un mapa de coocurrencia de ` +
        `${m.unidad === 'palabras-openalex' ? 'las palabras clave que OpenAlex asigna a cada trabajo (con una puntuación de pertinencia de al menos 0,4, excluidas las diecinueve disciplinas generales de su clasificación)' : 'palabras clave de autor'}` +
        `${conRecuento}. De ${n(r.unidadesDistintas)} palabras distintas, ${n(r.cumplenMinimo)} alcanzaron el umbral mínimo de ${r.minimo} ocurrencias.`;
      break;
    case 'coautoria':
      analisis =
        `Con VOSviewer (van Eck y Waltman, 2010) se construyó un mapa de coautoría por ${u.plural}${conRecuento}, ` +
        `excluyendo los documentos con más de ${maxAutores ?? 25} autores. De ${n(r.unidadesDistintas)} ${u.plural}, ` +
        `${n(r.cumplenMinimo)} tenían al menos ${r.minimo} documentos${citas}.`;
      break;
    case 'citacion':
      analisis =
        `Con VOSviewer (van Eck y Waltman, 2010) se realizó un análisis de citación entre ${u.plural}: dos unidades ` +
        `se enlazan cuando un documento de una cita a un documento de la otra dentro del conjunto analizado.` +
        (m.unidad === 'documentos'
          ? citas ? ` Se consideraron los documentos con al menos ${n(r.minimoCitas)} citas.` : ''
          : ` De ${n(r.unidadesDistintas)} ${u.plural}, ${n(r.cumplenMinimo)} tenían al menos ${r.minimo} documentos${citas}.`);
      break;
    case 'acoplamiento':
      analisis =
        `Con VOSviewer (van Eck y Waltman, 2010) se realizó un análisis de acoplamiento bibliográfico de ${u.plural}: ` +
        `la fuerza del enlace entre dos unidades es el número de referencias que comparten sus documentos.` +
        (m.unidad === 'documentos'
          ? citas ? ` Se consideraron los documentos con al menos ${n(r.minimoCitas)} citas.` : ''
          : ` De ${n(r.unidadesDistintas)} ${u.plural}, ${n(r.cumplenMinimo)} tenían al menos ${r.minimo} documentos${citas}.`);
      break;
    case 'cocitacion':
      analisis =
        `Con VOSviewer (van Eck y Waltman, 2010) se realizó un análisis de cocitación de referencias citadas${conRecuento}: ` +
        `dos referencias se enlazan cuando un mismo documento cita ambas. De ${n(m.detalle.referenciasDistintas ?? r.unidadesDistintas)} ` +
        `referencias distintas, se consideraron las citadas al menos ${r.minimo} veces por los documentos analizados.`;
      break;
    case 'terminos': {
      referencias.push(REFERENCIAS.textos);
      const t = m.detalle.terminos;
      analisis =
        `Con VOSviewer (van Eck y Waltman, 2010) se construyó un mapa de coocurrencia de términos extraídos de ` +
        `${m.unidad === 'titulo' ? 'los títulos' : 'los títulos y resúmenes'} mediante la identificación de frases nominales, ` +
        `con recuento ${recuento}. De ${n(t?.distintos ?? r.unidadesDistintas)} términos, ${n(t?.candidatos ?? r.cumplenMinimo)} ` +
        `alcanzaron el mínimo de ${r.minimo} ocurrencias, y de ellos se seleccionó el ${t?.porcentaje ?? 60} % más ` +
        `relevante según su puntuación de relevancia (van Eck y Waltman, 2011).`;
      break;
    }
  }

  return { parrafo: `${datos} ${analisis}${cierre}`, referencias };
}
