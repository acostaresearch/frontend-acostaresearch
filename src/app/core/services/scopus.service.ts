import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

/**
 * Cómo está su conexión con Scopus.
 *
 * `disponible` no es lo mismo que `conectado`: lo primero dice si este
 * servidor tiene la API de Scopus encendida y con credenciales, y si no la
 * tiene no se ofrece el botón. Una función a medio conectar enseña a
 * desconfiar del resto.
 */
export interface EstadoDeScopus {
  disponible: boolean;
  /** Con OAuth, «conectar» manda a Elsevier. Sin él, conecta en el momento. */
  conOauth: boolean;
  /**
   * Si las fichas van a traer resumen.
   *
   * Depende de que el servidor tenga token institucional de Elsevier. Sin él,
   * lo que devuelve Scopus es la vista reducida: sin resumen, sin palabras
   * clave y con un solo autor. Se puede citar, pero Claude no la encontrará
   * cuando redacte, así que hay que decirlo antes y no después.
   */
  conResumenes: boolean;
  conectado: boolean;
  estado?: 'ACTIVA' | 'CADUCADA' | 'REVOCADA';
  cuenta?: string | null;
  /** Cuántas fuentes ha traído por aquí en total. */
  importadas?: number;
  ultimaBusqueda?: string | null;
  error?: string | null;
}

/**
 * Dónde se lee gratis un artículo, si es que se puede.
 *
 * Lo dan los catálogos abiertos (OpenAlex, y Unpaywall para lo recién
 * depositado), nunca Elsevier: el enlace apunta a la copia que el propio
 * editor o un repositorio pusieron en abierto. Aquí no se aloja ningún PDF.
 */
export interface EnlaceAbierto {
  url: string;
  /** Si al otro lado está el PDF o la página desde la que se descarga. */
  esPdf: boolean;
  /**
   * Cuál de las tres copias es, y no es un detalle:
   * `publishedVersion` es la del editor y se cita sin más;
   * `acceptedVersion` tiene otra maquetación, así que no sirve para citar
   * con número de página; `submittedVersion` es un preprint sin revisar.
   */
  version: 'publishedVersion' | 'acceptedVersion' | 'submittedVersion' | null;
  licencia: string | null;
  /** El repositorio o la revista que la aloja. */
  donde: string | null;
  catalogo: 'openalex' | 'unpaywall';
  /** La copia abierta está en la editorial: es el mismo sitio que «Ver en la editorial». */
  mismoQueEditorial: boolean;
}

/** Un artículo de la lista de resultados. */
export interface ResultadoDeScopus {
  /** Lo único que vuelve al importar. Ver `importar`. */
  eid: string;
  scopusId: string | null;
  titulo: string;
  autores: string;
  anio: number | null;
  revista: string | null;
  /**
   * Volumen, número y páginas, para el «26(1), 534» de debajo de la revista.
   * Opcionales porque un servidor anterior no los manda.
   */
  volumen?: string | null;
  numero?: string | null;
  paginas?: string | null;
  doi: string | null;
  tipo: string | null;
  citas: number;
  accesoAbierto: boolean;
  /** El registro en Scopus, para poder mirarlo antes de decidir. */
  enlace: string | null;
  conResumen: boolean;
  /** Ya está en su biblioteca. Se marca, no se esconde. */
  yaLaTienes: boolean;
  /** En la búsqueda por significado: lo cerca que está de la pregunta (coseno). */
  afinidad?: number;
  /**
   * Dónde leerlo gratis. Nulo si no hay copia abierta, y ausente si contesta
   * un servidor anterior a esto: la vista trata los dos casos igual.
   */
  enlaceAbierto?: EnlaceAbierto | null;
}

/** Cómo se ordenan los resultados. «citas» es el de siempre: más citados primero. */
export type OrdenDeScopus = 'citas' | 'recientes' | 'antiguos' | 'relevancia' | 'significado';

/** Los filtros que se cuentan exactos con Scopus. */
export type FacetaExacta = 'anio' | 'tipo' | 'idioma' | 'abierto' | 'fuente' | 'etapa';

/** Los números aproximados de OpenAlex, por filtro. */
export interface CuentasAproximadas {
  total: number | null;
  grupos: Record<string, { valor: string; texto: string; n: number }[]>;
}

/** Una búsqueda guardada o una conversación del copiloto, en la lista. */
export interface BusquedaGuardadaResumida {
  id: string;
  tipo: 'BUSQUEDA' | 'COPILOTO';
  titulo: string;
  total: number;
  createdAt: string;
  updatedAt: string;
}

/** La misma, entera, para volver a ella. */
export interface BusquedaGuardada extends BusquedaGuardadaResumida {
  ecuacion: string;
  estado: Record<string, unknown>;
  hilo: unknown[] | null;
}

