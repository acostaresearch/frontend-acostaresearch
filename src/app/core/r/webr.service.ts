import { Injectable, signal } from '@angular/core';

/**
 * La versión de WebR de la que se bajan los binarios.
 *
 * Tiene que coincidir con la de `@r-wasm/webr` en `package.json`. Van juntas
 * porque los scripts que se copian a `public/` salen del paquete y los binarios
 * del CDN: si se separan, el hilo de trabajo de una versión intenta cargar el R
 * de otra, y eso falla de formas que no se parecen a su causa.
 *
 * No hay que acordarse de cambiarla a mano: `scripts/copiar-webr.js` compara
 * este número con el del paquete instalado y corta el build si no coinciden.
 */
const VERSION = '0.2.0';

/**
 * Las funciones que una tesis necesita y que R no trae con ese nombre.
 *
 * POR QUÉ NO SE USA `psych`
 * -------------------------
 * Era lo natural —`alpha()` y `describe()` salen de ahí— pero **no se puede
 * instalar en WebR**: `psych` importa `mnormt`, y `mnormt` no está compilado
 * para WebAssembly en el repositorio de WebR. El paquete se baja, y luego
 * `library(psych)` falla por la dependencia que falta.
 *
 * Escribirlas aquí no es un apaño: el alfa de Cronbach son cinco líneas de
 * fórmula, y lo demás que pide una tesis —Shapiro-Wilk, Pearson, Spearman, t de
 * Student, ANOVA, chi-cuadrado— ya viene en `stats`, que es parte de R. Con
 * esto la página no depende de ningún paquete externo, arranca varios segundos
 * antes y no puede romperse porque un repositorio de terceros cambie.
 *
 * Probadas con Rscript contra la matriz de ejemplo: alfa 0,886, Shapiro
 * p=0,148, Pearson r=0,511.
 */
const PREAMBULO = String.raw`
alfa_de_cronbach <- function(items) {
  items <- as.data.frame(items)
  items <- items[stats::complete.cases(items), , drop = FALSE]
  k <- ncol(items)

  if (k < 2) stop("El alfa necesita al menos dos items.")

  total <- rowSums(items)
  alfa <- (k / (k - 1)) * (1 - sum(apply(items, 2, stats::var)) / stats::var(total))

  por_item <- t(sapply(seq_len(k), function(i) {
    resto <- items[, -i, drop = FALSE]
    kk <- ncol(resto)
    sin_el <- if (kk < 2) NA else {
      (kk / (kk - 1)) * (1 - sum(apply(resto, 2, stats::var)) / stats::var(rowSums(resto)))
    }
    c(r_item_resto = stats::cor(items[, i], rowSums(resto)), alfa_si_se_quita = sin_el)
  }))

  rownames(por_item) <- names(items)

  cat("Alfa de Cronbach:", round(alfa, 3), "\n")
  cat("Items:", k, " Casos:", nrow(items), "\n\n")
  cat("Si el alfa SUBE al quitar un item, ese item mide otra cosa:\n")
  print(round(as.data.frame(por_item), 3))

  invisible(alfa)
}

descriptivos <- function(datos) {
  datos <- as.data.frame(datos)
  numericas <- datos[, sapply(datos, is.numeric), drop = FALSE]

  if (ncol(numericas) == 0) stop("No hay ninguna columna numerica.")

  resumen <- data.frame(
    n = sapply(numericas, function(x) sum(!is.na(x))),
    media = round(sapply(numericas, mean, na.rm = TRUE), 2),
    de = round(sapply(numericas, stats::sd, na.rm = TRUE), 2),
    minimo = sapply(numericas, min, na.rm = TRUE),
    maximo = sapply(numericas, max, na.rm = TRUE)
  )

  print(resumen)
  invisible(resumen)
}
`;

/** Una línea de la consola de R, con su origen. */
export interface LineaDeSalida {
  tipo: 'stdout' | 'stderr';
  texto: string;
}

/** Un objeto vivo en la sesión, como se ve en el panel de entorno. */
export interface ObjetoDelEntorno {
  nombre: string;
  /** «data.frame», «numeric»… lo que diga `class()`. */
  clase: string;
  /** «60 obs. de 14 variables», «num [1:60]»… el resumen de una línea. */
  detalle: string;
}

/** Un archivo de la carpeta de trabajo. */
export interface ArchivoDeLaSesion {
  nombre: string;
  bytes: number;
}

/** Lo que devuelve una ejecución: la consola y los gráficos que salieron. */
export interface Resultado {
  salida: LineaDeSalida[];
  /** Cada gráfico como `data:` URL, listo para un `<img>`. */
  graficos: string[];
}

