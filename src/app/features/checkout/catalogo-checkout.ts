import { computed, signal, Signal } from '@angular/core';
import { Plan } from '../../core/models/rewrite.model';
import { FASES_ARTICULO, FASES_INFORME, FASES_REVISION, FASES_TSP, INCLUYE } from '../../shared/contenido/metodo';
/**
 * Las etapas de la tesis con el nombre que se entiende en una ficha de precios.
 * `FASES_TESIS` es más corto («Tema», «Datos») porque va en fichas del inicio
 * donde caben dos palabras; aquí hay sitio para decir qué es cada una.
 */
const ETAPAS_TESIS = [
  'Tema y delimitación',
  'Problema y objetivos',
  'Marco teórico',
  'Metodología',
  'Instrumento',
  'Recolección de datos',
  'Análisis de datos',
  'Discusión',
  'Conclusiones y abstract',
] as const;


export class CatalogoCheckout {
constructor(
readonly metodo: Signal<Plan[]>, readonly membresias: Signal<Plan[]>,
readonly vigencia: (plan: Plan) => string,
readonly esElMasElegido: (plan: Plan) => boolean,
readonly ahorro: (plan: Plan) => string | null,
readonly pasarelaCulqi: () => unknown, readonly pasarelaHotmart: () => unknown,
readonly pasarelaPaypal: () => unknown, readonly datosWU: () => unknown,
) {}
  /**
   * Qué se lleva quien compra este paquete.
   *
   * El método de tesis tiene su lista escrita —las Skills, el panel, la
   * duración—. Un grupo creado desde el panel no puede tenerla: nadie la ha
   * escrito. Para esos se arma con lo que el servidor sí sabe con certeza, que
   * es poco pero cierto. Inventarles viñetas sería prometer en su nombre.
   */
  loQueIncluye(plan: Plan): string[] {
    const duracion =
      plan.durationDays > 0
        ? `${this.vigencia(plan)} de acceso, renovables`
        : 'Acceso permanente, sin suscripción';

    // La duración va tercera en las listas escritas: con las dos primeras son
    // las tres que se destacan. Sale del plan y no del texto, así que si la
    // vigencia cambia desde el panel, la tarjeta cambia con ella.
    const escrita = INCLUYE[plan.code];
    if (escrita) return [...escrita.slice(0, 2), duracion, ...escrita.slice(2)];

    // Sin lista escrita: el producto y su duración primero, que son las dos
    // que se destacan, y detrás lo que vale para cualquier paquete.
    return [
      `El ${plan.name}`,
      duracion,
      'Se conecta a tu cuenta de Claude.ai',
      'Funciona también con el plan gratuito de Claude',
    ];
  }

  /**
   * Qué trozo de una ventaja destacada va en negrita: [negrita, resto].
   *
   * «Las 12 Skills: las 9 fases…» se lee por su arranque, hasta los dos
   * puntos; una frase larga sin ellos, hasta la primera coma. Las cortas —«12
   * meses de acceso, renovables»— van enteras: partidas, la negrita se queda
   * en dos palabras sueltas.
   */
  partirVentaja(item: string): [string, string] {
    const dosPuntos = item.indexOf(':');
    if (dosPuntos > 0) return [item.slice(0, dosPuntos + 1), item.slice(dosPuntos + 1)];

    const coma = item.indexOf(',');
    if (item.length > 45 && coma > 0) return [item.slice(0, coma + 1), item.slice(coma + 1)];

    return [item, ''];
  }

