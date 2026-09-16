import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

export type EstadoDeEtapa = 'PENDIENTE' | 'EN_CURSO' | 'LISTO';

/** Un capítulo del método, con lo que el tesista lleva hecho de él. */
export interface EtapaDelProyecto {
  code: string;
  displayName: string;
  /**
   * Herramienta de apoyo (el humanizador) y no fase del método. Va aparte en
   * el panel y no cuenta en el avance: se usa cuando hace falta, no en orden.
   */
  apoyo: boolean;
  estado: EstadoDeEtapa;
  /** Qué quedó decidido, en dos o tres frases. Nulo si no se guardó nada. */
  resumen: string | null;
  /** Palabras del capítulo escrito. Cero = todavía no hay texto guardado. */
  palabras: number;
  updatedAt: string | null;
}

/**
 * Lo que el servidor recuerda de una tesis.
 *
 * Viene ya cruzado con el catálogo: la lista de etapas trae TODOS los capítulos
 * del método, no solo los que el tesista ha tocado. Saber lo que falta es la
 * mitad de saber por dónde va.
 */
/** Cómo entra la cita: en el texto con autor y año, con número, o en nota al pie. */
export type FamiliaDeNorma = 'autor-fecha' | 'numerica' | 'notas';

/** La norma de citas de un proyecto. */
export interface NormaDelProyecto {
  estilo: string;
  nombre: string;
  familia: FamiliaDeNorma;
  idioma: string;
  idiomaNombre: string;
  /** Falso = nadie la ha elegido y sale la de por defecto. */
  elegida: boolean;
}

/** El Word que el tesista escribió por su cuenta y subió para que Claude lo cite. */
export interface DocumentoSubido {
  /** Cómo se llamaba el archivo. Sirve para que compruebe que subió el bueno. */
  nombre: string;
  subidoAt: string;
  parrafos: number;
  palabras: number;
  /** Párrafos a los que Claude ya les puso citas. Cero = todavía nada que descargar. */
  citados: number;
}

/** Una de las tesis de un método. Un comprador tiene una; un administrador, las que abra. */
export interface TesisDelMetodo {
  id: string;
  /** Solo las que se abrieron aparte llevan nombre. */
  nombre: string | null;
  tema: string | null;
  /** La activa es con la que trabaja Claude y la que enseña el panel. */
  activa: boolean;
  palabras: number;
  updatedAt: string | null;
}

/** La ficha de un informe estudiantil. La guarda Claude; aquí solo se enseña. */
export interface FichaInforme {
  tipo?: 'curso' | 'proyecto' | 'caso';
  curso?: string;
  /** Vacío = no hay docente que poner. */
  docente?: string;
  integrantes?: { nombre: string; codigo?: string }[];
  cicloSeccion?: string;
  ciudad?: string;
  /** AAAA-MM-DD. */
  fechaEntrega?: string;
  rubrica?: string;
}

