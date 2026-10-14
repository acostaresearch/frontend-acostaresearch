import { normalizarDoi } from './doi-del-pdf';

/**
 * Los DOI de una lista de referencias en texto (.md), y cuántas referencias
 * vienen sin DOI.
 *
 * POR QUÉ SOLO LOS DOI (14-oct-2026)
 * ----------------------------------
 * Un .md con referencias casi siempre lo escribió una IA (Claude, ChatGPT) o
 * sale de unas notas, y una lista así puede traer fuentes inventadas o con el
 * año y la revista cambiados. Importar el texto tal cual metería esas fuentes
 * en su biblioteca y Claude las citaría como reales. Por eso del archivo solo
 * se toma el DOI: la ficha la pone el catálogo abierto, y el DOI que no existe
 * en ningún catálogo se le enseña para que lo revise.
 *
 * A diferencia del PDF, aquí sí vale cualquier DOI del texto: en una lista de
 * referencias, cada DOI es una fuente que la persona quiere.
 */
export interface DoisDelTexto {
  dois: string[];
  /** Renglones que parecen una referencia (llevan un año) y no traen DOI. */
  sinDoi: number;
}

const DOI_EN_TEXTO = /10\.\d{4,9}\/[^\s"'<>\]]+/gi;

/** Lo que el Markdown o la frase le pegan por detrás: `**`, `_`, `)`, `.`… */
function recortar(crudo: string): string {
  let doi = crudo.replace(/[*_`>]+$/, '').replace(/[.,;:]+$/, '');
  // Un DOI puede llevar paréntesis —10.1016/S0140-6736(20)30183-5—, pero el
  // `)` de cierre de un enlace [texto](https://doi.org/…) no es suyo.
  const abiertos = (s: string) => (s.match(/\(/g) ?? []).length;
  const cerrados = (s: string) => (s.match(/\)/g) ?? []).length;
  while (doi.endsWith(')') && cerrados(doi) > abiertos(doi)) {
    doi = doi.slice(0, -1).replace(/[*_`.,;:]+$/, '');
  }
  return doi;
}

/** Un renglón con aspecto de referencia: un año y algo de texto. */
const PARECE_REFERENCIA = /\b(19|20)\d{2}[a-z]?\b/;

export function doisDelTexto(texto: string): DoisDelTexto {
  const vistos = new Set<string>();
  const dois: string[] = [];
  let sinDoi = 0;

  for (const renglon of texto.split(/\r?\n/)) {
    const encontrados = [...renglon.matchAll(DOI_EN_TEXTO)]
      .map((m) => normalizarDoi(recortar(m[0])))
      .filter((d): d is string => d !== null);

    if (encontrados.length === 0) {
      if (renglon.trim().length >= 40 && PARECE_REFERENCIA.test(renglon)) sinDoi++;
      continue;
    }

    for (const doi of encontrados) {
      // Los DOI no distinguen mayúsculas: el mismo escrito dos veces es uno.
      const clave = doi.toLowerCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      dois.push(doi);
    }
  }

  return { dois, sinDoi };
}
