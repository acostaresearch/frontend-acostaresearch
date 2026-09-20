import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { Convocatoria, Opcion } from './asesor.service';

export type EstadoDePedido =
  | 'ESPERANDO'
  | 'EN_REVISION'
  | 'ENTREGADO'
  | 'RECHAZADO'
  | 'CANCELADO';
export type NivelDeTesis = 'PREGRADO' | 'MAESTRIA' | 'DOCTORADO';

/** Las listas que necesita el formulario del tesista. */
export interface CatalogosDePedido {
  areas: Opcion[];
  metodos: Opcion[];
  capitulos: Opcion[];
  niveles: Opcion[];
}

export interface ConvocatoriaDeRevision {
  slug: string;
  nombre: string;
  intro: string;
  abierta: boolean;
  catalogos: CatalogosDePedido;
}

/** Una reseña, como se enseña en el perfil de un asesor. */
export interface ResenaPublica {
  estrellas: number;
  comentario: string;
  createdAt: string;
}

/**
 * La ficha pública de un asesor: lo que decide a quién le confías tu tesis.
 *
 * `nota` viene nula mientras no tenga reseñas suficientes. Con una o dos, una
 * media dice más del azar que de la persona, así que el servidor prefiere no
 * enseñarla a enseñar un 5,0 de un solo tesista.
 */
export interface AsesorPublico {
  id: string;
  nombre: string;
  iniciales: string;
  /** El código, para filtrar: BACHILLER, MAGISTER o DOCTOR. */
  grado: string;
  gradoNombre: string;
  especialidad: string;
  areas: string[];
  areasCodigos: string[];
  metodos: string[];
  metodosCodigos: string[];
  universidades: string;
  anosExperiencia: number;
  presentacion: string;
  tesisRevisadas: number;
  resenas: number;
  nota: number | null;
  ultimasResenas: ResenaPublica[];
}

/** Lo que acompaña al Word. Viaja en la query, no en el cuerpo. */
export interface DatosDelPedido {
  asesorId: string;
  nombre: string;
  email: string;
  telefono: string;
  universidad: string;
  nivel: NivelDeTesis;
  area: string;
  metodo: string;
  capitulo: string;
  tema: string;
  mensaje: string;
}

/** Quién está revisando, como lo ve el tesista que lo eligió. */
export interface AsesorDelPedido {
  nombre: string;
  iniciales: string;
  gradoNombre: string;
  especialidad: string;
}

export interface Seguimiento {
  codigo: string;
  nombre: string;
  universidad: string;
  capitulo: string;
  nivel: string;
  tema: string;
  estado: EstadoDePedido;
  archivoNombre: string;
  asesor: AsesorDelPedido | null;
  /** Con qué palabras dijo que no. Vacío si no rechazó. */
  motivoRechazo: string;
  /** Solo llega con valor cuando el pedido está entregado. */
  enlaceObservaciones: string;
  resena: ResenaPublica | null;
  puedeResenar: boolean;
  /** Mensajes de su asesor que todavía no ha abierto. */
  sinLeer: number;
  createdAt: string;
  aceptadoAt: string | null;
  entregadoAt: string | null;
}

/** Un mensaje de la conversación de un encargo. */
export interface Mensaje {
  id: string;
  de: 'TESISTA' | 'ASESOR';
  texto: string;
  /** Vacío = mensaje solo de texto, que es lo normal. */
  archivoNombre: string;
  bytes: number;
  leidoAt: string | null;
  createdAt: string;
}

/** La conversación entera, y si todavía admite mensajes. */
export interface Conversacion {
  /** Falso mientras el asesor no haya aceptado: entonces no se habla. */
  abierta: boolean;
  mensajes: Mensaje[];
}

/** Un encargo, como lo ve el asesor en su pantalla. */
export interface Encargo {
  id: string;
  codigo: string;
  estado: EstadoDePedido;
  capitulo: string;
  nivel: string;
  area: string;
  metodo: string;
  universidad: string;
  tema: string;
  mensaje: string;
  /** Vacío mientras no lo haya aceptado: hasta entonces no ve el documento. */
  archivoNombre: string;
  bytes: number;
  /** Nulo mientras no lo haya aceptado. */
  tesista: { nombre: string; email: string; telefono: string } | null;
  enlaceObservaciones: string;
  resena: ResenaPublica | null;
  /** Mensajes del tesista que todavía no ha abierto. */
  sinLeer: number;
  createdAt: string;
  aceptadoAt: string | null;
  entregadoAt: string | null;
}

