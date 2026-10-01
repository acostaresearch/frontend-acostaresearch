import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';

export type ModoWhatsapp = 'BOT' | 'HUMANO';
export type AutorWhatsapp = 'CLIENTE' | 'BOT' | 'ADMIN';
export type EnvioWhatsapp = 'RECIBIDO' | 'ENVIADO' | 'FALLIDO' | 'SIMULADO';
export type FiltroWhatsapp = 'TODAS' | 'PERSONA' | 'NO_LEIDAS' | 'BLOQUEADAS';

/** Cómo está montado el bot: si piensa (Gemini) y si habla (Meta). */
export interface EstadoWhatsapp {
  ia: boolean;
  meta: boolean;
  /** Las claves de Meta que faltan en el .env del servidor. */
  faltan: string[];
  webhookUrl: string;
  modelos: string[];
  maxDiario: number;
  usadosHoy: number;
  retencionDias: number;
  cifras: { conversaciones: number; delCliente: number; delBot: number; esperando: number };
}

export interface AjustesWhatsapp {
  activo: boolean;
  usarHorario: boolean;
  horaInicio: string;
  horaFin: string;
  /** «1,2,3,4,5»: 1 = lunes … 7 = domingo. */
  diasLaborables: string;
  bienvenida: string;
  instrucciones: string;
  palabrasHumano: string;
}

/** Lo que se manda al guardar: los días van como lista. */
export type AjustesWhatsappEnvio = Omit<AjustesWhatsapp, 'diasLaborables'> & {
  diasLaborables: number[];
};

export interface MensajeWhatsapp {
  id: string;
  autor: AutorWhatsapp;
  texto: string;
  envio: EnvioWhatsapp;
  error: string | null;
  modelo: string | null;
  /** La imagen de la galería que llevaba, si fue una. */
  imagenId: string | null;
  createdAt: string;
}

/** Una imagen de la galería del bot. */
export interface ImagenWhatsapp {
  id: string;
  nombre: string;
  /** Cuándo la manda el bot. */
  cuando: string;
  /** El texto que va debajo en WhatsApp. */
  pie: string;
  /** Si el bot la puede mandar solo; si no, solo se manda desde el panel. */
  enBot: boolean;
  mime: string;
  bytes: number;
  createdAt: string;
}

export type DatosImagenWhatsapp = Pick<ImagenWhatsapp, 'nombre' | 'cuando' | 'pie' | 'enBot'>;

export interface ConversacionWhatsapp {
  id: string;
  /** Un número real (51987654321) o una prueba del panel (prueba-…). */
  telefono: string;
  nombre: string;
  modo: ModoWhatsapp;
  bloqueado: boolean;
  pideHumano: boolean;
  noLeidos: number;
  ultimoDelClienteAt: string | null;
  ultimoMensajeAt: string;
  createdAt: string;
  ultimo?: { autor: AutorWhatsapp; texto: string } | null;
}

export interface ConversacionAbierta extends ConversacionWhatsapp {
  /** Si todavía se le puede escribir: 24 horas desde su último mensaje. */
  ventanaAbierta: boolean;
  mensajes: MensajeWhatsapp[];
}

/** Por qué el bot contestó o se calló, en palabras del panel. */
export const MOTIVOS: Record<string, string> = {
  respondido: 'El bot respondió.',
  bot_pide_persona: 'El bot respondió y pidió que lo atienda una persona.',
  pidio_persona: 'Pidió una persona: la conversación pasó a «La llevas tú».',
  no_es_texto: 'No era texto: se le pidió que lo escriba.',
  persona: 'La conversación la llevas tú: el bot no contesta.',
  personal: 'Parecía un mensaje personal: el bot no contestó y la conversación pasó a ti.',
  apagado: 'El bot está apagado: el mensaje quedó guardado.',
  horario: 'Es horario de atención humana: el bot no contesta.',
  bloqueado: 'El número está bloqueado.',
  sin_ia: 'Falta la clave de Gemini del bot en el servidor.',
  tope: 'El bot llegó a su tope de respuestas del día.',
  bloqueado_por_gemini: 'Gemini se negó a responder: salió la respuesta fija.',
  error_ia: 'Gemini no respondió: salió la respuesta fija y se avisó.',
  repetido: 'Ese mensaje ya se había procesado.',
};

