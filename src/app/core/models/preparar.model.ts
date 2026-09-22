/**
 * «Preparar documento»: edición de inglés académico, traducción y resúmenes.
 *
 * Los tres servicios trabajan sobre el .docx que sube el cliente y le devuelven
 * otro .docx. Se paga por membresía —hasta diez documentos al mes, del tamaño
 * que sean— y no por documento.
 */

/** Los tres servicios. Mismo nombre que el enum del servidor. */
export type ServicioPreparar = 'EDICION' | 'TRADUCCION' | 'RESUMEN';

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
  /** Los que se quedaron como estaban porque llevaban algo que no se puede rehacer. */
  intactos: number;
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
