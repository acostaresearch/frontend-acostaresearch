/** Nivel de intervención sobre el texto original. */
export type RewriteMode = 'LIGERO' | 'ESTANDAR' | 'PROFUNDO';

/** Capítulo de la tesis: cada uno tiene sus propias convenciones. */
export type ThesisChapter =
  | 'GENERAL'
  | 'CAP_I_PROBLEMA'
  | 'CAP_II_MARCO_TEORICO'
  | 'CAP_III_METODOLOGIA'
  | 'CAP_IV_RESULTADOS'
  | 'CAP_V_DISCUSION'
  | 'CAP_VI_CONCLUSIONES'
  | 'RESUMEN_ABSTRACT';

export interface Rewrite {
  id: string;
  mode: RewriteMode;
  chapter: ThesisChapter;
  status: 'COMPLETED' | 'FAILED';
  sourceWords: number;
  createdAt: string;
  sourceText?: string;
  resultText?: string | null;
  errorCode?: string | null;
  durationMs?: number | null;
}

export interface RewriteRequest {
  text: string;
  mode: RewriteMode;
  chapter: ThesisChapter;
}

export interface WordPack {
  id: string;
  wordsTotal: number;
  wordsUsed: number;
  status: 'ACTIVE' | 'EXHAUSTED' | 'REVOKED';
  activatedAt: string;
  expiresAt: string;
  plan: { code: string; name: string };
}

export interface Balance {
  wordsAvailable: number;
  maxWordsPerRequest: number;
  expiresAt: string | null;
  packs: WordPack[];
}

/** Qué entrega un plan: palabras para el humanizador o licencia del conector. */
export type PlanKind = 'WORDS' | 'LICENSE';

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: PlanKind;
  /** Solo en planes de licencia: qué producto se licencia. */
  productCode: string | null;
  words: number;
  priceCents: number;
  currency: string;
  /** Precio para las pasarelas que cobran en dólares. Nulo = solo pago manual. */
  priceUsdCents: number | null;
  durationDays: number;
}

/** Etiquetas para la interfaz. El backend solo entiende los códigos. */
export const CAPITULOS: ReadonlyArray<{ value: ThesisChapter; label: string; hint: string }> = [
  {
    value: 'GENERAL',
    label: 'Texto general',
    hint: 'Para párrafos sueltos o textos que no son de un capítulo concreto.',
  },
  {
    value: 'CAP_I_PROBLEMA',
    label: 'Capítulo I · Problema y objetivos',
    hint: 'Registro argumentativo; no adelanta resultados.',
  },
  {
    value: 'CAP_II_MARCO_TEORICO',
    label: 'Capítulo II · Marco teórico',
    hint: 'Respeta autores, años y páginas sin tocarlos.',
  },
  {
    value: 'CAP_III_METODOLOGIA',
    label: 'Capítulo III · Metodología',
    hint: 'No cambia diseño, población ni muestra.',
  },
  {
    value: 'CAP_IV_RESULTADOS',
    label: 'Capítulo IV · Resultados',
    hint: 'Describe las tablas, no las interpreta.',
  },
  {
    value: 'CAP_V_DISCUSION',
    label: 'Capítulo V · Discusión',
    hint: 'Prosa continua; mantiene las hipótesis rechazadas.',
  },
  {
    value: 'CAP_VI_CONCLUSIONES',
    label: 'Capítulo VI · Conclusiones',
    hint: 'No introduce datos nuevos.',
  },
  {
    value: 'RESUMEN_ABSTRACT',
    label: 'Resumen / Abstract',
    hint: 'Estructura IMRyD y respeta el límite de palabras.',
  },
];

export const MODOS: ReadonlyArray<{ value: RewriteMode; label: string; hint: string }> = [
  { value: 'LIGERO', label: 'Ligero', hint: 'Corrige y pule, respetando tu redacción.' },
  {
    value: 'ESTANDAR',
    label: 'Estándar',
    hint: 'Reescribe para ganar claridad y registro académico.',
  },
  {
    value: 'PROFUNDO',
    label: 'Profundo',
    hint: 'Además reorganiza las ideas dentro de cada párrafo.',
  },
];
