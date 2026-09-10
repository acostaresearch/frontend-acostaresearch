import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { resaltarR } from '../../core/r/resaltado-r';
import {
  ArchivoDeLaSesion,
  ColumnaDeDatos,
  LineaDeSalida,
  ObjetoDelEntorno,
  WebrService,
} from '../../core/r/webr.service';
import { SiteHeader } from '../../shared/layout/site-header';
import { CATALOGO, Comando, conColumnas } from './comandos';

/**
 * El guion con el que empieza todo el mundo.
 *
 * Va relleno y no en blanco a propósito: una caja de código vacía delante de
 * alguien que no programa es una pared. Con esto puede pulsar «Ejecutar» antes
 * de entender nada, ver salir números, y a partir de ahí cambiar cosas.
 */
const GUION_INICIAL = `# Guion de análisis · Capítulo IV
# Pulsa «Ejecutar todo» arriba, o ponte en una línea y pulsa Ctrl+Enter.

datos <- read.csv("datos.csv")

dim(datos)      # cuántas filas y columnas tiene tu matriz
names(datos)    # cómo se llama cada columna
head(datos)     # las primeras filas, para comprobar que entró bien

# Tabla de descriptivos: media, desviación, mínimo y máximo
descriptivos(datos)
`;

/** Qué pestaña se ve en cada uno de los dos paneles de la derecha. */
type PestanaArriba = 'entorno' | 'historial';
type PestanaAbajo = 'analisis' | 'graficos' | 'archivos' | 'ayuda';

/** Cuál de los cuatro paneles está a pantalla completa, si alguno. */
type PanelGrande = 'ninguno' | 'guion' | 'consola' | 'entorno' | 'auxiliar';

/**
 * Analizar los datos sin instalar nada, con la disposición de RStudio.
 *
 * CUATRO PANELES, Y NO ES IMITACIÓN
 * ---------------------------------
 * El tesista ya ha visto RStudio —se lo pide su asesor y sale en todos los
 * tutoriales— así que esta pantalla se organiza igual: guion arriba a la
 * izquierda con sus números de línea y su código en color, consola debajo con
 * el prompt al final, lo que existe en la sesión arriba a la derecha, y los
 * archivos y gráficos abajo. Cada cosa donde la va a buscar.
 *
 * LO QUE NO SE IMITA, Y POR QUÉ
 * -----------------------------
 * No hay barra de menús File / Edit / View. Un menú que se despliega y no hace
 * nada es peor que no tenerlo: enseña que la pantalla es un decorado. Lo que
 * sí está —ejecutar línea, ejecutar todo, reiniciar R, maximizar un panel— son
 * botones de verdad, y son los que se usan.
 *
 * LA PARTE QUE RSTUDIO NO TIENE
 * -----------------------------
 * La pestaña «Análisis». RStudio da la consola y se acabó: qué prueba toca y
 * cómo se lee el resultado es cosa del tesista y su asesor. Aquí eso está
 * escrito, con las columnas de SU archivo ya puestas en el código. Es la
 * diferencia entre una consola de R y algo que alguien que no programa puede
 * usar solo.
 *
 * POR QUÉ NO ES RSTUDIO, DICHO AQUÍ Y TAMBIÉN EN LA PANTALLA
 * ----------------------------------------------------------
 * Se descartó RStudio Server porque necesita un servidor: uno nuevo cuesta
 * dinero y el actual guarda los secretos y las tesis de todos. Lo que queda es
 * R en el navegador.
 *
 * Ejecuta R auténtico, que es lo que se declara en una tesis. Lo que no da es
 * el programa RStudio para una captura de pantalla. Quien la necesite abre
 * RStudio y corre el MISMO guion: sale igual.
 */
@Component({
  selector: 'app-analisis',
  imports: [ReactiveFormsModule, SiteHeader],
  templateUrl: './analisis.html',
  styleUrl: './analisis.css',
})
export class Analisis {
  protected readonly r = inject(WebrService);

