/**
 * Revisa un correo antes de mandarle un código.
 *
 * El `type="email"` del navegador y `Validators.email` solo miran la forma:
 * `kelin@gamail.com` la tiene perfecta y se vendió un código a un dominio que no
 * es de nadie. Aquí se busca la errata a propósito: un dominio a una o dos letras
 * de gmail, hotmail, outlook, yahoo o icloud es uno de esos mal tecleado.
 *
 * Es copia de `backend/src/shared/utils/correo.js`, que es la que manda. Esta
 * existe para avisar mientras se escribe y proponer el arreglo con un clic; si
 * cambian las reglas, cambian en los dos sitios.
 */

export interface RevisionDeCorreo {
  /** El correo sin espacios y en minúsculas. */
  correo: string;
  /** Qué le pasa, o null si está bien. */
  problema: string | null;
  /** El correo corregido, cuando se puede adivinar. */
  sugerencia: string | null;
}

/** Dominios reales que se parecen a los grandes y no hay que «corregir». */
const DOMINIOS_BUENOS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.es',
  'outlook.com',
  'outlook.es',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.es',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  // A una letra de gmail, y son proveedores de verdad.
  'mail.com',
  'email.com',
]);

/** gmail e icloud solo existen en `.com`; los otros tienen versiones de país. */
const PROVEEDORES = [
  { nombre: 'gmail', soloCom: true },
  { nombre: 'hotmail', soloCom: false },
  { nombre: 'outlook', soloCom: false },
  { nombre: 'yahoo', soloCom: false },
  { nombre: 'icloud', soloCom: true },
];

/** Terminaciones que no existen y que siempre quisieron decir `.com`. */
const TERMINACIONES_MAL = new Set([
  'con', 'cmo', 'comm', 'coom', 'cpm', 'xom', 'vom', 'ocm', 'cim', 'om', 'cm', 'co', 'c',
]);

/** Estas son reales, pero pegadas a gmail o hotmail no lo son. */
const TERMINACIONES_SOSPECHOSAS_SOLO_EN_PROVEEDOR = new Set(['om', 'cm', 'co', 'c']);

const FORMA = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** Distancia entre dos palabras contando el cambio de dos letras seguidas. */
function distancia(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + coste);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[a.length][b.length];
}

function proveedorParecido(nombre: string): (typeof PROVEEDORES)[number] | null {
  for (const proveedor of PROVEEDORES) {
    if (nombre === proveedor.nombre) return proveedor;
    // Con cinco letras, dos cambios ya convierten gmail en otra palabra.
    const tope = proveedor.nombre.length >= 6 ? 2 : 1;
    if (distancia(nombre, proveedor.nombre) <= tope) return proveedor;
  }
  return null;
}

function dominioCorregido(dominio: string): string | null {
  if (DOMINIOS_BUENOS.has(dominio)) return null;

  const partes = dominio.split('.');
  const nombre = partes[0];
  const terminacion = partes.slice(1).join('.');
  const proveedor = proveedorParecido(nombre);

  if (proveedor) {
    const fin =
      proveedor.soloCom || !terminacion || TERMINACIONES_MAL.has(terminacion)
        ? 'com'
        : terminacion;
    const propuesto = `${proveedor.nombre}.${fin}`;
    return propuesto === dominio ? null : propuesto;
  }

  const ultima = partes[partes.length - 1];
  if (
    partes.length > 1 &&
    TERMINACIONES_MAL.has(ultima) &&
    !TERMINACIONES_SOSPECHOSAS_SOLO_EN_PROVEEDOR.has(ultima)
  ) {
    return [...partes.slice(0, -1), 'com'].join('.');
  }

  return null;
}

export function revisarCorreo(entrada: string): RevisionDeCorreo {
  const correo = (entrada ?? '').trim().toLowerCase();

  if (!correo) return { correo, problema: 'Falta el correo.', sugerencia: null };

  const arrobas = correo.split('@').length - 1;

  if (arrobas === 0) {
    for (const dominio of DOMINIOS_BUENOS) {
      if (correo.endsWith(dominio) && correo.length > dominio.length) {
        const sugerencia = `${correo.slice(0, -dominio.length)}@${dominio}`;
        return { correo, problema: 'Le falta la @.', sugerencia };
      }
    }
    return {
      correo,
      problema: 'Le falta la @ y el dominio (por ejemplo @gmail.com).',
      sugerencia: null,
    };
  }

  if (arrobas > 1) return { correo, problema: 'Tiene más de una @.', sugerencia: null };

  const [usuario, dominio] = correo.split('@');

  if (!usuario) return { correo, problema: 'Falta lo que va antes de la @.', sugerencia: null };

  const corregido = dominioCorregido(dominio);
  if (corregido) {
    return {
      correo,
      problema: `«@${dominio}» parece mal escrito.`,
      sugerencia: `${usuario}@${corregido}`,
    };
  }

  if (
    !FORMA.test(correo) ||
    usuario.startsWith('.') ||
    usuario.endsWith('.') ||
    correo.includes('..')
  ) {
    return {
      correo,
      problema: dominio.includes('.')
        ? 'No es un correo válido.'
        : 'Al dominio le falta la terminación (por ejemplo .com).',
      sugerencia: null,
    };
  }

  return { correo, problema: null, sugerencia: null };
}

export interface ListaDeCorreos {
  /** Cada correo distinto, en el orden en que se pegó, ya revisado. */
  correos: RevisionDeCorreo[];
  /** Cuántos venían repetidos y se quitaron. */
  repetidos: number;
}

/**
 * Lee una lista pegada tal cual venga: uno por línea, separados por comas o
 * punto y coma, o copiados de un chat con `<` y `>` alrededor.
 */
export function leerListaDeCorreos(texto: string): ListaDeCorreos {
  const trozos = (texto ?? '')
    .replace(/[<>"'()[\]]/g, ' ')
    .split(/[\s,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const distintos = [...new Set(trozos)];

  return {
    correos: distintos.map((correo) => revisarCorreo(correo)),
    repetidos: trozos.length - distintos.length,
  };
}
