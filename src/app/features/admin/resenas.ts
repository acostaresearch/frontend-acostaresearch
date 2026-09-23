import { Component, computed, inject, input, output, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import {
  EstadoDeResena,
  MAXIMO_VIDEO_BYTES,
  NOMBRE_DEL_ESTADO,
  ResenaDelPanel,
  ResenaService,
  estrellas,
} from '../../core/services/resena.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/** Las pestañas de la lista. `TODAS` al final: es el cajón, no lo habitual. */
const FILTROS: { clave: EstadoDeResena | 'TODAS'; nombre: string }[] = [
  { clave: 'PENDIENTE', nombre: 'Esperando' },
  { clave: 'APROBADA', nombre: 'Publicadas' },
  { clave: 'RECHAZADA', nombre: 'No publicadas' },
  { clave: 'TODAS', nombre: 'Todas' },
];

/**
 * Las reseñas del servicio, en el panel.
 *
 * Componente aparte y no una sección más dentro de `admin`, por lo mismo que
 * `ReclamosAdmin`: aquella hoja de estilos ya roza el tope de tamaño que
 * permite la compilación, y esto trae su propia ventana.
 *
 * SON DOS DECISIONES, NO UNA
 * --------------------------
 * Aprobar quiere decir «se puede leer en /resenas». Destacar, «además sale en
 * la portada», donde hay sitio para tres o cuatro. Por eso son dos botones y
 * no una casilla: se aprueban muchas y se destacan pocas.
 *
 * AQUÍ TAMBIÉN SE DAN DE ALTA
 * ---------------------------
 * Los testimonios llegan por WhatsApp y por correo, no por el formulario: quien
 * graba un video contando cómo le fue no vuelve luego a la web a escribirlo.
 * Se apunta el correo del cliente y la reseña nace publicada, porque la escribe
 * quien la aprobaría. El correo TIENE que ser el de una cuenta: de ahí sale la
 * firma pública, y sin cuenta detrás el servidor no crea nada.
 *
 * EL MOTIVO DE UN RECHAZO LO LEE SU AUTOR
 * ---------------------------------------
 * Sale en su perfil tal y como se escriba aquí. No es una nota interna: es una
 * respuesta a una persona que dedicó un rato a escribir algo, así que el campo
 * lo dice antes de que se escriba.
 */
@Component({
  imports: [AvisoFlotante],
  selector: 'app-resenas-admin',
  templateUrl: './resenas.html',
  styleUrl: './resenas.css',
})
export class ResenasAdmin {
  private readonly api = inject(ResenaService);

  readonly resenas = input.required<ResenaDelPanel[]>();
  /** Se cambió algo. Lleva el mensaje para el aviso del panel, que recarga. */
  readonly cambiada = output<string>();

  readonly filtros = FILTROS;
  readonly nombreDelEstado = NOMBRE_DEL_ESTADO;
  readonly estrellas = estrellas;

  readonly filtro = signal<EstadoDeResena | 'TODAS'>('PENDIENTE');

  readonly abierta = signal<ResenaDelPanel | null>(null);
  readonly motivo = signal('');
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);

  /** El video de la que se está mirando, bajado con la sesión puesta. */
  readonly videoLocal = signal<string | null>(null);
  readonly subiendoVideo = signal(false);
  readonly maximoMb = Math.round(MAXIMO_VIDEO_BYTES / (1024 * 1024));

  /** El alta a mano: el formulario de arriba, cerrado hasta que se pide. */
  readonly dandoDeAlta = signal(false);
  readonly nuevaEmail = signal('');
  readonly nuevaEstrellas = signal(5);
  readonly nuevaComentario = signal('');
  readonly nuevaOficio = signal('');
  /** El video, elegido antes de guardar: se sube en cuanto existe la reseña. */
  readonly nuevaVideo = signal<File | null>(null);

  /**
   * Hace falta el correo y ALGO que enseñar: el texto o el video.
   *
   * Sin ninguna de las dos cosas quedaría una reseña en blanco, que no sale en
   * la web pero sí cuenta para la media. Con video basta: hay testimonios que
   * son solo la grabación.
   */
  readonly puedeDarDeAlta = computed(
    () =>
      this.nuevaEmail().trim().includes('@') &&
      (this.nuevaComentario().trim().length >= 20 || this.nuevaVideo() !== null) &&
      !this.guardando(),
  );

  /** «12,4 MB», para que se vea qué se va a subir antes de subirlo. */
  readonly pesoDelNuevoVideo = computed(() => {
    const archivo = this.nuevaVideo();
    return archivo ? `${(archivo.size / (1024 * 1024)).toFixed(1)} MB` : '';
  });

  /** Lo que se está mirando. El filtrado es aquí: la lista viene entera. */
  readonly visibles = computed(() => {
    const filtro = this.filtro();
    return filtro === 'TODAS' ? this.resenas() : this.resenas().filter((r) => r.estado === filtro);
  });

  /** Cuántas hay de cada estado, para los números de las pestañas. */
  readonly cuantas = computed(() => {
    const todas = this.resenas();
    return {
      PENDIENTE: todas.filter((r) => r.estado === 'PENDIENTE').length,
      APROBADA: todas.filter((r) => r.estado === 'APROBADA').length,
      RECHAZADA: todas.filter((r) => r.estado === 'RECHAZADA').length,
      TODAS: todas.length,
    };
  });

  readonly destacadas = computed(() => this.resenas().filter((r) => r.destacada).length);

  abrir(resena: ResenaDelPanel): void {
    this.abierta.set(resena);
    this.motivo.set(resena.motivo);
    this.error.set(null);
    this.soltarElVideo();
    // El video se baja con la sesión: hay que poder verlo ANTES de aprobarlo, y
    // la ruta pública solo sirve las que ya están aprobadas.
    if (resena.video) {
      this.api.videoPorRevisar(resena.id, 'panel').subscribe({
        next: (blob) => this.videoLocal.set(URL.createObjectURL(blob)),
        error: () => this.videoLocal.set(null),
      });
    }
  }

  cerrar(): void {
    this.abierta.set(null);
    this.soltarElVideo();
  }

  private soltarElVideo(): void {
    const url = this.videoLocal();
    if (url) URL.revokeObjectURL(url);
    this.videoLocal.set(null);
  }

  escribirNueva(evento: Event, donde: 'nuevaEmail' | 'nuevaComentario' | 'nuevaOficio'): void {
    this[donde].set((evento.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  /** Elige el video que se subirá con el alta. Todavía no sube nada. */
  elegirVideoNuevo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;

    if (archivo.size > MAXIMO_VIDEO_BYTES) {
      this.error.set(`Ese video pesa demasiado. El tope son ${this.maximoMb} MB.`);
      return;
    }

    this.error.set(null);
    this.nuevaVideo.set(archivo);
  }

  /**
   * Da de alta la reseña de un cliente, con su correo, y le cuelga el video.
   *
   * Dos pasos y no uno: el video se sube a una reseña que ya existe, porque
   * hasta entonces no hay a qué colgarlo. Si el alta falla no se ha subido
   * nada; si falla el video, la reseña queda guardada y se dice, que es mejor
   * que perder el texto por un archivo.
   */
  darDeAlta(): void {
    if (!this.puedeDarDeAlta()) return;

    this.guardando.set(true);
    this.error.set(null);

    this.api
      .crearDesdeElPanel({
        email: this.nuevaEmail().trim(),
        estrellas: this.nuevaEstrellas(),
        comentario: this.nuevaComentario().trim(),
        oficio: this.nuevaOficio().trim(),
      })
      .subscribe({
        next: (resena) => {
          const video = this.nuevaVideo();
          if (!video) return this.altaTerminada(resena.autor, resena.sinCuenta);

          this.api.subirVideoDelPanel(resena.id, video).subscribe({
            next: () => this.altaTerminada(resena.autor, resena.sinCuenta),
            error: (e: unknown) => {
              this.guardando.set(false);
              this.error.set(
                `La reseña se guardó, pero el video no subió: ${mensajeDeError(e)} Ábrela con «Leerla» para volver a intentarlo.`,
              );
            },
          });
        },
        error: (e: unknown) => {
          this.guardando.set(false);
          this.error.set(mensajeDeError(e));
        },
      });
  }

  private altaTerminada(autor: string, sinCuenta = false): void {
    this.guardando.set(false);
    this.dandoDeAlta.set(false);
    this.nuevaComentario.set('');
    this.nuevaOficio.set('');
    const correo = this.nuevaEmail().trim();
    this.nuevaVideo.set(null);
    // Si ese correo no tiene cuenta se guarda igual —hay quien compró por otra
    // vía— pero se dice en el mismo aviso: una firma sin cuenta detrás no se
    // puede comprobar, y eso hay que saberlo ahora, no descubrirlo después.
    this.cambiada.emit(
      sinCuenta
        ? `Guardada y publicada, pero OJO: no hay ninguna cuenta con ${correo}. Se firma igual con ese correo, aunque nadie ha comprado con él.`
        : `Reseña de ${autor} guardada y publicada.`,
    );
    this.nuevaEmail.set('');
  }

  /** Sube o cambia el video de la reseña abierta, sin devolverla a pendiente. */
  elegirVideo(evento: Event, resena: ResenaDelPanel): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;

    if (archivo.size > MAXIMO_VIDEO_BYTES) {
      this.error.set(`Ese video pesa demasiado. El tope son ${this.maximoMb} MB.`);
      return;
    }

    this.subiendoVideo.set(true);
    this.error.set(null);
    this.api.subirVideoDelPanel(resena.id, archivo).subscribe({
      next: () => {
        this.subiendoVideo.set(false);
        this.cambiada.emit('Video subido.');
      },
      error: (e: unknown) => {
        this.subiendoVideo.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  escribirMotivo(evento: Event): void {
    this.motivo.set((evento.target as HTMLTextAreaElement).value);
  }

  /** Aprobar, y de paso destacarla si se pidió así. */
  aprobar(resena: ResenaDelPanel, destacada = false): void {
    this.aplicar(resena, { estado: 'APROBADA', destacada }, (r) =>
      destacada
        ? `Publicada la reseña de ${r.nombre}, y sale en la portada.`
        : `Publicada la reseña de ${r.nombre}.`,
    );
  }

  /** Subir o bajar de la portada una que ya está publicada. */
  destacar(resena: ResenaDelPanel, destacada: boolean): void {
    this.aplicar(resena, { destacada }, (r) =>
      destacada
        ? `La reseña de ${r.nombre} ya sale en la portada.`
        : `La reseña de ${r.nombre} sale en /resenas, pero ya no en la portada.`,
    );
  }

  /** Rechazar, con el motivo que va a leer su autor. */
  rechazar(resena: ResenaDelPanel): void {
    this.aplicar(
      resena,
      { estado: 'RECHAZADA', motivo: this.motivo().trim() },
      (r) => `No se publicó la reseña de ${r.nombre}. Puede cambiarla y volver a enviarla.`,
    );
  }

  /** Retirar de la web una que ya estaba publicada. Vuelve a la cola. */
  retirar(resena: ResenaDelPanel): void {
    this.aplicar(
      resena,
      { estado: 'PENDIENTE' },
      (r) => `La reseña de ${r.nombre} ya no se ve en la web.`,
    );
  }

  /**
   * La borra del todo: la fila y su video.
   *
   * Es otra cosa que «No publicar». Rechazar retira de la web y deja la reseña
   * donde está, con su motivo, porque detrás hay alguien que escribió algo y
   * puede corregirlo. Esto es para lo que nunca fue una reseña —las de prueba,
   * las que se dieron de alta con el correo equivocado—: ahí no hay a quién
   * responder, y rechazarlas solo las escondía sin sacarlas del panel.
   *
   * Pregunta antes, con el nombre delante, que no se deshace.
   */
  borrar(resena: ResenaDelPanel): void {
    if (this.guardando()) return;

    const quien = resena.nombre || resena.autor;
    if (!confirm(`¿Borrar la reseña de ${quien}? Se va con su video y no se puede deshacer.`)) {
      return;
    }

    this.guardando.set(true);
    this.error.set(null);

    this.api.borrar(resena.id).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrar();
        this.cambiada.emit(`Borrada la reseña de ${quien}.`);
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  private aplicar(
    resena: ResenaDelPanel,
    cambios: { estado?: EstadoDeResena; destacada?: boolean; motivo?: string },
    mensaje: (r: ResenaDelPanel) => string,
  ): void {
    if (this.guardando()) return;

    this.guardando.set(true);
    this.error.set(null);

    this.api.revisar(resena.id, cambios).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrar();
        this.cambiada.emit(mensaje(resena));
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  fecha(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-PE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'America/Lima',
      });
    } catch {
      return iso.slice(0, 10);
    }
  }
}