  private readonly cajaConsola = viewChild<ElementRef<HTMLDivElement>>('consola');
  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');
  private readonly fondo = viewChild<ElementRef<HTMLPreElement>>('fondo');
  private readonly numeros = viewChild<ElementRef<HTMLDivElement>>('numeros');

  readonly codigo = new FormControl(GUION_INICIAL, { nonNullable: true });
  /** Lo que se teclea en la consola, que es otra caja distinta del guion. */
  readonly ordenSuelta = new FormControl('', { nonNullable: true });

  readonly salida = signal<LineaDeSalida[]>([]);
  readonly graficos = signal<string[]>([]);
  readonly objetos = signal<ObjetoDelEntorno[]>([]);
  readonly archivos = signal<ArchivoDeLaSesion[]>([]);
  readonly columnas = signal<ColumnaDeDatos[]>([]);
  readonly versionR = signal('R');

  readonly ejecutando = signal(false);
  readonly error = signal<string | null>(null);

  readonly pestanaArriba = signal<PestanaArriba>('entorno');
  readonly pestanaAbajo = signal<PestanaAbajo>('analisis');
  readonly grande = signal<PanelGrande>('ninguno');

  readonly listo = computed(() => this.r.estado() === 'listo');

  // ── El editor ────────────────────────────────────────────────────────────

  /**
   * El texto del guion, seguido como señal.
   *
   * `FormControl` no es una señal, así que el color y los números de línea no
   * se recalcularían al teclear. Este espejo se actualiza en cada pulsación y
   * es de quien cuelgan los dos.
   */
  readonly texto = signal(GUION_INICIAL);

  /** El mismo código con `<span>` de color, para pintarlo detrás del área. */
  readonly coloreado = computed(() => resaltarR(this.texto()));

