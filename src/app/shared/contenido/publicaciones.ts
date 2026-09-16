/**
 * Artículos publicados por Benicio Acosta, para dar peso a quien firma el método.
 *
 * Los datos salen de OpenAlex (septiembre de 2026) y el título va en su idioma
 * original, como en una bibliografía. El enlace es el DOI y no la dirección de
 * la revista: esa cambia cuando la editorial rehace su web; el DOI no.
 *
 * Sin número de citas a propósito: sube cada mes y una cifra escrita aquí
 * quedaría vieja sin que nadie se entere. Para eso está el enlace a Google
 * Académico de «Quién soy».
 */
export interface Publicacion {
  titulo: string;
  revista: string;
  editorial: string;
  anio: number;
  doi: string;
}

export const PUBLICACIONES: readonly Publicacion[] = [
  {
    titulo:
      "Analysis of college students' attitudes toward the use of ChatGPT in their academic activities: effect of intent to use, verification of information and responsible use",
    revista: 'BMC Psychology',
    editorial: 'Springer Nature',
    anio: 2024,
    doi: '10.1186/s40359-024-01764-z',
  },
  {
    titulo:
      'Knowledge, attitudes, and perceived Ethics regarding the use of ChatGPT among generation Z university students',
    revista: 'International Journal for Educational Integrity',
    editorial: 'Springer Nature',
    anio: 2024,
    doi: '10.1007/s40979-024-00157-4',
  },
  {
    titulo:
      'Exploring attitudes toward ChatGPT among college students: An empirical analysis of cognitive, affective, and behavioral components using path analysis',
    revista: 'Computers and Education: Artificial Intelligence',
    editorial: 'Elsevier',
    anio: 2024,
    doi: '10.1016/j.caeai.2024.100320',
  },
  {
    titulo:
      'The mediating role of academic stress, critical thinking and performance expectations in the influence of academic self-efficacy on AI dependence: Case study in college students',
    revista: 'Computers and Education: Artificial Intelligence',
    editorial: 'Elsevier',
    anio: 2025,
    doi: '10.1016/j.caeai.2025.100381',
  },
  {
    titulo:
      'Acceptance of Artificial Intelligence as a Teaching Strategy Among University Professors: The Role of Habit, Hedonic Motivation, and Competence for Technology Integration',
    revista: 'Human Behavior and Emerging Technologies',
    editorial: 'Wiley',
    anio: 2025,
    doi: '10.1155/hbe2/5933157',
  },
];

/** Las revistas, una vez cada una y en el orden de arriba. */
export const REVISTAS_PUBLICADAS: readonly string[] = [
  ...new Set(PUBLICACIONES.map((p) => p.revista)),
];
