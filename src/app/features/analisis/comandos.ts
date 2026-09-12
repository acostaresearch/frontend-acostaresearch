/**
 * El catálogo de análisis: qué se puede hacer, cuándo, y cómo se lee lo que
 * sale.
 *
 * POR QUÉ ESTO Y NO UNA FILA DE BOTONES
 * -------------------------------------
 * Antes había cinco pastillas con el nombre de la prueba. Eso solo sirve a
 * quien ya sabe cuál necesita — y quien ya lo sabe no necesita el botón. El
 * tesista que llega aquí no está buscando «Shapiro-Wilk»: está buscando «cómo
 * sé si mis datos son normales», y sobre todo, una vez ejecutado, «y esto qué
 * quiere decir».
 *
 * Por eso cada entrada trae tres cosas y no una:
 *   · `cuando`  — en qué momento de la tesis se usa, en castellano.
 *   · `codigo`  — el código, con las columnas de SU archivo ya puestas.
 *   · `comoLee` — cómo se interpreta el resultado. Es la parte que falta en
 *                 todos los tutoriales y la que decide si el capítulo sale.
 *
 * LOS HUECOS
 * ----------
 * El código lleva marcas que se sustituyen por las columnas reales del archivo
 * que subió (ver `conColumnas`). Un ejemplo con `cd1, cd2, cd3` es un ejemplo
 * que no funciona al pulsarlo, y el primer error que ve alguien que no
 * programa no debería ser culpa nuestra.
 */

/** Un análisis del catálogo, listo para insertar en el guion. */
export interface Comando {
  nombre: string;
  cuando: string;
  comoLee: string;
  codigo: string;
}

/** Los análisis agrupados por el momento de la tesis en que se usan. */
export interface GrupoDeComandos {
  titulo: string;
  /** Para qué sirve el grupo entero, en una línea. */
  resumen: string;
  comandos: Comando[];
}

/**
 * Las marcas que se sustituyen por columnas del archivo del tesista.
 *
 * `ITEMS` son los ítems de una dimensión —las columnas con el mismo prefijo y
 * un número al final, `cd1..cd4`—, para el alfa. `NUM` y `NUM2` son los
 * puntajes de esas dimensiones, para correlacionar. `CAT` y `CAT2`, las de
 * texto, para frecuencias y para agrupar. Quién es quién lo decide la pantalla:
 * ver `eleccion` en `analisis.ts`.
 */
export interface Columnas {
  items: string;
  num: string;
  num2: string;
  cat: string;
  cat2: string;
  /**
   * Las líneas que hay que ejecutar ANTES del análisis, o cadena vacía.
   *
   * Cuando la matriz trae los ítems pero no los puntajes de cada dimensión,
   * aquí vienen los `puntaje()` que los crean. Sin eso, el ejemplo tendría que
   * conformarse con correlacionar dos ítems sueltos —o la edad—, que es lo que
   * hacía y no le sirve a nadie.
   */
  prepara: string;
  /** Las mismas líneas, sueltas, para el paso «Crear el puntaje». */
  puntajes: string;
}

/** Cambia las marcas por las columnas de verdad. */
export function conColumnas(codigo: string, c: Columnas): string {
  return codigo
    .replaceAll('{{PUNTAJES}}', c.puntajes)
    .replaceAll('{{PREPARA}}', c.prepara)
    .replaceAll('{{ITEMS}}', c.items)
    .replaceAll('{{NUM2}}', c.num2)
    .replaceAll('{{NUM}}', c.num)
    .replaceAll('{{CAT2}}', c.cat2)
    .replaceAll('{{CAT}}', c.cat);
}

