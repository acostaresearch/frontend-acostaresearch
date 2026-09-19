import { Component, computed, signal } from '@angular/core';

import { GuiaDeUso, MensajeDeEjemplo, PasoDeGuia } from './guia-de-uso';

type Programa = 'atlas' | 'nvivo' | 'maxqda' | 'qualcoder' | 'ninguno';

interface ComoSeAbre {
  readonly pasos: readonly string[];
  readonly nota: string;
}

const PROGRAMAS: readonly { clave: Programa; texto: string }[] = [
  { clave: 'atlas', texto: 'ATLAS.ti' },
  { clave: 'nvivo', texto: 'NVivo' },
  { clave: 'maxqda', texto: 'MAXQDA' },
  { clave: 'qualcoder', texto: 'QualCoder (gratis)' },
  { clave: 'ninguno', texto: 'No tengo ninguno' },
];

/**
 * Cómo se abre el .qdpx en cada programa. Los menús cambian de nombre entre
 * versiones; lo que no cambia es «REFI-QDA», y eso es lo que se le dice que
 * busque.
 */
const COMO_SE_ABRE: Record<Programa, ComoSeAbre> = {
  atlas: {
    pasos: [
      'Pídele a Claude «dame el archivo para ATLAS.ti» y descarga el .qdpx.',
      'En ATLAS.ti: Archivo → Importar → Proyecto REFI-QDA, y elige el archivo.',
      'Encontrarás tus entrevistas con los códigos, sus definiciones y sus citas ya puestos.',
    ],
    nota: 'Funciona en ATLAS.ti 9 o superior, de escritorio o web.',
  },
  nvivo: {
    pasos: [
      'Pídele a Claude «dame el archivo para ATLAS.ti»: es el mismo .qdpx.',
      'En NVivo: Importar → Proyecto REFI-QDA (.qdpx).',
      'Las categorías llegan como códigos padre, con sus códigos dentro.',
    ],
    nota: 'Funciona en NVivo 14 o superior.',
  },
  maxqda: {
    pasos: [
      'Pídele a Claude «dame el archivo para ATLAS.ti»: es el mismo .qdpx.',
      'En MAXQDA: Importar → Proyecto REFI-QDA.',
      'Tus entrevistas llegan como documentos, con los segmentos ya codificados.',
    ],
    nota: 'Funciona en MAXQDA 2020 o superior.',
  },
  qualcoder: {
    pasos: [
      'Descarga QualCoder: es gratis y de código abierto, para Windows, Mac y Linux.',
      'Pídele a Claude «dame el archivo para ATLAS.ti» y descarga el .qdpx.',
      'En QualCoder: Archivo → Importar proyecto REFI-QDA.',
    ],
    nota: 'La opción para seguir explorando tus códigos sin pagar una licencia.',
  },
  ninguno: {
    pasos: [
      'No te hace falta: la codificación, las tablas, la red de códigos y el capítulo salen de aquí.',
      'Si tu asesor trabaja con ATLAS.ti, pásale el .qdpx y lo abre ya codificado.',
    ],
    nota: 'El .qdpx es un extra, no un requisito.',
  },
};

const PASOS: readonly PasoDeGuia[] = [
  {
    titulo: 'Pídeselo a Claude',
    detalle:
      'En tu conector, dile «quiero analizar mis entrevistas». Claude lee tus objetivos y tu metodología para saber qué categorías buscar.',
  },
  {
    titulo: 'Sube tus transcripciones',
    detalle:
      'Claude te da un enlace. Sube tus entrevistas o grupos focales, una por archivo, en Word, PDF con texto o .txt. Quita los nombres reales si tu comité de ética lo pide.',
  },
  {
    titulo: 'Aprueba la codificación',
    detalle:
      'Claude lee cada entrevista y te propone los códigos y las citas. Tú apruebas, corriges o descartas: nada se guarda sin tu visto bueno, y cada cita se comprueba letra por letra contra tu transcripción.',
  },
  {
    titulo: 'Tablas y red de códigos',
    detalle:
      'Con todo codificado, recibes la tabla de frecuencias, la de coocurrencia de códigos y la red dibujada, como en ATLAS.ti.',
  },
  {
    titulo: 'Tu capítulo y tu .qdpx',
    detalle:
      'Claude redacta tu capítulo de resultados con citas de tus entrevistados, comprobadas contra las transcripciones, y te da el Word. Si quieres, también el proyecto para abrirlo en ATLAS.ti.',
  },
];

const EJEMPLO: readonly MensajeDeEjemplo[] = [
  { de: 'tu', texto: 'Quiero analizar mis entrevistas.' },
  {
    de: 'claude',
    texto:
      'Leí tus objetivos. Sube tus transcripciones por este enlace, una por archivo, y dime «ya subí mis entrevistas».',
  },
  { de: 'tu', texto: 'Ya subí mis entrevistas.' },
  {
    de: 'claude',
    texto:
      'Tengo cuatro. Leí la E1 y te propongo seis códigos. Por ejemplo, «Falta de apoyo del asesor»: «le mandaba mis avances y pasaban tres semanas sin respuesta» (¶6). ¿Los guardo así?',
  },
  { de: 'tu', texto: 'Sí, guárdala.' },
  {
    de: 'claude',
    texto: 'Guardada, con todas las citas comprobadas en tu transcripción. Sigo con la E2.',
  },
  { de: 'tu', texto: 'Dame el archivo para ATLAS.ti.' },
  {
    de: 'claude',
    texto: 'Listo: 4 entrevistas, 18 códigos y 52 citas. Ábrelo en ATLAS.ti con Importar → Proyecto REFI-QDA.',
  },
];

/**
 * La pestaña «Tu ATLAS.ti» del perfil.
 *
 * El análisis cualitativo no se hace EN ATLAS.ti —no hay forma de manejarlo
 * desde fuera—: se hace con Claude, y el resultado se entrega en el formato de
 * intercambio (.qdpx) que ATLAS.ti, NVivo, MAXQDA y QualCoder importan ya
 * codificado. La pestaña lleva el nombre de ATLAS.ti porque es el programa que
 * el tesista y su asesor conocen, y lo primero que dice es que no hace falta
 * tenerlo.
 *
 * Como la de R, no hay nada que configurar: enseña cómo se pide y adelanta la
 * duda que más frena, que aquí es «¿y cómo lo abro en mi programa?».
 */
@Component({
  selector: 'app-mi-atlas-ti',
  imports: [GuiaDeUso],
  templateUrl: './mi-atlas-ti.html',
  styleUrl: './mi-analisis-r.css',
})
export class MiAtlasTi {
  readonly pasos = PASOS;
  readonly ejemplo = EJEMPLO;
  readonly frases = [
    'quiero analizar mis entrevistas',
    'sácame las tablas y la red de códigos',
    'redacta el capítulo de resultados',
    'dame el archivo para ATLAS.ti',
  ];
  readonly programas = PROGRAMAS;

  readonly programa = signal<Programa | null>(null);
  readonly comoSeAbre = computed(() => {
    const programa = this.programa();
    return programa ? COMO_SE_ABRE[programa] : null;
  });
}
