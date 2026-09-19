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
  { clave: 'ninguno', texto: 'No, lo hago todo aquí' },
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
      'Es lo normal: la codificación, las tablas, la red de códigos y el capítulo salen de aquí.',
      'Si más adelante tu asesor o tu jurado quieren revisarlo en su programa, pide el archivo entonces.',
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
    titulo: 'Tu capítulo en Word',
    detalle:
      'Claude redacta tu capítulo de resultados, organizado por objetivos, con citas de tus entrevistados comprobadas contra las transcripciones. Queda guardado en tu tesis y lo descargas en Word.',
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
  { de: 'tu', texto: 'Sácame las tablas y la red de códigos.' },
  {
    de: 'claude',
    texto:
      'Listo: 18 códigos en 5 categorías. «Falta de apoyo del asesor» aparece en las cuatro entrevistas y casi siempre junto a «Ayuda externa». Aquí tienes la red.',
  },
  { de: 'tu', texto: 'Redacta el capítulo de resultados.' },
  {
    de: 'claude',
    texto:
      'Tu capítulo está listo, organizado por objetivos, con las tablas, la red y 12 citas de tus entrevistados, todas encontradas en tus transcripciones. Descárgalo en Word.',
  },
];

/**
 * La pestaña «Tu ATLAS.ti» del perfil.
 *
 * El análisis cualitativo se hace ENTERO aquí, en el chat con Claude y en la
 * plataforma: codificación, tablas, red de códigos y capítulo. Es lo que haría
 * ATLAS.ti, sin instalarlo ni pagarlo, y eso es lo que la pestaña enseña. La
 * pestaña lleva el nombre de ATLAS.ti porque es el programa que el tesista y su
 * asesor conocen.
 *
 * El .qdpx —el proyecto para abrirlo ya codificado en ATLAS.ti, NVivo, MAXQDA o
 * QualCoder— va al final y como opcional: para el asesor o el jurado que
 * quieran revisarlo en su programa, no como meta del tesista.
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
  ];
  readonly programas = PROGRAMAS;

  readonly programa = signal<Programa | null>(null);
  readonly comoSeAbre = computed(() => {
    const programa = this.programa();
    return programa ? COMO_SE_ABRE[programa] : null;
  });
}
