import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

export type EstadoDeResena = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export const NOMBRE_DEL_ESTADO: Record<EstadoDeResena, string> = {
  PENDIENTE: 'Esperando revisión',
  APROBADA: 'Publicada',
  RECHAZADA: 'No publicada',
};

/** Una reseña como la ve cualquiera. Con el correo tapado, nunca entero. */
export interface ResenaPublica {
  id: string;
  estrellas: number;
  comentario: string;
  /**
   * Con lo que sale firmada: «steb***@gmail.com».
   *
   * Lo calcula el servidor a partir del correo de la cuenta. No es un nombre
   * que nadie escriba —eso lo escribe cualquiera— y el correo entero no llega
   * nunca hasta aquí.
   */
  autor: string;
  /** Vacío = no puso a qué se dedica. */
  oficio: string;
  createdAt: string;
  /**
   * Si tiene video. El archivo se pide aparte, por su URL.
   *
   * Una reseña puede ser SOLO video: entonces `comentario` viene vacío y lo que
   * hay que enseñar es la grabación.
   */
  video: boolean;
  /**
   * La elegimos para la portada, y /resenas la marca.
   *
   * Es lo único de la moderación que se asoma fuera, y no es ningún secreto:
   * son justo las que cualquiera ve en la portada. El estado y el motivo de un
   * rechazo no salen de la cuenta de su autor.
   */
  destacada: boolean;
  /**
   * Detrás de la firma hay una cuenta de verdad.
   *
   * Falso en las que se apuntaron a mano desde el panel a nombre de quien
   * compró por otra vía: su testimonio puede ser igual de real, pero la firma
   * no se puede comprobar y la web no las enseña como si sí.
   */
  conCuenta: boolean;
}

/** La suya, con en qué punto está. */
export interface MiResena extends ResenaPublica {
  estado: EstadoDeResena;
  /** Por qué no se publicó. Vacío mientras no se haya rechazado. */
  motivo: string;
  /**
   * La publicamos nosotros a su nombre.
   *
   * No la escribió él, así que no la puede cambiar, ni tocarle el video, ni
   * quitárselo. Verla sí, y escribir la suya también: es otra reseña.
   */
  delPanel: boolean;
  updatedAt: string;
}

/** La misma, como la ve el panel: añade de quién es y el correo entero. */
export interface ResenaDelPanel extends MiResena {
  /** El nombre de la cuenta. Solo se ve aquí: en la web sale `autor`. */
  nombre: string;
  /** El correo entero, para saber a quién escribir. Fuera sale tapado. */
  correo: string;
  revisadaAt: string | null;
  /** Nulo cuando se dio de alta a nombre de alguien que no tiene cuenta. */
  user: { id: string; email: string; firstName: string; lastName: string } | null;
  /** Ese correo no tiene cuenta: la firma no se puede comprobar. */
  sinCuenta: boolean;
}

/** Lo que se escribe al dejar una. Sin nombre: la firma sale del correo. */
export interface ResenaEnvio {
  estrellas: number;
  comentario: string;
  oficio: string;
  /** El video va detrás, en la petición siguiente: puede nacer sin texto. */
  conVideo?: boolean;
}

/** Lo que apunta el panel para dar de alta la reseña de un cliente. */
export interface AltaDeResena extends ResenaEnvio {
  /** El de la cuenta con la que compró. Sin cuenta, no se crea nada. */
  email: string;
}

/** Lo que pesa como mucho un video. El servidor tiene el mismo tope. */
export const MAXIMO_VIDEO_BYTES = 80 * 1024 * 1024;

/**
 * El correo tapado, para enseñarlo ANTES de enviar la reseña.
 *
 * El de verdad lo calcula el servidor y es el que se publica; este es el mismo
 * corte hecho aquí para que quien va a escribir vea con qué va a salir sin
 * tener que enviarla primero. Si algún día dejaran de coincidir, manda el
 * servidor.
 */
export function firmaDe(email: string): string {
  const [local = '', dominio = ''] = (email ?? '').split('@');
  if (!local || !dominio) return 'cliente***';
  return `${local.slice(0, 4)}***@${dominio}`;
}

/** Las aprobadas, con el resumen. */
export interface Resenas {
  resenas: ResenaPublica[];
  /** Cuántas hay aprobadas EN TOTAL, aunque se hayan pedido solo las destacadas. */
  total: number;
  /** La media, con un decimal. Null cuando todavía no hay ninguna. */
  nota: number | null;
}

/** Las cinco estrellas, llenas hasta la nota. Para leerlo de un vistazo. */
export function estrellas(nota: number): string {
  const llenas = Math.round(nota);
  return '★★★★★'.slice(0, llenas) + '☆☆☆☆☆'.slice(0, 5 - llenas);
}

/** «4,5». Con coma, que es como se escribe un decimal en español. */
export function nota(valor: number): string {
  return valor.toFixed(1).replace('.', ',');
}

