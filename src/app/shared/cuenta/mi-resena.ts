import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { AuthService } from '../../core/services/auth.service';
import {
  MAXIMO_VIDEO_BYTES,
  MiResena,
  NOMBRE_DEL_ESTADO,
  ResenaService,
  estrellas,
  firmaDe,
} from '../../core/services/resena.service';
import { AvisoFlotante } from '../layout/aviso-flotante';

/** Lo mismo que exige el servidor. Se comprueba aquí para no ir y volver. */
const MINIMO_COMENTARIO = 20;
const MAXIMO_COMENTARIO = 1500;

/**
 * Lo que este cliente opina del servicio, dentro de su perfil.
 *
 * POR QUÉ AQUÍ Y NO EN UN FORMULARIO SUELTO
 * -----------------------------------------
 * Porque un formulario abierto recoge lo que escribe cualquiera que pase, y eso
 * no es un testimonio: es trabajo de moderación. Este solo aparece para quien
 * tiene la sesión abierta —en la portada, debajo de las reseñas, y donde haga
 * falta— y su reseña es una, la suya, que puede reescribir cuando cambie de
 * opinión.
 *
 * NO SE PIDE NOMBRE
 * -----------------
 * Sale firmada con el correo de la cuenta tapado, «steb***@gmail.com». Un
 * nombre escrito a mano lo pone cualquiera y no prueba nada; el correo a medias
 * enseña que detrás hay una cuenta de verdad sin repartir la dirección. Se le
 * enseña con qué va a salir ANTES de escribir, que para eso es su firma.
 *
 * NO SE PUBLICA AL ENVIARLA, Y SE DICE
 * ------------------------------------
 * Queda pendiente hasta que la apruebe un administrador. Se avisa antes de
 * escribirla y después de enviarla, porque quien deja cinco estrellas y no las
 * ve aparecer en la web da por hecho que se perdieron.
 *
 * Y reescribirla la devuelve a pendiente: se dice también, al pie del botón, en
 * lugar de que el cliente lo descubra al ver que su reseña desapareció de la
 * portada.
 */
@Component({
  selector: 'app-mi-resena',
  imports: [AvisoFlotante],
  templateUrl: './mi-resena.html',
  styleUrl: './mi-resena.css',
})
export class MiResenaDelServicio implements OnInit {
  private readonly api = inject(ResenaService);
  private readonly auth = inject(AuthService);

  readonly nombreDelEstado = NOMBRE_DEL_ESTADO;
  readonly estrellas = estrellas;
  readonly maximo = MAXIMO_COMENTARIO;

  readonly cargando = signal(true);
  /** La que ya dejó. Null = todavía no ha escrito ninguna. */
  readonly mia = signal<MiResena | null>(null);
  /** Si está con el formulario abierto. Se abre solo cuando no tiene ninguna. */
  readonly editando = signal(false);

  readonly puestas = signal(0);
  readonly comentario = signal('');
  readonly oficio = signal('');

  /** Con qué va a salir: el correo de su cuenta, tapado. */
  readonly firma = computed(() => firmaDe(this.auth.user()?.email ?? ''));

  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  /**
   * El video del testimonio.
   *
   * Se sube DESPUÉS de escribirla, no a la vez: hasta que no existe la reseña
   * no hay a qué colgarlo, y partirlo en dos pasos evita que un video de 60 MB
   * se suba dos veces porque el texto se quedó corto.
   *
   * Para verlo no vale un `<video src>`: el suyo todavía no está aprobado y esa
   * ruta solo sirve las que sí. Se baja con la sesión puesta y se reproduce
   * desde la memoria del navegador.
   */
  readonly subiendoVideo = signal(false);
  readonly progreso = signal(0);
  readonly videoLocal = signal<string | null>(null);
  readonly maximoMb = Math.round(MAXIMO_VIDEO_BYTES / (1024 * 1024));

  readonly faltan = computed(() => MINIMO_COMENTARIO - this.comentario().trim().length);