  /**
   * La caja del producto que va en la cabecera de la tarjeta.
   *
   * POR QUÉ UNA IMAGEN Y NO UN ICONO
   * --------------------------------
   * Tres tarjetas de texto seguidas se leen como tres párrafos y hay que
   * leerlas enteras para saber cuál es cuál. La caja arriba las separa de un
   * vistazo y, además, repite en su portada lo que la tarjeta cuenta debajo:
   * el nombre, lo que incluye y la duración. Es la misma promesa que la lista
   * de «Qué incluye», dicha sin palabras.
   *
   * POR PREFIJO DEL CÓDIGO, no por una lista de códigos exactos: igual que
   * `producto.perfil.js` en el servidor. Un grupo que se cree mañana desde el
   * panel con un código que empiece por ARTICULO nace con su caja, sin tocar
   * esto.
   *
   * Devuelve `null` —y no una caja cualquiera— cuando el código no encaja en
   * ninguno: la tarjeta cae entonces en el dibujo genérico de la plantilla,
   * que es un documento a secas. Enseñar la caja de «Artículos Científicos»
   * sobre un producto que no lo es sería una promesa escrita en la portada.
   */
  imagenDe(plan: Plan): string | null {
    // Las membresías de documentos se distinguen entre sí por la duración, que
    // va rotulada en la propia caja: «1 mes» y «3 meses».
    if (plan.kind === 'DOCUMENTO') {
      return plan.durationDays > 30
        ? '/productos/05-preparar-documento-trimestral-caja.svg'
        : '/productos/04-preparar-documento-mensual-caja.svg';
    }

    const codigo = plan.code.toUpperCase();
    if (codigo.startsWith('ARTICULO')) return '/productos/02-articulos-cientificos-caja.svg';
    if (codigo.startsWith('HUMANIZ')) return '/productos/03-humanizador-academico-caja.svg';
    if (codigo.startsWith('METODO')) return '/productos/01-metodo-de-tesis-caja.svg';
    if (codigo.startsWith('TSP')) return '/productos/06-suficiencia-profesional-caja.svg';
    if (codigo.startsWith('INFORME')) return '/productos/07-informes-caja.svg';
    return null;
  }

  /**
   * Cuántas viñetas van destacadas: las tres primeras de la lista escrita.
   *
   * Son las que deciden la compra —las Skills, el panel y la duración— y en
   * una lista de seis todas iguales se leían como requisitos
   * técnicos. Un paquete sin lista escrita destaca dos: el producto y su
   * duración. Las genéricas de detrás no, que sería subrayar «se conecta a tu
   * cuenta» como si fuera el argumento de venta.
   */
  clavesDe(plan: Plan): number {
    return INCLUYE[plan.code] ? 3 : 2;
  }

  // ── Las tarjetas de paquetes ───────────────────────────────────────────

  /**
   * Los paquetes de skills en el orden de la rejilla: método de tesis,
   * artículos empíricos, de revisión, suficiencia profesional, humanizador y,
   * al final, lo que no encaje en ninguno. Por prefijo del código, como
   * `imagenDe`: un grupo nuevo creado desde el panel cae en su sitio.
   */
  readonly ordenSkills = computed(() => {
    const puesto = (plan: Plan): number => {
      const codigo = plan.code.toUpperCase();
      if (codigo.startsWith('METODO')) return this.esElMasElegido(plan) ? 0 : 1;
      if (this.esRevision(plan)) return 3;
      if (codigo.startsWith('ARTICULO')) return 2;
      if (codigo.startsWith('TSP')) return 4;
      if (codigo.startsWith('HUMANIZ')) return 5;
      return 6;
    };
    return [...this.metodo()].sort((a, b) => puesto(a) - puesto(b));
  });

  /** El fondo de la portada: azul el más elegido, verde la suficiencia, gris el resto. */
  tonoDe(plan: Plan): 'azul' | 'verde' | 'gris' {
    if (this.esElMasElegido(plan)) return 'azul';
    if (plan.code.toUpperCase().startsWith('TSP')) return 'verde';
    return 'gris';
  }

  /** El paquete cuya ventana «Qué incluye» está abierta; de inicio, ninguno. */
  private readonly filaAbierta = signal<string | null>(null);

  /**
   * El plan de la ventana abierta. Se busca en lo que hay a la venta ahora: si
   * el catálogo se recarga sin él, la ventana se cierra sola en vez de enseñar
   * un paquete que ya no se puede comprar.
   */
  readonly planAbierto = computed<Plan | null>(() => {
    const codigo = this.filaAbierta();
    if (!codigo) return null;
    return [...this.metodo(), ...this.membresias()].find((plan) => plan.code === codigo) ?? null;
  });