  /** Un número por línea, para la banda de la izquierda. */
  readonly lineas = computed(() => {
    const total = this.texto().split('\n').length;
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  /** En qué línea está el cursor, para marcarla como hace RStudio. */
  readonly lineaActual = signal(1);

  /**
   * ¿Puede esta pestaña ejecutar R?
   *
   * Depende de dos cabeceras que solo llegan con el documento. Si el tesista
   * entró por otra página y navegó hasta aquí por dentro de la aplicación, no
   * llegaron — y la solución es recargar, que sí pide el documento.
   */
  readonly aislada = signal(globalThis.crossOriginIsolated === true);

  // ── Primeros pasos ───────────────────────────────────────────────────────

  /**
   * Los tres pasos que hay que dar la primera vez.
   *
   * Van en pantalla y se van tachando solos. Es la respuesta a «no sé cómo
   * usar esto»: una pantalla con cuatro paneles y una caja de código no dice
   * por dónde se empieza, y quien no lo sabe cierra la pestaña.
   */
  readonly subioArchivo = signal(false);
  readonly ejecutoAlgo = signal(false);
  readonly insertoAnalisis = signal(false);

  readonly pasosHechos = computed(
    () =>
      Number(this.subioArchivo()) + Number(this.ejecutoAlgo()) + Number(this.insertoAnalisis()),
  );

  /** Se pliega solo al terminar los tres, y se puede plegar antes a mano. */
  readonly guiaPlegada = signal(false);
  readonly guiaVisible = computed(() => !this.guiaPlegada() && this.pasosHechos() < 3);

  constructor() {
    this.codigo.valueChanges.subscribe((valor) => this.texto.set(valor));

    /**
     * Se retira el Service Worker del canal antiguo.
     *
     * Quien abrió esta página antes tiene uno registrado con alcance sobre TODO
     * el dominio. Ya no se usa —R va por memoria compartida— pero un trabajador
     * que intercepta peticiones en toda la web y que nadie mantiene es una
     * pieza que solo puede dar problemas.
     */
    void navigator.serviceWorker
      ?.getRegistrations()
      .then((registros) =>
        registros
          .filter((r) => r.active?.scriptURL.includes('webr'))
          .forEach((r) => void r.unregister()),
      )
      .catch(() => undefined);
  }

  /** Recarga de verdad, para que el servidor vuelva a mandar las cabeceras. */
  recargar(): void {
    location.reload();
  }

  /** Arranca R. Va tras un botón porque son 30 MB y se pide, no se impone. */
  encender(): void {
    this.error.set(null);

    this.r
      .arrancar()
      .then(async () => {
        this.versionR.set(await this.r.version());
        await this.refrescarPaneles();
      })
      .catch((fallo: unknown) => {
        // El fallo de aislamiento tiene su propia pantalla, con el botón de
        // recargar, porque su solución es distinta de «reintenta».
        if (fallo instanceof Error && fallo.message === 'SIN_AISLAMIENTO') {
          this.aislada.set(false);
          return;
        }

        this.error.set(
          'No se pudo cargar R. Suele ser la conexión: vuelve a intentarlo en un momento.',
        );
      });
  }

  // ── El archivo ───────────────────────────────────────────────────────────

  /**
   * Mete el archivo del tesista en R.
   *
   * Se le pone SIEMPRE el nombre `datos.csv`, se llame como se llame el suyo.
   * Así el guion funciona sin que tenga que editar la primera línea, que es
   * donde se atasca quien no programa —y donde una barra invertida de Windows
   * rompe la ruta sin decir por qué—.
   *
   * Y se lee de una vez, sin esperar a que pulse «Ejecutar»: subir un archivo y
   * que no pase nada visible es el momento exacto en que alguien se pregunta si
   * la página funciona.
   */
  async elegirArchivo(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;

    this.error.set(null);

    try {
      await this.r.subirArchivo('datos.csv', await archivo.arrayBuffer());
      this.subioArchivo.set(true);
      this.anotar(`Cargado «${archivo.name}» como datos.csv`);
      await this.correr('datos <- read.csv("datos.csv")\ndim(datos)\nhead(datos)', null);
    } catch {
      this.error.set('No se pudo leer ese archivo. Guárdalo como CSV y vuelve a subirlo.');
    }
  }

  /**
   * Baja un archivo de la sesión al equipo del tesista.
   *
   * Es la única salida de lo que produce R aquí dentro: el Word con las tablas,
   * el CSV con los puntajes calculados. Sin esto, el análisis se queda en la
   * pestaña y muere al cerrarla.
   */
  async descargar(nombre: string): Promise<void> {
    try {
      const bytes = await this.r.leerArchivo(nombre);
      // Se copia a un ArrayBuffer propio: el de WebR pertenece a su memoria y
      // pasárselo al Blob directamente lo deja del tamaño equivocado.
      const url = URL.createObjectURL(new Blob([bytes.slice()]));

      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch {
      this.error.set(`No se pudo leer «${nombre}».`);
    }
  }

  // ── Ejecutar ─────────────────────────────────────────────────────────────

  /** Todo el guion, como el «Source» de RStudio. */
  ejecutarTodo(): void {
    void this.correr(this.codigo.value, null);
  }

  /**
   * Solo la línea donde está el cursor, y baja a la siguiente.
   *
   * Es el Ctrl+Enter de RStudio, y es CÓMO se trabaja de verdad: se avanza línea
   * a línea mirando lo que sale, no ejecutando el archivo entero cada vez. Sin
   * esto, la pantalla se parece a RStudio pero no se usa como RStudio.
   */
  ejecutarLinea(): void {
    const caja = this.editor()?.nativeElement;
    if (!caja) return;

    const texto = caja.value;
    const inicio = texto.lastIndexOf('\n', Math.max(0, caja.selectionStart - 1)) + 1;
    const finBruto = texto.indexOf('\n', caja.selectionStart);
    const fin = finBruto === -1 ? texto.length : finBruto;

    const linea = texto.slice(inicio, fin);

    // El cursor baja aunque la línea esté vacía: así se puede mantener pulsado
    // Ctrl+Enter para recorrer el guion, igual que en RStudio.
    const siguiente = Math.min(fin + 1, texto.length);
    caja.setSelectionRange(siguiente, siguiente);
    this.marcarLinea();

    if (linea.trim()) void this.correr(linea, linea);
  }

  /** Una orden tecleada directamente en la consola. */
  ejecutarOrden(): void {
    const orden = this.ordenSuelta.value.trim();
    if (!orden) return;

    this.ordenSuelta.reset();
    this.historial.update((lista) => [...lista, orden]);
    this.posicionHistorial.set(null);
    void this.correr(orden, orden);
  }

  /**
   * El motor de las tres.
   *
   * `eco` es lo que se pinta como orden antes del resultado. Va cuando la
   * ejecución es de una línea suelta —así la consola se lee como una
   * conversación— y no cuando es el guion entero, donde repetir cuarenta líneas
   * enterraría la salida.
   */
  private async correr(codigo: string, eco: string | null): Promise<void> {
    if (this.ejecutando()) return;

    this.ejecutando.set(true);
    this.error.set(null);

    if (eco) this.anotar(`> ${eco}`);

    try {
      const { salida, graficos } = await this.r.ejecutar(codigo);

      this.salida.update((lineas) => [...lineas, ...salida]);
      this.ejecutoAlgo.set(true);

      if (graficos.length > 0) {
        this.graficos.set(graficos);
        this.pestanaAbajo.set('graficos');
      }

      await this.refrescarPaneles();
    } finally {
      this.ejecutando.set(false);
      this.alFinalDeLaConsola();
    }
  }

  /** Refresca entorno, archivos y columnas. Tras CADA ejecución, como RStudio. */
  private async refrescarPaneles(): Promise<void> {
    const [objetos, archivos, columnas] = await Promise.all([
      this.r.entorno(),
      this.r.archivos(),
      this.r.columnas(),
    ]);

    this.objetos.set(objetos);
    this.archivos.set(archivos);
    this.columnas.set(columnas);
  }

  private anotar(texto: string): void {
    this.salida.update((lineas) => [...lineas, { tipo: 'stdout', texto }]);
    this.alFinalDeLaConsola();
  }

  /** La consola sigue lo último, como cualquier terminal. */
  private alFinalDeLaConsola(): void {
    setTimeout(() => {
      const caja = this.cajaConsola()?.nativeElement;
      if (caja) caja.scrollTop = caja.scrollHeight;
    });
  }

  limpiarConsola(): void {
    this.salida.set([]);
  }

  /** Vacía el entorno, como el escobón de RStudio. */
  async limpiarEntorno(): Promise<void> {
    await this.correr('rm(list = ls())', 'rm(list = ls())');
  }

  /**
   * El «Restart R» de RStudio.
   *
   * Es lo que se pulsa cuando algo se enredó y no se sabe por qué: se queda sin
   * objetos y sin archivos, pero no vuelve a descargar los 30 MB.
   */
  async reiniciarR(): Promise<void> {
    if (this.ejecutando()) return;

    this.ejecutando.set(true);
    try {
      await this.r.reiniciar();
      this.subioArchivo.set(false);
      this.graficos.set([]);
      this.anotar('— Sesión de R reiniciada. Vuelve a subir tu matriz. —');
      await this.refrescarPaneles();
    } finally {
      this.ejecutando.set(false);
    }
  }

  // ── El historial de la consola ───────────────────────────────────────────

  /** Todo lo tecleado en la consola, para subir por ello con la flecha. */
  readonly historial = signal<string[]>([]);
  private readonly posicionHistorial = signal<number | null>(null);

  /**
   * Recorre lo ya tecleado con las flechas, como cualquier consola.
   *
   * Quien está tanteando repite la misma orden con un cambio pequeño diez
   * veces; volver a escribirla entera cada vez es donde se abandona.
   */
  recorrerHistorial(paso: -1 | 1): void {
    const lista = this.historial();
    if (lista.length === 0) return;

    const actual = this.posicionHistorial();
    let nueva: number | null;

    if (paso === -1) {
      nueva = actual === null ? lista.length - 1 : Math.max(0, actual - 1);
    } else {
      // Bajar desde la última devuelve la línea en blanco, no la repite.
      nueva = actual === null || actual >= lista.length - 1 ? null : actual + 1;
    }

    this.posicionHistorial.set(nueva);
    this.ordenSuelta.setValue(nueva === null ? '' : lista[nueva]);
  }

  /** Reejecuta una orden del historial con un clic. */
  repetir(orden: string): void {
    void this.correr(orden, orden);
  }

  // ── El catálogo de análisis ──────────────────────────────────────────────

  readonly catalogo = CATALOGO;

  /** Qué grupo del catálogo está desplegado. Solo uno, para que quepa. */
  readonly grupoAbierto = signal<string | null>(CATALOGO[0].titulo);

  abrirGrupo(titulo: string): void {
    this.grupoAbierto.update((abierto) => (abierto === titulo ? null : titulo));
  }

  /** Qué análisis tiene abierta su explicación de «cómo se lee». */
  readonly explicando = signal<string | null>(null);

  explicar(nombre: string): void {
    this.explicando.update((abierto) => (abierto === nombre ? null : nombre));
  }

  /**
   * Qué columnas de su archivo entran en los ejemplos del catálogo.
   *
   * No vale coger las cuatro primeras numéricas: en una matriz de tesis las
   * primeras son `id` y `edad`, y un alfa de Cronbach sobre el número de caso
   * da 0,014 y le hace creer que su instrumento no sirve. Se probó contra la
   * matriz real y eso es exactamente lo que salía.
   *
   * Lo que sí funciona es cómo se nombran de verdad estas matrices:
   *
   *   · Los ítems de una dimensión llevan prefijo y número —`cd1..cd4`,
   *     `emp1..emp4`—. Tres o más con el mismo prefijo son una dimensión, y
   *     esos son los del alfa.
   *   · El puntaje de esa dimensión se llama como el prefijo, en mayúsculas:
   *     `CD`, `EMP`. Esos son los que se correlacionan, no los ítems sueltos.
   *   · `id`, `n`, `caso`, `código` son identificadores y no entran en nada.
   *
   * Si el archivo no sigue esa forma, se cae a las primeras numéricas que no
   * sean identificador — que es lo razonable cuando no hay nada mejor.
   */
  private readonly eleccion = computed(() => {
    const numericas = this.columnas().filter((c) => c.numerica).map((c) => c.nombre);
    const textos = this.columnas().filter((c) => !c.numerica).map((c) => c.nombre);

    const esIdentificador = (n: string) => /^(id|n|nro|num|caso|codigo|c[oó]digo)$/i.test(n);
    const utiles = numericas.filter((n) => !esIdentificador(n));

    // Las familias de ítems: mismo prefijo y un número al final.
    const familias = new Map<string, string[]>();
    for (const nombre of utiles) {
      const parte = /^([A-Za-z_.]+?)\d+$/.exec(nombre);
      if (!parte) continue;
      const prefijo = parte[1].toLowerCase();
      familias.set(prefijo, [...(familias.get(prefijo) ?? []), nombre]);
    }

    const dimensiones = [...familias.entries()].filter(([, items]) => items.length >= 3);

    // Los puntajes: una columna que se llama igual que el prefijo de una
    // familia es el total de esa dimensión.
    const prefijos = new Set(dimensiones.map(([prefijo]) => prefijo));
    const puntajes = utiles.filter((n) => prefijos.has(n.toLowerCase()));

    const sueltas = puntajes.length >= 2 ? puntajes : [...puntajes, ...utiles];

    return {
      items: dimensiones[0]?.[1] ?? utiles.slice(0, 4),
      num: sueltas[0],
      num2: sueltas[1] ?? sueltas[0],
      cat: textos[0],
      cat2: textos[1] ?? textos[0],
    };
  });

  /**
   * El código de un análisis, con las columnas del archivo que subió.
   *
   * Sin esto los ejemplos hablan de `cd1, cd2, cd3`, que no existen en su
   * matriz: el primer error que ve alguien que no programa no debería ser culpa
   * nuestra.
   */
  codigoDe(comando: Comando): string {
    const e = this.eleccion();

    return conColumnas(comando.codigo, {
      items:
        e.items.length > 0
          ? `c(${e.items.map((n) => `"${n}"`).join(', ')})`
          : 'c("item1", "item2", "item3")',
      num: e.num ?? 'variable1',
      num2: e.num2 ?? 'variable2',
      cat: e.cat ?? e.num ?? 'grupo',
      cat2: e.cat2 ?? e.cat ?? 'grupo2',
    });
  }

  /** Mete el análisis al final del guion y lleva la vista allí. */
  insertar(comando: Comando): void {
    this.anadir(`# ${comando.nombre}\n${this.codigoDe(comando)}`);
    this.insertoAnalisis.set(true);
  }

  /**
   * Añade un bloque al final del guion en vez de reemplazarlo.
   *
   * Los atajos son para ir componiendo el análisis paso a paso. Si sustituyeran
   * lo escrito, el tesista perdería lo que llevaba cada vez que pulsa uno.
   */
  anadir(bloque: string): void {
    const nuevo = `${this.codigo.value.trimEnd()}\n\n${bloque}\n`;
    this.codigo.setValue(nuevo);

    // El cursor al final y la vista con él: si el bloque cae fuera de la parte
    // visible, el botón parece no haber hecho nada.
    setTimeout(() => {
      const caja = this.editor()?.nativeElement;
      if (!caja) return;
      caja.focus();
      caja.setSelectionRange(nuevo.length, nuevo.length);
      caja.scrollTop = caja.scrollHeight;
      this.sincronizarFondo();
      this.marcarLinea();
    });
  }

  /** Pone el nombre de una columna donde esté el cursor del guion. */
  insertarColumna(nombre: string): void {
    const caja = this.editor()?.nativeElement;
    if (!caja) return;

    const texto = caja.value;
    const corte = caja.selectionStart;
    const nuevo = texto.slice(0, corte) + nombre + texto.slice(caja.selectionEnd);

    this.codigo.setValue(nuevo);

    setTimeout(() => {
      caja.focus();
      caja.setSelectionRange(corte + nombre.length, corte + nombre.length);
      this.sincronizarFondo();
    });
  }

  // ── Sincronía del editor ─────────────────────────────────────────────────

  /**
   * El color y los números siguen al área de texto cuando se desplaza.
   *
   * Son tres capas superpuestas y solo una recibe la rueda del ratón. Sin esto,
   * el código de color se queda quieto mientras el texto sube, y lo que se ve
   * es un guion con los colores de otro.
   */
  sincronizarFondo(): void {
    const caja = this.editor()?.nativeElement;
    const atras = this.fondo()?.nativeElement;
    const banda = this.numeros()?.nativeElement;
    if (!caja) return;

    if (atras) {
      atras.scrollTop = caja.scrollTop;
      atras.scrollLeft = caja.scrollLeft;
    }
    if (banda) banda.scrollTop = caja.scrollTop;
  }

  /** Marca la línea del cursor, como el resaltado de RStudio. */
  marcarLinea(): void {
    const caja = this.editor()?.nativeElement;
    if (!caja) return;

    const hasta = caja.value.slice(0, caja.selectionStart);
    this.lineaActual.set(hasta.split('\n').length);
  }

  /**
   * El tabulador sangra en vez de saltar al botón siguiente.
   *
   * En un editor de código eso es lo que se espera. Se dejan dos espacios, que
   * es el estilo con el que R se escribe y publica.
   */
  tabular(evento: Event): void {
    const caja = this.editor()?.nativeElement;
    if (!caja) return;

    evento.preventDefault();

    const corte = caja.selectionStart;
    const nuevo = caja.value.slice(0, corte) + '  ' + caja.value.slice(caja.selectionEnd);
    this.codigo.setValue(nuevo);

    setTimeout(() => caja.setSelectionRange(corte + 2, corte + 2));
  }

  // ── Panel a pantalla completa ────────────────────────────────────────────

  /** Como el maximizar de cada panel de RStudio. */
  maximizar(panel: PanelGrande): void {
    this.grande.update((actual) => (actual === panel ? 'ninguno' : panel));
  }

  /** Tamaño legible, para el panel de archivos. */
  peso(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
}
