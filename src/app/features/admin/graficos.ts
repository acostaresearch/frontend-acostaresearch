/**
 * La geometría de los gráficos del panel, sin Angular de por medio.
 *
 * Vive aparte del componente por dos razones: son funciones puras —entra un
 * array, sale una lista de rectángulos— y así el componente se queda con lo
 * suyo, que es pedir datos y pintarlos.
 *
 * NO HAY LIBRERÍA DE GRÁFICOS, y es a propósito. Son tres gráficos de barras
 * sobre datos que ya están en memoria; meter Chart.js para esto añadiría más
 * kilobytes al panel —que ya es el trozo más pesado del sitio— que todo el
 * código de aquí, y encima trae su propia idea de cómo deben verse las cosas.
 * El SVG se calcula aquí y se pinta en la plantilla.
 */

/** Lienzo de los gráficos de columnas, en unidades de usuario del SVG. */
const ANCHO = 320;
const ALTO = 118;
/** Banda inferior reservada a las etiquetas del eje. Sin ella, se cortan. */
const BANDA_EJE = 18;
const TECHO = 10;
const BASE = ALTO - BANDA_EJE;
/**
 * Canal para las marcas del eje vertical.
 *
 * Sin él, el valor de una guía se escribe encima de la primera barra en cuanto
 * esa semana es alta: se vio en la primera prueba con datos de verdad.
 */
const CANAL = 30;

/** Tope de grosor de barra. Lo que sobra del hueco es aire, no barra. */
const GROSOR_MAXIMO = 24;

export interface Barra {
  /** Lo que va bajo el eje. Corto: si no cabe, no se lee. */
  etiqueta: string;
  /** Lo que dice la pista al pasar por encima. Aquí sí cabe la frase entera. */
  detalle: string;
  valor: number;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Centro de la barra en % del ancho, para colocar la pista sobre ella. */
  centro: number;
  /** Camino con la punta redondeada y la base recta. */
  forma: string;
}

export interface Columnas {
  barras: Barra[];
  /** Marcas del eje vertical, ya redondeadas a números limpios. */
  guias: { texto: string; y: number }[];
  total: number;
  maximo: number;
  ancho: number;
  alto: number;
  base: number;
  /** Dónde empieza el trazado: a su izquierda solo van las marcas del eje. */
  canal: number;
}

/**
 * Una columna con la punta redondeada.
 *
 * El radio se recorta cuando la barra es más baja que él: sin eso, un valor
 * pequeño sale como una pastilla deforme en vez de como una barra pequeña.
 */
function columna(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(4, alto, ancho / 2);
  const base = y + alto;
  return [
    `M${x},${base}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + ancho - r},${y}`,
    `Q${x + ancho},${y} ${x + ancho},${y + r}`,
    `L${x + ancho},${base}`,
    'Z',
  ].join(' ');
}

/** Redondea el techo del eje a un número limpio: 0, 500, 1.000, 2.500… */
function techoLimpio(maximo: number): number {
  if (maximo <= 0) return 1;

  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  for (const paso of [1, 2, 2.5, 5, 10]) {
    const candidato = paso * magnitud;
    if (candidato >= maximo) return candidato;
  }
  return 10 * magnitud;
}

/**
 * Monta un gráfico de columnas a partir de una serie ya agrupada.
 *
 * `formatear` decide cómo se leen los valores —soles, unidades— tanto en el eje
 * como en la pista, para que el gráfico no tenga que saber qué está contando.
 */
