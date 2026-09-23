import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { AuthService } from '../../core/services/auth.service';
import {
  MiResena,
  NOMBRE_DEL_ESTADO,
  ResenaService,
  estrellas,
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
 * Porque un formulario abierto en la portada recoge lo que escribe cualquiera
 * que pase, y eso no es un testimonio: es trabajo de moderación. Aquí escribe
 * quien tiene cuenta, se le rellena el nombre solo y su reseña es una, la suya,
 * que puede reescribir cuando cambie de opinión.
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
  readonly nombre = signal('');
  readonly oficio = signal('');

  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  readonly faltan = computed(() => MINIMO_COMENTARIO - this.comentario().trim().length);

  readonly puedeEnviar = computed(
    () =>
      this.puestas() >= 1 &&
      this.faltan() <= 0 &&
      this.comentario().trim().length <= MAXIMO_COMENTARIO &&
      this.nombre().trim().length >= 2 &&
      !this.guardando(),
  );

  ngOnInit(): void {
    this.api.mia().subscribe({
      next: (resena) => {
        this.cargando.set(false);
        this.mia.set(resena);
        this.rellenarCon(resena);
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

  escribir(evento: Event, donde: 'comentario' | 'nombre' | 'oficio'): void {
    const valor = (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
    this[donde].set(valor);
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
        nombre: this.nombre().trim(),
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

  /**
   * Deja el formulario como está la reseña guardada.
   *
   * Sin ninguna, el nombre sale del de la cuenta: es lo que ya escribió al
   * registrarse, y pedírselo otra vez es pedirle que repita algo que ya dimos
   * por sabido. Puede cambiarlo —hay quien no quiere su apellido debajo de su
   * opinión— pero por defecto no tiene que escribir nada.
   */
  private rellenarCon(resena: MiResena | null): void {
    this.puestas.set(resena?.estrellas ?? 0);
    this.comentario.set(resena?.comentario ?? '');
    this.nombre.set(resena?.nombre || this.auth.fullName() || '');
    this.oficio.set(resena?.oficio ?? '');
  }
}