  /**
   * Con video, el texto sobra: el testimonio es la grabación. Sin video, hace
   * falta una frase de verdad, que cinco estrellas sueltas no cuentan nada.
   */
  readonly puedeEnviar = computed(
    () =>
      this.puestas() >= 1 &&
      (this.faltan() <= 0 || this.mia()?.video === true) &&
      this.comentario().trim().length <= MAXIMO_COMENTARIO &&
      !this.guardando(),
  );

  ngOnInit(): void {
    this.api.mia().subscribe({
      next: (resena) => {
        this.cargando.set(false);
        this.mia.set(resena);
        this.rellenarCon(resena);
        if (resena?.video) this.verVideo();
        // Sin ninguna escrita, el formulario ya está abierto: cerrado obligaría
        // a un clic más para llegar a lo único que hay aquí.
        this.editando.set(resena === null);
      },
      // Sin reseña que enseñar no se pinta un error rojo en medio del perfil:
      // esto es lo menos importante de la página y no vale la pena asustar.
      error: () => {
        this.cargando.set(false);
        this.mia.set(null);
      },
    });
  }

  /** Empieza a escribir, o vuelve a lo que ya tenía guardado. */
  editar(): void {
    const resena = this.mia();
    if (resena) this.rellenarCon(resena);
    this.aviso.set(null);
    this.error.set(null);
    this.editando.set(true);
  }

  cancelar(): void {
    this.editando.set(false);
    this.error.set(null);
  }

  poner(estrellas: number): void {
    this.puestas.set(estrellas);
  }

  escribir(evento: Event, donde: 'comentario' | 'oficio'): void {
    const valor = (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
    this[donde].set(valor);
  }

  /**
   * Coge el video del disco y lo sube.
   *
   * El peso se mira aquí antes de mandar nada: subir 200 MB para que el
   * servidor conteste que el tope son 80 es tirar diez minutos de datos del
   * móvil de alguien.
   */
  elegirVideo(evento: Event): void {
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
    this.api.subirMiVideo(archivo).subscribe({
      next: (resena) => {
        this.subiendoVideo.set(false);
        this.mia.set(resena);
        this.editando.set(false);
        this.verVideo();
        this.aviso.set('Video subido. Lo vemos antes de publicarlo.');
      },
      error: (e: unknown) => {
        this.subiendoVideo.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /** Baja el suyo con la sesión puesta y lo deja listo para reproducir. */
  verVideo(): void {
    if (this.videoLocal()) return;
    this.api.videoPorRevisar().subscribe({
      next: (blob) => this.videoLocal.set(URL.createObjectURL(blob)),
      error: () => this.videoLocal.set(null),
    });
  }

  quitarVideo(): void {
    this.api.quitarMiVideo().subscribe({
      next: (resena) => {
        this.mia.set(resena);
        this.soltarElVideo();
        this.aviso.set('Video quitado.');
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  private soltarElVideo(): void {
    const url = this.videoLocal();
    if (url) URL.revokeObjectURL(url);
    this.videoLocal.set(null);
  }

  enviar(): void {
    if (!this.puedeEnviar()) return;

    const tenia = this.mia() !== null;
    this.guardando.set(true);
    this.error.set(null);

    this.api
      .guardar({
        estrellas: this.puestas(),
        comentario: this.comentario().trim(),
        oficio: this.oficio().trim(),
      })
      .subscribe({
        next: (resena) => {
          this.guardando.set(false);
          this.mia.set(resena);
          this.editando.set(false);
          this.aviso.set(
            tenia
              ? 'Guardamos los cambios. Vuelve a pasar por revisión antes de publicarse.'
              : '¡Gracias! La leeremos antes de publicarla.',
          );
        },
        error: (e: unknown) => {
          this.guardando.set(false);
          this.error.set(mensajeDeError(e));
        },
      });
  }

  /** Deja el formulario como está la reseña guardada. */
  private rellenarCon(resena: MiResena | null): void {
    this.puestas.set(resena?.estrellas ?? 0);
    this.comentario.set(resena?.comentario ?? '');
    this.oficio.set(resena?.oficio ?? '');
  }
}