export const CATALOGO: GrupoDeComandos[] = [
  {
    titulo: 'Mirar los datos',
    resumen: 'Lo primero, siempre: comprobar que el archivo entró como esperabas.',
    comandos: [
      {
        nombre: 'Ver las primeras filas',
        cuando: 'Nada más subir tu matriz, para confirmar que las columnas se leyeron bien.',
        comoLee:
          'Si ves una sola columna con todo dentro, tu CSV usa punto y coma: vuelve a subirlo ' +
          'guardado con comas, o usa read.csv2 en vez de read.csv.',
        codigo: 'head(datos)\ndim(datos)      # filas y columnas\nnames(datos)    # cómo se llama cada columna',
      },
      {
        nombre: 'Buscar datos perdidos',
        cuando: 'Antes de cualquier prueba. Un NA de más cambia todos los resultados.',
        comoLee:
          'Cada número es cuántas respuestas faltan en esa columna. Un cero en todas es lo que ' +
          'quieres. Si falta mucho en una, dilo en tu capítulo: no lo escondas.',
        codigo: 'colSums(is.na(datos))',
      },
      {
        nombre: 'Ver el tipo de cada columna',
        cuando: 'Cuando una prueba se queja de que la variable no es numérica.',
        comoLee:
          '«int» y «num» son números, y con esos se calculan medias. «chr» es texto: sirve para ' +
          'frecuencias y para agrupar, no para promediar.',
        codigo: 'str(datos)',
      },
    ],
  },
  {
    titulo: 'Descriptivos',
    resumen: 'La primera tabla del Capítulo IV, la que describe a tu muestra.',
    comandos: [
      {
        nombre: 'Media, desviación, mínimo y máximo',
        cuando: 'Para la tabla de estadísticos descriptivos de tus variables numéricas.',
        comoLee:
          'La media dice por dónde va el grupo y la DE cuánto se dispersa. Una DE muy pequeña ' +
          'con escala Likert suele significar que todos contestaron parecido.',
        codigo: 'descriptivos(datos)',
      },
      {
        nombre: 'Frecuencias de una variable categórica',
        cuando: 'Para describir tu muestra: sexo, ciclo, carrera, condición laboral.',
        comoLee:
          'Te da el recuento y el porcentaje de cada categoría. Es lo que va en la tabla de ' +
          'caracterización de la muestra, tal cual.',
        codigo: 'frecuencias(datos${{CAT}})',
      },
      {
        nombre: 'Tabla cruzada de dos categóricas',
        cuando: 'Cuando quieres ver cómo se reparte una variable dentro de otra.',
        comoLee:
          'Cada casilla es cuántos casos cumplen las dos condiciones a la vez. Si además quieres ' +
          'saber si la diferencia es significativa, usa chi-cuadrado.',
        codigo: 'table(datos${{CAT}}, datos${{CAT2}})',
      },
    ],
  },
  {
    titulo: 'Confiabilidad del instrumento',
    resumen: 'Demostrar que tu cuestionario mide de forma consistente.',
    comandos: [
      {
        nombre: 'Alfa de Cronbach',
        cuando: 'Para cada dimensión de tu instrumento, antes de usar sus puntajes.',
        comoLee:
          'Por encima de 0,70 se considera aceptable; por encima de 0,80, bueno. Si la columna ' +
          '«alfa_si_se_quita» SUBE en un ítem, ese ítem está midiendo otra cosa y conviene ' +
          'revisarlo o justificarlo.',
        codigo:
          '# Ajusta la lista a los ítems de UNA dimensión, no a todo el cuestionario\nalfa_de_cronbach(datos[, {{ITEMS}}])',
      },
      {
        nombre: 'Crear el puntaje de una dimensión',
        cuando: 'Después del alfa: convierte varios ítems en una sola variable con la que trabajar.',
        comoLee:
          'Añade una columna nueva a «datos» con el promedio de esos ítems por persona. A partir ' +
          'de ahí se usa esa columna, no los ítems sueltos.',
        codigo: '{{PUNTAJES}}',
      },
    ],
  },
  {
    titulo: 'Normalidad',
    resumen: 'La prueba que decide si el resto de tu análisis es paramétrico o no.',
    comandos: [
      {
        nombre: 'Shapiro-Wilk con veredicto',
        cuando: 'Sobre el puntaje total de cada variable, antes de correlacionar o comparar.',
        comoLee:
          'Si p ≥ 0,05 los datos NO se apartan de la normal: puedes usar Pearson, t de Student y ' +
          'ANOVA. Si p < 0,05, usa Spearman, Mann-Whitney y Kruskal-Wallis. La función te lo dice ' +
          'escrito, para que puedas copiarlo a tu capítulo.',
        codigo: '{{PREPARA}}normalidad(datos${{NUM}})',
      },
      {
        nombre: 'Histograma y gráfico Q-Q',
        cuando: 'Para acompañar el Shapiro con la figura que suele pedir el asesor.',
        comoLee:
          'En el histograma buscas una campana. En el Q-Q, que los puntos sigan la línea: si se ' +
          'curvan en los extremos, la distribución tiene colas y no es normal.',
        codigo:
          '{{PREPARA}}hist(datos${{NUM}}, main = "Distribución", xlab = "Puntaje", col = "grey90")\nqqnorm(datos${{NUM}}); qqline(datos${{NUM}}, col = "red")',
      },
    ],
  },
  {
    titulo: 'Relación entre dos variables',
    resumen: 'La hipótesis correlacional, que es la más frecuente en una tesis.',
    comandos: [
      {
        nombre: 'Correlación de Pearson',
        cuando: 'Si Shapiro dio p ≥ 0,05 en las DOS variables.',
        comoLee:
          'Mira dos cosas: «p-value» y «cor». Si p < 0,05 hay relación significativa. El valor de ' +
          'cor va de −1 a 1: por debajo de 0,3 la relación es débil, hasta 0,5 moderada, y por ' +
          'encima fuerte. El signo dice la dirección.',
        codigo:
          '{{PREPARA}}cor.test(datos${{NUM}}, datos${{NUM2}}, method = "pearson")\nplot(datos${{NUM}}, datos${{NUM2}}, xlab = "{{NUM}}", ylab = "{{NUM2}}", pch = 19)',
      },
      {
        nombre: 'Correlación de Spearman',
        cuando: 'Si Shapiro dio p < 0,05 en alguna de las dos, o si tu escala es ordinal.',
        comoLee:
          'Se lee igual que Pearson, pero el coeficiente se llama rho. El aviso sobre empates que ' +
          'a veces sale es normal con escalas Likert y no invalida nada.',
        codigo: '{{PREPARA}}cor.test(datos${{NUM}}, datos${{NUM2}}, method = "spearman")',
      },
      {
        nombre: 'Regresión lineal simple',
        cuando: 'Cuando tu hipótesis dice que una variable INFLUYE en la otra, no solo que se relacionan.',
        comoLee:
          'En el resumen busca «Adjusted R-squared»: es la proporción de la variación explicada ' +
          '(0,25 = 25 %). Y en la fila de tu predictor, «Pr(>|t|)» es su p-valor.',
        codigo: '{{PREPARA}}modelo <- lm({{NUM2}} ~ {{NUM}}, data = datos)\nsummary(modelo)',
      },
    ],
  },
  {
    titulo: 'Comparar grupos',
    resumen: 'La hipótesis comparativa: si hay diferencia entre hombres y mujeres, ciclos, turnos.',
    comandos: [
      {
        nombre: 't de Student (dos grupos, normales)',
        cuando: 'Dos grupos, y Shapiro dio p ≥ 0,05.',
        comoLee:
          'Si p < 0,05 hay diferencia significativa entre los grupos. Debajo salen las dos medias, ' +
          'que es lo que reportas junto al p.',
        codigo: '{{PREPARA}}t.test(datos${{NUM}} ~ datos${{CAT}})\nboxplot(datos${{NUM}} ~ datos${{CAT}}, xlab = "{{CAT}}", ylab = "{{NUM}}")',
      },
      {
        nombre: 'U de Mann-Whitney (dos grupos, no normales)',
        cuando: 'Dos grupos, y Shapiro dio p < 0,05.',
        comoLee:
          'Mismo criterio: p < 0,05 significa que los grupos difieren. Aquí se comparan rangos, no ' +
          'medias, así que reporta la mediana de cada grupo.',
        codigo:
          '{{PREPARA}}wilcox.test(datos${{NUM}} ~ datos${{CAT}})\ntapply(datos${{NUM}}, datos${{CAT}}, median)',
      },
      {
        nombre: 'ANOVA o Kruskal-Wallis (tres grupos o más)',
        cuando: 'Cuando la variable de agrupación tiene tres categorías o más.',
        comoLee:
          'Un p < 0,05 dice que AL MENOS un grupo se diferencia, pero no cuál: para eso está la ' +
          'prueba post-hoc de la última línea.',
        codigo:
          '{{PREPARA}}# Paramétrico\nsummary(aov(datos${{NUM}} ~ factor(datos${{CAT}})))\n\n# No paramétrico\nkruskal.test(datos${{NUM}} ~ factor(datos${{CAT}}))\n\n# Post-hoc: qué pares difieren\npairwise.wilcox.test(datos${{NUM}}, datos${{CAT}}, p.adjust.method = "holm")',
      },
      {
        nombre: 'Chi-cuadrado (dos variables categóricas)',
        cuando: 'Cuando las dos variables son categorías, no puntajes.',
        comoLee:
          'p < 0,05 significa que las dos variables están asociadas. Si R avisa de que la ' +
          'aproximación puede ser incorrecta, es que alguna casilla tiene menos de cinco casos: ' +
          'usa fisher.test en su lugar.',
        codigo: 'chisq.test(table(datos${{CAT}}, datos${{CAT2}}))',
      },
    ],
  },
  {
    titulo: 'Guardar el trabajo',
    resumen: 'Todo esto vive en la pestaña y desaparece al cerrarla.',
    comandos: [
      {
        nombre: 'Guardar la tabla en CSV',
        cuando: 'Cuando has añadido puntajes y quieres la matriz completa en tu equipo.',
        comoLee:
          'Aparece en la pestaña «Archivos», con su botón de descargar al lado. Sale con punto y ' +
          'coma y con la coma decimal, que es lo que espera el Excel en español: al abrirlo, cada ' +
          'columna cae en su celda.',
        // `write.csv2` y no `write.csv`: el 2 es la versión para los países donde el
        // decimal es la coma. Con `write.csv`, el Excel de aquí mete las 14 columnas
        // en la A y el tesista ve una página de texto donde esperaba su matriz.
        codigo: 'write.csv2(datos, "resultados.csv", row.names = FALSE, fileEncoding = "UTF-8")',
      },
      {
        nombre: 'Guardar un gráfico en PNG',
        cuando: 'Para pegarlo en el Word de tu tesis con buena resolución.',
        comoLee:
          'También sale en «Archivos». Los gráficos de la pestaña «Gráficos» son para mirar; este ' +
          'es el que se descarga.',
        codigo:
          '{{PREPARA}}png("figura1.png", width = 1200, height = 800, res = 150)\nhist(datos${{NUM}}, main = "", xlab = "Puntaje", col = "grey90")\ndev.off()',
      },
    ],
  },
];