@Injectable({ providedIn: 'root' })
export class ResenaService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/resenas`;

  /**
   * Público: las aprobadas.
   *
   * `destacadas` es lo que pide la portada, que enseña unas pocas elegidas a
   * mano. La media que vuelve es la de TODAS las aprobadas en los dos casos.
   */
  publicas(destacadas = false): Observable<Resenas> {
    const url = destacadas ? `${this.base}?destacadas=1` : this.base;
    return this.http.get<ApiResponse<Resenas>>(url).pipe(map((res) => res.data));
  }

  /** Las suyas, las últimas primero. Vacío si todavía no ha escrito ninguna. */
  mias(): Observable<MiResena[]> {
    return this.http
      .get<ApiResponse<{ resenas: MiResena[] }>>(`${this.base}/mias`)
      .pipe(map((res) => res.data.resenas));
  }

  /** Escribe una nueva. Puede tener varias: cada vuelta cuenta otra cosa. */
  guardar(datos: ResenaEnvio): Observable<MiResena> {
    return this.http
      .post<ApiResponse<{ resena: MiResena }>>(this.base, datos)
      .pipe(map((res) => res.data.resena));
  }

  /** Cambia una de las suyas. Vuelve a quedar pendiente. */
  cambiar(id: string, datos: ResenaEnvio): Observable<MiResena> {
    return this.http
      .put<ApiResponse<{ resena: MiResena }>>(`${this.base}/mias/${id}`, datos)
      .pipe(map((res) => res.data.resena));
  }

  // ── El video ──────────────────────────────────────────────────────────────

  /**
   * La dirección del video de una reseña APROBADA.
   *
   * Se le da tal cual a la etiqueta `<video>`, que no puede mandar la sesión de
   * nadie: por eso esta es la única ruta de reseñas que no lleva cabecera. Un
   * video sin aprobar no se sirve por aquí.
   */
  urlDelVideo(id: string): string {
    return `${this.base}/${id}/video`;
  }

  /** Sube el video de una suya, o cambia el que tenía. */
  subirMiVideo(id: string, archivo: File): Observable<MiResena> {
    return this.http
      .put<ApiResponse<{ resena: MiResena }>>(`${this.base}/mias/${id}/video`, archivo)
      .pipe(map((res) => res.data.resena));
  }

  /** Lo quita y deja el texto. */
  quitarMiVideo(id: string): Observable<MiResena> {
    return this.http
      .delete<ApiResponse<{ resena: MiResena }>>(`${this.base}/mias/${id}/video`)
      .pipe(map((res) => res.data.resena));
  }

  /**
   * El suyo o el de cualquiera (panel), esté aprobado o no, como archivo.
   *
   * Se baja con la sesión puesta y se reproduce desde la memoria del navegador:
   * un `<video src>` no lleva cabeceras, así que un video pendiente —que es
   * justo el que hay que mirar antes de aprobarlo— no se puede pedir de otra
   * forma.
   */
  videoPorRevisar(id: string, dondeEstoy: 'mias' | 'panel' = 'mias'): Observable<Blob> {
    const url =
      dondeEstoy === 'panel' ? `${this.base}/panel/${id}/video` : `${this.base}/mias/${id}/video`;
    return this.http.get(url, { responseType: 'blob' });
  }

  /** Panel: sube el video de una reseña sin devolverla a pendiente. */
  subirVideoDelPanel(id: string, archivo: File): Observable<ResenaDelPanel> {
    return this.http
      .put<ApiResponse<{ resena: ResenaDelPanel }>>(`${this.base}/panel/${id}/video`, archivo)
      .pipe(map((res) => res.data.resena));
  }

  /** Panel: da de alta la reseña de un cliente, con su correo. */
  crearDesdeElPanel(datos: AltaDeResena): Observable<ResenaDelPanel> {
    return this.http
      .post<ApiResponse<{ resena: ResenaDelPanel }>>(`${this.base}/panel`, datos)
      .pipe(map((res) => res.data.resena));
  }

  /** Panel: todas, o las de un estado, con cuántas están esperando. */
  listar(
    estado: EstadoDeResena | 'TODAS' = 'TODAS',
  ): Observable<{ resenas: ResenaDelPanel[]; pendientes: number }> {
    return this.http
      .get<
        ApiResponse<{ resenas: ResenaDelPanel[]; pendientes: number }>
      >(`${this.base}/panel?estado=${estado}`)
      .pipe(map((res) => res.data));
  }

  /**
   * Panel: la borra del todo, con su video. No se puede deshacer.
   *
   * No es rechazarla: rechazar la retira de la web y deja la fila con su
   * motivo, para quien la escribió. Esto es para lo que nunca fue una reseña
   * —las de prueba, las del correo equivocado, las que quedaron en blanco—,
   * donde no hay a quién responder ni nada que conservar.
   */
  borrar(id: string): Observable<void> {
    return this.http
      .delete<ApiResponse<{ id: string }>>(`${this.base}/panel/${id}`)
      .pipe(map(() => undefined));
  }

  /** Panel: aprobar, rechazar o destacar. */
  revisar(
    id: string,
    cambios: { estado?: EstadoDeResena; destacada?: boolean; motivo?: string },
  ): Observable<ResenaDelPanel> {
    return this.http
      .patch<ApiResponse<{ resena: ResenaDelPanel }>>(`${this.base}/panel/${id}`, cambios)
      .pipe(map((res) => res.data.resena));
  }
}
