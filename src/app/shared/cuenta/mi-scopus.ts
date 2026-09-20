import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { toApiError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import { MisFuentesService } from '../../core/services/mis-fuentes.service';
import {
  BusquedaDeScopus,
  BusquedaGuardadaResumida,
  CuentasAproximadas,
  FacetaExacta,
  EnlaceAbierto,
  EstadoDeScopus,
  FuenteParaResumir,
  ImportacionDeScopus,
  OrdenDeScopus,
  ResultadoDeScopus,
  ResumenConIa,
  ScopusService,
  TemaPropuesto,
} from '../../core/services/scopus.service';
import { AvisoFlotante } from '../layout/aviso-flotante';

/**
 * Buscar en Scopus desde aquí y traerse lo que elija.
 *
 * VA JUNTO A LA SUBIDA DE ARCHIVOS, NO EN SU LUGAR
 * ------------------------------------------------
 * Son la misma pregunta —de dónde salen las fuentes que Claude va a citar— por
 * dos puertas, y las dos tienen que seguir abiertas. El archivo funciona
 * siempre: lo exporta el tesista con el acceso de su universidad y no depende
 * de que Elsevier nos deje entrar. Esto es más cómodo cuando está encendido, y
 * cuando no lo está la tarjeta se comporta como se comportaba antes.
 *
 * TRES DECISIONES QUE SE VEN EN LA PANTALLA
 * -----------------------------------------
 * 1. Nunca se le pide su contraseña de Scopus, ni su usuario, ni una clave de
 *    API. O autoriza en Elsevier, o se busca con la credencial de este
 *    servidor. Aquí no se escribe ninguna credencial suya.
 *
 * 2. Se marca lo que ya tiene, pero no se le esconde. Quien busca en Scopus
 *    quiere ver los mismos artículos que ve en Scopus; quitarle los repetidos
 *    de la lista le haría contarlos mal y desconfiar del buscador.
 *
 * 3. No hay paso de «conectar» mientras se busque con la credencial del
 *    servidor: no habría nada que conectar, y era un clic de trámite entre el
 *    tesista y el buscador. Con el OAuth de Elsevier habilitado vuelve a
 *    aparecer, porque ahí sí se autoriza algo.
 *
 * 4. Con el campo vacío se explica CÓMO ESCRIBIR LA ECUACIÓN DE SU TEMA, no
 *    cómo funciona esto por dentro. Quien mira un campo en blanco no necesita
 *    saber de dónde sale el resumen: necesita saber qué teclear.
 */
interface OpcionDeFaceta {
  /** El código tal como lo entiende Scopus dentro de `CAMPO(…)`. */
  valor: string;
  texto: string;
}

/** Una fila más del buscador: «Agregar campo de búsqueda». */
interface FilaDeBusqueda {
  id: number;
  operador: 'AND' | 'OR' | 'AND NOT';
  campo: string;
  texto: string;
}

/** Una búsqueda de esta sesión, en el historial numerado. */
interface EntradaDeHistorial {
  n: number;
  ecuacion: string;
  total: number;
  cuando: number;
  /** Lo que se buscó, dicho como lo escribió el tesista. Las viejas no lo traen. */
  titulo?: string;
  tipo?: 'normal' | 'avanzada' | 'copiloto' | 'combinada';
  /** Los filtros en palabras: «2020–2024», «Idioma: Español», «Sin Inglés». */
  filtros?: string[];
  /** El buscador tal cual, para volver a él con sus filtros. */
  estado?: Record<string, unknown>;
}

/** Cómo se ordena la lista de la ventana de «Mostrar todo». */
type OrdenDeLaVentana = 'resultados' | 'alfabetico' | 'habitual';

/** Los filtros que Scopus cuenta exactos, y los que se cuentan con OpenAlex. */
const FACETAS_EXACTAS: readonly string[] = ['anio', 'tipo', 'idioma', 'abierto', 'fuente', 'etapa'];
const FACETAS_APROXIMADAS: readonly string[] = ['area', 'pais', 'revista', 'autor', 'afiliacion', 'patrocinador'];

/** Una sección de «Refinar búsqueda». Ver `facetas` en el componente. */
interface Faceta {
  clave: string;
  titulo: string;
  tipo: 'casillas' | 'texto';
  /** El campo de Scopus: `SUBJAREA`, `DOCTYPE`, `AFFILCOUNTRY`… */
  campo: string;
  opciones?: readonly OpcionDeFaceta[];
  /** Cuántas casillas se ven antes de «Mostrar todo». Sin esto, todas. */
  visibles?: number;
  /** El texto de muestra del campo, en las de escribir. */
  ejemplo?: string;
}

@Component({
  selector: 'app-mi-scopus',
  imports: [AvisoFlotante, DecimalPipe, NgTemplateOutlet],
  templateUrl: './mi-scopus.html',
  styleUrls: ['./mi-scopus.css', './mi-scopus-ia.css', './mi-scopus-historial.css'],
})
export class MiScopusPanel implements OnInit {
  private readonly scopus = inject(ScopusService);
  private readonly dialogos = inject(DialogoService);
  private readonly misFuentes = inject(MisFuentesService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly estado = signal<EstadoDeScopus | null>(null);
  readonly cargando = signal(true);
  readonly conectando = signal(false);
  readonly buscando = signal(false);
  readonly importando = signal(false);
  readonly error = signal<string | null>(null);

  readonly busqueda = signal<BusquedaDeScopus | null>(null);
  readonly parte = signal<ImportacionDeScopus | null>(null);

  /**
   * Lo que trajo la vuelta desde Elsevier: ok, cancelado, rechazado o error.
   *
   * Llega en la dirección porque quien redirige es Elsevier y no nosotros. Se
   * lee una vez y se limpia de la barra: recargar la página no debería volver
   * a anunciar algo que pasó hace diez minutos.
   */
  readonly vuelta = signal<string | null>(null);

  /**
   * Búsqueda normal o avanzada, como en la web de Scopus.
   *
   * La normal existe porque la mayoría de tesistas no ha escrito una ecuación
   * en su vida y un campo que pide `TITLE-ABS-KEY(…)` los frena en la puerta:
   * escriben palabras, eligen dónde buscarlas, y la ecuación se arma sola. La
   * avanzada es el campo de siempre, para quien trae la ecuación de Claude.
   *
   * Cada modo guarda su propio texto: cambiar de pestaña no borra lo escrito
   * en la otra.
   */
  readonly modo = signal<'normal' | 'avanzada'>('normal');
  readonly texto = signal('');
  readonly campo = signal('TITLE-ABS-KEY');
  readonly ecuacion = signal('');

  /** Dónde se buscan las palabras en la búsqueda normal. Son campos de Scopus. */
  readonly campos = [
    { valor: 'TITLE-ABS-KEY', texto: 'Título, resumen y palabras clave' },
    { valor: 'TITLE', texto: 'Solo el título' },
    { valor: 'ABS', texto: 'Solo el resumen' },
    { valor: 'KEY', texto: 'Solo las palabras clave' },
    { valor: 'AUTHOR-NAME', texto: 'Autor' },
    { valor: 'SRCTITLE', texto: 'Revista' },
    { valor: 'DOI', texto: 'DOI' },
  ];

  /**
   * Lo escrito en la búsqueda normal, convertido en ecuación.
   *
   * Se quitan los paréntesis: aquí nadie los pone a propósito, y uno sin cerrar
   * haría que Scopus rechazara la búsqueda con un error que el tesista no
   * sabría leer. Las comillas se quedan —una frase exacta sigue sirviendo— y
   * las palabras sueltas Scopus las junta con AND dentro del campo.
   */
  readonly ecuacionNormal = computed(() => {
    let ecuacion = this.primeraFila();
    // Las filas de «Agregar campo de búsqueda», de izquierda a derecha y con
    // paréntesis: Scopus resuelve OR antes que AND y AND antes que AND NOT, y
    // sin ellos «a OR b AND NOT c» no significaría lo que se ve en pantalla.
    // Con el copiloto no cuentan: no se ven.
    if (!this.iaAbierta()) {
      for (const fila of this.filas()) {
        const trozo = this.ecuacionDeTexto(fila.campo, fila.texto);
        if (!trozo) continue;
        ecuacion = ecuacion ? `(${ecuacion}) ${fila.operador} ${trozo}` : trozo;
      }
    }
    return ecuacion;
  });

  /** La primera fila: la de los conceptos y sus sinónimos. */
  private readonly primeraFila = computed(() => {
    if (this.enConceptos()) {
      const campo = this.campo();
      return this.conceptos()
        .map((concepto) => {
          const terminos = [concepto.nombre, ...concepto.sinonimos].map((t) => this.comoFrase(t));
          return `${campo}(${terminos.join(' OR ')})`;
        })
        .join(' AND ');
    }
    const limpio = this.texto().replace(/[(){}]/g, ' ').replace(/\s+/g, ' ').trim();
    return limpio ? `${this.campo()}(${limpio})` : '';
  });

  /**
   * Lo escrito en una fila, como ecuación. Con comas en un campo que admite
   * conceptos, cada trozo es una frase y tienen que estar todos; si no, las
   * palabras sueltas, como siempre.
   */
  private ecuacionDeTexto(campo: string, texto: string): string {
    const conceptos = texto
      .split(/[,;]/)
      .map((trozo) => this.limpio(trozo))
      .filter(Boolean);
    if (conceptos.length === 0) return '';
    if (conceptos.length > 1 && MiScopusPanel.CAMPOS_CON_CONCEPTOS.has(campo)) {
      return `(${conceptos.map((c) => `${campo}(${this.comoFrase(c)})`).join(' AND ')})`;
    }
    return `${campo}(${conceptos.join(' ')})`;
  }

  // ── «Agregar campo de búsqueda» ───────────────────────────────────────────

  readonly filas = signal<FilaDeBusqueda[]>([]);
  private siguienteFila = 1;

  readonly operadores: readonly { valor: FilaDeBusqueda['operador']; texto: string }[] = [
    { valor: 'AND', texto: 'Y' },
    { valor: 'OR', texto: 'O' },
    { valor: 'AND NOT', texto: 'Y NO' },
  ];

  agregarFila(): void {
    this.filas.update((filas) => [
      ...filas,
      { id: this.siguienteFila++, operador: 'AND', campo: 'TITLE-ABS-KEY', texto: '' },
    ]);
  }

  cambiarFila(id: number, cambio: Partial<Omit<FilaDeBusqueda, 'id'>>): void {
    this.filas.update((filas) => filas.map((fila) => (fila.id === id ? { ...fila, ...cambio } : fila)));
  }

  quitarFila(id: number): void {
    this.filas.update((filas) => filas.filter((fila) => fila.id !== id));
  }

  // ── Conceptos separados por comas ─────────────────────────────────────────

  /**
   * Los campos en los que una coma separa conceptos. En autor, revista y DOI
   * la coma es parte de lo que se busca —«Kansal, P.»— y no se toca.
   */
  private static readonly CAMPOS_CON_CONCEPTOS = new Set(['TITLE-ABS-KEY', 'TITLE', 'ABS', 'KEY']);

  /** Los sinónimos de cada concepto, por su nombre en minúsculas. */
  readonly sinonimos = signal<Readonly<Record<string, readonly string[]>>>({});

  /**
   * Lo escrito, partido por comas: cada trozo es un concepto de la búsqueda.
   *
   * «use of AI, critical thinking, college students» son TRES ideas que tienen
   * que aparecer a la vez, no nueve palabras sueltas: sin separarlas, la «AI»
   * del primero se cruzaba con cualquier cosa.
   */
  readonly conceptos = computed(() => {
    const vistos = new Set<string>();
    const sinonimos = this.sinonimos();
    return this.texto()
      .split(/[,;]/)
      .map((trozo) => this.limpio(trozo))
      .filter((nombre) => {
        const clave = nombre.toLowerCase();
        if (!nombre || vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      })
      .map((nombre) => ({ nombre, sinonimos: sinonimos[nombre.toLowerCase()] ?? [] }));
  });

  /**
   * Si la búsqueda normal va por conceptos: en un campo que los admite, con
   * más de uno o con sinónimos. Una sola idea sin comas se busca como siempre,
   * palabra por palabra, para no volver frase exacta lo que no lo era.
   */
  readonly enConceptos = computed(
    () =>
      MiScopusPanel.CAMPOS_CON_CONCEPTOS.has(this.campo()) &&
      (this.conceptos().length > 1 || this.conceptos().some((c) => c.sinonimos.length > 0)),
  );

  /** Un término de varias palabras va entre comillas: es una idea, no palabras sueltas. */
  private comoFrase(termino: string): string {
    const limpio = this.limpio(termino);
    return /\s/.test(limpio) ? `"${limpio}"` : limpio;
  }

  agregarSinonimo(nombre: string, campo: HTMLInputElement): void {
    const valor = this.limpio(campo.value);
    campo.value = '';
    if (!valor) return;
    const clave = nombre.toLowerCase();
    const actuales = this.sinonimos()[clave] ?? [];
    const repetido =
      valor.toLowerCase() === clave ||
      actuales.some((s) => s.toLowerCase() === valor.toLowerCase());
    if (repetido) return;
    this.sinonimos.update((todos) => ({ ...todos, [clave]: [...actuales, valor] }));
  }

  quitarSinonimo(nombre: string, sinonimo: string): void {
    const clave = nombre.toLowerCase();
    this.sinonimos.update((todos) => ({
      ...todos,
      [clave]: (todos[clave] ?? []).filter((s) => s !== sinonimo),
    }));
  }

  /** Quita un concepto del campo, y sus sinónimos con él. */
  quitarConcepto(nombre: string): void {
    const clave = nombre.toLowerCase();
    this.texto.set(
      this.conceptos()
        .filter((c) => c.nombre.toLowerCase() !== clave)
        .map((c) => c.nombre)
        .join(', '),
    );
    this.sinonimos.update((todos) => {
      const copia = { ...todos };
      delete copia[clave];
      return copia;
    });
  }

  /**
   * ¿Lo escribió en español?
   *
   * Casi toda la literatura de Scopus está indexada en inglés, y buscar
   * «pensamiento crítico» da una décima parte que «critical thinking». Se mira
   * por tildes o por dos palabras que solo existen en español; sin pretender
   * acertar siempre: es un aviso, no un bloqueo.
   */
  readonly enEspanol = computed(() => {
    const texto = this.texto().toLowerCase();
    if (!texto.trim() || !MiScopusPanel.CAMPOS_CON_CONCEPTOS.has(this.campo())) return false;
    if (/[áéíóúñ¿¡]/.test(texto)) return true;
    const palabras = texto.match(
      /\b(de|del|la|las|los|el|en|para|con|por|y|uso|estudiantes|universitarios|docentes|pensamiento|aprendizaje|calidad|gestion|nivel|salud|empresa|trabajo)\b/g,
    );
    return (palabras?.length ?? 0) >= 2;
  });

  // ── El generador con IA ───────────────────────────────────────────────────

  /**
   * El «Generador de consultas de IA» de Scopus, hecho con Gemini: describe su
   * tema en español y recibe los conceptos en inglés con sus sinónimos, ya
   * como etiquetas. No busca: propone, y él revisa antes de pulsar «Buscar».
   */
  readonly iaAbierta = signal(false);
  readonly temaIa = signal('');
  readonly generando = signal(false);
  readonly errorIa = signal<string | null>(null);
  readonly notaIa = signal<string | null>(null);

  /**
   * Lo que hizo el copiloto la última vez, para enseñar sus pasos como Scopus
   * («Ocultar pasos del copiloto»): qué entendió, qué añadió y qué quitó.
   */
  readonly ultimaGeneracion = signal<{
    tema: string;
    conceptos: number;
    sinonimos: number;
    nota: string | null;
  } | null>(null);

  readonly pasosAbiertos = signal(false);

  /**
   * Los temas que el copiloto propone investigar, con sus variables.
   *
   * Quien escribe «algo de IA y universitarios» no tiene un tema: tiene una
   * inquietud, y la búsqueda que sale de ahí trae de todo. Estas tarjetas le
   * enseñan en qué se puede convertir eso —qué influye, sobre qué y en
   * quiénes— y cada una busca SU literatura con un botón. No sustituyen a la
   * búsqueda general, que ya se hizo: están encima de ella para afinarla.
   */
  readonly temasPropuestos = signal<TemaPropuesto[]>([]);

  /** El tema por el que se está buscando ahora, para marcar su tarjeta. */
  readonly temaElegido = signal<number | null>(null);

  readonly temasAbiertos = signal(true);

  readonly pasosDelCopiloto = computed(() => {
    const generacion = this.ultimaGeneracion();
    if (!generacion) return [];
    const pasos = [
      `Leí tu tema y lo separé en ${generacion.conceptos} ${generacion.conceptos === 1 ? 'concepto' : 'conceptos'}.`,
      generacion.sinonimos > 0
        ? `Añadí ${generacion.sinonimos} sinónimos en inglés, los que usa de verdad la literatura.`
        : 'No hacían falta sinónimos: los términos ya son los que usa la literatura.',
    ];
    if (generacion.nota) pasos.push(generacion.nota);
    pasos.push('Armé la búsqueda: cada concepto con sus sinónimos (O), y todos los conceptos a la vez (Y).');
    return pasos;
  });

  alternarIa(encendida: boolean): void {
    this.iaAbierta.set(encendida);
    this.errorIa.set(null);
    if (encendida) this.cambiarModo('normal');
  }

  /** En la pregunta del copiloto, Enter propone y Mayúsculas+Enter parte la línea. */
  enterEnPregunta(evento: KeyboardEvent): void {
    if (evento.shiftKey) return;
    evento.preventDefault();
    this.generarConIa();
  }

  /** Desde el aviso de español: lleva lo escrito al generador para pasarlo a inglés. */
  pasarAIngles(): void {
    this.temaIa.set(this.texto());
    this.alternarIa(true);
  }

  generarConIa(): void {
    const tema = this.temaIa().trim();
    if (tema.length < 8 || this.generando()) return;

    this.generando.set(true);
    this.errorIa.set(null);
    this.notaIa.set(null);

    this.scopus.generarConsulta(tema).subscribe({
      next: ({ conceptos, nota, temas }) => {
        this.generando.set(false);
        this.campo.set('TITLE-ABS-KEY');
        this.texto.set(conceptos.map((c) => c.nombre).join(', '));
        this.sinonimos.set(
          Object.fromEntries(conceptos.map((c) => [c.nombre.toLowerCase(), c.sinonimos])),
        );
        this.notaIa.set(nota);
        // Los temas son de ESTA pregunta: los de la anterior ya no valen.
        this.temasPropuestos.set(temas ?? []);
        this.temaElegido.set(null);
        this.temasAbiertos.set(true);
        this.ultimaGeneracion.set({
          tema,
          conceptos: conceptos.length,
          sinonimos: conceptos.reduce((suma, c) => suma + c.sinonimos.length, 0),
          nota,
        });
        // Los pasos y los conceptos se quedan plegados: quien pregunta al
        // copiloto viene a por la respuesta, no a revisar la ecuación. Y se
        // busca en el acto, por significado, con el resumen detrás; y es una
        // conversación nueva, que se guardará sola.
        this.pasosAbiertos.set(false);
        this.conversacionId = null;
        this.orden.set('significado');
        this.buscar(1);
      },
      error: (fallo: unknown) => {
        this.generando.set(false);
        this.errorIa.set(toApiError(fallo).message);
      },
    });
  }

  /**
   * Elegir uno de los temas propuestos: se busca ESE, no la inquietud entera.
   *
   * Hace lo mismo que acabar de preguntar —los conceptos al campo, sus
   * sinónimos, orden por significado y el resumen con citas detrás—, pero con
   * los del tema, y la pregunta del resumen pasa a ser su título, que es lo
   * que ahora se está investigando. Cuenta como conversación nueva: se guarda
   * por su cuenta y no pisa la del tema que se miró antes.
   *
   * Las tarjetas se quedan: casi nadie acierta a la primera, y lo normal es
   * mirar un tema, volver y probar el siguiente.
   */
  elegirTema(tema: TemaPropuesto, indice: number): void {
    if (this.buscando() || this.generando()) return;

    this.campo.set('TITLE-ABS-KEY');
    this.texto.set(tema.conceptos.map((c) => c.nombre).join(', '));
    this.sinonimos.set(
      Object.fromEntries(tema.conceptos.map((c) => [c.nombre.toLowerCase(), c.sinonimos])),
    );
    this.temaElegido.set(indice);
    this.notaIa.set(null);
    this.ultimaGeneracion.set({
      tema: tema.titulo,
      conceptos: tema.conceptos.length,
      sinonimos: tema.conceptos.reduce((suma, c) => suma + c.sinonimos.length, 0),
      nota: tema.relacion,
    });
    this.pasosAbiertos.set(false);
    this.conversacionId = null;
    this.orden.set('significado');
    this.buscar(1);
  }

  /** Las variables del tema, en la línea de su tarjeta. Sin las que no dijo. */
  variablesDelTema(tema: TemaPropuesto): { etiqueta: string; valor: string }[] {
    const filas = [
      { etiqueta: 'Influye', valor: tema.independiente },
      { etiqueta: 'Sobre', valor: tema.dependiente },
      { etiqueta: 'En quiénes', valor: tema.poblacion },
    ];
    return filas.filter((f): f is { etiqueta: string; valor: string } => Boolean(f.valor));
  }

  /** Con qué se buscaría ese tema, para que se vea antes de pulsar. */
  conceptosDelTema(tema: TemaPropuesto): string {
    return tema.conceptos.map((c) => c.nombre).join(' · ');
  }

  // ── El resumen con citas ──────────────────────────────────────────────────

  /**
   * Las preguntas hechas sobre la página que se ve, con su respuesta. La
   * primera es el resumen; las demás, las de seguimiento. Se vacía con cada
   * búsqueda nueva: el resumen es de ESTOS artículos, y con otros ya no vale.
   */
  readonly hilo = signal<{ pregunta: string; resumen: ResumenConIa }[]>([]);
  readonly resumiendo = signal(false);
  readonly errorResumen = signal<string | null>(null);
  readonly resumenAbierto = signal(true);
  readonly seguimiento = signal('');
  readonly referenciaResaltada = signal<number | null>(null);

  /** Los artículos que lee la IA: los diez primeros de la página que se ve. */
  readonly fuentesDelResumen = computed<FuenteParaResumir[]>(() =>
    (this.busqueda()?.resultados ?? []).slice(0, 10).map((r) => ({
      eid: r.eid,
      doi: r.doi,
      titulo: r.titulo,
      anio: r.anio,
    })),
  );

  /** Los mismos, enteros, para la columna de «Referencias». */
  readonly referencias = computed(() => (this.busqueda()?.resultados ?? []).slice(0, 10));

  /** Los números que la IA pudo leer con resumen, del último turno. */
  readonly conResumen = computed(() => new Set(this.hilo().at(-1)?.resumen.conResumen ?? []));

  /** La pregunta por defecto: la del copiloto, o lo que buscó escrito en palabras. */
  private preguntaPorDefecto(): string {
    const generacion = this.ultimaGeneracion();
    if (generacion) return generacion.tema;
    const conceptos = this.conceptos().map((c) => c.nombre);
    return conceptos.length > 0
      ? `¿Qué dice la literatura sobre ${conceptos.join(', ')}?`
      : '¿Qué dicen estos artículos?';
  }

  /** Un turno, en texto plano, para que la IA entienda la de seguimiento. */
  private comoTexto(resumen: ResumenConIa): string {
    const puntos = resumen.secciones.flatMap((s) => s.puntos.map((p) => p.texto));
    return [resumen.introduccion, ...puntos, resumen.conclusion].filter(Boolean).join(' ').slice(0, 2900);
  }

  resumir(pregunta = this.preguntaPorDefecto()): void {
    const fuentes = this.fuentesDelResumen();
    if (fuentes.length === 0 || this.resumiendo()) return;

    this.resumiendo.set(true);
    this.errorResumen.set(null);
    this.resumenAbierto.set(true);

    const anteriores = this.hilo().map((turno) => ({
      pregunta: turno.pregunta,
      respuesta: this.comoTexto(turno.resumen),
    }));

    this.scopus.resumir(pregunta, fuentes, anteriores).subscribe({
      next: (resumen) => {
        this.resumiendo.set(false);
        this.hilo.update((turnos) => [...turnos, { pregunta, resumen }]);
        this.seguimiento.set('');
        if (this.iaAbierta()) this.guardarConversacion();
      },
      error: (fallo: unknown) => {
        this.resumiendo.set(false);
        this.errorResumen.set(toApiError(fallo).message);
      },
    });
  }

  preguntarSeguimiento(): void {
    const pregunta = this.seguimiento().trim();
    if (pregunta.length < 3) return;
    this.resumir(pregunta);
  }

  /** Una cita [n] lleva a su referencia de la columna y la resalta. */
  verReferencia(numero: number): void {
    this.referenciaResaltada.set(numero);
    document
      .getElementById(`sc-ref-${numero}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ── «Ver resumen» en cada resultado ───────────────────────────────────────

  /**
   * Los resúmenes de la página, por DOI en minúsculas. Nulo mientras no se ha
   * abierto ninguno: se piden los de toda la página al abrir el primero, en
   * una sola consulta a OpenAlex, y abrir los demás ya no cuesta nada.
   */
  readonly resumenesDePagina = signal<Record<string, string> | null>(null);
  readonly cargandoResumenes = signal(false);
  readonly resumenesAbiertos = signal<ReadonlySet<string>>(new Set());

  verResumen(resultado: ResultadoDeScopus): void {
    const copia = new Set(this.resumenesAbiertos());
    if (copia.has(resultado.eid)) copia.delete(resultado.eid);
    else copia.add(resultado.eid);
    this.resumenesAbiertos.set(copia);

    if (this.resumenesDePagina() !== null || this.cargandoResumenes()) return;
    const dois = (this.busqueda()?.resultados ?? [])
      .map((r) => r.doi)
      .filter((doi): doi is string => Boolean(doi));
    if (dois.length === 0) return;

    this.cargandoResumenes.set(true);
    this.scopus.resumenes(dois).subscribe({
      next: (resumenes) => {
        this.resumenesDePagina.set(resumenes);
        this.cargandoResumenes.set(false);
      },
      error: () => {
        // Sin resumen no se rompe nada: cada fila dirá que no lo hay.
        this.resumenesDePagina.set({});
        this.cargandoResumenes.set(false);
      },
    });
  }

  resumenDe(resultado: ResultadoDeScopus): string | null {
    if (!resultado.doi) return null;
    return this.resumenesDePagina()?.[resultado.doi.toLowerCase()] ?? null;
  }

  /** Cuántas de las referencias del resumen aún no están en su biblioteca. */
  readonly referenciasPorAnadir = computed(() => this.referencias().filter((r) => !r.yaLaTienes));

  anadirReferencias(): void {
    this.importarEids(this.referenciasPorAnadir().map((r) => r.eid));
  }

  // ── El orden de los resultados ────────────────────────────────────────────

  readonly orden = signal<OrdenDeScopus>('citas');
  readonly menuOrdenResultados = signal(false);

  private readonly todasLasOrdenes: readonly { valor: OrdenDeScopus; texto: string }[] = [
    { valor: 'significado', texto: 'Por significado ✦' },
    { valor: 'citas', texto: 'Más citados' },
    { valor: 'recientes', texto: 'Más recientes' },
    { valor: 'antiguos', texto: 'Más antiguos' },
    { valor: 'relevancia', texto: 'Relevancia' },
  ];

  /** «Por significado» solo cuando hay una pregunta con la que comparar. */
  readonly ordenesDeResultados = computed(() =>
    this.todasLasOrdenes.filter((o) => o.valor !== 'significado' || Boolean(this.preguntaSemantica())),
  );

  readonly textoDelOrdenDeResultados = computed(
    () => this.todasLasOrdenes.find((o) => o.valor === this.orden())?.texto ?? '',
  );

  /** Cambiar el orden vuelve a la primera página: la segunda de otro orden no es la misma. */
  elegirOrdenDeResultados(valor: OrdenDeScopus): void {
    this.menuOrdenResultados.set(false);
    if (valor === this.orden()) return;
    this.orden.set(valor);
    if (this.busqueda()) this.buscar(1);
  }

  /** La ecuación del modo en el que está, sin filtros. */
  private readonly ecuacionBase = computed(() =>
    this.modo() === 'normal' ? this.ecuacionNormal() : this.ecuacion().trim(),
  );

  cambiarModo(modo: 'normal' | 'avanzada'): void {
    if (modo === this.modo()) return;
    // Pasar a avanzada con palabras escritas se lleva la ecuación ya armada:
    // es la forma natural de aprender a escribirla, partiendo de la suya.
    if (modo === 'avanzada' && !this.ecuacion().trim() && this.ecuacionNormal()) {
      this.ecuacion.set(this.ecuacionNormal());
    }
    this.modo.set(modo);
  }

  /**
   * Lo que tiene marcado, por EID.
   *
   * Se vacía al cambiar de página a propósito. Guardar la selección entre
   * páginas suena mejor de lo que es: el servidor importa como mucho una
   * página de golpe, así que una selección que cruza páginas acabaría en un
   * error justo al final, después de haber marcado treinta cosas.
   */
  readonly marcados = signal<ReadonlySet<string>>(new Set());

  readonly cuantosMarcados = computed(() => this.marcados().size);

  /** Si toda la página en pantalla está marcada: la casilla de la cabecera. */
  readonly paginaMarcada = computed(() => {
    const enPantalla = this.busqueda()?.resultados ?? [];
    return enPantalla.length > 0 && enPantalla.every((r) => this.marcados().has(r.eid));
  });

  /** El ejemplo que se ofrece. Es el mismo que arma la skill del método. */
  readonly ejemplo = 'TITLE-ABS-KEY("mobile applications" AND education) AND PUBYEAR > 2019';

  /** El de la búsqueda normal: palabras, en inglés, sin sintaxis. */
  readonly ejemploNormal = 'generative AI, critical thinking, university students';

  /**
   * «Refinar búsqueda»: los mismos filtros que el panel de Scopus.
   *
   * NO VIAJAN APARTE: se convierten en cláusulas de la propia ecuación
   * (`PUBYEAR`, `SUBJAREA`, `DOCTYPE`, `AFFILCOUNTRY`…) y se pegan con AND. Es
   * el mismo lenguaje que usa Scopus en su web, así que el servidor no cambia y
   * lo que se busca es exactamente la ecuación que se enseña debajo: quien la
   * copie y la pegue en Scopus ve los mismos resultados. Todos los códigos se
   * probaron contra la API el 17-sep.
   *
   * SIN CUENTAS JUNTO A CADA OPCIÓN, Y POR QUÉ
   * -----------------------------------------
   * Scopus las da con el parámetro `facets`, pero con nuestra clave contesta
   * «not entitled to access facets»: hace falta token institucional. Sacarlas a
   * mano sería una consulta por opción —unas cincuenta por búsqueda— contra la
   * cuota de la casa. Así que se ofrecen las opciones sin número, que es mejor
   * que un número inventado o calculado sobre veinticinco resultados.
   *
   * Dentro de una sección las opciones se suman (OR: «artículo o ponencia»); entre
   * secciones se restan (AND), igual que en Scopus.
   */
  readonly dentro = signal('');
  readonly modoAnio = signal<'rango' | 'sueltos'>('rango');
  readonly anioDesde = signal('');
  readonly anioHasta = signal('');
  readonly aniosSueltos = signal('');

  /** Lo marcado o escrito en cada faceta, por su clave. */
  readonly seleccion = signal<Readonly<Record<string, readonly string[]>>>({});

  /**
   * Las secciones de la columna de filtros que están abiertas.
   *
   * Empiezan abiertas el año —con sus barras— y el área; las demás plegadas.
   * No es solo por espacio: cada sección abierta pide sus números, y los
   * exactos gastan una consulta a Scopus por opción (el tipo, doce). Se
   * cuentan cuando el tesista abre la sección, no en cada búsqueda.
   */
  readonly abiertas = signal<ReadonlySet<string>>(new Set(['anio', 'area']));

  /** En el móvil la columna de filtros se abre con un botón, encima de la lista. */
  readonly filtrosAbiertos = signal(false);

  /**
   * Las secciones del panel, en el orden de Scopus.
   *
   * `casillas`: una lista cerrada con el código de Scopus de cada opción.
   * `texto`: lo escribe él (un país, una revista, un autor), porque sin facetas
   * no hay de dónde sacar la lista de los que aparecen en su búsqueda.
   */
  readonly facetas: readonly Faceta[] = [
    {
      clave: 'area',
      titulo: 'Área temática',
      tipo: 'casillas',
      campo: 'SUBJAREA',
      visibles: 5,
      opciones: [
        { valor: 'SOCI', texto: 'Ciencias sociales' },
        { valor: 'COMP', texto: 'Ciencias de la computación' },
        { valor: 'BUSI', texto: 'Administración, negocios y contabilidad' },
        { valor: 'PSYC', texto: 'Psicología' },
        { valor: 'MEDI', texto: 'Medicina' },
        { valor: 'ENGI', texto: 'Ingeniería' },
        { valor: 'AGRI', texto: 'Agricultura y biología' },
        { valor: 'ARTS', texto: 'Artes y humanidades' },
        { valor: 'BIOC', texto: 'Bioquímica, genética y biología molecular' },
        { valor: 'CENG', texto: 'Ingeniería química' },
        { valor: 'CHEM', texto: 'Química' },
        { valor: 'DECI', texto: 'Ciencias de la decisión' },
        { valor: 'DENT', texto: 'Odontología' },
        { valor: 'EART', texto: 'Ciencias de la Tierra y planetarias' },
        { valor: 'ECON', texto: 'Economía, econometría y finanzas' },
        { valor: 'ENER', texto: 'Energía' },
        { valor: 'ENVI', texto: 'Ciencias ambientales' },
        { valor: 'HEAL', texto: 'Profesiones de la salud' },
        { valor: 'IMMU', texto: 'Inmunología y microbiología' },
        { valor: 'MATE', texto: 'Ciencia de materiales' },
        { valor: 'MATH', texto: 'Matemáticas' },
        { valor: 'MULT', texto: 'Multidisciplinar' },
        { valor: 'NEUR', texto: 'Neurociencia' },
        { valor: 'NURS', texto: 'Enfermería' },
        { valor: 'PHAR', texto: 'Farmacología, toxicología y farmacia' },
        { valor: 'PHYS', texto: 'Física y astronomía' },
        { valor: 'VETE', texto: 'Veterinaria' },
      ],
    },
    {
      clave: 'tipo',
      titulo: 'Tipo de documento',
      tipo: 'casillas',
      campo: 'DOCTYPE',
      visibles: 4,
      opciones: [
        { valor: 'ar', texto: 'Artículo' },
        { valor: 're', texto: 'Revisión' },
        { valor: 'cp', texto: 'Ponencia de congreso' },
        { valor: 'ch', texto: 'Capítulo de libro' },
        { valor: 'bk', texto: 'Libro' },
        { valor: 'cr', texto: 'Reseña de congreso' },
        { valor: 'ed', texto: 'Editorial' },
        { valor: 'le', texto: 'Carta' },
        { valor: 'no', texto: 'Nota' },
        { valor: 'sh', texto: 'Encuesta breve' },
        { valor: 'dp', texto: 'Artículo de datos' },
        { valor: 'er', texto: 'Fe de erratas' },
      ],
    },
    {
      clave: 'idioma',
      titulo: 'Idioma',
      tipo: 'casillas',
      campo: 'LANGUAGE',
      visibles: 4,
      opciones: [
        { valor: 'english', texto: 'Inglés' },
        { valor: 'spanish', texto: 'Español' },
        { valor: 'portuguese', texto: 'Portugués' },
        { valor: 'french', texto: 'Francés' },
        { valor: 'german', texto: 'Alemán' },
        { valor: 'italian', texto: 'Italiano' },
        { valor: 'chinese', texto: 'Chino' },
        { valor: 'russian', texto: 'Ruso' },
      ],
    },
    {
      clave: 'clave',
      titulo: 'Palabra clave',
      tipo: 'texto',
      campo: 'KEY',
      ejemplo: 'employability',
    },
    {
      clave: 'pais',
      titulo: 'País o territorio',
      tipo: 'texto',
      campo: 'AFFILCOUNTRY',
      ejemplo: 'Peru',
    },
    {
      clave: 'fuente',
      titulo: 'Tipo de fuente',
      tipo: 'casillas',
      campo: 'SRCTYPE',
      opciones: [
        { valor: 'j', texto: 'Revista' },
        { valor: 'p', texto: 'Actas de congreso' },
        { valor: 'b', texto: 'Libro' },
        { valor: 'k', texto: 'Serie de libros' },
        { valor: 'd', texto: 'Revista profesional' },
      ],
    },
    {
      clave: 'revista',
      titulo: 'Título de la fuente',
      tipo: 'texto',
      campo: 'SRCTITLE',
      ejemplo: 'Computers & Education',
    },
    {
      clave: 'autor',
      titulo: 'Autor',
      tipo: 'texto',
      campo: 'AUTHOR-NAME',
      ejemplo: 'Apellido, inicial',
    },
    {
      clave: 'etapa',
      titulo: 'Etapa de publicación',
      tipo: 'casillas',
      campo: 'PUBSTAGE',
      opciones: [
        { valor: 'final', texto: 'Final' },
        { valor: 'aip', texto: 'En prensa' },
      ],
    },
    {
      clave: 'afiliacion',
      titulo: 'Afiliación',
      tipo: 'texto',
      campo: 'AFFIL',
      ejemplo: 'Universidad Nacional Mayor de San Marcos',
    },
    {
      clave: 'patrocinador',
      titulo: 'Patrocinador',
      tipo: 'texto',
      campo: 'FUND-SPONSOR',
      ejemplo: 'CONCYTEC',
    },
    {
      clave: 'abierto',
      titulo: 'Acceso abierto',
      tipo: 'casillas',
      campo: 'OA',
      opciones: [
        { valor: 'all', texto: 'Todo el acceso abierto' },
        { valor: 'publisherfullgold', texto: 'Gold' },
        { valor: 'publisherhybridgold', texto: 'Híbrido gold' },
        { valor: 'publisherfree2read', texto: 'Bronze' },
        { valor: 'repository', texto: 'Green' },
      ],
    },
  ];

  /** Un año que se pueda creer, o nada. Lo demás se ignora sin avisar. */
  private anio(texto: string): number | null {
    const numero = Number(String(texto).trim());
    const tope = new Date().getFullYear() + 1;
    return Number.isInteger(numero) && numero >= 1900 && numero <= tope ? numero : null;
  }

  /**
   * Lo que escribe en una faceta de texto, apto para ir dentro de `CAMPO(…)`.
   *
   * Sin comillas y sin paréntesis: `AUTHOR-NAME("Kansal, P.")` da cero en
   * Scopus y `AUTHOR-NAME(Kansal, P.)` da los suyos, y un paréntesis suelto
   * rompería la ecuación entera.
   */
  private limpio(texto: string): string {
    return texto.replace(/[()"{}]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private clausulaDeAnios(): string | null {
    if (this.modoAnio() === 'sueltos') {
      const anios = [
        ...new Set(
          this.aniosSueltos()
            .split(/[\s,;]+/)
            .map((a) => this.anio(a))
            .filter((a): a is number => a !== null),
        ),
      ].sort();
      if (anios.length === 0) return null;
      const partes = anios.map((a) => `PUBYEAR = ${a}`);
      return partes.length === 1 ? partes[0] : `(${partes.join(' OR ')})`;
    }

    let desde = this.anio(this.anioDesde());
    let hasta = this.anio(this.anioHasta());
    // Escribir los años al revés es un despiste, no una búsqueda vacía.
    if (desde !== null && hasta !== null && desde > hasta) [desde, hasta] = [hasta, desde];
    if (desde !== null && desde === hasta) return `PUBYEAR = ${desde}`;
    // Scopus no tiene «mayor o igual»: se corre un año para que el escrito entre.
    const partes: string[] = [];
    if (desde !== null) partes.push(`PUBYEAR > ${desde - 1}`);
    if (hasta !== null) partes.push(`PUBYEAR < ${hasta + 1}`);
    return partes.length ? partes.join(' AND ') : null;
  }

  /** Las cláusulas que añaden los filtros, ya en el lenguaje de Scopus. */
  readonly clausulas = computed(() => this.construirClausulas());

  /**
   * Las cláusulas de los filtros; `sin` deja fuera una faceta. Para contar las
   * opciones de un filtro se cuenta sobre lo demás: si «Artículo» está marcado,
   * «Revisión» tiene que decir cuántas habría, no cero.
   */
  private construirClausulas(sin: string | null = null): string[] {
    const partes: string[] = [];

    const dentro = this.limpio(this.dentro());
    if (dentro) partes.push(`TITLE-ABS-KEY(${dentro})`);

    if (sin !== 'anio') {
      const anios = this.clausulaDeAnios();
      if (anios) partes.push(anios);
    }

    const seleccion = this.seleccion();
    for (const faceta of this.facetas) {
      if (faceta.clave === sin) continue;
      const valores = seleccion[faceta.clave] ?? [];
      if (valores.length === 0) continue;
      const trozos = valores.map((valor) => `${faceta.campo}(${valor})`);
      partes.push(trozos.length === 1 ? trozos[0] : `(${trozos.join(' OR ')})`);
    }
    return partes;
  }

  /**
   * Lo excluido («todo menos esto»), por faceta. Va en un solo `AND NOT (… OR …)`
   * al final: Scopus resuelve AND NOT lo último, y varios sueltos se
   * encadenarían de una forma que nadie espera. Probado contra la API.
   */
  readonly exclusiones = signal<Readonly<Record<string, readonly string[]>>>({});

  private construirExclusiones(sin: string | null = null): string[] {
    const exclusiones = this.exclusiones();
    return this.facetas.flatMap((faceta) =>
      faceta.clave === sin
        ? []
        : (exclusiones[faceta.clave] ?? []).map((valor) => `${faceta.campo}(${valor})`),
    );
  }

  readonly clausulasExcluidas = computed(() => this.construirExclusiones());

  readonly hayFiltros = computed(
    () => this.clausulas().length > 0 || this.clausulasExcluidas().length > 0,
  );
  readonly cuantosFiltros = computed(
    () => this.clausulas().length + this.clausulasExcluidas().length,
  );

  excluido(faceta: Faceta, valor: string): boolean {
    return (this.exclusiones()[faceta.clave] ?? []).includes(valor);
  }

  valoresExcluidosDe(faceta: Faceta): readonly string[] {
    return this.exclusiones()[faceta.clave] ?? [];
  }

  /** Excluir, o dejar de excluir. Una opción no puede estar a la vez dentro y fuera. */
  alternarExclusion(faceta: Faceta, valor: string): void {
    const actuales = this.valoresExcluidosDe(faceta);
    const excluir = !actuales.includes(valor);
    this.exclusiones.update((e) => ({
      ...e,
      [faceta.clave]: excluir ? [...actuales, valor] : actuales.filter((v) => v !== valor),
    }));
    if (excluir && this.marcado(faceta, valor)) {
      this.seleccion.update((s) => ({
        ...s,
        [faceta.clave]: (s[faceta.clave] ?? []).filter((v) => v !== valor),
      }));
    }
    this.filtrar();
  }

  /** En las de escribir: el valor pasa de incluido a excluido y al revés. */
  invertirValor(faceta: Faceta, valor: string): void {
    if (this.excluido(faceta, valor)) {
      this.exclusiones.update((e) => ({
        ...e,
        [faceta.clave]: (e[faceta.clave] ?? []).filter((v) => v !== valor),
      }));
      this.seleccion.update((s) => ({ ...s, [faceta.clave]: [...(s[faceta.clave] ?? []), valor] }));
      this.filtrar();
    } else {
      this.alternarExclusion(faceta, valor);
    }
  }

  quitarExcluido(faceta: Faceta, valor: string): void {
    this.exclusiones.update((e) => ({
      ...e,
      [faceta.clave]: (e[faceta.clave] ?? []).filter((v) => v !== valor),
    }));
    this.filtrar();
  }

  // ── Los números de los filtros ────────────────────────────────────────────

  /** Por faceta: la ecuación con la que se contó y lo que salió. */
  readonly cuentasExactas = signal<Readonly<Record<string, { ecuacion: string; n: Record<string, number | null> }>>>({});
  readonly contando = signal<ReadonlySet<string>>(new Set());
  readonly aproximadas = signal<{ clave: string; datos: CuentasAproximadas } | null>(null);
  readonly contandoAproximadas = signal(false);

  /** La ecuación sobre la que se cuentan las opciones de una faceta: todo menos ella. */
  private ecuacionParaContar(clave: string): string {
    const base = this.ecuacionBase();
    if (!base) return '';
    const incluidas = this.construirClausulas(clave);
    const excluidas = this.construirExclusiones(clave);
    let ecuacion = incluidas.length ? [`(${base})`, ...incluidas].join(' AND ') : base;
    if (excluidas.length) ecuacion = `(${ecuacion}) AND NOT (${excluidas.join(' OR ')})`;
    return ecuacion;
  }

  /**
   * Pide los números de las secciones abiertas que no los tengan para esta
   * búsqueda. Se llama al llegar resultados y al abrir una sección: los
   * números cuestan consultas, y una sección cerrada no los necesita.
   */
  private cargarCuentas(): void {
    if (!this.busqueda() || this.iaAbierta() || this.orden() === 'significado') return;
    const abiertas = this.abiertas();

    for (const clave of FACETAS_EXACTAS) {
      if (!abiertas.has(clave) || this.contando().has(clave)) continue;
      const ecuacion = this.ecuacionParaContar(clave);
      if (!ecuacion || this.cuentasExactas()[clave]?.ecuacion === ecuacion) continue;

      this.contando.update((c) => new Set([...c, clave]));
      this.scopus.cuentas(ecuacion, clave as FacetaExacta).subscribe({
        next: (n) => {
          this.cuentasExactas.update((todas) => ({ ...todas, [clave]: { ecuacion, n } }));
          this.dejarDeContar(clave);
        },
        error: () => this.dejarDeContar(clave),
      });
    }

    if (!FACETAS_APROXIMADAS.some((clave) => abiertas.has(clave))) return;
    const conceptos = this.conceptosParaContar();
    if (conceptos.length === 0 || this.contandoAproximadas()) return;
    const desde = this.anio(this.anioDesde());
    const hasta = this.anio(this.anioHasta());
    const clave = JSON.stringify({ conceptos, desde, hasta });
    if (this.aproximadas()?.clave === clave) return;

    this.contandoAproximadas.set(true);
    this.scopus.aproximadas(conceptos, desde, hasta).subscribe({
      next: (datos) => {
        this.aproximadas.set({ clave, datos });
        this.contandoAproximadas.set(false);
      },
      error: () => this.contandoAproximadas.set(false),
    });
  }

  private dejarDeContar(clave: string): void {
    this.contando.update((c) => new Set([...c].filter((x) => x !== clave)));
  }

  /**
   * Los conceptos para preguntarle a OpenAlex. Solo con la búsqueda normal en
   * título, resumen o palabras clave: una ecuación avanzada no se puede
   * traducir a OpenAlex sin inventarse la mitad.
   */
  private conceptosParaContar(): { nombre: string; sinonimos: string[] }[] {
    if (this.modo() !== 'normal' || !MiScopusPanel.CAMPOS_CON_CONCEPTOS.has(this.campo())) return [];
    return this.conceptos().map((c) => ({ nombre: c.nombre, sinonimos: [...c.sinonimos] }));
  }

  /** Si los números de una faceta exacta son de la búsqueda que se ve. */
  private numerosDe(clave: string): Record<string, number | null> | null {
    const guardadas = this.cuentasExactas()[clave];
    return guardadas && guardadas.ecuacion === this.ecuacionParaContar(clave) ? guardadas.n : null;
  }

  /** El número de una opción: exacto, aproximado (área) o nada. */
  cuentaDe(faceta: Faceta, valor: string): { n: number; aprox: boolean } | null {
    const exactas = this.numerosDe(faceta.clave);
    if (exactas) {
      const n = exactas[valor];
      return typeof n === 'number' ? { n, aprox: false } : null;
    }
    if (faceta.clave === 'area') {
      const encontrada = this.aproximadas()?.datos.grupos['area']?.find((g) => g.valor === valor);
      return encontrada ? { n: encontrada.n, aprox: true } : null;
    }
    return null;
  }

  esExacta(clave: string): boolean {
    return FACETAS_EXACTAS.includes(clave);
  }

  esAproximada(clave: string): boolean {
    return FACETAS_APROXIMADAS.includes(clave);
  }

  contandoFaceta(clave: string): boolean {
    return this.esExacta(clave) ? this.contando().has(clave) : this.esAproximada(clave) && this.contandoAproximadas();
  }

  /** Sugerencias con número para las de escribir (país, revista, autor…). */
  sugerencias(faceta: Faceta): { valor: string; texto: string; n: number }[] {
    const ya = new Set([...this.valoresDe(faceta), ...this.valoresExcluidosDe(faceta)].map((v) => v.toLowerCase()));
    return (this.aproximadas()?.datos.grupos[faceta.clave] ?? [])
      .filter((g) => !ya.has(g.valor.toLowerCase()))
      .slice(0, 5);
  }

  agregarValor(faceta: Faceta, valor: string): void {
    const limpio = this.limpio(valor);
    if (!limpio || this.valoresDe(faceta).includes(limpio)) return;
    this.seleccion.update((s) => ({ ...s, [faceta.clave]: [...this.valoresDe(faceta), limpio] }));
    this.filtrar();
  }

  /** Las barras de los años: los diez últimos con su número exacto. */
  readonly barrasDeAnios = computed(() => {
    // Se leen las señales de las que depende para recalcular a tiempo.
    this.cuentasExactas();
    this.seleccion();
    this.anioDesde();
    this.anioHasta();
    const numeros = this.numerosDe('anio');
    if (!numeros) return [];
    const valores = Object.entries(numeros).map(([anio, n]) => ({ anio, n: n ?? 0 }));
    const maximo = Math.max(1, ...valores.map((v) => v.n));
    return valores.map((v) => ({ ...v, alto: Math.max(4, Math.round((v.n / maximo) * 100)) }));
  });

  /** Una barra elige ese año, como en Scopus. */
  elegirAnio(anio: string): void {
    this.modoAnio.set('rango');
    this.anioDesde.set(anio);
    this.anioHasta.set(anio);
    this.filtrar();
  }

  marcado(faceta: Faceta, valor: string): boolean {
    return (this.seleccion()[faceta.clave] ?? []).includes(valor);
  }

  valoresDe(faceta: Faceta): readonly string[] {
    return this.seleccion()[faceta.clave] ?? [];
  }

  /**
   * Lo que se ve de una faceta de casillas en la columna: las primeras y, más
   * abajo del corte, las que estén marcadas, que tienen que verse siempre. El
   * resto se elige en la ventana de «Mostrar todo».
   */
  opcionesVisibles(faceta: Faceta): readonly OpcionDeFaceta[] {
    let opciones = faceta.opciones ?? [];
    // Con números, primero las que más tienen, como en Scopus.
    if (opciones.some((o) => this.cuentaDe(faceta, o.valor))) {
      opciones = [...opciones].sort(
        (a, b) => (this.cuentaDe(faceta, b.valor)?.n ?? -1) - (this.cuentaDe(faceta, a.valor)?.n ?? -1),
      );
    }
    if (!faceta.visibles) return opciones;
    return opciones.filter(
      (opcion, i) =>
        i < faceta.visibles! || this.marcado(faceta, opcion.valor) || this.excluido(faceta, opcion.valor),
    );
  }

  tieneMas(faceta: Faceta): boolean {
    return Boolean(faceta.visibles && (faceta.opciones?.length ?? 0) > faceta.visibles);
  }

  alternarSeccion(clave: string): void {
    const copia = new Set(this.abiertas());
    if (copia.has(clave)) copia.delete(clave);
    else copia.add(clave);
    this.abiertas.set(copia);
    this.cargarCuentas();
  }

  // ── «Mostrar todo»: la ventana emergente ───────────────────────────────────

  /**
   * La faceta cuya lista completa está abierta, o nada.
   *
   * La ventana trabaja sobre un BORRADOR y no sobre la selección: marcar cinco
   * áreas no lanza cinco búsquedas contra la cuota de la casa, y «Cancelar»
   * deja las cosas como estaban. Solo «Aplicar» toca la búsqueda.
   */
  readonly modalFaceta = signal<Faceta | null>(null);
  readonly borrador = signal<ReadonlySet<string>>(new Set());
  readonly filtroModal = signal('');
  readonly ordenModal = signal<OrdenDeLaVentana>('alfabetico');

  /** El menú de «Ordenar por» de la ventana, abierto o cerrado. */
  readonly menuOrden = signal(false);

  /** Si las opciones de la ventana ya tienen su número de resultados. */
  readonly modalConNumeros = computed(() => {
    const faceta = this.modalFaceta();
    return Boolean(faceta && (faceta.opciones ?? []).some((o) => this.cuentaDe(faceta, o.valor)));
  });

  /** Si la faceta de la ventana es de las que llevan número, aunque aún no lo tenga. */
  readonly modalCuenta = computed(() => {
    const faceta = this.modalFaceta();
    // El área se cuenta con OpenAlex, que solo entiende la búsqueda normal.
    return Boolean(
      faceta && (this.esExacta(faceta.clave) || (faceta.clave === 'area' && this.modo() === 'normal')),
    );
  });

  /** «Más resultados» solo tiene sentido cuando hay números con los que ordenar. */
  readonly ordenes = computed(() => [
    ...(this.modalConNumeros() ? [{ valor: 'resultados' as const, texto: 'Más resultados' }] : []),
    { valor: 'alfabetico' as const, texto: 'Alfabético' },
    { valor: 'habitual' as const, texto: 'Más usadas en tesis' },
  ]);

  readonly textoDelOrden = computed(
    () => this.ordenes().find((orden) => orden.valor === this.ordenModal())?.texto ?? 'Alfabético',
  );

  elegirOrden(valor: OrdenDeLaVentana): void {
    this.ordenModal.set(valor);
    this.menuOrden.set(false);
  }

  /** Las opciones de la ventana, filtradas por lo que escribe y en su orden. */
  readonly opcionesModal = computed(() => {
    const faceta = this.modalFaceta();
    if (!faceta) return [];
    const buscado = this.sinTildes(this.filtroModal().trim());
    const opciones = (faceta.opciones ?? []).filter(
      (opcion) => !buscado || this.sinTildes(opcion.texto).includes(buscado),
    );
    if (this.ordenModal() === 'resultados' && this.modalConNumeros()) {
      // Como en la columna: primero las que más tienen; sin número, al final.
      return [...opciones].sort(
        (a, b) =>
          (this.cuentaDe(faceta, b.valor)?.n ?? -1) - (this.cuentaDe(faceta, a.valor)?.n ?? -1) ||
          a.texto.localeCompare(b.texto, 'es'),
      );
    }
    return this.ordenModal() === 'habitual'
      ? opciones
      : [...opciones].sort((a, b) => a.texto.localeCompare(b.texto, 'es'));
  });

  private sinTildes(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  abrirModal(faceta: Faceta): void {
    this.borrador.set(new Set(this.valoresDe(faceta)));
    this.filtroModal.set('');
    this.modalFaceta.set(faceta);
    // Si la columna ya enseña números, la ventana abre ordenada por ellos,
    // igual que Scopus; si no, por orden alfabético.
    this.ordenModal.set(this.modalConNumeros() ? 'resultados' : 'alfabetico');
    this.cargarCuentas();
  }

  cerrarModal(): void {
    this.menuOrden.set(false);
    this.modalFaceta.set(null);
  }

  alternarBorrador(valor: string): void {
    const copia = new Set(this.borrador());
    if (copia.has(valor)) copia.delete(valor);
    else copia.add(valor);
    this.borrador.set(copia);
  }

  /** Aplica lo marcado en la ventana, en el orden de la lista y no del clic. */
  aplicarModal(): void {
    const faceta = this.modalFaceta();
    if (!faceta) return;
    const elegidas = (faceta.opciones ?? [])
      .map((opcion) => opcion.valor)
      .filter((valor) => this.borrador().has(valor));
    this.seleccion.update((s) => ({ ...s, [faceta.clave]: elegidas }));
    this.modalFaceta.set(null);
    this.filtrar();
  }

  /** Escape cierra la ventana, como cierra cualquier cosa que se abre encima. */
  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    // Escape cierra lo que esté más arriba: primero el menú, después la ventana.
    if (this.menuOrdenResultados()) this.menuOrdenResultados.set(false);
    else if (this.menuOrden()) this.menuOrden.set(false);
    else if (this.historialAbierto()) this.historialAbierto.set(false);
    else if (this.modalFaceta()) this.cerrarModal();
    else if (this.parte()) this.cerrarParte();
  }

  /** Cierra la ventana de «fuentes añadidas». */
  cerrarParte(): void {
    this.parte.set(null);
  }

  /** «Consulta avanzada»: el interruptor de encima del buscador. */
  alternarAvanzada(encendida: boolean): void {
    if (encendida) this.iaAbierta.set(false);
    this.cambiarModo(encendida ? 'avanzada' : 'normal');
  }

  /**
   * «26(1), 534»: volumen, número y páginas, como los pinta Scopus debajo de
   * la revista. Solo lo que haya: muchas fichas de congreso no traen número.
   */
  detalleDeFuente(resultado: ResultadoDeScopus): string {
    const volumen = resultado.volumen
      ? `${resultado.volumen}${resultado.numero ? `(${resultado.numero})` : ''}`
      : '';
    return [volumen, resultado.paginas].filter(Boolean).join(', ');
  }

  alternar(faceta: Faceta, valor: string): void {
    const actuales = this.valoresDe(faceta);
    const incluir = !actuales.includes(valor);
    const nuevos = incluir ? [...actuales, valor] : actuales.filter((v) => v !== valor);
    this.seleccion.update((s) => ({ ...s, [faceta.clave]: nuevos }));
    if (incluir && this.excluido(faceta, valor)) {
      this.exclusiones.update((e) => ({
        ...e,
        [faceta.clave]: (e[faceta.clave] ?? []).filter((v) => v !== valor),
      }));
    }
    this.filtrar();
  }

  /** Añade lo escrito en una faceta de texto. Lo repetido no entra dos veces. */
  agregar(faceta: Faceta, campo: HTMLInputElement): void {
    const valor = this.limpio(campo.value);
    campo.value = '';
    if (!valor || this.valoresDe(faceta).some((v) => v.toLowerCase() === valor.toLowerCase())) {
      return;
    }
    this.seleccion.update((s) => ({ ...s, [faceta.clave]: [...this.valoresDe(faceta), valor] }));
    this.filtrar();
  }

  quitar(faceta: Faceta, valor: string): void {
    this.seleccion.update((s) => ({
      ...s,
      [faceta.clave]: this.valoresDe(faceta).filter((v) => v !== valor),
    }));
    this.filtrar();
  }

  cambiarModoAnio(modo: 'rango' | 'sueltos'): void {
    if (modo === this.modoAnio()) return;
    const antes = this.clausulaDeAnios();
    this.modoAnio.set(modo);
    // Solo se vuelve a buscar si el cambio de modo cambia de verdad la ecuación.
    if (antes !== this.clausulaDeAnios()) this.filtrar();
  }

  /**
   * La ecuación escrita con los filtros pegados.
   *
   * La del tesista va entre paréntesis: sin ellos, un `OR` suyo se comería el
   * primer filtro y `a OR b AND PUBYEAR > 2019` filtraría solo la mitad.
   */
  readonly ecuacionCompleta = computed(() => {
    const ecuacion = this.ecuacionBase();
    // Con el copiloto, los filtros de la columna no se ven y tampoco cuentan:
    // aplicar algo que no está a la vista daría resultados que no se explican.
    // Siguen guardados y vuelven al apagarlo.
    const clausulas = this.iaAbierta() ? [] : this.clausulas();
    const excluidas = this.iaAbierta() ? [] : this.clausulasExcluidas();
    if (!ecuacion) return '';
    let completa = clausulas.length ? [`(${ecuacion})`, ...clausulas].join(' AND ') : ecuacion;
    if (excluidas.length) completa = `(${completa}) AND NOT (${excluidas.join(' OR ')})`;
    return completa;
  });

  // ── El historial de esta sesión ───────────────────────────────────────────

  /**
   * Las búsquedas de esta sesión, numeradas como en Scopus, para volver a una
   * o combinar varias (#2 AND #4). Vive en la pestaña: `sessionStorage`, que se
   * va al cerrarla. Lo que se quiere conservar se guarda con «Guardar búsqueda».
   */
  readonly historial = signal<EntradaDeHistorial[]>(this.leerHistorial());
  readonly historialAbierto = signal(false);
  readonly elegidasDelHistorial = signal<ReadonlySet<number>>(new Set());
  readonly operadorCombinar = signal<'AND' | 'OR' | 'AND NOT'>('AND');
  /** Las entradas con la ecuación desplegada. */
  readonly ecuacionesAbiertas = signal<ReadonlySet<number>>(new Set());
  /** Lo que diga «Combinar» para la entrada que va a crear, en vez de describir el buscador. */
  private proximaCombinada: { titulo: string; filtros: string[] } | null = null;

  /** Qué hace cada forma de combinar, dicho en cristiano. */
  readonly explicacionDeCombinar: Readonly<Record<'AND' | 'OR' | 'AND NOT', string>> = {
    AND: 'Solo los documentos que aparecen en todas las marcadas.',
    OR: 'Los documentos de cualquiera de las marcadas, juntos.',
    'AND NOT': 'Los de la primera marcada, quitando los que salen en las demás.',
  };

  /** Cómo se leerá la combinación: «#2 Y #4». */
  readonly vistaDeCombinar = computed(() => {
    const texto = this.operadores.find((o) => o.valor === this.operadorCombinar())?.texto ?? 'Y';
    return this.historial()
      .filter((e) => this.elegidasDelHistorial().has(e.n))
      .map((e) => `#${e.n}`)
      .join(` ${texto} `);
  });

  private leerHistorial(): EntradaDeHistorial[] {
    try {
      const guardado = JSON.parse(sessionStorage.getItem('scopus-historial') ?? '[]');
      return Array.isArray(guardado) ? guardado.slice(-30) : [];
    } catch {
      return [];
    }
  }

  private anotarEnHistorial(ecuacion: string, total: number): void {
    const lista = this.historial();
    const ultima = lista.at(-1);
    let nueva: EntradaDeHistorial[];
    if (ultima && ultima.ecuacion === ecuacion) {
      nueva = [...lista.slice(0, -1), { ...ultima, total, cuando: Date.now() }];
    } else {
      const n = (lista.at(-1)?.n ?? 0) + 1;
      const combinada = this.proximaCombinada;
      const descripcion = combinada
        ? { ...combinada, tipo: 'combinada' as const }
        : { ...this.describirBusqueda(), estado: this.estadoActual() };
      nueva = [...lista, { n, ecuacion, total, cuando: Date.now(), ...descripcion }].slice(-30);
    }
    this.proximaCombinada = null;
    this.historial.set(nueva);
    try {
      sessionStorage.setItem('scopus-historial', JSON.stringify(nueva));
    } catch {
      // Sin almacenamiento, el historial vive hasta recargar. No es grave.
    }
  }

  elegirDelHistorial(n: number): void {
    const copia = new Set(this.elegidasDelHistorial());
    if (copia.has(n)) copia.delete(n);
    else copia.add(n);
    this.elegidasDelHistorial.set(copia);
  }

  /**
   * Vuelve a una del historial. Si se guardó cómo estaba el buscador, vuelve
   * así, con sus filtros y en su modo; si no (las combinadas y las viejas),
   * con la ecuación en la consulta avanzada. Nunca con el copiloto encendido:
   * volver a una búsqueda no es volver a pedirle un resumen a la IA.
   */
  relanzar(entrada: EntradaDeHistorial): void {
    if (this.buscando()) return;
    this.historialAbierto.set(false);
    // Las del copiloto, por su ecuación: sin la IA, su estado no sabe rehacerla.
    if (!entrada.estado || entrada.tipo === 'copiloto') {
      this.lanzarEcuacion(entrada.ecuacion);
      return;
    }
    this.restaurarEstado(entrada.estado);
    this.iaAbierta.set(false);
    this.buscar(1);
  }

  /** «Combinar consultas»: las elegidas, unidas con Y, O o Y NO. */
  combinar(): void {
    const elegidas = this.historial().filter((e) => this.elegidasDelHistorial().has(e.n));
    if (elegidas.length < 2) return;
    this.historialAbierto.set(false);
    this.proximaCombinada = { titulo: `Combinación ${this.vistaDeCombinar()}`, filtros: [] };
    this.elegidasDelHistorial.set(new Set());
    this.lanzarEcuacion(elegidas.map((e) => `(${e.ecuacion})`).join(` ${this.operadorCombinar()} `));
  }

  desmarcarHistorial(): void {
    this.elegidasDelHistorial.set(new Set());
  }

  alternarEcuacion(n: number): void {
    const copia = new Set(this.ecuacionesAbiertas());
    if (copia.has(n)) copia.delete(n);
    else copia.add(n);
    this.ecuacionesAbiertas.set(copia);
  }

  vaciarHistorial(): void {
    this.historial.set([]);
    this.elegidasDelHistorial.set(new Set());
    try {
      sessionStorage.removeItem('scopus-historial');
    } catch {
      // Igual que al anotar.
    }
  }

  /** «hace 5 min»: el historial es de esta pestaña, así que basta con minutos y horas. */
  haceCuanto(cuando: number): string {
    const minutos = Math.round((Date.now() - cuando) / 60_000);
    if (minutos < 1) return 'hace un momento';
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.round(minutos / 60);
    return horas === 1 ? 'hace 1 hora' : `hace ${horas} horas`;
  }

  /** Lo que se está buscando ahora, en palabras, para el historial. */
  private describirBusqueda(): Pick<EntradaDeHistorial, 'titulo' | 'tipo' | 'filtros'> {
    const generacion = this.ultimaGeneracion();
    let titulo: string;
    let tipo: EntradaDeHistorial['tipo'];
    if (this.iaAbierta() && generacion) {
      titulo = generacion.tema;
      tipo = 'copiloto';
    } else if (this.modo() === 'normal') {
      const campo = this.campos.find((c) => c.valor === this.campo());
      titulo = this.texto().trim();
      for (const fila of this.filas()) {
        if (!fila.texto.trim()) continue;
        const operador = this.operadores.find((o) => o.valor === fila.operador)?.texto ?? 'Y';
        titulo += ` ${operador} ${fila.texto.trim()}`;
      }
      if (campo && this.campo() !== 'TITLE-ABS-KEY') titulo += ` · ${campo.texto}`;
      tipo = 'normal';
    } else {
      titulo = this.ecuacion().trim();
      tipo = 'avanzada';
    }
    if (titulo.length > 140) titulo = `${titulo.slice(0, 137)}…`;
    // Con el copiloto los filtros no cuentan: la búsqueda los ignora.
    return { titulo, tipo, filtros: tipo === 'copiloto' ? [] : this.filtrosEnPalabras() };
  }

  /** Los filtros puestos, uno por ficha, en palabras. */
  private filtrosEnPalabras(): string[] {
    const fichas: string[] = [];
    const desde = this.anioDesde().trim();
    const hasta = this.anioHasta().trim();
    if (this.modoAnio() === 'sueltos' && this.aniosSueltos().trim()) {
      fichas.push(`Años: ${this.aniosSueltos().trim()}`);
    } else if (desde && hasta) {
      fichas.push(desde === hasta ? `Año ${desde}` : `${desde}–${hasta}`);
    } else if (desde) {
      fichas.push(`Desde ${desde}`);
    } else if (hasta) {
      fichas.push(`Hasta ${hasta}`);
    }
    if (this.dentro().trim()) fichas.push(`Dentro: «${this.dentro().trim()}»`);
    const textoDe = (faceta: Faceta, valor: string) =>
      faceta.opciones?.find((o) => o.valor === valor)?.texto ?? valor;
    for (const faceta of this.facetas) {
      const puestas = this.seleccion()[faceta.clave] ?? [];
      if (puestas.length) fichas.push(`${faceta.titulo}: ${puestas.map((v) => textoDe(faceta, v)).join(', ')}`);
      const fuera = this.exclusiones()[faceta.clave] ?? [];
      if (fuera.length) fichas.push(`Sin ${fuera.map((v) => textoDe(faceta, v)).join(', ')}`);
    }
    return fichas;
  }

  borrarDelHistorial(n: number): void {
    const nueva = this.historial().filter((e) => e.n !== n);
    this.historial.set(nueva);
    this.elegidasDelHistorial.update((s) => new Set([...s].filter((x) => x !== n)));
    try {
      sessionStorage.setItem('scopus-historial', JSON.stringify(nueva));
    } catch {
      // Igual que al anotar.
    }
  }

  /**
   * Busca una ecuación ya completa en la consulta avanzada. Los filtros de la
   * columna se vacían sin buscar: la ecuación ya los lleva dentro, y dejarlos
   * los pegaría otra vez.
   */
  private lanzarEcuacion(ecuacion: string): void {
    this.iaAbierta.set(false);
    this.modo.set('avanzada');
    this.ecuacion.set(ecuacion);
    this.vaciarFiltros();
    if (this.orden() === 'significado') this.orden.set('citas');
    this.buscar(1);
  }

  private vaciarFiltros(): void {
    this.dentro.set('');
    this.anioDesde.set('');
    this.anioHasta.set('');
    this.aniosSueltos.set('');
    this.seleccion.set({});
    this.exclusiones.set({});
  }

  // ── Búsquedas guardadas y conversaciones del copiloto ─────────────────────

  readonly guardadas = signal<BusquedaGuardadaResumida[] | null>(null);
  readonly panelGuardadas = signal(false);
  readonly errorGuardadas = signal<string | null>(null);
  readonly avisoGuardada = signal<string | null>(null);
  /** La conversación del copiloto que se está escribiendo, para ir añadiéndole preguntas. */
  private conversacionId: string | null = null;
  /** El hilo de una conversación que se acaba de abrir, a la espera de sus resultados. */
  private hiloPendiente: { pregunta: string; resumen: ResumenConIa }[] | null = null;

  /** La lista, por fechas, como en la IA de Scopus. */
  readonly guardadasPorFecha = computed(() => {
    const ahora = new Date();
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
    const dia = 24 * 60 * 60 * 1000;
    const grupos: { titulo: string; lista: BusquedaGuardadaResumida[] }[] = [
      { titulo: 'Hoy', lista: [] },
      { titulo: 'Últimos 7 días', lista: [] },
      { titulo: 'Últimos 30 días', lista: [] },
      { titulo: 'Antes', lista: [] },
    ];
    for (const g of this.guardadas() ?? []) {
      const cuando = new Date(g.updatedAt).getTime();
      const i = cuando >= hoy ? 0 : cuando >= hoy - 7 * dia ? 1 : cuando >= hoy - 30 * dia ? 2 : 3;
      grupos[i].lista.push(g);
    }
    return grupos.filter((g) => g.lista.length > 0);
  });

  abrirPanelGuardadas(): void {
    this.panelGuardadas.set(true);
    this.errorGuardadas.set(null);
    this.scopus.guardadas().subscribe({
      next: (lista) => this.guardadas.set(lista),
      error: (fallo: unknown) => this.errorGuardadas.set(toApiError(fallo).message),
    });
  }

  /** El estado del buscador, para volver a él tal cual. */
  private estadoActual(): Record<string, unknown> {
    return {
      v: 1,
      modo: this.modo(),
      texto: this.texto(),
      campo: this.campo(),
      sinonimos: this.sinonimos(),
      ecuacion: this.ecuacion(),
      temaIa: this.temaIa(),
      iaAbierta: this.iaAbierta(),
      ultimaGeneracion: this.ultimaGeneracion(),
      orden: this.orden(),
      dentro: this.dentro(),
      modoAnio: this.modoAnio(),
      anioDesde: this.anioDesde(),
      anioHasta: this.anioHasta(),
      aniosSueltos: this.aniosSueltos(),
      seleccion: this.seleccion(),
      exclusiones: this.exclusiones(),
      filas: this.filas(),
    };
  }

  private restaurarEstado(e: Record<string, unknown>): void {
    const texto = (v: unknown) => (typeof v === 'string' ? v : '');
    const objeto = <T>(v: unknown, porDefecto: T): T => (v && typeof v === 'object' ? (v as T) : porDefecto);
    this.modo.set(e['modo'] === 'avanzada' ? 'avanzada' : 'normal');
    this.texto.set(texto(e['texto']));
    this.campo.set(texto(e['campo']) || 'TITLE-ABS-KEY');
    this.sinonimos.set(objeto(e['sinonimos'], {}));
    this.ecuacion.set(texto(e['ecuacion']));
    this.temaIa.set(texto(e['temaIa']));
    this.iaAbierta.set(e['iaAbierta'] === true);
    this.ultimaGeneracion.set(objeto(e['ultimaGeneracion'], null));
    // Los temas propuestos no se guardan: una búsqueda guardada se abre para
    // ver SUS resultados, y enseñar debajo los temas de otra pregunta —o los
    // de hace un mes— solo confunde. Se vuelven a pedir preguntando otra vez.
    this.temasPropuestos.set([]);
    this.temaElegido.set(null);
    const orden = texto(e['orden']);
    this.orden.set(
      (['citas', 'recientes', 'antiguos', 'relevancia', 'significado'].includes(orden) ? orden : 'citas') as OrdenDeScopus,
    );
    this.dentro.set(texto(e['dentro']));
    this.modoAnio.set(e['modoAnio'] === 'sueltos' ? 'sueltos' : 'rango');
    this.anioDesde.set(texto(e['anioDesde']));
    this.anioHasta.set(texto(e['anioHasta']));
    this.aniosSueltos.set(texto(e['aniosSueltos']));
    this.seleccion.set(objeto(e['seleccion'], {}));
    this.exclusiones.set(objeto(e['exclusiones'], {}));
    const filas = Array.isArray(e['filas']) ? (e['filas'] as FilaDeBusqueda[]) : [];
    this.filas.set(filas);
    this.siguienteFila = Math.max(1, ...filas.map((f) => f.id + 1));
  }

  /** El nombre con que se guarda: lo que se escribió, o el principio de la ecuación. */
  private tituloPorDefecto(): string {
    const escrito = this.modo() === 'normal' ? this.texto().trim() : '';
    const titulo = escrito || this.ecuacionCompleta();
    return titulo.length > 120 ? `${titulo.slice(0, 117)}…` : titulo;
  }

  guardarBusqueda(): void {
    const ecuacion = this.ecuacionCompleta();
    if (!ecuacion) return;
    this.scopus
      .guardar({
        tipo: 'BUSQUEDA',
        titulo: this.tituloPorDefecto(),
        ecuacion,
        estado: this.estadoActual(),
        total: this.busqueda()?.total ?? 0,
      })
      .subscribe({
        next: (guardada) => {
          this.guardadas.update((lista) => (lista ? [guardada, ...lista] : lista));
          this.avisar('Guardada en «Tus búsquedas».');
        },
        error: (fallo: unknown) => this.avisar(toApiError(fallo).message),
      });
  }

  /**
   * Un error, en el aviso que baja desde arriba. Arriba del panel quedaba
   * fuera de la vista cuando el fallo llegaba con la lista de resultados en
   * pantalla, y el tesista no sabía por qué no pasaba nada.
   */
  private mostrarError(texto: string): void {
    this.error.set(texto);
    setTimeout(() => {
      if (this.error() === texto) this.error.set(null);
    }, 12_000);
  }

  private avisar(texto: string): void {
    this.avisoGuardada.set(texto);
    setTimeout(() => this.avisoGuardada.set(null), 3500);
  }

  /**
   * La conversación del copiloto se guarda sola: al llegar el primer resumen se
   * crea, y cada pregunta de seguimiento la actualiza. Si falla no se dice
   * nada: el resumen está en pantalla, que es lo que importa ahora.
   */
  private guardarConversacion(): void {
    const generacion = this.ultimaGeneracion();
    if (!generacion || this.hilo().length === 0) return;
    const hilo = this.hilo();
    const total = this.busqueda()?.total ?? 0;

    if (this.conversacionId) {
      this.scopus.actualizarGuardada(this.conversacionId, { hilo, total }).subscribe({
        next: (guardada) => this.alFrente(guardada),
        error: () => {},
      });
      return;
    }

    this.scopus
      .guardar({
        tipo: 'COPILOTO',
        titulo: generacion.tema.slice(0, 200),
        ecuacion: this.ecuacionCompleta(),
        estado: this.estadoActual(),
        hilo,
        total,
      })
      .subscribe({
        next: (guardada) => {
          this.conversacionId = guardada.id;
          this.alFrente(guardada);
        },
        error: () => {},
      });
  }

  private alFrente(guardada: BusquedaGuardadaResumida): void {
    this.guardadas.update((lista) =>
      lista ? [guardada, ...lista.filter((g) => g.id !== guardada.id)] : lista,
    );
  }

  /** Vuelve a una guardada: su estado, sus resultados otra vez y, si es del copiloto, su hilo. */
  abrirGuardada(item: BusquedaGuardadaResumida): void {
    this.scopus.guardada(item.id).subscribe({
      next: (guardada) => {
        this.panelGuardadas.set(false);
        this.restaurarEstado(guardada.estado ?? {});
        if (guardada.tipo === 'COPILOTO') {
          this.conversacionId = guardada.id;
          this.hiloPendiente = Array.isArray(guardada.hilo)
            ? (guardada.hilo as { pregunta: string; resumen: ResumenConIa }[])
            : [];
        } else {
          this.conversacionId = null;
        }
        this.buscar(1);
      },
      error: (fallo: unknown) => this.errorGuardadas.set(toApiError(fallo).message),
    });
  }

  borrarGuardada(item: BusquedaGuardadaResumida, evento: Event): void {
    evento.stopPropagation();
    this.scopus.borrarGuardada(item.id).subscribe({
      next: () => {
        this.guardadas.update((lista) => (lista ?? []).filter((g) => g.id !== item.id));
        if (this.conversacionId === item.id) this.conversacionId = null;
      },
      error: (fallo: unknown) => this.errorGuardadas.set(toApiError(fallo).message),
    });
  }

  // ── Búsqueda por significado ──────────────────────────────────────────────

  /** La pregunta con la que se ordena por significado: la del copiloto, o los conceptos. */
  readonly preguntaSemantica = computed(() => {
    const generacion = this.ultimaGeneracion();
    if (generacion) return generacion.tema;
    const conceptos = this.conceptos().map((c) => c.nombre);
    const pregunta = this.modo() === 'normal' ? conceptos.join(', ').trim() : '';
    // El servidor pide al menos dos letras: con menos no hay significado que comparar.
    return pregunta.length >= 2 ? pregunta : '';
  });

  /** Cuán cerca está un resultado, relativo a los demás de la lista. */
  cercania(resultado: ResultadoDeScopus): { texto: string; nivel: number } | null {
    if (typeof resultado.afinidad !== 'number') return null;
    const afinidades = (this.busqueda()?.resultados ?? [])
      .map((r) => r.afinidad)
      .filter((a): a is number => typeof a === 'number');
    const maximo = Math.max(...afinidades);
    const minimo = Math.min(...afinidades);
    const relativo = maximo > minimo ? (resultado.afinidad - minimo) / (maximo - minimo) : 1;
    if (relativo >= 0.66) return { texto: 'Muy cercano', nivel: 3 };
    if (relativo >= 0.33) return { texto: 'Cercano', nivel: 2 };
    return { texto: 'Relacionado', nivel: 1 };
  }

  /**
   * Cómo se le dice al tesista qué copia abierta va a abrir.
   *
   * No es un adorno. Una copia abierta no siempre es EL artículo, y la
   * diferencia le importa justo a quien está citando: el manuscrito aceptado
   * tiene el mismo texto con otra maquetación —así que la página 14 no es la
   * página 14— y el preprint puede decir cosas que el artículo publicado ya
   * no dice. Quien cite un preprint creyendo que es el publicado se lo va a
   * oír al asesor, así que se avisa antes de que haga clic.
   *
   * Devuelve nulo cuando es la versión del editor: ahí no hay nada que
   * advertir y un cartel de más solo ensucia la lista.
   */
  avisoDeVersion(enlace: EnlaceAbierto): string | null {
    if (enlace.version === 'acceptedVersion') return 'Manuscrito aceptado (otra paginación)';
    if (enlace.version === 'submittedVersion') return 'Preprint, sin revisión por pares';
    return null;
  }

  /** El texto del botón: «PDF» si es el archivo, «Leer gratis» si es la página. */
  textoDelEnlaceAbierto(enlace: EnlaceAbierto): string {
    return enlace.esPdf ? 'Descargar PDF gratis' : 'Leer gratis';
  }

  /**
   * Si se enseña el botón aparte.
   *
   * Cuando la copia abierta está en la propia editorial, el enlace es el mismo
   * `doi.org` al que ya lleva «Ver en la editorial», y poner dos botones al
   * mismo sitio no ayuda a nadie. La etiqueta de acceso abierto sigue estando:
   * el dato útil —que ahí se lee gratis— no se pierde.
   */
  enlaceAbiertoAparte(resultado: ResultadoDeScopus): EnlaceAbierto | null {
    const enlace = resultado.enlaceAbierto;
    if (!enlace || enlace.mismoQueEditorial) return null;
    return enlace;
  }

  ngOnInit(): void {
    const resultado = this.ruta.snapshot.queryParamMap.get('scopus');
    if (resultado) {
      this.vuelta.set(resultado);
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { scopus: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    this.cargar();
  }

  private cargar(): void {
    this.scopus.estado().subscribe({
      next: (datos) => {
        this.estado.set(datos);
        this.cargando.set(false);
      },
      error: () => {
        this.estado.set(null);
        this.cargando.set(false);
      },
    });
  }

  conectar(): void {
    if (this.conectando()) return;
    this.conectando.set(true);
    this.error.set(null);

    this.scopus.conectar().subscribe({
      next: ({ url }) => {
        if (url) {
          // Navegación completa y en esta misma pestaña: al terminar, Elsevier
          // devuelve al tesista aquí. Una pestaña nueva lo dejaría mirando la
          // vieja, que no se entera de nada.
          window.location.href = url;
          return;
        }
        this.conectando.set(false);
        this.vuelta.set(null);
        this.cargar();
      },
      error: (fallo: unknown) => {
        this.conectando.set(false);
        this.mostrarError(toApiError(fallo).message);
      },
    });
  }

  buscar(pagina = 1): void {
    const ecuacion = this.ecuacionCompleta();
    if (!ecuacion || this.buscando()) return;

    // Desde el copiloto, con conceptos ya propuestos, la primera página llega
    // con su resumen, como en la IA de Scopus: la pregunta ya está hecha.
    const generacion = this.ultimaGeneracion();
    const hiloGuardado = this.hiloPendiente;
    this.hiloPendiente = null;
    const resumirAlLlegar =
      this.iaAbierta() && generacion !== null && pagina === 1 && !(hiloGuardado?.length);
    const pregunta = this.preguntaSemantica();
    const porSignificado = this.orden() === 'significado' && Boolean(pregunta);
    this.hilo.set([]);
    this.errorResumen.set(null);
    this.referenciaResaltada.set(null);
    this.resumenesDePagina.set(null);
    this.resumenesAbiertos.set(new Set());

    this.buscando.set(true);
    this.error.set(null);
    this.parte.set(null);
    this.marcados.set(new Set());

    const peticion = porSignificado
      ? this.scopus.semantica(ecuacion, pregunta)
      : this.scopus.buscar(ecuacion, pagina, this.orden() === 'significado' ? 'citas' : this.orden());

    peticion.subscribe({
      next: (resultado) => {
        this.busqueda.set(resultado);
        this.buscando.set(false);
        if (pagina === 1) this.anotarEnHistorial(ecuacion, resultado.total);
        if (hiloGuardado?.length) this.hilo.set(hiloGuardado);
        else if (resumirAlLlegar && resultado.total > 0) this.resumir(generacion!.tema);
        this.cargarCuentas();
      },
      error: (fallo: unknown) => {
        this.buscando.set(false);
        if (porSignificado) {
          // Ordenar por significado es un extra: si falla, se busca igual,
          // por citas, y se dice por qué el orden no es el pedido.
          this.orden.set('citas');
          // Primero la búsqueda, que al empezar borra el aviso anterior.
          this.buscar(pagina);
          this.mostrarError(
            `No se pudo ordenar por significado (${toApiError(fallo).message}). Te los mostramos por más citados.`,
          );
          return;
        }
        this.mostrarError(toApiError(fallo).message);
        // Una búsqueda que falló no puede dejar en pantalla los resultados de
        // la anterior: parecería que esos son la respuesta a lo que escribió.
        this.busqueda.set(null);
        this.cargar();
      },
    });
  }

  /**
   * Un filtro cambió. Si ya hay resultados en pantalla se vuelve a buscar desde
   * la primera página: dejar la lista vieja debajo de un filtro nuevo haría
   * creer que esa lista ya está filtrada.
   */
  filtrar(): void {
    if (this.busqueda()) this.buscar(1);
  }

  quitarFiltros(): void {
    this.vaciarFiltros();
    this.filtrar();
  }

  usarEjemplo(): void {
    if (this.modo() === 'normal') {
      this.campo.set('TITLE-ABS-KEY');
      this.texto.set(this.ejemploNormal);
    } else {
      this.ecuacion.set(this.ejemplo);
    }
  }

  /**
   * Borra la búsqueda y vuelve al punto de partida.
   *
   * Se puede afinar una ecuación sin esto —el campo sigue ahí y se edita—, así
   * que esto no es para corregir: es para EMPEZAR OTRA. Quien termina con un
   * tema y pasa al siguiente se encontraba la lista del anterior debajo del
   * campo, las marcas a medio poner y el parte de la importación de hace un
   * rato, y tenía que recargar la página para quitarlo.
   *
   * Se lleva TODO lo de la búsqueda anterior, incluido el parte: dejar «3
   * fuentes importadas» en pantalla mientras se busca otra cosa hace dudar de
   * si eso es de ahora o de antes. Lo que no toca son las fuentes, que ya
   * están guardadas y no dependen de esta pantalla.
   */
  limpiar(): void {
    this.filas.set([]);
    this.conversacionId = null;
    this.texto.set('');
    this.sinonimos.set({});
    this.notaIa.set(null);
    this.ultimaGeneracion.set(null);
    this.temasPropuestos.set([]);
    this.temaElegido.set(null);
    this.temaIa.set('');
    this.hilo.set([]);
    this.errorResumen.set(null);
    this.ecuacion.set('');
    this.busqueda.set(null);
    this.marcados.set(new Set());
    this.parte.set(null);
    this.error.set(null);
  }

  /** «Reiniciar»: la búsqueda y los filtros, todo de vuelta al principio. */
  reiniciar(): void {
    this.limpiar();
    this.quitarFiltros();
  }

  /** En la ecuación, Enter busca y Mayúsculas+Enter parte la línea. */
  enterEnEcuacion(evento: KeyboardEvent): void {
    if (evento.shiftKey) return;
    evento.preventDefault();
    this.buscar();
  }

  pagina(numero: number): void {
    const busqueda = this.busqueda();
    if (!busqueda || numero < 1 || numero > busqueda.paginas) return;
    this.buscar(numero);
  }

  marcar(eid: string): void {
    const copia = new Set(this.marcados());
    if (copia.has(eid)) copia.delete(eid);
    else copia.add(eid);
    this.marcados.set(copia);
  }

  /** Marcar toda la página de una vez, o desmarcarla si ya lo estaba entera. */
  marcarTodo(): void {
    const enPantalla = this.busqueda()?.resultados ?? [];
    if (enPantalla.length === 0) return;

    const todos = enPantalla.every((r) => this.marcados().has(r.eid));
    this.marcados.set(todos ? new Set() : new Set(enPantalla.map((r) => r.eid)));
  }

  importar(): void {
    this.importarEids([...this.marcados()]);
  }

  /**
   * Trae a su biblioteca estos artículos. Lo usan las casillas de la tabla y
   * los botones de la columna de referencias del resumen.
   */
  importarEids(eids: string[]): void {
    if (eids.length === 0 || this.importando()) return;

    this.importando.set(true);
    this.error.set(null);
    this.parte.set(null);

    this.scopus.importar(eids).subscribe({
      next: (resultado) => {
        this.importando.set(false);
        this.parte.set(resultado);
        this.marcados.set(new Set());
        // Lo recién importado pasa a estar «ya en tu biblioteca», para que las
        // marcas de la lista cuadren con lo que hay detrás.
        this.marcarComoTuyas(eids);
        this.cargar();
        // Y la cifra de «fuentes tuyas» de la tarjeta de abajo, que es OTRO
        // componente y no se entera de esto por su cuenta. Sin el aviso se
        // queda con el número viejo hasta recargar la página, y lo que parece
        // entonces es que la importación no funcionó.
        this.misFuentes.avisarDeCambio();
      },
      error: (fallo: unknown) => {
        this.importando.set(false);
        this.mostrarError(toApiError(fallo).message);
      },
    });
  }

  /**
   * Marca en la lista de pantalla lo que se acaba de importar.
   *
   * En vez de repetir la búsqueda, que sería otra petición a Elsevier contra
   * la cuota de la casa por un cambio que ya se sabe cuál es.
   */
  private marcarComoTuyas(eids: string[]): void {
    const traidas = new Set(eids);
    this.busqueda.update((busqueda) =>
      busqueda
        ? {
            ...busqueda,
            resultados: busqueda.resultados.map((resultado) =>
              traidas.has(resultado.eid) ? { ...resultado, yaLaTienes: true } : resultado,
            ),
          }
        : busqueda,
    );
  }

  async desconectar(): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: 'Desconectar Scopus',
      mensaje: 'Dejaremos de buscar en Scopus a tu nombre.',
      nota: 'Las fuentes que ya importaste se quedan donde están: si las quitáramos, las citas que ya escribiste en tus capítulos dejarían de resolver.',
      confirmar: 'Desconectar',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.error.set(null);
    this.scopus.desconectar().subscribe({
      next: () => {
        this.busqueda.set(null);
        this.parte.set(null);
        this.vuelta.set(null);
        this.marcados.set(new Set());
        this.cargar();
      },
      error: (fallo: unknown) => this.mostrarError(toApiError(fallo).message),
    });
  }
}