/**
 * Con qué se separan los campos que R devuelve para el panel de entorno.
 *
 * Caracteres de control y no comas ni tabuladores: el nombre de una columna
 * puede llevar una coma dentro, y entonces la fila se partiría en dos. Van
 * como escape y no como el carácter literal porque literales son invisibles,
 * y un reformateo que los pierda dejaría el panel vacío sin un solo error.
 */
const SEPARADOR_FILA = '\u001e';
const SEPARADOR_CAMPO = '\u001f';

/** La carpeta donde vive todo lo del tesista. Es el `getwd()` de la sesión. */
const CASA = '/home/web_user';

/** Dónde caen los gráficos antes de recogerlos. Aparte, para no listarlos. */
const GRAFICOS = '/tmp/graficos';

/**
 * R corriendo dentro del navegador del tesista.
 *
 * POR QUÉ AQUÍ Y NO EN UN SERVIDOR
 * --------------------------------
 * Porque no hay servidor, y no lo va a haber. RStudio Server necesita una
 * máquina, y ponerlo en la de la API sería dar a cada comprador algo muy
 * parecido a una consola donde viven los secretos, los capítulos de todos y los
 * comprobantes de pago.
 *
 * WebR es R compilado a WebAssembly: se descarga una vez y se ejecuta en la
 * pestaña. Cero infraestructura, cero cuentas que aprovisionar, y los datos del
 * tesista no salen de su equipo — cosa que ningún servidor puede prometer.
 *
 * LO QUE ESTO NO ES
 * -----------------
 * NO es RStudio. Es R, que es lo que se declara en una tesis, pero no tiene la
 * interfaz de cuatro paneles ni sale en una captura como RStudio. Quien tenga
 * que enseñarle a su asesor la pantalla, tendrá que abrir RStudio y volver a
 * correr el mismo script — sale igual, porque es el mismo R y el mismo código.
 *
 * Eso hay que decirlo en la página, sin letra pequeña.
 *
 * SE CARGA CUANDO SE PIDE, NO AL ARRANCAR
 * ---------------------------------------
 * El paquete son decenas de megas. Cargarlo con la aplicación castigaría a
 * todos los que nunca van a analizar datos, que son la mayoría. Por eso el
 * `import()` va dentro de `arrancar()` y no arriba del archivo.
 */
@Injectable({ providedIn: 'root' })
export class WebrService {
  /** En qué punto va el arranque, para poder contarlo en pantalla. */
  readonly estado = signal<'apagado' | 'arrancando' | 'listo' | 'error'>('apagado');
  readonly paso = signal<string>('');

  /**
   * El arranque en curso, que resuelve en la instancia ya lista.
   *
   * Devuelve la instancia en vez de guardarla en un campo aparte para que quien
   * la use la tenga garantizada: con un campo que puede ser nulo, cada llamada
   * tendría que comprobarlo, y esa comprobación es la que un día se olvida.
   *
   * Dos llamadas a la vez esperan a la misma promesa: no se arrancan dos R.
   */
  private arranque: Promise<import('@r-wasm/webr').WebR> | null = null;

  arrancar(): Promise<import('@r-wasm/webr').WebR> {
    if (this.arranque) return this.arranque;

    this.arranque = this.arrancarDeVerdad().catch((error) => {
      // Se suelta la promesa para que un segundo intento pueda volver a probar:
      // el fallo típico es de red al bajar el paquete, y eso se reintenta.
      this.arranque = null;
      this.estado.set('error');
      throw error;
    });

    return this.arranque;
  }