/**
 * Un tema concreto que el copiloto propone investigar, con sus variables.
 *
 * `independiente` y `dependiente` van en nulo cuando el estudio no tiene esa
 * forma —un cualitativo, un descriptivo—, y entonces lo que se estudia lo
 * cuenta `relacion`. Los conceptos son los de ESTE tema: con ellos se busca
 * al elegirlo.
 */
export interface TemaPropuesto {
  titulo: string;
  independiente: string | null;
  dependiente: string | null;
  relacion: string | null;
  poblacion: string | null;
  conceptos: { nombre: string; sinonimos: string[] }[];
}

/** Lo que propone el generador con IA: conceptos en inglés con sus sinónimos. */
export interface ConsultaGenerada {
  conceptos: { nombre: string; sinonimos: string[] }[];
  /** Una frase para el tesista: qué se dejó fuera y por qué. */
  nota: string | null;
  /** Temas investigables que salen de lo que describió. Puede venir vacío. */
  temas: TemaPropuesto[];
}

/** Un artículo tal como viaja para el resumen: lo justo para citarlo. */
export interface FuenteParaResumir {
  eid: string;
  doi: string | null;
  titulo: string;
  anio: number | null;
}

/**
 * El resumen con citas de la IA. Cada punto dice qué artículos lo sostienen,
 * por su número en la lista de referencias (1 = el primero que se mandó).
 */
export interface ResumenConIa {
  titulo: string;
  introduccion: string;
  secciones: { titulo: string; puntos: { texto: string; citas: number[] }[] }[];
  conclusion: string;
  limites: string;
  /** Los números que tenían resumen; los demás se leyeron solo por el título. */
  conResumen: number[];
}

export interface BusquedaDeScopus {
  total: number;
  pagina: number;
  paginas: number;
  /** El número del primer resultado de esta página, para poder numerarlos. */
  desde: number;
  porPagina: number;
  /** El orden con el que contestó el servidor. Opcional: uno anterior no lo manda. */
  orden?: OrdenDeScopus;
  /** Por significado: de cuántos candidatos se eligieron estos. */
  semantica?: boolean;
  candidatos?: number;
  conResumenes: boolean;
  resultados: ResultadoDeScopus[];
}

export interface ImportacionDeScopus {
  pedidas: number;
  guardadas: number;
  repetidas: number;
  /** Las que Scopus ya no devuelve. */
  noEncontradas: number;
  sinResumen: number;
  total: number;
  sinResumenEnTotal: number;
}

/**
 * Buscar en Scopus e importar lo que elija.
 *
 * LO QUE NUNCA PASA POR AQUÍ
 * --------------------------
 * Ni la clave de Elsevier, ni el token institucional, ni los tokens de
 * autorización. Viven en el servidor y no salen: este servicio pide una
 * dirección a la que ir, manda una ecuación de búsqueda y devuelve
 * identificadores. Nada de eso se guarda en el navegador, ni en
 * `localStorage`, ni en ninguna cookie que este código escriba.
 *
 * Al importar viajan los EID de lo que marcó, no las fichas que se ven en
 * pantalla: el servidor vuelve a pedírselas a Scopus. Si mandara las fichas,
 * lo que acabaría en su bibliografía sería lo que dijera una petición del
 * navegador y no lo que dijo Elsevier.
 */
