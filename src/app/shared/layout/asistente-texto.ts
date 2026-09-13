/**
 * Convierte la respuesta del asistente en algo que se pueda pintar.
 *
 * El modelo escribe con un Markdown mínimo —párrafos, viñetas, **negrita** y
 * [enlaces](/ruta)— y aquí se trocea en piezas que la plantilla pinta con
 * elementos de Angular. NUNCA con `innerHTML`: el texto lo escribe una IA a la
 * que cualquiera le puede pedir cosas, y lo que llega así no tiene por qué ser
 * inofensivo.
 */

export type Segmento =
  | { tipo: 'texto' | 'negrita'; texto: string }
  | { tipo: 'enlace'; texto: string; ruta: string; fragmento?: string }
  | { tipo: 'whatsapp'; texto: string };

export interface Bloque {
  tipo: 'parrafo' | 'lista';
  /** Cada línea es un párrafo con saltos o un punto de la lista. */
  lineas: Segmento[][];
}

/**
 * Las páginas a las que puede llevar un enlace del asistente.
 *
 * Es la misma lista que le da el backend al modelo
 * (`backend/src/modules/asistente/asistente.prompt.js`). Un enlace a cualquier
 * otro sitio —inventado o externo— se pinta como texto y no lleva a ninguna
 * parte.
 */
export const RUTAS_DEL_ASISTENTE: ReadonlySet<string> = new Set([
  '/metodo',
  '/articulo',
  '/en-accion',
  '/planes',
  '/preguntas',
  '/quien-soy',
  '/tutoriales',
  '/perfil',
  '/auth/registro',
  '/auth/login',
  '/privacidad',
]);

const VINETA = /^(?:[-*•]|\d+[.)])\s+/;
const TITULO = /^#{1,6}\s+/;
const EN_LINEA = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*/g;

export function trocear(texto: string): Bloque[] {
  const bloques: Bloque[] = [];
  let actual: Bloque | null = null;

  for (const cruda of texto.replace(/\r/g, '').split('\n')) {
    const linea = cruda.trim();
    if (!linea) {
      actual = null;
      continue;
    }

    const esVineta = VINETA.test(linea);
    const tipo = esVineta ? 'lista' : 'parrafo';

    if (!actual || actual.tipo !== tipo) {
      actual = { tipo, lineas: [] };
      bloques.push(actual);
    }

    // Se le pide que no ponga títulos, pero si pone uno sale en negrita en vez
    // de con sus almohadillas delante.
    actual.lineas.push(
      TITULO.test(linea)
        ? [{ tipo: 'negrita', texto: linea.replace(TITULO, '') }]
        : segmentar(esVineta ? linea.replace(VINETA, '') : linea),
    );
  }

  return bloques;
}

export function segmentar(linea: string): Segmento[] {
  const segmentos: Segmento[] = [];
  let desde = 0;

  for (const encontrado of linea.matchAll(EN_LINEA)) {
    const inicio = encontrado.index ?? 0;
    if (inicio > desde) segmentos.push({ tipo: 'texto', texto: linea.slice(desde, inicio) });

    segmentos.push(
      encontrado[3] !== undefined
        ? { tipo: 'negrita', texto: encontrado[3] }
        : enlace(encontrado[1], encontrado[2]),
    );
    desde = inicio + encontrado[0].length;
  }

  if (desde < linea.length) segmentos.push({ tipo: 'texto', texto: linea.slice(desde) });
  return segmentos;
}

function enlace(texto: string, destino: string): Segmento {
  if (destino.toLowerCase() === 'whatsapp') return { tipo: 'whatsapp', texto };

  const [camino, fragmento] = destino.split('#');
  const ruta = camino.split('?')[0];

  if (!RUTAS_DEL_ASISTENTE.has(ruta)) return { tipo: 'texto', texto };
  return fragmento ? { tipo: 'enlace', texto, ruta, fragmento } : { tipo: 'enlace', texto, ruta };
}
