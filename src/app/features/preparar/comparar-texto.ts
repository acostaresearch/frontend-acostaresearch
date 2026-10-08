/**
 * Los trozos de un párrafo con su color, para la vista «Lado a lado».
 *
 * Corrigiendo, se compara palabra a palabra: en el original se pinta en rojo lo
 * que se quitó y en el resultado en verde lo que entró. Traduciendo no: todo el
 * párrafo es otro, y una comparación palabra a palabra lo pintaría entero de
 * rojo y verde sin decir nada. Ahí solo se marcan las citas.
 *
 * Las citas van en azul en los dos lados, salvo que la corrección las haya
 * tocado —no debería, el servidor lo impide—, y entonces gana el rojo o el
 * verde, que es lo que hay que ver.
 */

export type TipoTrozo = 'igual' | 'quitado' | 'nuevo' | 'cita';

export interface Trozo {
  texto: string;
  tipo: TipoTrozo;
}

/** Palabras y espacios por separado, para que un espacio no cuente como cambio. */
const FICHAS = /\s+|[^\s]+/g;

/** Por encima de esto, la tabla de la comparación pesa demasiado: se marca entero. */
const MAXIMO_FICHAS = 1500;

const fichasDe = (texto: string): string[] => texto.match(FICHAS) ?? [];

/**
 * Qué fichas de cada lado sobreviven, por la subsecuencia común más larga.
 * Devuelve dos listas de booleanos: `true` = esa ficha está en los dos.
 */
function comunes(a: string[], b: string[]): [boolean[], boolean[]] {
  const n = a.length;
  const m = b.length;
  const tabla: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      tabla[i][j] =
        a[i] === b[j] ? tabla[i + 1][j + 1] + 1 : Math.max(tabla[i + 1][j], tabla[i][j + 1]);
    }
  }

  const enA = new Array<boolean>(n).fill(false);
  const enB = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      enA[i++] = true;
      enB[j++] = true;
    } else if (tabla[i + 1][j] >= tabla[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return [enA, enB];
}

/** Dónde empieza y acaba cada cita dentro del texto. */
function tramosDeCitas(texto: string, citas: readonly string[]): [number, number][] {
  const tramos: [number, number][] = [];
  for (const cita of citas) {
    let desde = 0;
    for (;;) {
      const i = texto.indexOf(cita, desde);
      if (i === -1 || cita.length === 0) break;
      tramos.push([i, i + cita.length]);
      desde = i + cita.length;
    }
  }
  return tramos;
}

/** Une los trozos seguidos del mismo tipo: menos `<span>` en la página. */
function juntar(trozos: Trozo[]): Trozo[] {
  const juntos: Trozo[] = [];
  for (const trozo of trozos) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && ultimo.tipo === trozo.tipo) ultimo.texto += trozo.texto;
    else juntos.push({ ...trozo });
  }
  return juntos;
}

/** Las fichas con su tipo, marcando en azul las que caen dentro de una cita. */
function conCitas(fichas: string[], tipos: TipoTrozo[], citas: readonly string[]): Trozo[] {
  const texto = fichas.join('');
  const tramos = tramosDeCitas(texto, citas);
  let pos = 0;
  return fichas.map((ficha, k) => {
    const inicio = pos;
    pos += ficha.length;
    // Basta con que la toque: «2020).» lleva pegado el punto de después.
    const enCita = tramos.some(([a, b]) => inicio < b && pos > a);
    return { texto: ficha, tipo: tipos[k] === 'igual' && enCita ? 'cita' : tipos[k] };
  });
}

/**
 * Los dos lados de un párrafo, troceados.
 *
 * `palabraAPalabra` es falso traduciendo: entonces solo se marcan las citas.
 * Un espacio que queda entre dos cambios se pinta con ellos, para que «a big
 * change» se lea como un solo tramo rojo y no como tres.
 */
export function trocear(
  original: string,
  resultado: string,
  citasOriginal: readonly string[],
  citasResultado: readonly string[],
  palabraAPalabra: boolean,
): { original: Trozo[]; resultado: Trozo[] } {
  const a = fichasDe(original);
  const b = fichasDe(resultado);

  let tiposA: TipoTrozo[] = a.map(() => 'igual');
  let tiposB: TipoTrozo[] = b.map(() => 'igual');

  if (palabraAPalabra && original !== resultado) {
    if (a.length > MAXIMO_FICHAS || b.length > MAXIMO_FICHAS) {
      tiposA = a.map(() => 'quitado');
      tiposB = b.map(() => 'nuevo');
    } else {
      const [enA, enB] = comunes(a, b);
      tiposA = a.map((_, k) => (enA[k] ? 'igual' : 'quitado'));
      tiposB = b.map((_, k) => (enB[k] ? 'igual' : 'nuevo'));
      rellenarEspacios(a, tiposA, 'quitado');
      rellenarEspacios(b, tiposB, 'nuevo');
    }
  }

  return {
    original: juntar(conCitas(a, tiposA, citasOriginal)),
    resultado: juntar(conCitas(b, tiposB, citasResultado)),
  };
}

/** Un espacio «igual» entre dos fichas cambiadas pasa a ser parte del cambio. */
function rellenarEspacios(fichas: string[], tipos: TipoTrozo[], cambio: TipoTrozo): void {
  for (let k = 1; k < fichas.length - 1; k++) {
    if (/^\s+$/.test(fichas[k]) && tipos[k - 1] === cambio && tipos[k + 1] === cambio) {
      tipos[k] = cambio;
    }
  }
}
