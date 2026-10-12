import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { Plan } from '../../core/models/rewrite.model';
import { BillingService } from '../../core/services/billing.service';
import { FASES_INFORME, FASES_TSP } from '../../shared/contenido/metodo';
import { IconoRuta } from '../../shared/layout/icono-ruta';
import { LineasNoche } from '../../shared/layout/lineas-noche';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

export type ClaveDeProducto = 'tsp' | 'informe' | 'humanizador';

/**
 * Un paso de la lista: una fase de la ruta o, en el Humanizador, cómo trabaja.
 * `fuera` es lo que viene con el paquete sin ser una fase: va en gris y con «+».
 */
interface Paso {
  nombre: string;
  etiqueta: string;
  icono: string;
  texto: string;
  entregable?: string;
  fuera?: boolean;
}

/** Lo que traen el TSP y el Informe además de sus fases. */
const EXTRAS: Paso[] = [
  {
    nombre: 'Humanizador académico',
    etiqueta: 'Cuando quieras',
    icono: 'pulso',
    texto: 'Quita los rastros de IA de lo que ya está escrito, párrafo por párrafo.',
    fuera: true,
  },
  {
    nombre: 'Bajar similitud',
    etiqueta: 'Cuando quieras',
    icono: 'escudo',
    texto:
      'Reduce el porcentaje de Turnitin a partir de tu informe de similitud y de tu Word, sin ' +
      'perder ninguna cita ni ninguna cifra.',
    fuera: true,
  },
];

/** Una tarjeta de «Qué incluye»: lo que acompaña a las fases. */
interface Tarjeta {
  icono: string;
  titulo: string;
  texto: string;
}

const TARJETA_EXTRAS: Tarjeta = {
  icono: 'pulso',
  titulo: 'Humanizador y Bajar similitud',
  texto:
    'Vienen en el paquete. Uno quita los rastros de IA de lo que ya está escrito y el otro ' +
    'reduce el porcentaje de Turnitin.',
};

const TARJETA_PLAN_GRATUITO: Tarjeta = {
  icono: 'check',
  titulo: 'Con el plan gratuito de Claude',
  texto: 'Funciona también con el plan gratuito: no necesitas una suscripción de pago para empezar.',
};

/**
 * Los tres productos que se venden y no tenían página: quien los elegía en el
 * menú «Productos» caía en /planes, a comprar algo que nadie le había contado.
 *
 * `prefijo` es por donde empieza el código de su plan, como en `imagenDe` del
 * checkout: el del informe se llama hoy `INFORME_PRUEBA01` y mañana puede
 * llamarse de otra manera. Lo que cuenta cada fase sale de la descripción de
 * su skill en el catálogo; si una skill cambia, se cambia aquí.
 */
const PRODUCTOS: Record<
  ClaveDeProducto,
  {
    prefijo: string;
    rotulo: string;
    titulo: string;
    entrada: string;
    caja: string;
    pasosRotulo: string;
    pasosTitulo: string;
    pasosNota: string;
    /** Si la lista empieza en la fase 0, como la numeran las skills. */
    desdeCero: boolean;
    pasos: Paso[];
    /** Sin lista, la página no enseña «Qué incluye»: el Informe ya lo dice en sus fases. */
    incluye?: Tarjeta[];
    imagen?: { src: string; alt: string };
    cierre: string;
  }
