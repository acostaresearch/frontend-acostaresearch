/**
 * «Preparar documento»: edición de inglés académico y traducción.
 *
 * Los dos servicios trabajan sobre el .docx que sube el cliente y le devuelven
 * otro .docx. Se paga por membresía —hasta diez documentos al mes, del tamaño
 * que sean— y no por documento.
 */

/**
 * Los servicios que se ofrecen. Mismo nombre que el enum del servidor.
 *
 * `RESUMEN` se retiró el 22-sep-2026 y por eso no está aquí, pero sigue en el
 * enum de la base: hay trabajos entregados con ese servicio y tienen que poder
 * leerse en el historial.
 */
export type ServicioPreparar = 'EDICION' | 'TRADUCCION';

/** Los cuatro idiomas de la traducción. */
export type IdiomaPreparar = 'es' | 'en' | 'pt' | 'zh';

/**
 * Por dónde va un trabajo.
 *
 * `EN_COLA` y `EN_CURSO` son lo mismo para quien mira —está esperando—, pero se
 * distinguen porque con varios clientes a la vez uno puede pasar minutos en
 * cola, y decir «en cola» es más honesto que fingir que ya se está trabajando.
 */
export type EstadoPreparacion = 'EN_COLA' | 'EN_CURSO' | 'LISTO' | 'FALLIDO';

/** Un grupo de párrafos que quedó sin tocar, con su motivo. */
export interface AvisoPreparacion {
  /** «el cuerpo del documento», «las notas al pie», «el pie de página». */
  donde: string;
  /** Qué pasó, en las palabras del servidor: se enseña tal cual. */
  motivo: string;
  cuantos: number;
  /** El principio de uno de ellos, para que lo encuentre en su Word. */
  ejemplo: string;
}

export interface Preparacion {
  id: string;
  servicio: ServicioPreparar;
  idioma: IdiomaPreparar | null;
  nombre: string;
  palabras: number;
  estado: EstadoPreparacion;
  /** Por qué no salió. Se enseña tal cual: lo escribió el servidor para leerse. */
  error: string | null;
  /** Párrafos corregidos o traducidos. */
  tocados: number;
  /** Los que se quedaron como estaban. El porqué de cada uno va en `avisos`. */
  intactos: number;
  /**
   * Por qué quedaron así, agrupado por motivo y por parte del documento.
   *
   * Lo escribe el servidor mirando lo que pasó de verdad. Antes esto no
   * existía y la web se inventaba el motivo: decía «llevaban una nota al pie,
   * una ecuación o una imagen» hasta en documentos sin una sola nota al pie.
   * Viene vacío en los trabajos entregados antes de que esto existiera.
   */
  avisos: AvisoPreparacion[];
  createdAt: string;
  entregadoAt: string | null;
}

/** Cuántos documentos quedan este mes y cuándo vuelve a haber. */
export interface CupoPreparar {
  total: number;
  usados: number;
  restantes: number;
  /** En qué mes de la membresía va, y de cuántos: «mes 2 de 3». */
  ventana: number;
  ventanas: number;
  renuevaEl: string;
  desde: string;
  caducaEl: string;
}

export interface MembresiaPreparar {
  plan: { code: string; name: string; durationDays: number };
  estado: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  activadaEl: string;
  caducaEl: string;
  vigente: boolean;
}

/** Todo lo que la pantalla necesita para pintarse de una sola petición. */
export interface PanelPreparar {
  /** Falso = el servicio está apagado en el servidor. No se enseña el formulario. */
  disponible: boolean;
  membresia: MembresiaPreparar | null;
  cupo: CupoPreparar | null;
  /** Por qué no puede mandar un documento ahora mismo. Null = sí puede. */
  motivo: string | null;
  idiomas: { codigo: IdiomaPreparar; nombre: string }[];
  maxPalabras: number;
  trabajos: Preparacion[];
}

/** Lo que devuelve el servidor al aceptar un encargo. */
export interface EncargoAceptado {
  preparacion: Preparacion;
  cupo: CupoPreparar;
}