/** La cabecera de su pantalla: quién es y cómo le está yendo. */
export interface FichaDelAsesor {
  nombre: string;
  iniciales: string;
  gradoNombre: string;
  especialidad: string;
  visible: boolean;
  tesisRevisadas: number;
  resenas: number;
  nota: number | null;
}

export interface PanelDelAsesor {
  asesor: FichaDelAsesor;
  encargos: Encargo[];
}

/** Un pedido, como lo lee el panel de la casa. */
export interface Pedido {
  id: string;
  codigo: string;
  nombre: string;
  email: string;
  telefono: string;
  universidad: string;
  nivelNombre: string;
  areaNombre: string;
  metodoNombre: string;
  capituloNombre: string;
  tema: string;
  mensaje: string;
  archivoNombre: string;
  bytes: number;
  estado: EstadoDePedido;
  asesorId: string | null;
  asesor: { id: string; nombre: string; estado: string } | null;
  enlaceObservaciones: string;
  motivoRechazo: string;
  notas: string | null;
  asignadoAt: string | null;
  aceptadoAt: string | null;
  entregadoAt: string | null;
  createdAt: string;
  resena: ResenaPublica | null;
}

export const NOMBRE_DEL_ESTADO_PEDIDO: Record<EstadoDePedido, string> = {
  ESPERANDO: 'Esperando respuesta',
  EN_REVISION: 'En revisión',
  ENTREGADO: 'Entregado',
  RECHAZADO: 'Sin asesor',
  CANCELADO: 'Cancelado',
};

/** Lo que se le dice al tesista en cada estado, en su idioma y no en el nuestro. */
export const PASO_DEL_PEDIDO: Record<EstadoDePedido, string> = {
  ESPERANDO: 'Tu asesor tiene que aceptar el encargo. Suele responder en menos de un día.',
  EN_REVISION: 'Ya lo aceptó y lo está revisando.',
  ENTREGADO: 'Tus observaciones están listas.',
  RECHAZADO: 'Tu asesor no pudo tomarlo. Elige a otro: no tienes que volver a subir nada.',
  CANCELADO: 'Este pedido se canceló.',
};

/**
 * Los encargos de revisión, por los tres lados: el tesista, el asesor y la casa.
 *
 * El documento va en crudo con su ficha en la query, igual que las guías en
 * PDF: el servidor lo espera así para no montar `multipart` por un solo
 * archivo.
 */