  private async arrancarDeVerdad(): Promise<import('@r-wasm/webr').WebR> {
    /**
     * Sin aislamiento no se arranca, y no es rigidez.
     *
     * WebR tiene un canal de reserva para páginas no aisladas que simula la
     * memoria compartida con un Service Worker. Se probó, y falla de formas que
     * no se relacionan con su causa: lecturas fuera de rango en mitad de un
     * análisis, peticiones que no vuelven. Un tesista lo leería como «la web
     * está rota» a los diez minutos de trabajo, no al abrir.
     *
     * Es preferible no arrancar y decir por qué. La causa casi siempre es haber
     * llegado navegando por dentro de la aplicación: las cabeceras viajan con
     * el documento, y por dentro no se pide documento nuevo.
     */
    if (!globalThis.crossOriginIsolated) {
      this.estado.set('error');
      throw new Error('SIN_AISLAMIENTO');
    }

    this.estado.set('arrancando');
    this.paso.set('Descargando R… (unos 30 MB, solo la primera vez)');

    const { WebR } = await import('@r-wasm/webr');

    const webR = new WebR({
      /**
       * De dónde se baja R, dicho a las claras.
       *
       * El paquete de npm trae la dirección VACÍA, así que el hilo de trabajo
       * la resuelve relativa a sí mismo — y como sus scripts se copian a la
       * raíz de nuestro dominio, acababa pidiendo `acostaresearch.com/R.bin.js`
       * y fallando con un NetworkError que en realidad era un 404.
       *
       * Se apunta al CDN oficial, y CON LA VERSIÓN CLAVADA, no con «latest»:
       * los binarios tienen que corresponderse con el paquete instalado, y un
       * «latest» que avance por su cuenta rompería la página sin que nadie
       * hubiera tocado nada aquí.
       */
      baseUrl: `https://webr.r-wasm.org/v${VERSION}/`,
      /**
       * El canal bueno, exigido y no elegido.
       *
       * `Automatic` prueba la memoria compartida y, si no puede, cae al Service
       * Worker sin decir nada. Ese silencio es el problema: la página parece
       * funcionar y se rompe más tarde, dentro de un análisis. Pidiéndolo
       * explícitamente, o va por memoria compartida o falla al arrancar, que es
       * el momento en que un fallo se entiende.
       */
      channelType: 1 /* ChannelType.SharedArrayBuffer */,
    });

    await webR.init();

    // Las funciones de la casa. No se instala ningún paquete: ver `PREAMBULO`.
    this.paso.set('Preparando las funciones de análisis…');
    await webR.evalRVoid(PREAMBULO);

    this.paso.set('');
    this.estado.set('listo');

    return webR;
  }

  /**
   * Deja un archivo del tesista dentro del sistema de archivos de R.
   *
   * A partir de ahí `read.csv("datos.csv")` funciona igual que en RStudio. El
   * archivo vive en la memoria de la pestaña: al cerrarla desaparece, y no ha
   * viajado a ningún sitio.
   */
  async subirArchivo(nombre: string, contenido: ArrayBuffer): Promise<void> {
    const webR = await this.arrancar();
    await webR.FS.writeFile(`/home/web_user/${nombre}`, new Uint8Array(contenido));
  }

  /**
   * Ejecuta código y devuelve lo que habría salido por la consola.
   *
   * `withAutoprint` es lo que hace que escribir `mean(x)` a secas imprima el
   * resultado, igual que en la consola de R. Sin eso, el tesista escribiría lo
   * mismo que en RStudio y no vería nada.
   *
   * Los errores de R NO se lanzan como excepción: vuelven como líneas de
   * `stderr`, que es como los ve en la consola. Un error de sintaxis es parte
   * del trabajo, no un fallo de la página.
   */
  async ejecutar(codigo: string): Promise<Resultado> {
    const webR = await this.arrancar();
    const shelter = await new webR.Shelter();

    try {
      /**
       * El código va envuelto para recoger los gráficos.
       *
       * Se abre un dispositivo PNG antes y se cierra después, así que un
       * `hist()` o un `plot()` del tesista acaban en archivos que luego se
       * leen. Va dentro de `try` porque no todas las compilaciones de R para
       * WebAssembly traen el dispositivo: si no está, el `try` se lo traga y
       * lo único que pasa es que no hay gráficos. El análisis sigue igual.
       *
       * Y el `dev.off()` va en `on.exit` para que también se cierre si el
       * código del tesista falla a mitad: un dispositivo abierto se queda
       * capturando las ejecuciones siguientes, y entonces el gráfico aparece
       * una vez y no vuelve a aparecer nunca.
       */
      const envuelto = [
        `try({ dir.create("${GRAFICOS}", showWarnings = FALSE, recursive = TRUE)`,
        `  unlink(list.files("${GRAFICOS}", full.names = TRUE))`,
        `  grDevices::png("${GRAFICOS}/g%03d.png", width = 900, height = 620)`,
        `  on.exit(try(grDevices::dev.off(), silent = TRUE), add = TRUE) }, silent = TRUE)`,
        codigo,
      ].join('\n');

      const resultado = await shelter.captureR(envuelto, {
        withAutoprint: true,
        captureStreams: true,
        captureConditions: false,
      });

      // El dispositivo se cierra aparte además del `on.exit`: `captureR` evalúa
      // en su propio ámbito y el `on.exit` de arriba puede dispararse antes de
      // que el código haya pintado. Cerrarlo dos veces es inofensivo.
      await webR.evalRVoid('try(while (grDevices::dev.cur() > 1) grDevices::dev.off(), silent = TRUE)');

      return {
        salida: (resultado.output ?? []).map((linea) => ({
          tipo: linea.type === 'stderr' ? ('stderr' as const) : ('stdout' as const),
          texto: String(linea.data),
        })),
        graficos: await this.recogerGraficos(webR),
      };
    } catch (error) {
      return {
        salida: [
          { tipo: 'stderr', texto: error instanceof Error ? error.message : String(error) },
        ],
        graficos: [],
      };
    } finally {
      // Sin esto, cada ejecución deja objetos de R vivos y la pestaña va
      // engordando durante la sesión.
      await shelter.purge();
    }
  }