> = {
  tsp: {
    prefijo: 'TSP',
    rotulo: 'Trabajo de Suficiencia Profesional',
    titulo: 'Titúlate con tu experiencia laboral',
    entrada:
      'De la empresa y tu cargo al Word final, sin hipótesis ni instrumento. Seis fases que ' +
      'trabajan contigo en Claude, paso a paso y con el formato de tu universidad.',
    caja: '/productos/06-suficiencia-profesional-caja.svg',
    pasosRotulo: 'Las fases',
    pasosTitulo: 'Seis, de tu experiencia a las conclusiones',
    pasosNota:
      'La fase 0 prepara el terreno y las otras cinco son los capítulos de tu trabajo. El ' +
      'Humanizador y Bajar similitud se usan en cualquier momento.',
    desdeCero: true,
    pasos: [
      {
        nombre: FASES_TSP[0],
        etiqueta: 'Punto de partida',
        icono: 'diana',
        texto:
          'Eliges una experiencia concreta de tu trabajo que se pueda contar y demostrar. Se ' +
          'fijan la empresa, el rubro, tu cargo, el periodo, el problema que resolviste y las ' +
          'evidencias que tienes, y se revisan los requisitos de tu universidad: tiempo mínimo ' +
          'de experiencia, estructura y extensión.',
        entregable: 'Ficha de tu experiencia y título propuesto',
      },
      {
        nombre: FASES_TSP[1],
        etiqueta: 'Capítulo I',
        icono: 'lineas',
        texto:
          'La realidad problemática del sector y de la empresa con fuentes reales; la ' +
          'descripción de la empresa (datos generales, misión, visión, organigrama, productos ' +
          'o servicios); tu cargo y tus funciones; el problema, los objetivos y la ' +
          'justificación. Sin hipótesis.',
        entregable: 'Capítulo I en tu Word',
      },
      {
        nombre: FASES_TSP[2],
        etiqueta: 'Capítulo II',
        icono: 'libro',
        texto:
          'Los antecedentes nacionales e internacionales, las bases teóricas de lo que ' +
          'aplicaste en tu trabajo —métodos, herramientas de gestión, normas técnicas— y la ' +
          'definición de términos. Más corto que el de una tesis: sostiene tu experiencia, no ' +
          'una hipótesis. Solo cita fuentes reales.',
        entregable: 'Capítulo II en tu Word',
      },
      {
        nombre: FASES_TSP[3],
        etiqueta: 'Capítulo III',
        icono: 'chat',
        texto:
          'El corazón del trabajo: ocupa el lugar de la metodología de una tesis. Te ' +
          'entrevista sobre lo que hiciste de verdad y lo redacta en orden: el diagnóstico de ' +
          'la situación inicial, el enfoque de trabajo aplicado, las actividades etapa por ' +
          'etapa con su cronograma, y las herramientas y los recursos.',
        entregable: 'Capítulo III en tu Word',
      },
      {
        nombre: FASES_TSP[4],
        etiqueta: 'Capítulo IV',
        icono: 'barras',
        texto:
          'Lo que logró tu experiencia, objetivo por objetivo, con los indicadores de antes y ' +
          'después tomados de los datos de la empresa, en tablas y figuras APA. Los cálculos ' +
          '—variaciones, ahorros, promedios— se hacen en R o los traes tú: nunca de cabeza.',
        entregable: 'Capítulo IV con sus tablas y figuras',
      },
      {
        nombre: FASES_TSP[5],
        etiqueta: 'Capítulo V',
        icono: 'check',
        texto:
          'Una conclusión por objetivo, cada una con su hallazgo y su cifra; recomendaciones ' +
          'con responsable y plazo para la empresa, otros profesionales y la universidad; el ' +
          'resumen y el abstract con palabras clave; y los anexos de evidencias: constancia de ' +
          'trabajo, reportes, fotos, planos.',
        entregable: 'Tu trabajo completo en un solo Word',
      },
      ...EXTRAS,
    ],
    incluye: [
      {
        icono: 'documento',
        titulo: 'Tu trabajo en un solo Word',
        texto:
          'Tus capítulos se van guardando en el mismo documento, con el formato de tu ' +
          'universidad y en la norma de citas que te pidan entre 17.',
      },
      {
        icono: 'archivo',
        titulo: 'Tus fuentes',
        texto:
          'Scopus en la plataforma, tus PDF o tu Zotero. Las citas salen de fuentes reales, ' +
          'cada una con su clave: aquí no aparecen autores que no existen.',
      },
      {
        icono: 'barras',
        titulo: 'Tus indicadores, calculados en R',
        texto:
          'Las variaciones, los ahorros y los promedios de antes y después se calculan en R, ' +
          'dentro de la conversación y sin instalar nada. Ninguna cifra se inventa.',
      },
      TARJETA_EXTRAS,
      {
        icono: 'play',
        titulo: 'Videos guía',
        texto: 'Para conectarlo a tu Claude y usarlo desde el primer día.',
      },
      TARJETA_PLAN_GRATUITO,
    ],
    cierre: 'Quiero el Trabajo de Suficiencia',
  },
  informe: {
    prefijo: 'INFORME',
    rotulo: 'Ruta del Informe',
    titulo: 'Tu informe, del encargo al Word final',
    entrada:
      'De curso o de empresa, en cinco fases. Parte del encargo —la consigna y la rúbrica, si ' +
      'es de un curso— y termina revisando el informe contra esa misma rúbrica.',
    caja: '/productos/07-informes-caja.svg',
    pasosRotulo: 'Las fases',
    pasosTitulo: 'Cinco, del encargo a la revisión final',
    pasosNota:
      'La fase 3 solo se usa si tu informe lo pide. El Humanizador y Bajar similitud se usan ' +
      'en cualquier momento.',
    desdeCero: true,
    pasos: [
      {
        nombre: FASES_INFORME[0],
        etiqueta: 'Plan con fecha',
        icono: 'formulario',
        texto:
          'Convierte el encargo de tu docente en un plan con fecha. Lee la consigna y la ' +
          'rúbrica que compartas, identifica el tipo de informe —académico de curso, de ' +
          'proyecto o análisis de caso—, delimita el tema, acuerda el esquema de secciones y ' +
          'arma un calendario hasta la entrega.',
        entregable: 'Ficha del informe, esquema y calendario',
      },
      {
        nombre: FASES_INFORME[1],
        etiqueta: 'Fuentes reales',
        icono: 'buscar',
        texto:
          'Consigue las fuentes y te enseña a distinguir una confiable de una que no se cita. ' +
          'Arma palabras clave en español e inglés, busca en la biblioteca de Acosta, en la ' +
          'tuya (Zotero incluido) y en el catálogo abierto, y te deja elegir.',
        entregable: 'Tabla de qué fuente sostiene cada subtítulo',
      },
      {
        nombre: FASES_INFORME[2],
        etiqueta: 'El cuerpo',
        icono: 'lineas',
        texto:
          'Redacta el cuerpo según el tipo de informe. En el académico de curso, un apartado ' +
          'por subtítulo con la idea, lo que dicen las fuentes, un ejemplo y tu postura. En el ' +
          'de proyecto, el problema, los objetivos, la propuesta y la implementación. En el ' +
          'análisis de caso, los hechos, el problema central, el análisis y las alternativas.',
        entregable: 'El desarrollo en tu Word',
      },
      {
        nombre: FASES_INFORME[3],
        etiqueta: 'Si tu informe lo pide',
        icono: 'barras',
        texto:
          'Presenta e interpreta lo que se obtuvo: resultados de la implementación, pruebas, ' +
          'indicadores de antes y después, beneficios y lecciones aprendidas. Si hay datos, ' +
          'corre el análisis en R dentro de la conversación.',
        entregable: 'Análisis y resultados en tu Word',
      },
      {
        nombre: FASES_INFORME[4],
        etiqueta: 'Cierre',
        icono: 'check',
        texto:
          'Escribe lo que se escribe al final: la introducción, las conclusiones por objetivo ' +
          'o apartado, las recomendaciones y el resumen si la consigna los pide. Después ' +
          'revisa el informe entero, criterio por criterio, contra la rúbrica de tu docente.',
        entregable: 'Informe completo en Word, revisado con la rúbrica',
      },
      ...EXTRAS,
    ],
    cierre: 'Quiero la ruta del informe',
  },
  humanizador: {
    prefijo: 'HUMANIZ',
    rotulo: 'Humanizador Académico',
    titulo: 'Un estilo más natural, claro y coherente',
    entrada:
      'Mejora la redacción de tus textos académicos conservando su contenido y su sentido ' +
      'original. Para tesis, artículos científicos y presentaciones de sustentación.',
    caja: '/productos/03-humanizador-academico-caja.svg',
    pasosRotulo: 'Cómo trabaja',
    pasosTitulo: 'Párrafo por párrafo, no de un tirón',
    pasosNota:
      'Para textos académicos en español, escritos por ti o con ayuda de una IA. No cambia lo ' +
      'que dices: cambia cómo suena.',
    desdeCero: false,
    pasos: [
      {
        nombre: 'Tú decides por dónde empieza',
        etiqueta: 'Arranque',
        icono: 'chat',
        texto:
          'Pregunta primero si revisa ella cada párrafo o si ya traes marcados los patrones ' +
          'que quieres quitar. Si los traes, comprueba de dónde salieron antes de tocar nada.',
      },
      {
        nombre: 'Diagnóstico',
        etiqueta: 'Informe',
        icono: 'buscar',
        texto:
          'Revisa tu texto párrafo por párrafo y te entrega un informe de diagnóstico con lo ' +
          'que encontró y su medición.',
        entregable: 'Informe de diagnóstico',
      },
      {
        nombre: 'Reescritura por rondas',
        etiqueta: 'Hasta tres rondas',
        icono: 'ciclo',
        texto:
          'Trabaja en hasta tres rondas, porque en una sola pasada no se quitan todos los ' +
          'patrones. En cada una reescribe solo lo que hace falta.',
      },
      {
        nombre: 'Párrafos a su medida',
        etiqueta: 'Redacción científica',
        icono: 'documento',
        texto:
          'Detecta los párrafos demasiado extensos y propone partirlos en dos, manteniendo la ' +
          'redacción científica.',
      },
    ],
    incluye: [
      {
        icono: 'documento',
        titulo: 'Para tus textos académicos',
        texto: 'Tesis, artículos científicos y presentaciones de sustentación, en español.',
      },
      {
        icono: 'escudo',
        titulo: 'Tu contenido no cambia',
        texto: 'Conserva el contenido y el sentido original: cambia cómo suena, no lo que dices.',
      },
      {
        icono: 'buscar',
        titulo: 'Sabes qué se tocó',
        texto: 'Recibes un informe de diagnóstico con lo que encontró y su medición.',
      },
      TARJETA_PLAN_GRATUITO,
    ],
    imagen: { src: '/humanizador/humanizador.png', alt: 'De texto de IA a texto humano' },
    cierre: 'Quiero el Humanizador',
  },
};

