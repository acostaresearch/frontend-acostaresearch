import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { LineaDeSalida, WebrService } from '../../core/r/webr.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * El guion con el que empieza todo el mundo.
 *
 * Va relleno y no en blanco a propósito: una caja de código vacía delante de
 * alguien que no programa es una pared. Con esto puede pulsar «Ejecutar» antes
 * de entender nada, ver salir números, y a partir de ahí cambiar cosas.
 *
 * Y es el guion real de un Capítulo IV, no un ejemplo de manual: leer la
 * matriz, descriptivos, alfa de Cronbach y normalidad, en ese orden.
 */
const GUION_INICIAL = `# Tus datos. Cambia el nombre por el de tu archivo.
datos <- read.csv("datos.csv")

# Un vistazo: cuántas filas y qué columnas hay
dim(datos)
head(datos)

# Descriptivos — la primera tabla del Capítulo IV
library(psych)
describe(datos)
`;

/**
 * Analizar los datos sin instalar nada.
 *
 * R de verdad, dentro de la pestaña del tesista. Sube su matriz, escribe su
 * script y ve la salida — sin descargar R, sin configurar nada y sin que sus
 * datos salgan de su equipo.
 *
 * POR QUÉ NO ES RSTUDIO, DICHO AQUÍ Y TAMBIÉN EN LA PANTALLA
 * ----------------------------------------------------------
 * Se descartó RStudio Server porque necesita un servidor —uno nuevo cuesta
 * dinero, y el actual guarda los secretos y las tesis de todos—. Lo que queda
 * es R en el navegador.
 *
 * Ejecuta R auténtico, que es lo que se declara en una tesis. Lo que no da es
 * la interfaz de RStudio para una captura de pantalla. Quien la necesite abre
 * RStudio y corre el MISMO script: sale igual. Eso está escrito en la página
 * porque prometer RStudio y entregar otra cosa sería peor que no ofrecerlo.
 */
@Component({
  selector: 'app-analisis',
  imports: [ReactiveFormsModule, SiteHeader, SiteFooter],
  templateUrl: './analisis.html',
  styleUrl: './analisis.css',
})
export class Analisis {
  protected readonly r = inject(WebrService);

  readonly codigo = new FormControl(GUION_INICIAL, { nonNullable: true });

  readonly salida = signal<LineaDeSalida[]>([]);
  readonly ejecutando = signal(false);
  readonly archivo = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly listo = computed(() => this.r.estado() === 'listo');

  constructor() {
    /**
     * Se retira el Service Worker del canal antiguo.
     *
     * Quien abrió esta página antes tiene uno registrado con alcance sobre TODO
     * el dominio. Ya no se usa —R va por memoria compartida— pero un trabajador
     * que intercepta peticiones en toda la web y que nadie mantiene es una
     * pieza que solo puede dar problemas.
     *
     * Se hace en silencio y sin esperar: si falla, no cambia nada de lo que el
     * tesista viene a hacer.
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

  /**
   * ¿Puede esta pestaña ejecutar R?
   *
   * Depende de dos cabeceras que solo llegan con el documento. Si el tesista
   * entró por otra página y navegó hasta aquí por dentro de la aplicación, no
   * llegaron — y la solución es recargar, que sí pide el documento.
   */
  readonly aislada = signal(globalThis.crossOriginIsolated === true);

  /** Recarga de verdad, para que el servidor vuelva a mandar las cabeceras. */
  recargar(): void {
    location.reload();
  }

  /** Arranca R. Va tras un botón porque son 30 MB y se pide, no se impone. */
  encender(): void {
    this.error.set(null);

    this.r.arrancar().catch((fallo: unknown) => {
      // El fallo de aislamiento no se cuenta aquí: tiene su propia pantalla,
      // con el botón de recargar, porque su solución es distinta de «reintenta».
      if (fallo instanceof Error && fallo.message === 'SIN_AISLAMIENTO') {
        this.aislada.set(false);
        return;
      }

      this.error.set(
        'No se pudo cargar R. Suele ser la conexión: vuelve a intentarlo en un momento.',
      );
    });
  }

  /**
   * Mete el archivo del tesista en R.
   *
   * Se le pone SIEMPRE el nombre `datos.csv`, se llame como se llame el suyo.
   * Así el guion de arriba funciona sin que tenga que editar la primera línea,
   * que es donde se atasca quien no programa —y donde una barra invertida de
   * Windows rompe la ruta sin decir por qué—.
   */
  async elegirArchivo(evento: Event): Promise<void> {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;

    this.error.set(null);

    try {
      await this.r.subirArchivo('datos.csv', await archivo.arrayBuffer());
      this.archivo.set(archivo.name);
    } catch {
      this.error.set('No se pudo leer ese archivo. Guárdalo como CSV y vuelve a subirlo.');
    }
  }

  async ejecutar(): Promise<void> {
    if (this.ejecutando()) return;

    this.ejecutando.set(true);
    this.error.set(null);

    try {
      this.salida.set(await this.r.ejecutar(this.codigo.value));
    } finally {
      this.ejecutando.set(false);
    }
  }

  limpiar(): void {
    this.salida.set([]);
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
      codigo: '# Cambia cd1:cd4 por las columnas de TU variable\nalpha(datos[, c("cd1","cd2","cd3","cd4")])',
    },
    {
      nombre: 'Normalidad',
      ayuda: 'Decide si la prueba es paramétrica',
      codigo:
        '# Sobre el puntaje total, no ítem por ítem\ndatos$total <- rowMeans(datos[, c("cd1","cd2","cd3","cd4")])\nshapiro.test(datos$total)',
    },
    {
      nombre: 'Correlación',
      ayuda: 'Pearson si hubo normalidad; si no, Spearman',
      codigo:
        'datos$emp <- rowMeans(datos[, c("emp1","emp2","emp3","emp4")])\ncor.test(datos$total, datos$emp, method = "pearson")',
    },
    {
      nombre: 'Frecuencias',
      ayuda: 'Para las variables categóricas',
      codigo: 'table(datos$sexo)\nprop.table(table(datos$sexo)) * 100',
    },
  ];
}
