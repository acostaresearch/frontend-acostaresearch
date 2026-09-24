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
 * Lo que este cliente opina del servicio.
 *
 * POR QUÉ NO ES UN FORMULARIO SUELTO
 * ----------------------------------
 * Porque un formulario abierto recoge lo que escribe cualquiera que pase, y eso
 * no es un testimonio: es trabajo de moderación. Este solo aparece para quien
 * tiene la sesión abierta —en la portada, debajo de las reseñas, y donde haga
 * falta—.
 *
 * VARIAS, NO UNA
 * --------------
 * Quien vuelve a los seis meses con otra fase terminada tiene algo distinto que
 * contar, así que escribe otra en vez de pisar la de antes. Se ven todas las
 * suyas con su estado, y cada una se cambia por su lado.
 *
 * LAS QUE PUBLICAMOS NOSOTROS NO SE TOCAN
 * ---------------------------------------
 * Una que se dio de alta desde el panel a su nombre sale aquí para que la vea
 * —tiene derecho a saber qué se publicó con su firma— pero sin botones: no la
 * escribió él. Si quiere cambiarla, escribe.
 *
 * NO SE PIDE NOMBRE
 * -----------------
 * Sale firmada con el correo de la cuenta tapado, «steb***@gmail.com». Un
 * nombre escrito a mano lo pone cualquiera y no prueba nada; el correo a medias
 * enseña que detrás hay una cuenta de verdad sin repartir la dirección.
 *
 * NO SE PUBLICA AL ENVIARLA, Y SE DICE
 * ------------------------------------
 * Queda pendiente hasta que la apruebe un administrador. Se avisa antes de
 * escribirla y después de enviarla, porque quien deja cinco estrellas y no las
 * ve aparecer en la web da por hecho que se perdieron.
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
  readonly maximoMb = Math.round(MAXIMO_VIDEO_BYTES / (1024 * 1024));

  readonly cargando = signal(true);
  /** Las que ya dejó, las últimas primero. */
  readonly mias = signal<MiResena[]>([]);

  /**
   * Cuál se está escribiendo.
   *
   * `null` = ninguna, se ven solo las suyas. `'nueva'` = el formulario en
   * blanco. Un id = está cambiando esa.
   */
  readonly editando = signal<string | null>(null);

  readonly puestas = signal(0);
  readonly comentario = signal('');
  readonly oficio = signal('');

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
   * Para verlo no vale un `<video src>`: los suyos todavía no están aprobados y
   * esa ruta solo sirve las que sí. Se bajan con la sesión puesta y se guardan
   * aquí, uno por reseña.
   */
  readonly subiendoVideo = signal<string | null>(null);
  readonly videos = signal<Record<string, string>>({});

  /**
   * El video elegido en el propio formulario, antes de enviarla.
   *
   * Se sube justo después de guardar el texto, en la misma pulsación de
   * «Enviar»: así se deja la reseña con su video de una vez, sin tener que
   * volver a buscar el botón en la lista.
   */
  readonly videoElegido = signal<File | null>(null);

  /** Con qué va a salir: el correo de su cuenta, tapado. */
  readonly firma = computed(() => firmaDe(this.auth.user()?.email ?? ''));

  readonly faltan = computed(() => MINIMO_COMENTARIO - this.comentario().trim().length);

  /** La que se está cambiando, si es que se está cambiando alguna. */
  readonly enCurso = computed(() => {
    const cual = this.editando();
    return cual && cual !== 'nueva' ? (this.mias().find((r) => r.id === cual) ?? null) : null;
  });

  /**
   * Con video, el texto sobra: el testimonio es la grabación. Sin video, hace
   * falta una frase de verdad, que cinco estrellas sueltas no cuentan nada.
   */
  readonly puedeEnviar = computed(
    () =>
      this.puestas() >= 1 &&
      (this.faltan() <= 0 || this.enCurso()?.video === true || this.videoElegido() !== null) &&
      this.comentario().trim().length <= MAXIMO_COMENTARIO &&
      !this.guardando(),
  );

  ngOnInit(): void {
    this.api.mias().subscribe({
      next: (resenas) => {
        this.cargando.set(false);
        this.mias.set(resenas);
        // Sin ninguna escrita, el formulario ya está abierto: cerrado obligaría
        // a un clic más para llegar a lo único que hay aquí.
        if (resenas.length === 0) this.escribirOtra();
        for (const r of resenas) if (r.video) this.traerVideo(r.id);
      },
      // Sin lista que enseñar no se pinta un error rojo: esto es lo menos
      // importante de la pantalla y no vale la pena asustar.
      error: () => {
        this.cargando.set(false);
        this.mias.set([]);
      },
    });
  }

  /** Abre el formulario en blanco. */
  escribirOtra(): void {
    this.videoElegido.set(null);
    this.puestas.set(0);
    this.comentario.set('');
    this.oficio.set('');
    this.aviso.set(null);
    this.error.set(null);
    this.editando.set('nueva');
  }

  /** Vuelve a abrir una suya para cambiarla. */
  editar(resena: MiResena): void {
    this.videoElegido.set(null);
    this.puestas.set(resena.estrellas);
    this.comentario.set(resena.comentario);
    this.oficio.set(resena.oficio);
    this.aviso.set(null);
    this.error.set(null);
    this.editando.set(resena.id);
  }

  cancelar(): void {
    this.videoElegido.set(null);
    this.editando.set(null);
    this.error.set(null);
  }

  poner(estrellas: number): void {
    this.puestas.set(estrellas);
  }

  escribir(evento: Event, donde: 'comentario' | 'oficio'): void {
    const valor = (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
    this[donde].set(valor);
  }

  enviar(): void {
    if (!this.puedeEnviar()) return;

    const cual = this.editando();
    const cambiando = cual !== null && cual !== 'nueva';
    const video = this.videoElegido();
    const datos = {
      estrellas: this.puestas(),
      comentario: this.comentario().trim(),
      oficio: this.oficio().trim(),
      conVideo: video !== null,
    };

    this.guardando.set(true);
    this.error.set(null);

    const peticion = cambiando ? this.api.cambiar(cual, datos) : this.api.guardar(datos);

    peticion.subscribe({
      next: (resena) => {
        this.guardando.set(false);
        this.guardarEnLaLista(resena);
        this.editando.set(null);
        this.videoElegido.set(null);
        if (video) {
          this.aviso.set('Reseña guardada. Subiendo tu video: no cierres esta ventana…');
          this.subirVideo(resena, video);
          return;
        }
        this.aviso.set(
          cambiando
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

  /**
   * Coge el video del disco y lo sube a esa reseña.
   *
   * El peso se mira aquí antes de mandar nada: subir 200 MB para que el
   * servidor conteste que el tope son 80 es tirar diez minutos de datos del
   * móvil de alguien.
   */
  elegirVideo(evento: Event, resena: MiResena): void {
    const archivo = this.leerVideo(evento);
    if (archivo) this.subirVideo(resena, archivo);
  }

  /** El video del formulario: se guarda aquí y sube al pulsar «Enviar». */
  elegirVideoDelFormulario(evento: Event): void {
    const archivo = this.leerVideo(evento);
    if (archivo) this.videoElegido.set(archivo);
  }

  /** «video.mp4 · 12,4 MB», para que vea que eligió el que quería. */
  describirVideo(archivo: File): string {
    const mb = (archivo.size / (1024 * 1024)).toLocaleString('es-PE', { maximumFractionDigits: 1 });
    return `${archivo.name} · ${mb} MB`;
  }

  /** Saca el archivo del campo y mira el peso antes de mandar nada. */
  private leerVideo(evento: Event): File | null {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0] ?? null;
    entrada.value = '';
    if (!archivo) return null;

    if (archivo.size > MAXIMO_VIDEO_BYTES) {
      this.error.set(`Ese video pesa demasiado. El tope son ${this.maximoMb} MB.`);
      return null;
    }
    this.error.set(null);
    return archivo;
  }

  private subirVideo(resena: MiResena, archivo: File): void {
    this.subiendoVideo.set(resena.id);
    this.error.set(null);
    this.api.subirMiVideo(resena.id, archivo).subscribe({
      next: (guardada) => {
        this.subiendoVideo.set(null);
        this.guardarEnLaLista(guardada);
        this.soltarElVideo(guardada.id);
        this.traerVideo(guardada.id);
        this.aviso.set('¡Gracias! Recibimos tu reseña con su video. La vemos antes de publicarla.');
      },
      error: (e: unknown) => {
        this.subiendoVideo.set(null);
        this.error.set(
          `${mensajeDeError(e)} Tu reseña quedó guardada: vuelve a intentarlo con «Añadir un video».`,
        );
      },
    });
  }

  quitarVideo(resena: MiResena): void {
    this.api.quitarMiVideo(resena.id).subscribe({
      next: (guardada) => {
        this.guardarEnLaLista(guardada);
        this.soltarElVideo(guardada.id);
        this.aviso.set('Video quitado.');
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /** Baja el video de una suya con la sesión puesta y lo deja reproducible. */
  private traerVideo(id: string): void {
    if (this.videos()[id]) return;
    this.api.videoPorRevisar(id).subscribe({
      next: (blob) => this.videos.update((todos) => ({ ...todos, [id]: URL.createObjectURL(blob) })),
      error: () => this.soltarElVideo(id),
    });
  }

  private soltarElVideo(id: string): void {
    const url = this.videos()[id];
    if (url) URL.revokeObjectURL(url);
    this.videos.update((todos) => {
      const resto = { ...todos };
      delete resto[id];
      return resto;
    });
  }

  /** Mete la que vuelve del servidor en su sitio de la lista. */
  private guardarEnLaLista(resena: MiResena): void {
    this.mias.update((todas) => {
      const conocida = todas.some((r) => r.id === resena.id);
      return conocida ? todas.map((r) => (r.id === resena.id ? resena : r)) : [resena, ...todas];
    });
  }

  /** «setiembre de 2026». El día exacto de una opinión no le importa a nadie. */
  cuando(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-PE', {
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Lima',
      });
    } catch {
      return '';
    }
  }
}