/**
 * La página de un producto sin ruta propia de fases: Suficiencia Profesional,
 * Informes y Humanizador. Una sola para los tres, con la presentación de «Las
 * 12 Skills» y de la Ruta del Artículo (`shared/estilos/ruta.css`); cuál se
 * enseña lo dice `data.producto` de la ruta.
 */
@Component({
  selector: 'app-producto',
  imports: [NgTemplateOutlet, RouterLink, SiteHeader, SiteFooter, LineasNoche, IconoRuta],
  templateUrl: './producto.html',
  styleUrls: ['../../shared/estilos/ruta.css', './producto.css'],
})
export class Producto implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly ruta = inject(ActivatedRoute);

  private readonly clave = toSignal(
    this.ruta.data.pipe(map((d) => d['producto'] as ClaveDeProducto)),
    { initialValue: this.ruta.snapshot.data['producto'] as ClaveDeProducto },
  );

  /** Los textos y las listas del producto de esta dirección. */
  readonly producto = computed(() => PRODUCTOS[this.clave()]);

  /** Los pasos con su número; lo que no es una fase lleva «+». */
  readonly pasos = computed(() => {
    const primero = this.producto().desdeCero ? 0 : 1;
    return this.producto().pasos.map((paso, i) => ({
      ...paso,
      numero: paso.fuera ? '+' : String(i + primero).padStart(2, '0'),
    }));
  });

  /** Las dos columnas: impares a la izquierda, pares a la derecha. */
  readonly columnaIzquierda = computed(() => this.pasos().filter((_, i) => i % 2 === 0));
  readonly columnaDerecha = computed(() => this.pasos().filter((_, i) => i % 2 === 1));

  private readonly planes = signal<Plan[]>([]);

  /**
   * El plan del producto. Sale del catálogo de planes, que es con el que se
   * cobra: el precio y la vigencia no se escriben aquí.
   */
  readonly plan = computed(() =>
    this.planes().find((p) => p.code.toUpperCase().startsWith(this.producto().prefijo)),
  );

  readonly precio = computed(() => {
    const plan = this.plan();
    return plan ? `S/ ${(plan.priceCents / 100).toFixed(0)}` : null;
  });

  /** «6 meses de acceso», «Un mes de acceso». */
  readonly vigencia = computed(() => {
    const dias = this.plan()?.durationDays ?? 0;
    if (dias <= 0) return 'Acceso';
    const meses = Math.round(dias / 30);
    return meses === 1 ? 'Un mes de acceso' : `${meses} meses de acceso`;
  });

  ngOnInit(): void {
    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
  }
}