@Injectable({ providedIn: 'root' })
export class WhatsappService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/whatsapp`;

  estado(): Observable<EstadoWhatsapp> {
    return this.http.get<ApiResponse<EstadoWhatsapp>>(`${this.base}/estado`).pipe(map((r) => r.data));
  }

  ajustes(): Observable<AjustesWhatsapp> {
    return this.http.get<ApiResponse<AjustesWhatsapp>>(`${this.base}/ajustes`).pipe(map((r) => r.data));
  }

  guardarAjustes(datos: Partial<AjustesWhatsappEnvio>): Observable<AjustesWhatsapp> {
    return this.http
      .put<ApiResponse<AjustesWhatsapp>>(`${this.base}/ajustes`, datos)
      .pipe(map((r) => r.data));
  }

  conversaciones(filtro: FiltroWhatsapp, busqueda = ''): Observable<ConversacionWhatsapp[]> {
    let params = new HttpParams().set('filtro', filtro);
    if (busqueda.trim()) params = params.set('busqueda', busqueda.trim());
    return this.http
      .get<ApiResponse<ConversacionWhatsapp[]>>(`${this.base}/conversaciones`, { params })
      .pipe(map((r) => r.data));
  }

  abrir(id: string): Observable<ConversacionAbierta> {
    return this.http
      .get<ApiResponse<ConversacionAbierta>>(`${this.base}/conversaciones/${id}`)
      .pipe(map((r) => r.data));
  }

  /** Texto, una imagen de la galería, o las dos: el texto va debajo de la imagen. */
  responder(id: string, texto: string, imagenId?: string | null): Observable<MensajeWhatsapp> {
    return this.http
      .post<ApiResponse<MensajeWhatsapp>>(`${this.base}/conversaciones/${id}/responder`, {
        texto,
        ...(imagenId ? { imagenId } : {}),
      })
      .pipe(map((r) => r.data));
  }

  // ── La galería de imágenes ───────────────────────────────────────────────

  imagenes(): Observable<ImagenWhatsapp[]> {
    return this.http.get<ApiResponse<ImagenWhatsapp[]>>(`${this.base}/imagenes`).pipe(map((r) => r.data));
  }

  /** El archivo va crudo en el cuerpo y sus datos en la dirección, como los comprobantes. */
  subirImagen(archivo: File, datos: DatosImagenWhatsapp): Observable<ImagenWhatsapp> {
    const params = new HttpParams()
      .set('nombre', datos.nombre)
      .set('cuando', datos.cuando)
      .set('pie', datos.pie)
      .set('enBot', String(datos.enBot));
    return this.http
      .post<ApiResponse<ImagenWhatsapp>>(`${this.base}/imagenes`, archivo, {
        params,
        headers: { 'Content-Type': archivo.type },
      })
      .pipe(map((r) => r.data));
  }

  editarImagen(id: string, datos: Partial<DatosImagenWhatsapp>): Observable<ImagenWhatsapp> {
    return this.http
      .put<ApiResponse<ImagenWhatsapp>>(`${this.base}/imagenes/${id}`, datos)
      .pipe(map((r) => r.data));
  }

  borrarImagen(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/imagenes/${id}`);
  }

  /** Se pide con el token, así que llega como blob. */
  archivoImagen(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/imagenes/${id}/archivo`, { responseType: 'blob' });
  }

  cambiarModo(id: string, modo: ModoWhatsapp): Observable<ConversacionWhatsapp> {
    return this.http
      .put<ApiResponse<ConversacionWhatsapp>>(`${this.base}/conversaciones/${id}/modo`, { modo })
      .pipe(map((r) => r.data));
  }

  bloquear(id: string, bloqueado: boolean): Observable<ConversacionWhatsapp> {
    return this.http
      .put<ApiResponse<ConversacionWhatsapp>>(`${this.base}/conversaciones/${id}/bloqueo`, { bloqueado })
      .pipe(map((r) => r.data));
  }

  borrar(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/conversaciones/${id}`);
  }

  simular(texto: string, conversacion = 'prueba'): Observable<{ motivo: string; respuestas: MensajeWhatsapp[] }> {
    return this.http
      .post<
        ApiResponse<{ motivo: string; respuestas: MensajeWhatsapp[] }>
      >(`${this.base}/simular`, { texto, conversacion })
      .pipe(map((r) => r.data));
  }
}
