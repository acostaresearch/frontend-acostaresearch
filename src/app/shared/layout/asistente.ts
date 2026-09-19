import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';

import { environment } from '../../../environments/environment';
import { mensajeDeError } from '../../core/http/api-error';
import { AsistenteService, MensajeAsistente } from '../../core/services/asistente.service';
import { AuthService } from '../../core/services/auth.service';
import { Bloque, trocear } from './asistente-texto';
import { AvisoFlotante } from './aviso-flotante';

interface Burbuja extends MensajeAsistente {
  bloques: Bloque[];
}

/** Lo que se le deja escribir. El servidor rechaza a partir de aquí. */
const MAX_CARACTERES = 800;

/**
 * Cuántos turnos se mandan. Impar a propósito: la conversación alterna y acaba
 * en una pregunta, así que un número impar desde el final siempre empieza
 * también en una pregunta, que es lo que exige Gemini.
 */
const TURNOS_ENVIADOS = 19;

const CLAVE_ABIERTO = 'asistente-abierto';

/**
 * El Asistente Acosta: el desplegable de abajo a la derecha, en todas las
 * páginas.
 *
 * Plegado por defecto, que se vea la barra y nada más: una ventana que se abre
 * sola tapa justo lo que la persona vino a leer. Si lo abre, sigue abierto al
 * cambiar de página y al recargar, hasta que cierre la pestaña.
 *
 * La conversación vive solo aquí, en memoria. El servidor no la guarda, así
 * que al recargar se pierde, y eso es lo que se promete en el pie del panel.
 *
 * Solo aparece si el servidor dice que está encendido: sin clave de Gemini, un
 * panel que contesta «no disponible» a todo es peor que no tener panel.
 */
