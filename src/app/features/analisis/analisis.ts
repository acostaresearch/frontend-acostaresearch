import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import {
  ArchivoDeLaSesion,
  LineaDeSalida,
  ObjetoDelEntorno,
  WebrService,
} from '../../core/r/webr.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * El guion con el que empieza todo el mundo.
 *
 * Va relleno y no en blanco a propósito: una caja de código vacía delante de
 * alguien que no programa es una pared. Con esto puede pulsar «Ejecutar» antes
 * de entender nada, ver salir números, y a partir de ahí cambiar cosas.
 */
const GUION_INICIAL = `# Tus datos, ya cargados. Ejecuta y mira qué hay dentro.
datos <- read.csv("datos.csv")

dim(datos)    # cuántas filas y columnas
head(datos)   # las primeras filas

# Descriptivos — la primera tabla del Capítulo IV
descriptivos(datos)
`;

/** Qué pestaña se ve en el panel de abajo a la derecha. */
type PestanaAbajo = 'archivos' | 'graficos';

/**
 * Analizar los datos sin instalar nada, con la disposición de RStudio.
 *
 * CUATRO PANELES, Y NO ES IMITACIÓN
 * ---------------------------------
 * El tesista ya ha visto RStudio —se lo pide su asesor y sale en todos los
 * tutoriales— así que esta pantalla se organiza igual: guion arriba a la
 * izquierda, consola abajo, lo que existe en la sesión arriba a la derecha, y
 * los archivos y gráficos abajo. Cada cosa donde la va a buscar.
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
  imports: [ReactiveFormsModule, SiteHeader, SiteFooter],
  templateUrl: './analisis.html',
  styleUrl: './analisis.css',
})
export class Analisis {
  protected readonly r = inject(WebrService);

  private readonly cajaConsola = viewChild<ElementRef<HTMLDivElement>>('consola');
  private readonly editor = viewChild<ElementRef<HTMLTextAreaElement>>('editor');

  readonly codigo = new FormControl(GUION_INICIAL, { nonNullable: true });
  /** Lo que se teclea en la consola, que es otra caja distinta del guion. */
  readonly ordenSuelta = new FormControl('', { nonNullable: true });

  readonly salida = signal<LineaDeSalida[]>([]);
  readonly graficos = signal<string[]>([]);
  readonly objetos = signal<ObjetoDelEntorno[]>([]);
  readonly archivos = signal<ArchivoDeLaSesion[]>([]);

  readonly ejecutando = signal(false);
  readonly error = signal<string | null>(null);
  readonly pestana = signal<PestanaAbajo>('archivos');

  readonly listo = computed(() => this.r.estado() === 'listo');

  /**
   * ¿Puede esta pestaña ejecutar R?
   *
   * Depende de dos cabeceras que solo llegan con el documento. Si el tesista
   * entró por otra página y navegó hasta aquí por dentro de la aplicación, no
   * llegaron — y la solución es recargar, que sí pide el documento.
   */
  readonly aislada = signal(globalThis.crossOriginIsolated === true);

  constructor() {
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
      .then(() => this.refrescarPaneles())
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
   */
  async elegirArchivo(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;

    this.error.set(null);

    try {
      await this.r.subirArchivo('datos.csv', await archivo.arrayBuffer());
      await this.refrescarPaneles();
      this.anotar(`Cargado «${archivo.name}» como datos.csv`);
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

    if (linea.trim()) void this.correr(linea, linea);
  }

  /** Una orden tecleada directamente en la consola. */
  ejecutarOrden(): void {
    const orden = this.ordenSuelta.value.trim();
    if (!orden) return;

    this.ordenSuelta.reset();
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
      if (graficos.length > 0) {
        this.graficos.set(graficos);
        this.pestana.set('graficos');
      }

      await this.refrescarPaneles();
    } finally {
      this.ejecutando.set(false);
      this.alFinalDeLaConsola();
    }
  }

  /** Refresca entorno y archivos. Se llama tras CADA ejecución, como RStudio. */
  private async refrescarPaneles(): Promise<void> {
    const [objetos, archivos] = await Promise.all([this.r.entorno(), this.r.archivos()]);
    this.objetos.set(objetos);
    this.archivos.set(archivos);
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
   * Añade un bloque al final del guion en vez de reemplazarlo.
   *
   * Los atajos son para ir componiendo el análisis paso a paso. Si sustituyeran
   * lo escrito, el tesista perdería lo que llevaba cada vez que pulsa uno.
   */
  anadir(bloque: string): void {
    this.codigo.setValue(`${this.codigo.value.trimEnd()}\n\n${bloque}\n`);
  }

  /** Los bloques que cubren lo que pide una tesis, en el orden en que se usan. */
  readonly atajos = [
    {
      nombre: 'Alfa de Cronbach',
      ayuda: 'Confiabilidad del instrumento',
      codigo:
        '# Cambia los nombres por las columnas de TU variable\nalfa_de_cronbach(datos[, c("cd1","cd2","cd3","cd4")])',
    },
    {
      nombre: 'Normalidad',
      ayuda: 'Decide si la prueba es paramétrica',
      codigo:
        '# Sobre el puntaje total, no ítem por ítem\ndatos$total <- rowMeans(datos[, c("cd1","cd2","cd3","cd4")])\nshapiro.test(datos$total)\nhist(datos$total, main = "Distribución del puntaje", xlab = "Puntaje")',
    },
    {
      nombre: 'Correlación',
      ayuda: 'Pearson si hubo normalidad; si no, Spearman',
      codigo:
        'datos$emp <- rowMeans(datos[, c("emp1","emp2","emp3","emp4")])\ncor.test(datos$total, datos$emp, method = "pearson")\nplot(datos$total, datos$emp, xlab = "Competencias", ylab = "Empleabilidad")',
    },
    {
      nombre: 'Frecuencias',
      ayuda: 'Para las variables categóricas',
      codigo: 'table(datos$sexo)\nround(prop.table(table(datos$sexo)) * 100, 1)',
    },
    {
      nombre: 'Guardar en CSV',
      ayuda: 'Para bajarlo desde el panel de archivos',
      codigo: 'write.csv(datos, "resultados.csv", row.names = FALSE)',
    },
  ];

  /** Tamaño legible, para el panel de archivos. */
  peso(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
}