export interface Proyecto {
  /** Nulo en un método comprado que todavía no tiene nada guardado. */
  id: string | null;
  /**
   * Qué se escribe: decide los textos del panel. Opcional porque un backend
   * anterior no lo manda, y entonces todo se ve como hasta ahora.
   */
  tipo?: 'tesis' | 'articulo' | 'informe';
  /** Solo en el informe. */
  fichaInforme?: FichaInforme | null;
  /** Falso = sale en blanco porque tiene licencia, pero no hay nada que borrar. */
  guardado: boolean;
  productCode: string;
  /** El nombre de venta del producto: «Método de Tesis · 9 Capítulos + …». */
  productName: string;
  /** Nombre de la tesis activa, si se abrió aparte. */
  nombre: string | null;
  /** Todas sus tesis de este método. Vacía si no hay nada guardado. */
  tesis: TesisDelMetodo[];
  /** Si puede abrir otra tesis: solo los administradores. */
  puedeCrearTesis: boolean;
  tema: string | null;
  carrera: string | null;
  universidad: string | null;
  /** Nulo = no se ha dicho; vacío = todavía no tiene. */
  asesor: string | null;
  /** El documento que subió para citar, si subió uno. */
  documento: DocumentoSubido | null;
  /** La norma de citas con la que sale el Word. Si no la eligió nadie, APA 7. */
  norma: NormaDelProyecto;
  updatedAt: string | null;
  etapas: EtapaDelProyecto[];
  /** Solo de las fases: las herramientas de apoyo no cuentan. */
  avance: { listos: number; total: number };
  /**
   * Por dónde retomar: la que eligió él si no está terminada; si no, la fase en
   * curso, o la primera sin dar por buena. Nulo cuando ya no queda ninguna.
   */
  siguiente: EtapaDelProyecto | null;
  /** Si `siguiente` la eligió él en el panel y no el orden del método. */
  retomarElegido: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProyectoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/proyectos`;

  /**
   * Los proyectos del comprador.
   *
   * Devuelve una lista vacía mientras no haya nada guardado, y eso es lo normal
   * al principio: el proyecto nace la primera vez que hay algo que recordar, no
   * al comprar.
   */
  mios(): Observable<Proyecto[]> {
    return this.http
      .get<ApiResponse<Proyecto[]>>(this.base)
      .pipe(map((r) => r.data ?? []));
  }

  /**
   * La tesis en Word, con todo lo escrito hasta ahora.
   *
   * Se pide en crudo porque no es JSON: llega el archivo. El nombre lo manda el
   * servidor en la cabecera —lleva la fecha, que es lo que distingue una
   * descarga de la siguiente— y se respeta en vez de inventarlo aquí.
   */
  word(productCode: string): Observable<{ archivo: Blob; nombre: string }> {
    return this.descargar(productCode, 'word', 'tesis.docx');
  }

  /**
   * La bibliografía en BibTeX, para quien escribe en LaTeX.
   *
   * Sale de las mismas citas que el Word, y las claves son las que ya están
   * entre corchetes en sus capítulos.
   */
  bib(productCode: string): Observable<{ archivo: Blob; nombre: string }> {
    return this.descargar(productCode, 'bib', 'bibliografia.bib');
  }

  /** Su documento con las citas y la lista de referencias puestas, en la norma del proyecto. */
  documento(productCode: string): Observable<{ archivo: Blob; nombre: string }> {
    return this.descargar(productCode, 'documento', 'documento-con-referencias.docx');
  }

  /**
   * Sube la tesis o el artículo que escribió por su cuenta, para que Claude lo cite.
   *
   * Va en crudo, sin `FormData`: es un solo archivo y no lo acompaña ningún
   * otro campo. El nombre viaja por cabecera solo para poder enseñárselo
   * después. Devuelve el mensaje del servidor, que dice cuántos párrafos leyó y
   * qué decirle a Claude.
   */
  subirDocumento(productCode: string, archivo: File): Observable<string> {
    return this.http
      .post<ApiResponse<unknown>>(`${this.base}/${encodeURIComponent(productCode)}/documento`, archivo, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Nombre-Archivo': encodeURIComponent(archivo.name).slice(0, 200),
        },
      })
      .pipe(map((r) => r.message ?? ''));
  }

  /** Quita el documento subido y las citas que tenía. */
  quitarDocumento(productCode: string): Observable<void> {
    return this.http
      .delete<ApiResponse<unknown>>(`${this.base}/${encodeURIComponent(productCode)}/documento`)
      .pipe(map(() => undefined));
  }

  /**
   * Devuelve el proyecto al comienzo: borra avance, capítulos, análisis y
   * documento subido, y el método queda con sus fases en blanco.
   *
   * La palabra viaja al servidor, que la vuelve a comprobar: la de la pantalla
   * solo enciende el botón.
   */
  borrar(productCode: string, confirmacion: string): Observable<void> {
    return this.http
      .delete<ApiResponse<unknown>>(`${this.base}/${encodeURIComponent(productCode)}`, {
        body: { confirmacion },
      })
      .pipe(map(() => undefined));
  }

  /** Abre otra tesis del método y la deja activa. El servidor solo se lo permite a un administrador. */
  crearTesis(productCode: string, nombre: string): Observable<void> {
    return this.http
      .post<ApiResponse<unknown>>(`${this.base}/${encodeURIComponent(productCode)}/tesis`, { nombre })
      .pipe(map(() => undefined));
  }

  /** Deja activa esa tesis: pasa a ser con la que trabaja Claude. */
  activarTesis(productCode: string, id: string): Observable<void> {
    return this.http
      .patch<ApiResponse<unknown>>(
        `${this.base}/${encodeURIComponent(productCode)}/tesis/${encodeURIComponent(id)}/activar`,
        {},
      )
      .pipe(map(() => undefined));
  }

  /** Borra una tesis entera. No vale para la última: esa se vacía con `borrar`. */
  borrarTesis(productCode: string, id: string, confirmacion: string): Observable<void> {
    return this.http
      .delete<ApiResponse<unknown>>(
        `${this.base}/${encodeURIComponent(productCode)}/tesis/${encodeURIComponent(id)}`,
        { body: { confirmacion } },
      )
      .pipe(map(() => undefined));
  }

  /**
   * Elige por qué fase retomar. `null` vuelve a la del orden del método.
   * Claude la usa también al decir «sigamos».
   */
  elegirRetomar(productCode: string, capitulo: string | null): Observable<void> {
    return this.http
      .patch<ApiResponse<null>>(`${this.base}/${encodeURIComponent(productCode)}/retomar`, { capitulo })
      .pipe(map(() => undefined));
  }

  /** Cambia el asesor que sale en la portada. Vacío lo quita. Devuelve el que queda. */
  cambiarAsesor(productCode: string, asesor: string): Observable<string> {
    return this.http
      .patch<ApiResponse<{ asesor: string }>>(`${this.base}/${encodeURIComponent(productCode)}/asesor`, {
        asesor,
      })
      .pipe(map((r) => r.data?.asesor ?? ''));
  }

  /**
   * Las descargas piden lo mismo de distinta forma.
   *
   * En crudo porque no es JSON: llega el archivo. El nombre lo manda el servidor
   * en la cabecera —lleva la fecha, que es lo que distingue una descarga de la
   * siguiente— y se respeta en vez de inventarlo aquí.
   */
  private descargar(
    productCode: string,
    ruta: 'word' | 'bib' | 'documento',
    respaldo: string,
  ): Observable<{ archivo: Blob; nombre: string }> {
    return this.http
      .get(`${this.base}/${encodeURIComponent(productCode)}/${ruta}`, {
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        map((respuesta) => ({
          archivo: respuesta.body as Blob,
          nombre: nombreDeLaCabecera(respuesta.headers.get('Content-Disposition'), respaldo),
        })),
      );
  }
}

/** Saca el nombre del archivo de la cabecera, con un respaldo si no viene. */
function nombreDeLaCabecera(cabecera: string | null, respaldo: string): string {
  const encontrado = cabecera?.match(/filename="?([^"]+)"?/);
  return encontrado?.[1] ?? respaldo;
}
