import { PAISES } from '../../shared/contenido/paises';

/**
 * Desde qué país se paga, para enseñar solo los medios que tocan.
 *
 *   null  no se sabe (la detección falló y nadie eligió): se enseña todo.
 *   ''    «Otro país»: uno que no está en la lista. Solo los medios para todos.
 *   'PE'  un país de la lista: lo suyo —Yape en Perú, su billetera en los
 *         demás— y los medios para todos.
 *
 * Es solo lo que se enseña. El servidor acepta cualquier medio: quien cambia
 * el país a mano paga por donde quiera.
 */
export type PaisDePago = string | null;

/** Perú delante, que es de donde viene casi todo el mundo; el resto, por orden. */
export const PAISES_DE_PAGO = [{ codigo: 'PE', nombre: 'Perú' }, ...PAISES];

/**
 * Lo que dice Cloudflare, hecho país de pago. Un código que no es de la lista
 * es «Otro país»; lo que no es un país (vacío, `XX` desconocido, `T1` de Tor)
 * es «no se sabe».
 */
export function paisDePagoDe(detectado: unknown): PaisDePago {
  if (typeof detectado !== 'string') return null;
  const codigo = detectado.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(codigo) || codigo === 'XX') return null;
  return PAISES_DE_PAGO.some((pais) => pais.codigo === codigo) ? codigo : '';
}

/** Yape es de Perú: sale ahí, y cuando no se sabe el país. */
export function yapeSeOfreceEn(pais: PaisDePago): boolean {
  return pais === null || pais === 'PE';
}

/** Cada billetera, solo en su país. Sin saber el país, todas. */
export function billeteraSeOfreceEn(pais: PaisDePago, paisDeLaBilletera: string): boolean {
  return pais === null || paisDeLaBilletera === pais;
}

/**
 * Pregunta al Worker de Cloudflare desde qué país entra el visitante
 * (`/api/pais`, ver `worker/index.js`). Nunca falla: sin Worker —en local— o
 * con cualquier error, devuelve `null` y se enseña todo, como siempre.
 *
 * Con `fetch` y no con `HttpClient` a propósito: no es una llamada al backend,
 * y un fallo aquí no debe pasar por los interceptores ni avisar a nadie.
 */
export async function detectarPaisDePago(): Promise<PaisDePago> {
  try {
    const respuesta = await fetch('/api/pais', { headers: { Accept: 'application/json' } });
    if (!respuesta.ok) return null;
    const datos: unknown = await respuesta.json();
    return paisDePagoDe((datos as { pais?: unknown } | null)?.pais);
  } catch {
    return null;
  }
}