  /** Los PNG que dejó la ejecución, convertidos a `data:` URL. */
  private async recogerGraficos(webR: import('@r-wasm/webr').WebR): Promise<string[]> {
    let nombres: string[] = [];

    try {
      const carpeta = await webR.FS.lookupPath(GRAFICOS);
      nombres = Object.keys(carpeta.contents ?? {}).sort();
    } catch {
      // No se llegó a crear: no hubo gráficos, o no hay dispositivo PNG.
      return [];
    }

    const graficos: string[] = [];

    for (const nombre of nombres) {
      try {
        const bytes = await webR.FS.readFile(`${GRAFICOS}/${nombre}`);
        // Un PNG vacío es un dispositivo que se abrió y no llegó a pintar.
        if (bytes.length === 0) continue;
        graficos.push(`data:image/png;base64,${aBase64(bytes)}`);
      } catch {
        // Un gráfico que no se puede leer no puede tumbar el análisis entero.
      }
    }

    return graficos;
  }

  /**
   * Lo que hay vivo en la sesión, para el panel de entorno.
   *
   * Se pide a R en una sola llamada y se devuelve ya formateado: preguntar
   * objeto por objeto serían tantas idas y vueltas como variables, y esto se
   * refresca después de CADA ejecución.
   */
  async entorno(): Promise<ObjetoDelEntorno[]> {
    const webR = await this.arrancar();

    const codigo = `
      local({
        nombres <- ls(envir = globalenv())
        nombres <- nombres[!startsWith(nombres, ".")]
        if (length(nombres) == 0) return("")
        paste(vapply(nombres, function(n) {
          x <- get(n, envir = globalenv())
          clase <- paste(class(x), collapse = "/")
          detalle <- if (is.data.frame(x)) {
            paste0(nrow(x), " obs. de ", ncol(x), " variables")
          } else if (is.function(x)) {
            "funcion"
          } else if (is.null(dim(x))) {
            paste0(class(x)[1], " [1:", length(x), "]")
          } else {
            paste(dim(x), collapse = " x ")
          }
          paste(n, clase, detalle, sep = "\\u001f")
        }, character(1)), collapse = "\\u001e")
      })
    `;

    try {
      const crudo = await webR.evalRString(codigo);
      if (!crudo) return [];

      return crudo.split(SEPARADOR_FILA).map((fila) => {
        const [nombre, clase, detalle] = fila.split(SEPARADOR_CAMPO);
        return { nombre, clase, detalle };
      });
    } catch {
      // El entorno es información de apoyo: que falle no puede estropear la
      // ejecución que el tesista acaba de hacer.
      return [];
    }
  }

  /** Los archivos de su carpeta de trabajo, para el panel de archivos. */
  async archivos(): Promise<ArchivoDeLaSesion[]> {
    const webR = await this.arrancar();

    try {
      const carpeta = await webR.FS.lookupPath(CASA);
      const nombres = Object.keys(carpeta.contents ?? {}).filter((n) => !n.startsWith('.'));

      const archivos: ArchivoDeLaSesion[] = [];

      for (const nombre of nombres.sort()) {
        try {
          const bytes = await webR.FS.readFile(`${CASA}/${nombre}`);
          archivos.push({ nombre, bytes: bytes.length });
        } catch {
          // Es una carpeta, no un archivo. No se listan.
        }
      }

      return archivos;
    } catch {
      return [];
    }
  }

  /** Los bytes de un archivo, para poder descargarlo al equipo del tesista. */
  async leerArchivo(nombre: string): Promise<Uint8Array> {
    const webR = await this.arrancar();
    return webR.FS.readFile(`${CASA}/${nombre}`);
  }
}

/**
 * Bytes a base64, por trozos.
 *
 * `String.fromCharCode(...bytes)` de una vez revienta la pila con un PNG de
 * medio mega: son cientos de miles de argumentos en una sola llamada. De 8 en
 * 8 kB no.
 */
function aBase64(bytes: Uint8Array): string {
  let binario = '';
  const TROZO = 8192;

  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }

  return btoa(binario);
}