@Injectable({ providedIn: 'root' })
export class PedidoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/pedidos`;

  // ── El tesista ─────────────────────────────────────────────────────────

  verConvocatoria(slug: string): Observable<ConvocatoriaDeRevision> {
    return this.http
      .get<ApiResponse<{ convocatoria: ConvocatoriaDeRevision }>>(
        `${this.base}/convocatoria/${slug}`,
      )
      .pipe(map((res) => res.data.convocatoria));
  }

  publica(): Observable<ConvocatoriaDeRevision | null> {
    return this.http
      .get<ApiResponse<{ convocatoria: ConvocatoriaDeRevision | null }>>(
        `${this.base}/convocatoria/publica`,
      )
      .pipe(map((res) => res.data.convocatoria));
  }

  /** El directorio: entre quiénes elige. Se filtra en el navegador. */
  directorio(slug: string): Observable<AsesorPublico[]> {
    return this.http
      .get<ApiResponse<{ asesores: AsesorPublico[] }>>(`${this.base}/convocatoria/${slug}/asesores`)
      .pipe(map((res) => res.data.asesores));
  }

  enviar(slug: string, datos: DatosDelPedido, archivo: File): Observable<string> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(datos)) {
      params = params.set(clave, String(valor));
    }

    return this.http
      .post<ApiResponse<{ codigo: string }>>(`${this.base}/convocatoria/${slug}`, archivo, {
        params,
        headers: {
          'Content-Type': 'application/octet-stream',
          // Codificado: una cabecera HTTP no admite tildes tal cual.
          'X-Nombre-Archivo': encodeURIComponent(archivo.name),
        },
      })
      .pipe(map((res) => res.data.codigo));
  }

  seguimiento(codigo: string): Observable<Seguimiento> {
    return this.http
      .get<ApiResponse<{ pedido: Seguimiento }>>(`${this.base}/${codigo}`)
      .pipe(map((res) => res.data.pedido));
  }

  /** Entre quiénes puede elegir si le dijeron que no. Sin el que lo rechazó. */
  directorioParaPedido(codigo: string): Observable<AsesorPublico[]> {
    return this.http
      .get<ApiResponse<{ asesores: AsesorPublico[] }>>(`${this.base}/${codigo}/asesores`)
      .pipe(map((res) => res.data.asesores));
  }

  /** Su asesor no pudo: elige otro sin volver a subir el documento. */
  reasignar(codigo: string, asesorId: string): Observable<Seguimiento> {
    return this.http
      .post<ApiResponse<{ pedido: Seguimiento }>>(`${this.base}/${codigo}/asesor`, { asesorId })
      .pipe(map((res) => res.data.pedido));
  }

  resenar(codigo: string, estrellas: number, comentario: string): Observable<Seguimiento> {
    return this.http
      .post<ApiResponse<{ pedido: Seguimiento }>>(`${this.base}/${codigo}/resena`, {
        estrellas,
        comentario,
      })
      .pipe(map((res) => res.data.pedido));
  }

  // ── Desde su panel, con su cuenta ──────────────────────────────────────

  /**
   * Si lo ve y, si lo ve, sus revisiones.
   *
   * `beta` en falso no es un error: es que para ese correo esto todavía no
   * existe, y su panel no pinta nada.
   */
  misRevisiones(): Observable<{
    beta: boolean;
    pedidos: Seguimiento[];
    catalogos: CatalogosDePedido | null;
  }> {
    return this.http
      .get<
        ApiResponse<{
          beta: boolean;
          pedidos: Seguimiento[];
          catalogos: CatalogosDePedido | null;
        }>
      >(`${this.base}/mis-revisiones`)
      .pipe(map((res) => res.data));
  }

  /** El directorio sin enlace de convocatoria: ya entró con su cuenta. */
  directorioDelPanel(): Observable<AsesorPublico[]> {
    return this.http
      .get<ApiResponse<{ asesores: AsesorPublico[] }>>(`${this.base}/mis-revisiones/asesores`)
      .pipe(map((res) => res.data.asesores));
  }

  enviarDesdeSuPanel(datos: DatosDelPedido, archivo: File): Observable<string> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(datos)) {
      params = params.set(clave, String(valor));
    }

    return this.http
      .post<ApiResponse<{ codigo: string }>>(`${this.base}/mis-revisiones`, archivo, {
        params,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Nombre-Archivo': encodeURIComponent(archivo.name),
        },
      })
      .pipe(map((res) => res.data.codigo));
  }

  // ── El asesor, por su enlace privado ───────────────────────────────────

  panelDelAsesor(token: string): Observable<PanelDelAsesor> {
    return this.http
      .get<ApiResponse<PanelDelAsesor>>(`${this.base}/asesor/${token}`)
      .pipe(map((res) => res.data));
  }

  disponibilidad(token: string, visible: boolean): Observable<PanelDelAsesor> {
    return this.http
      .patch<ApiResponse<PanelDelAsesor>>(`${this.base}/asesor/${token}`, { visible })
      .pipe(map((res) => res.data));
  }

  /** El saludo es opcional, pero es lo que convierte «aceptado» en alguien. */
  aceptar(token: string, id: string, saludo = ''): Observable<Encargo> {
    return this.http
      .post<ApiResponse<{ encargo: Encargo }>>(`${this.base}/asesor/${token}/${id}/aceptar`, {
        saludo,
      })
      .pipe(map((res) => res.data.encargo));
  }

  rechazar(token: string, id: string, motivo: string): Observable<Encargo> {
    return this.http
      .post<ApiResponse<{ encargo: Encargo }>>(`${this.base}/asesor/${token}/${id}/rechazar`, {
        motivo,
      })
      .pipe(map((res) => res.data.encargo));
  }

  entregar(token: string, id: string, enlaceObservaciones: string): Observable<Encargo> {
    return this.http
      .post<ApiResponse<{ encargo: Encargo }>>(`${this.base}/asesor/${token}/${id}/entregar`, {
        enlaceObservaciones,
      })
      .pipe(map((res) => res.data.encargo));
  }

  /**
   * El documento de un encargo aceptado.
   *
   * Se baja como blob y se guarda desde memoria, no con un enlace normal: así
   * el navegador manda las cabeceras y el servidor puede comprobar que ese
   * encargo es suyo y que ya lo aceptó.
   */
  documentoDelEncargo(token: string, id: string): Observable<Blob> {
    return this.http.get(`${this.base}/asesor/${token}/${id}/documento`, { responseType: 'blob' });
  }

  // ── La conversación ────────────────────────────────────────────────────
  //
  // Dos juegos de llamadas porque son dos llaves distintas: el tesista tiene su
  // código y el asesor su enlace. Ninguno de los dos puede leer la del otro, y
  // eso lo comprueba el servidor.

  mensajesDelTesista(codigo: string): Observable<Conversacion> {
    return this.http
      .get<ApiResponse<Conversacion>>(`${this.base}/${codigo}/mensajes`)
      .pipe(map((res) => res.data));
  }

  mensajesDelAsesor(token: string, id: string): Observable<Conversacion> {
    return this.http
      .get<ApiResponse<Conversacion>>(`${this.base}/asesor/${token}/${id}/mensajes`)
      .pipe(map((res) => res.data));
  }

  /**
   * Escribir, con un Word opcional.
   *
   * El texto va en la query y el documento en el cuerpo, igual que el capítulo:
   * el servidor lo espera así para no montar `multipart` por un archivo.
   */
  escribirComoTesista(codigo: string, texto: string, archivo: File | null): Observable<Mensaje> {
    return this.escribir(`${this.base}/${codigo}/mensajes`, texto, archivo);
  }

  escribirComoAsesor(
    token: string,
    id: string,
    texto: string,
    archivo: File | null,
  ): Observable<Mensaje> {
    return this.escribir(`${this.base}/asesor/${token}/${id}/mensajes`, texto, archivo);
  }

  private escribir(url: string, texto: string, archivo: File | null): Observable<Mensaje> {
    const params = new HttpParams().set('texto', texto);
    const cabeceras: Record<string, string> = { 'Content-Type': 'application/octet-stream' };
    if (archivo) cabeceras['X-Nombre-Archivo'] = encodeURIComponent(archivo.name);

    return this.http
      .post<ApiResponse<{ mensaje: Mensaje }>>(url, archivo ?? new Blob(), {
        params,
        headers: cabeceras,
      })
      .pipe(map((res) => res.data.mensaje));
  }

  adjuntoDelTesista(codigo: string, mensajeId: string): Observable<Blob> {
    return this.http.get(`${this.base}/${codigo}/mensajes/${mensajeId}/documento`, {
      responseType: 'blob',
    });
  }

  adjuntoDelAsesor(token: string, id: string, mensajeId: string): Observable<Blob> {
    return this.http.get(`${this.base}/asesor/${token}/${id}/mensajes/${mensajeId}/documento`, {
      responseType: 'blob',
    });
  }

  // ── La casa ────────────────────────────────────────────────────────────

  listar(): Observable<Pedido[]> {
    return this.http
      .get<ApiResponse<{ pedidos: Pedido[] }>>(`${this.base}/admin/todos`)
      .pipe(map((res) => res.data.pedidos));
  }

  cambiar(
    id: string,
    cambios: { estado?: 'CANCELADO'; notas?: string },
  ): Observable<{ pedido: Pedido; mensaje: string }> {
    return this.http
      .patch<ApiResponse<{ pedido: Pedido }>>(`${this.base}/admin/${id}`, cambios)
      .pipe(map((res) => ({ pedido: res.data.pedido, mensaje: res.message ?? '' })));
  }

  documento(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/admin/${id}/documento`, { responseType: 'blob' });
  }

  convocatorias(): Observable<Convocatoria[]> {
    return this.http
      .get<ApiResponse<{ convocatorias: Convocatoria[] }>>(`${this.base}/admin/convocatorias`)
      .pipe(map((res) => res.data.convocatorias));
  }

  crearConvocatoria(nombre: string, intro: string): Observable<Convocatoria> {
    return this.http
      .post<ApiResponse<{ convocatoria: Convocatoria }>>(`${this.base}/admin/convocatorias`, {
        nombre,
        intro,
      })
      .pipe(map((res) => res.data.convocatoria));
  }

  cambiarConvocatoria(
    id: string,
    cambios: Partial<Pick<Convocatoria, 'nombre' | 'intro' | 'abierta' | 'publica'>>,
  ): Observable<{ convocatoria: Convocatoria; mensaje: string }> {
    return this.http
      .patch<ApiResponse<{ convocatoria: Convocatoria }>>(
        `${this.base}/admin/convocatorias/${id}`,
        cambios,
      )
      .pipe(map((res) => ({ convocatoria: res.data.convocatoria, mensaje: res.message ?? '' })));
  }
}