export function columnas(
  serie: { etiqueta: string; detalle: string; valor: number }[],
  formatear: (valor: number) => string,
): Columnas {
  const total = serie.reduce((suma, punto) => suma + punto.valor, 0);
  const maximo = Math.max(...serie.map((p) => p.valor), 0);
  const techo = techoLimpio(maximo);
  const util = BASE - TECHO;

  const trazado = ANCHO - CANAL;
  const hueco = trazado / Math.max(serie.length, 1);
  const grosor = Math.max(4, Math.min(GROSOR_MAXIMO, hueco - 8));

  const barras = serie.map((punto, i) => {
    const alto = punto.valor > 0 ? Math.max(2, (punto.valor / techo) * util) : 0;
    const x = CANAL + i * hueco + (hueco - grosor) / 2;

    return {
      ...punto,
      x,
      y: BASE - alto,
      ancho: grosor,
      alto,
      centro: ((x + grosor / 2) / ANCHO) * 100,
      forma: alto > 0 ? columna(x, BASE - alto, grosor, alto) : '',
    };
  });

  // Tres guías bastan: suelo, mitad y techo. Más rayas es más ruido para leer
  // lo mismo, y la pista ya da el valor exacto de cada barra.
  const guias = [0, 0.5, 1].map((parte) => ({
    texto: formatear(techo * parte),
    y: BASE - parte * util,
  }));

  return { barras, guias, total, maximo, ancho: ANCHO, alto: ALTO, base: BASE, canal: CANAL };
}

/** Lunes de la semana a la que pertenece una fecha. Base de los agrupados. */
export function lunes(fecha: Date): Date {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  // getDay() da 0 el domingo; se corre al lunes anterior, no al siguiente.
  const desplazamiento = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - desplazamiento);
  return d;
}

const DIA_MES = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' });

/** «1 sep». El año se omite: son ventanas de semanas, no de años. */
export function diaMes(fecha: Date): string {
  return DIA_MES.format(fecha).replace('.', '');
}

/**
 * Reparte lo que devuelva `valorDe` en semanas consecutivas.
 *
 * Las semanas sin nada también salen, con un cero: un hueco en el eje dice
 * «esa semana no vendiste», y saltársela contaría otra historia.
 */
export function porSemana<T>(
  filas: T[],
  fechaDe: (fila: T) => Date | null,
  valorDe: (fila: T) => number,
  semanas: number,
  desde: Date = lunes(new Date()),
  haciaAtras = true,
): { etiqueta: string; detalle: string; valor: number; inicio: Date }[] {
  const cubos = Array.from({ length: semanas }, (_, i) => {
    const inicio = new Date(desde);
    inicio.setDate(inicio.getDate() + (haciaAtras ? -(semanas - 1 - i) : i) * 7);
    return { inicio, valor: 0 };
  });

  const primera = cubos[0].inicio.getTime();
  const ultima = cubos[cubos.length - 1].inicio.getTime();

  for (const fila of filas) {
    const fecha = fechaDe(fila);
    if (!fecha) continue;

    const semana = lunes(fecha).getTime();
    if (semana < primera || semana > ultima) continue;

    const indice = Math.round((semana - primera) / (7 * 24 * 60 * 60 * 1000));
    cubos[indice].valor += valorDe(fila);
  }

  return cubos.map(({ inicio, valor }) => ({
    inicio,
    valor,
    etiqueta: diaMes(inicio),
    detalle: `Semana del ${diaMes(inicio)}`,
  }));
}

/** Agrupa por una clave de texto y ordena de mayor a menor. */
export function porCategoria<T>(
  filas: T[],
  claveDe: (fila: T) => string,
  valorDe: (fila: T) => number,
): { etiqueta: string; valor: number; parte: number }[] {
  const cuenta = new Map<string, number>();
  for (const fila of filas) {
    const clave = claveDe(fila);
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + valorDe(fila));
  }

  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  const mayor = orden.length > 0 ? orden[0][1] : 0;

  // La barra se mide contra la mayor, no contra el total: lo que se compara
  // aquí es «cuánto entra por cada vía», no qué porción del pastel es cada una.
  return orden.map(([etiqueta, valor]) => ({
    etiqueta,
    valor,
    parte: mayor > 0 ? (valor / mayor) * 100 : 0,
  }));
}
