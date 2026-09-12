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

frecuencias <- function(x, etiqueta = NULL) {
  x <- x[!is.na(x)]
  conteo <- table(x)
  tabla <- data.frame(
    categoria = names(conteo),
    n = as.integer(conteo),
    porcentaje = round(as.numeric(conteo) / length(x) * 100, 1)
  )
  tabla$acumulado <- cumsum(tabla$porcentaje)

  if (!is.null(etiqueta)) cat(etiqueta, "\n")
  print(tabla, row.names = FALSE)
  cat("Total:", length(x), "casos\n")

  invisible(tabla)
}

puntaje <- function(datos, columnas) {
  faltan <- setdiff(columnas, names(datos))
  if (length(faltan) > 0) {
    stop("Estas columnas no estan en tus datos: ", paste(faltan, collapse = ", "))
  }
  rowMeans(datos[, columnas, drop = FALSE], na.rm = TRUE)
}

normalidad <- function(x, etiqueta = "la variable") {
  x <- x[!is.na(x)]
  n <- length(x)

  if (n < 3) stop("Hacen falta al menos tres casos.")
  if (n > 5000) stop("Shapiro-Wilk no admite mas de 5000 casos.")

  sw <- stats::shapiro.test(x)
  p <- sw$p.value

  cat("Shapiro-Wilk sobre", etiqueta, "\n")
  cat("  W =", round(sw$statistic, 4), "   p =", format.pval(p, digits = 4), "   n =", n, "\n\n")

  # El veredicto escrito, no solo el numero: es la frase que decide las tres
  # pruebas siguientes, y equivocarse de lado invalida el capitulo entero.
  if (p >= 0.05) {
    cat("p >= 0.05: los datos NO se apartan de la normal.\n")
    cat("Puedes usar pruebas parametricas: Pearson, t de Student, ANOVA.\n")
  } else {
    cat("p < 0.05: los datos SI se apartan de la normal.\n")
    cat("Usa pruebas no parametricas: Spearman, Mann-Whitney, Kruskal-Wallis.\n")
  }

  invisible(sw)
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

/**
 * Las funciones que define `PREAMBULO`.
 *
 * Viven en el entorno global, como cualquier objeto del tesista, y eso tiene
 * dos consecuencias que hay que corregir a mano: salían en el panel de Entorno
 * como si las hubiera creado él, y «Vaciar» se las llevaba por delante —después
 * de eso `descriptivos()` no existía hasta recargar la página—.
 *
 * La lista va aquí, al lado de las definiciones, para que añadir una función
 * y olvidarse de esto sea difícil.
 */
export const FUNCIONES_DE_LA_CASA = [
  'alfa_de_cronbach',
  'descriptivos',
  'frecuencias',
  'normalidad',
  'puntaje',
];

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

/** Una columna del data.frame que subio el tesista. */
export interface ColumnaDeDatos {
  nombre: string;
  numerica: boolean;
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
 * Los nombres de lo que hay dentro de una carpeta de WebR.
 *
 * POR QUÉ NO ES `Object.keys(carpeta.contents)`
 * ---------------------------------------------
 * Porque `contents` es una LISTA de nodos, y el nombre de cada archivo va
 * dentro, en su `name`. Con `Object.keys()` salían los índices —«0», «1»— y
 * luego `readFile('/tmp/graficos/0')` fallaba con un error de sistema de
 * archivos que estaba capturado y en silencio. Efecto: la pestaña de gráficos
 * y la de archivos salían siempre VACÍAS, con el PNG ya escrito al lado. Un
 * `hist()` funcionaba en R y no aparecía en pantalla.
 *
 * Se admiten las dos formas porque la declaración de tipos es nuestra y podría
 * volver a mentir: si un día `contents` llega como objeto por nombre, esto
 * sigue devolviendo nombres y no índices.
 */
export const hijosDe = (carpeta: import('@r-wasm/webr').WebRNodoFS | undefined): string[] => {
  const dentro = carpeta?.contents;
  if (!dentro) return [];

  const nodos = Array.isArray(dentro) ? dentro : Object.values(dentro);

  return nodos
    .map((nodo) => nodo?.name)
    .filter((nombre): nombre is string => typeof nombre === 'string' && nombre.length > 0);
};

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
       * El de captura se abre SOLO si no hay otro abierto, y al terminar se
       * cierra SOLO el suyo, por número. Antes se abría siempre y al final se
       * cerraban todos, y eso rompía guardar una figura línea a línea: el
       * `png("figura1.png")` de una línea moría al acabar esa ejecución, el
       * `hist()` de la siguiente iba a la pestaña, y en disco quedaba un PNG en
       * blanco. Se comprobó con R: 1.046 bytes línea a línea contra 10.125 con
       * todo de una vez. Ejecutar línea a línea es justo como se enseña a
       * trabajar aquí, así que el fallo le tocaba a todo el que siguiera el
       * método.
       *
       * Con un dispositivo del tesista abierto, el gráfico va a su archivo y no
       * a la pestaña. Es lo mismo que hace RStudio: mientras hay un `png()`
       * abierto, el panel de gráficos no se entera.
       */
      const envuelto = [
        `try({ dir.create("${GRAFICOS}", showWarnings = FALSE, recursive = TRUE)`,
        `  unlink(list.files("${GRAFICOS}", full.names = TRUE))`,
        `  assign(".acosta_captura", NULL, envir = globalenv())`,
        `  if (grDevices::dev.cur() == 1) {`,
        `    grDevices::png("${GRAFICOS}/g%03d.png", width = 900, height = 620)`,
        `    assign(".acosta_captura", grDevices::dev.cur(), envir = globalenv())`,
        `  } }, silent = TRUE)`,
        codigo,
      ].join('\n');

      const resultado = await shelter.captureR(envuelto, {
        withAutoprint: true,
        captureStreams: true,
        captureConditions: false,
      });

      // Solo el de captura, y por su número: el que haya abierto el tesista
      // sigue abierto para la línea siguiente. Ver el comentario de arriba.
      await webR.evalRVoid(
        'try({ captura <- get0(".acosta_captura", envir = globalenv()); ' +
          'if (!is.null(captura) && captura %in% grDevices::dev.list()) ' +
          'grDevices::dev.off(captura) }, silent = TRUE)',
      );

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
      nombres = hijosDe(carpeta).sort();
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
        # Las de la casa no son objetos del tesista: no se enseñan.
        nombres <- setdiff(nombres, c(${FUNCIONES_DE_LA_CASA.map((f) => `"${f}"`).join(', ')}))
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

  /**
   * Las columnas de un data.frame de la sesion, con su tipo.
   *
   * Sirve para que los ejemplos del catalogo lleven las columnas DE SU archivo
   * y no `cd1, cd2, cd3`. Un ejemplo que falla al pulsarlo es peor que ninguno:
   * el primer error que ve alguien que no programa no deberia ser culpa
   * nuestra.
   */
  async columnas(objeto = 'datos'): Promise<ColumnaDeDatos[]> {
    const webR = await this.arrancar();

    const codigo = `
      local({
        if (!exists("${objeto}", envir = globalenv())) return("")
        d <- get("${objeto}", envir = globalenv())
        if (!is.data.frame(d)) return("")
        paste(vapply(names(d), function(n) {
          paste(n, if (is.numeric(d[[n]])) "num" else "texto", sep = "\\u001f")
        }, character(1)), collapse = "\\u001e")
      })
    `;

    try {
      const crudo = await webR.evalRString(codigo);
      if (!crudo) return [];

      return crudo.split(SEPARADOR_FILA).map((fila) => {
        const [nombre, tipo] = fila.split(SEPARADOR_CAMPO);
        return { nombre, numerica: tipo === 'num' };
      });
    } catch {
      return [];
    }
  }

  /**
   * Vuelve a dejar la sesion como recien arrancada.
   *
   * Borra los objetos y los archivos, y vuelve a definir las funciones de la
   * casa. NO vuelve a descargar R: los 30 MB ya estan en la pestaña. Es el
   * «Restart R» de RStudio, que es lo que se pulsa cuando algo se enredo y no
   * se sabe por que.
   */
  async reiniciar(): Promise<void> {
    const webR = await this.arrancar();

    // Reiniciar también cierra los gráficos que el tesista dejara abiertos: un
    // `png()` sin su `dev.off()` es de lo que más enreda una sesión.
    await webR.evalRVoid('try(grDevices::graphics.off(), silent = TRUE)');
    await webR.evalRVoid('rm(list = ls(envir = globalenv()), envir = globalenv())');

    try {
      const carpeta = await webR.FS.lookupPath(CASA);
      for (const nombre of hijosDe(carpeta)) {
        if (nombre.startsWith('.')) continue;
        try {
          await webR.FS.unlink(`${CASA}/${nombre}`);
        } catch {
          // Es una carpeta. Se queda.
        }
      }
    } catch {
      // Sin carpeta que limpiar.
    }

    await webR.evalRVoid(PREAMBULO);
  }

  /** La version de R que corre dentro, para la cabecera de la consola. */
  async version(): Promise<string> {
    const webR = await this.arrancar();
    try {
      return await webR.evalRString('paste0("R ", R.version$major, ".", R.version$minor)');
    } catch {
      return 'R';
    }
  }

  /** Los archivos de su carpeta de trabajo, para el panel de archivos. */
  async archivos(): Promise<ArchivoDeLaSesion[]> {
    const webR = await this.arrancar();

    try {
      const carpeta = await webR.FS.lookupPath(CASA);
      const nombres = hijosDe(carpeta).filter((n) => !n.startsWith('.'));

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
