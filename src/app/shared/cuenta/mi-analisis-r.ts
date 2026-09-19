import { Component, computed, signal } from '@angular/core';

import { GuiaDeUso, MensajeDeEjemplo, PasoDeGuia } from './guia-de-uso';

type Objetivo = 'relacion' | 'dos-grupos' | 'varios-grupos' | 'antes-despues' | 'categorias';

interface Prueba {
  readonly nombre: string;
  readonly cuando: string;
}

interface Sugerencia {
  readonly normal: Prueba;
  readonly noNormal?: Prueba;
}

const OBJETIVOS: readonly { clave: Objetivo; texto: string }[] = [
  { clave: 'relacion', texto: 'Relacionar dos variables' },
  { clave: 'dos-grupos', texto: 'Comparar dos grupos' },
  { clave: 'varios-grupos', texto: 'Comparar tres grupos o más' },
  { clave: 'antes-despues', texto: 'Antes y después, mismo grupo' },
  { clave: 'categorias', texto: 'Asociar dos categorías' },
];

/**
 * La elección de siempre en una tesis peruana, la misma que aplica el
 * servidor al leer la normalidad (ver `r.catalogo.js` en el backend).
 */
const SUGERENCIAS: Record<Objetivo, Sugerencia> = {
  relacion: {
    normal: { nombre: 'r de Pearson', cuando: 'si tus datos siguen la normal' },
    noNormal: {
      nombre: 'Rho de Spearman',
      cuando: 'si no la siguen, lo habitual con escalas Likert',
    },
  },
  'dos-grupos': {
    normal: { nombre: 't de Student', cuando: 'si tus datos siguen la normal' },
    noNormal: { nombre: 'U de Mann-Whitney', cuando: 'si no la siguen' },
  },
  'varios-grupos': {
    normal: { nombre: 'ANOVA de un factor', cuando: 'si tus datos siguen la normal' },
    noNormal: { nombre: 'Kruskal-Wallis', cuando: 'si no la siguen' },
  },
  'antes-despues': {
    normal: {
      nombre: 't de Student para muestras relacionadas',
      cuando: 'si las diferencias siguen la normal',
    },
    noNormal: { nombre: 'Wilcoxon', cuando: 'si no la siguen' },
  },
  categorias: {
    normal: {
      nombre: 'Chi-cuadrado',
      cuando: 'con dos variables de categorías; aquí no hace falta la normalidad',
    },
  },
};

const PASOS: readonly PasoDeGuia[] = [
  {
    titulo: 'Pídeselo a Claude',
    detalle:
      'En tu conector, dile «analicemos mis datos en R». No tienes que instalar R, RStudio ni SPSS.',
  },
  {
    titulo: 'Sube tu matriz',
    detalle:
      'Claude te da un enlace. Ahí subes tu Excel (.xlsx), CSV o SPSS (.sav), de hasta 5 MB. Solo se usa para tu análisis y no lo ve nadie más.',
  },
  {
    titulo: 'Elige la prueba con Claude',
    detalle:
      'Te pregunta por tus variables y dimensiones, saca los descriptivos, el alfa de Cronbach y la normalidad, y con eso te propone la prueba de tus hipótesis.',
  },
  {
    titulo: 'Recibe tu informe en Word',
    detalle:
      'Con las tablas y figuras numeradas en APA y la interpretación de cada resultado. Con él se redacta tu Capítulo IV.',
  },
];

const EJEMPLO: readonly MensajeDeEjemplo[] = [
  { de: 'tu', texto: 'Analicemos mis datos en R.' },
  {
    de: 'claude',
    texto:
      'Perfecto. Sube tu matriz por este enlace: acepta Excel, CSV o SPSS. Cuando termines, dime «ya subí mis datos».',
  },
  { de: 'tu', texto: 'Ya subí mis datos.' },
  {
    de: 'claude',
    texto:
      'Leí 120 filas y 24 columnas. El alfa de Cronbach es 0,89 en tu primera variable y 0,86 en la segunda: la fiabilidad es buena.',
  },
  {
    de: 'claude',
    texto:
      'Con 120 casos uso Kolmogorov-Smirnov: p < 0,05, así que tus datos no siguen la normal. Para relacionar tus dos variables toca Rho de Spearman. ¿Seguimos?',
  },
  { de: 'tu', texto: 'Sí.' },
  {
    de: 'claude',
    texto:
      'Rho = 0,48, p < 0,001: una relación positiva y moderada. Tu informe en Word ya está listo, con cada tabla en APA.',
  },
];

/**
 * La pestaña «Tu análisis en R» del perfil.
 *
 * Aquí no hay nada que configurar —el análisis se pide a Claude y el archivo se
 * sube por el enlace que él da—, así que la pestaña enseña cómo se hace y
 * adelanta la duda que más frena: qué prueba le toca a su tesis. Sin ella, el
 * tesista cuantitativo llega al Capítulo IV pensando que tiene que instalar
 * RStudio o pagar a alguien que le corra el SPSS.
 */
@Component({
  selector: 'app-mi-analisis-r',
  imports: [GuiaDeUso],
  templateUrl: './mi-analisis-r.html',
  styleUrl: './mi-analisis-r.css',
})
export class MiAnalisisR {
  readonly pasos = PASOS;
  readonly ejemplo = EJEMPLO;
  readonly frases = ['analicemos mis datos en R'];
  readonly objetivos = OBJETIVOS;

  readonly objetivo = signal<Objetivo | null>(null);
  readonly sugerencia = computed(() => {
    const objetivo = this.objetivo();
    return objetivo ? SUGERENCIAS[objetivo] : null;
  });
}