@Injectable({ providedIn: 'root' })
export class ScopusService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/mi-scopus`;

  estado(): Observable<EstadoDeScopus> {
    return this.http
      .get<ApiResponse<{ scopus: EstadoDeScopus }>>(`${this.base}/estado`)
      .pipe(map((res) => res.data.scopus));
  }

  /**
   * Conecta, o pide la dirección de autorización.
   *
   * `url` con valor = hay que mandar al tesista a Elsevier. Nulo = la conexión
   * quedó hecha aquí mismo, porque este servidor pregunta con su propia clave.
   * El panel no tiene que saber cuál de las dos es: mira si vino dirección.
   */
  conectar(): Observable<{ conectado: boolean; url: string | null }> {
    return this.http
      .post<ApiResponse<{ conectado: boolean; url: string | null }>>(`${this.base}/conectar`, {})
      .pipe(map((res) => res.data));
  }

  buscar(ecuacion: string, pagina = 1, orden: OrdenDeScopus = 'citas'): Observable<BusquedaDeScopus> {
    return this.http
      .post<ApiResponse<BusquedaDeScopus>>(`${this.base}/buscar`, { ecuacion, pagina, orden })
      .pipe(map((res) => res.data));
  }

  /**
   * Del tema en español a los conceptos en inglés, con IA. No busca nada:
   * propone, y el tesista revisa antes de pulsar «Buscar».
   */
  generarConsulta(tema: string): Observable<ConsultaGenerada> {
    return this.http
      .post<ApiResponse<ConsultaGenerada>>(`${this.base}/generar-consulta`, { tema })
      .pipe(map((res) => res.data));
  }

  /**
   * Lo que dicen los artículos de la página, con citas. `anteriores` son las
   * preguntas ya hechas sobre estos mismos artículos, para las de seguimiento.
   */
  resumir(
    pregunta: string,
    fuentes: FuenteParaResumir[],
    anteriores: { pregunta: string; respuesta: string }[] = [],
  ): Observable<ResumenConIa> {
    return this.http
      .post<ApiResponse<ResumenConIa>>(`${this.base}/resumir`, { pregunta, fuentes, anteriores })
      .pipe(map((res) => res.data));
  }

  /**
   * Los resúmenes de los artículos de la página, de OpenAlex, por DOI en
   * minúsculas. Los que no tiene no vienen.
   */
  resumenes(dois: string[]): Observable<Record<string, string>> {
    return this.http
      .post<ApiResponse<{ resumenes: Record<string, string> }>>(`${this.base}/resumenes`, { dois })
      .pipe(map((res) => res.data.resumenes));
  }

  /** Cuántos resultados hay en cada opción de un filtro, exactos, de Scopus. */
  cuentas(ecuacion: string, faceta: FacetaExacta): Observable<Record<string, number | null>> {
    return this.http
      .post<ApiResponse<{ faceta: string; cuentas: Record<string, number | null> }>>(
        `${this.base}/cuentas`,
        { ecuacion, faceta },
      )
      .pipe(map((res) => res.data.cuentas));
  }

  /** Los números aproximados de OpenAlex para el área y los filtros de lo encontrado. */
  aproximadas(
    conceptos: { nombre: string; sinonimos: string[] }[],
    desde: number | null,
    hasta: number | null,
  ): Observable<CuentasAproximadas> {
    return this.http
      .post<ApiResponse<CuentasAproximadas>>(`${this.base}/cuentas-aproximadas`, {
        conceptos,
        desde,
        hasta,
      })
      .pipe(map((res) => res.data));
  }

  /** Los 25 más cercanos a la pregunta, por significado. */
  semantica(ecuacion: string, pregunta: string): Observable<BusquedaDeScopus> {
    return this.http
      .post<ApiResponse<BusquedaDeScopus>>(`${this.base}/semantica`, { ecuacion, pregunta })
      .pipe(map((res) => res.data));
  }

  // ── Búsquedas guardadas y conversaciones del copiloto ─────────────────────

  guardadas(): Observable<BusquedaGuardadaResumida[]> {
    return this.http
      .get<ApiResponse<{ guardadas: BusquedaGuardadaResumida[] }>>(`${this.base}/guardadas`)
      .pipe(map((res) => res.data.guardadas));
  }

  guardada(id: string): Observable<BusquedaGuardada> {
    return this.http
      .get<ApiResponse<{ guardada: BusquedaGuardada }>>(`${this.base}/guardadas/${id}`)
      .pipe(map((res) => res.data.guardada));
  }

  guardar(datos: {
    tipo: 'BUSQUEDA' | 'COPILOTO';
    titulo: string;
    ecuacion: string;
    estado: Record<string, unknown>;
    hilo?: unknown[] | null;
    total?: number;
  }): Observable<BusquedaGuardadaResumida> {
    return this.http
      .post<ApiResponse<{ guardada: BusquedaGuardadaResumida }>>(`${this.base}/guardadas`, datos)
      .pipe(map((res) => res.data.guardada));
  }

  actualizarGuardada(
    id: string,
    cambios: Partial<{ titulo: string; ecuacion: string; estado: Record<string, unknown>; hilo: unknown[]; total: number }>,
  ): Observable<BusquedaGuardadaResumida> {
    return this.http
      .put<ApiResponse<{ guardada: BusquedaGuardadaResumida }>>(`${this.base}/guardadas/${id}`, cambios)
      .pipe(map((res) => res.data.guardada));
  }

  borrarGuardada(id: string): Observable<{ ok: boolean }> {
    return this.http
      .delete<ApiResponse<{ ok: boolean }>>(`${this.base}/guardadas/${id}`)
      .pipe(map((res) => res.data));
  }

  importar(eids: string[]): Observable<ImportacionDeScopus> {
    return this.http
      .post<ApiResponse<ImportacionDeScopus>>(`${this.base}/importar`, { eids })
      .pipe(map((res) => res.data));
  }

  desconectar(): Observable<{ ok: boolean }> {
    return this.http
      .delete<ApiResponse<{ ok: boolean }>>(this.base)
      .pipe(map((res) => res.data));
  }
}