  /**
   * «Humanizador académico: quita los rastros de IA» → [nombre, para qué].
   * En la ventana el nombre va en negrita; uno sin dos puntos va entero.
   */
  partirExtra(extra: string): [string, string] {
    const corte = extra.indexOf(':');
    if (corte < 0) return [extra, ''];
    const resto = extra.slice(corte + 1).trim();
    return [extra.slice(0, corte), resto.charAt(0).toUpperCase() + resto.slice(1)];
  }

  estaAbierta(plan: Plan): boolean {
    return this.filaAbierta() === plan.code;
  }

  abrirFila(plan: Plan): void {
    this.filaAbierta.set(plan.code);
  }

  cerrarFila(): void {
    this.filaAbierta.set(null);
  }

  /** El nombre de la tarjeta: el de venta es largo y repite lo que dicen las etiquetas. */
  nombreFila(plan: Plan): string {
    if (plan.kind === 'DOCUMENTO') {
      // «Edición y Traducción · mensual» → «Mensual»: el título de encima ya lo dice.
      const corto = plan.name.replace(/^.*·\s*/, '');
      return corto.charAt(0).toUpperCase() + corto.slice(1);
    }
    const codigo = plan.code.toUpperCase();
    if (codigo.startsWith('METODO')) return 'Método de Tesis';
    // Los dos de artículos empiezan igual: el de revisión se mira antes.
    if (this.esRevision(plan)) return 'Artículos de Revisión';
    if (codigo.startsWith('ARTICULO')) return 'Artículos Científicos (Empíricos)';
    if (codigo.startsWith('HUMANIZ')) return 'Humanizador Académico';
    if (codigo.startsWith('TSP')) return 'Suficiencia Profesional';
    if (codigo.startsWith('INFORME')) return 'Informes';
    return plan.name;
  }

  /**
   * Una línea de qué es. Las de los paquetes conocidos están escritas para
   * caber en dos o tres renglones de la tarjeta; el resto usa la descripción del
   * catálogo, que es la que se escribió en el panel.
   */
  lemaDe(plan: Plan): string | null {
    if (plan.kind !== 'DOCUMENTO') {
      const codigo = plan.code.toUpperCase();
      if (codigo.startsWith('METODO'))
        return 'Herramientas para desarrollar tu tesis, estructurar cada capítulo y mejorar la claridad de tu redacción.';
      if (codigo.startsWith('TSP'))
        return 'Titúlate con tu experiencia laboral: de la empresa y tu cargo al Word final, sin hipótesis ni instrumento.';
      if (this.esRevision(plan))
        return 'Artículos de revisión sistemática y bibliométrica en todas las disciplinas científicas.';
      if (codigo.startsWith('ARTICULO'))
        return 'Planifica y elabora artículos científicos paso a paso con las Skills de Claude.';
      if (codigo.startsWith('INFORME'))
        return 'Tu informe de curso o de empresa en cinco fases: de la consigna y la rúbrica al Word final.';
      if (codigo.startsWith('HUMANIZ'))
        return 'Un estilo más natural, claro y coherente, conservando el contenido y sentido original de tu texto.';
    }
    return plan.description ?? null;
  }

  /** Lo que trae, de un vistazo: la línea azul de debajo del nombre, unida con «+». */
  etiquetasDe(plan: Plan): string[] {
    if (plan.kind === 'DOCUMENTO') {
      return [`${plan.docsPorMes} documentos al mes`, 'Inglés académico', '4 idiomas'];
    }
    const codigo = plan.code.toUpperCase();
    if (codigo.startsWith('METODO')) return ['9 capítulos', 'Humanizador', 'Reducción de similitud'];
    if (codigo.startsWith('TSP')) return ['Trabajo de suficiencia', 'Humanizador'];
    if (this.esRevision(plan)) return ['Sistemática', 'Bibliométrica', 'Humanizador'];
    if (codigo.startsWith('ARTICULO')) return ['Redacción de artículos', 'Humanizador'];
    if (codigo.startsWith('INFORME')) return ['5 fases', 'Humanizador', 'Reducción de similitud'];
    return [];
  }