@Component({
  selector: 'app-asistente',
  imports: [AvisoFlotante, NgTemplateOutlet, RouterLink],
  templateUrl: './asistente.html',
  styleUrl: './asistente.css',
})
export class Asistente {
  private readonly servicio = inject(AsistenteService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly whatsappUrl = environment.whatsappUrl;
  protected readonly maxCaracteres = MAX_CARACTERES;

  protected readonly bienvenida = trocear(
    '¡Hola! Soy el **Asistente Acosta**. Te ayudo a ver si el método te sirve, cuánto cuesta ' +
      'y por dónde empezar.\n\n¿En qué punto va tu tesis o tu artículo?',
  );

  protected readonly sugerencias = [
    '¿Qué incluye el Método de Tesis?',
    '¿Es plagio? ¿Lo detecta Turnitin?',
    '¿Cuánto cuesta y cómo pago?',
    'Ya compré, ¿cómo lo conecto?',
  ];

  protected readonly disponible = signal(false);
  protected readonly abierto = signal(leerAbierto());
  protected readonly burbujas = signal<Burbuja[]>([]);
  protected readonly borrador = signal('');
  protected readonly pensando = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');
  private readonly campo = viewChild<ElementRef<HTMLTextAreaElement>>('campo');
  private readonly cabecera = viewChild<ElementRef<HTMLButtonElement>>('cabecera');

  constructor() {
    // Mientras la barra está, la página deja sitio abajo para que no tape el final
    // del contenido: en la prueba del 13 de septiembre tapaba el cierre del pie en
    // móvil. Ver `.con-asistente` en `styles.css`.
    effect(() => document.body.classList.toggle('con-asistente', this.disponible()));

    this.servicio.activo().subscribe({
      next: (activo) => {
        this.disponible.set(activo);
        if (activo && this.abierto()) this.alFondo();
      },
      error: () => this.disponible.set(false),
    });
  }

  protected alternar(): void {
    const abrir = !this.abierto();
    this.abierto.set(abrir);
    guardarAbierto(abrir);
    if (abrir) {
      this.alFondo();
      setTimeout(() => this.campo()?.nativeElement.focus());
    }
  }

  @HostListener('keydown.escape')
  protected cerrarConEscape(): void {
    if (!this.abierto()) return;
    this.alternar();
    this.cabecera()?.nativeElement.focus();
  }

  protected escribir(evento: Event): void {
    const campo = evento.target as HTMLTextAreaElement;
    this.borrador.set(campo.value);
    // Crece con lo escrito hasta su máximo del CSS, como un chat cualquiera.
    campo.style.height = 'auto';
    // + 2 por el borde: `scrollHeight` no lo cuenta y, sin él, salía una barra de
    // desplazamiento en cuanto había dos líneas.
    campo.style.height = `${campo.scrollHeight + 2}px`;
  }

  /** Enter envía; Mayúsculas + Enter hace un salto de línea. */
  protected teclear(evento: KeyboardEvent): void {
    if (evento.key !== 'Enter' || evento.shiftKey || evento.isComposing) return;
    evento.preventDefault();
    this.enviar();
  }

  protected enviar(texto = this.borrador()): void {
    const pregunta = texto.trim().slice(0, MAX_CARACTERES);
    if (!pregunta || this.pensando()) return;

    const antes = this.burbujas();
    const conPregunta = [...antes, burbuja('usuario', pregunta)];

    this.burbujas.set(conPregunta);
    this.borrador.set('');
    this.error.set(null);
    this.pensando.set(true);
    this.reajustarCampo();
    this.alFondo();

    this.servicio
      .preguntar({
        mensajes: conPregunta.slice(-TURNOS_ENVIADOS).map(({ rol, texto: t }) => ({ rol, texto: t })),
        // Sin consulta ni fragmento: pueden llevar códigos, y esto acaba en Google.
        pagina: this.router.url.split(/[?#]/)[0],
        conSesion: this.auth.isAuthenticated(),
      })
      .pipe(finalize(() => this.pensando.set(false)))
      .subscribe({
        next: (respuesta) => {
          this.burbujas.update((todas) => [...todas, burbuja('asistente', respuesta)]);
          this.alInicioDeLaRespuesta();
        },
        error: (error: unknown) => {
          // La pregunta sin respuesta se retira y vuelve al campo: dejarla en la
          // lista rompería la alternancia del siguiente envío.
          this.burbujas.set(antes);
          this.borrador.set(pregunta);
          this.error.set(mensajeDeError(error));
          this.alFondo();
        },
      });
  }

  protected nuevaConversacion(): void {
    if (this.pensando()) return;
    this.burbujas.set([]);
    this.error.set(null);
    this.campo()?.nativeElement.focus();
  }

  /** En móvil el panel tapa la página: al seguir un enlace, se pliega. */
  protected alNavegar(): void {
    if (window.matchMedia('(max-width: 600px)').matches) {
      this.abierto.set(false);
      guardarAbierto(false);
    }
  }

  private alFondo(): void {
    setTimeout(() => {
      const lista = this.lista()?.nativeElement;
      if (lista) lista.scrollTop = lista.scrollHeight;
    });
  }

  /**
   * Una respuesta se lee desde arriba. Bajar hasta el final, como con la
   * pregunta, dejaba el principio tapado en cuanto pasaba de unas líneas y
   * obligaba a subir para empezar a leer.
   */
  private alInicioDeLaRespuesta(): void {
    setTimeout(() => {
      const lista = this.lista()?.nativeElement;
      const respuestas = lista?.querySelectorAll<HTMLElement>('.asis-de-asistente');
      const ultima = respuestas?.[respuestas.length - 1];
      if (lista && ultima) lista.scrollTop = ultima.offsetTop - 12;
    });
  }

  private reajustarCampo(): void {
    const campo = this.campo()?.nativeElement;
    if (campo) campo.style.height = '';
  }
}

function burbuja(rol: MensajeAsistente['rol'], texto: string): Burbuja {
  return { rol, texto, bloques: rol === 'asistente' ? trocear(texto) : [] };
}

/** `sessionStorage` puede no estar (modo privado estricto): entonces, plegado. */
function leerAbierto(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_ABIERTO) === '1';
  } catch {
    return false;
  }
}

function guardarAbierto(abierto: boolean): void {
  try {
    sessionStorage.setItem(CLAVE_ABIERTO, abierto ? '1' : '0');
  } catch {
    // Sin almacenamiento se pierde la preferencia al recargar, nada más.
  }
}