  /** Si algún paquete está rebajado: «Cómo pagar» avisa de que es por tiempo limitado. */
  readonly hayOfertas = computed(() =>
    [...this.metodo(), ...this.membresias()].some((plan) => this.ahorro(plan) !== null),
  );

  /**
   * Con qué se puede pagar, para «Cómo pagar». Sale de las pasarelas
   * que anuncia el servidor: si mañana se apaga una, deja de prometerse aquí.
   * Yape o Plin está siempre, porque no depende de ninguna pasarela.
   */
  readonly mediosDePago = computed(() => {
    const medios = ['Yape o Plin'];
    if (this.pasarelaCulqi() && !this.pasarelaHotmart()) medios.push('tarjeta');
    if (this.pasarelaHotmart()) medios.push('tarjeta o PayPal (vía Hotmart)');
    else if (this.pasarelaPaypal()) medios.push('PayPal');
    if (this.datosWU()) medios.push('Western Union');
    return medios;
  });

  /**
   * Las fases de la ruta, si el paquete la tiene. Por prefijo, como `imagenDe`.
   * El Humanizador no sigue ninguna ruta: su pestaña va sin esta columna.
   */
  fasesDe(plan: Plan): { titulo: string; lista: readonly string[]; extras: readonly string[] } | null {
    const codigo = plan.code.toUpperCase();
    // Lo que viene con el paquete sin ser una etapa: va debajo de la lista,
    // con «+» en vez de número. Solo lo que el grupo trae de verdad en el
    // catálogo: si una skill se retira del grupo, se retira de aquí.
    if (codigo.startsWith('METODO')) {
      return {
        titulo: `Las ${ETAPAS_TESIS.length} etapas del método`,
        lista: ETAPAS_TESIS,
        extras: [
          'Humanizador académico: quita los rastros de IA',
          'Bajar similitud: reduce el porcentaje de Turnitin',
          'Análisis cualitativo',
          'Aspectos administrativos',
        ],
      };
    }
    if (this.esRevision(plan)) {
      return {
        titulo: `Las ${FASES_REVISION.length} fases de la revisión`,
        lista: FASES_REVISION,
        extras: ['Humanizador académico: quita los rastros de IA'],
      };
    }
    if (codigo.startsWith('ARTICULO')) {
      return {
        titulo: `Las ${FASES_ARTICULO.length} fases de la ruta`,
        lista: FASES_ARTICULO,
        extras: [
          'Variante bibliométrica (3B)',
          'Humanizador académico: quita los rastros de IA',
        ],
      };
    }
    if (codigo.startsWith('TSP')) {
      return {
        titulo: `Las ${FASES_TSP.length} fases del TSP`,
        lista: FASES_TSP,
        extras: ['Humanizador académico: quita los rastros de IA'],
      };
    }
    if (codigo.startsWith('INFORME')) {
      return {
        titulo: `Las ${FASES_INFORME.length} fases del informe`,
        lista: FASES_INFORME,
        extras: [
          'Humanizador académico: quita los rastros de IA',
          'Bajar similitud: reduce el porcentaje de Turnitin',
        ],
      };
    }
    return null;
  }

  /** El Artículo de Revisión (`ARTICULOS_REVIEW`), que también empieza por ARTICULO. */
  esRevision(plan: Plan): boolean {
    const codigo = plan.code.toUpperCase();
    return codigo.startsWith('ARTICULO') && codigo.includes('REVIEW');
  }

  /** Cualquiera de los dos de artículos: llevan el comparador debajo. */
  esArticulo(plan: Plan): boolean {
    return plan.code.toUpperCase().startsWith('ARTICULO');
  }

}
