import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';

/** En qué punto va el cambio de contraseña. */
type PasoDeClave = 'cerrado' | 'esperando-codigo' | 'con-codigo';

/**
 * Los ajustes de la propia cuenta: los datos y la contraseña.
 *
 * Vive en `shared` y no dentro de una pantalla porque lo usan dos: el perfil del
 * comprador y el panel del administrador. Un administrador también es una
 * persona con nombre y contraseña, y tener dos copias de esto era garantizar que
 * una se quedara atrás.
 *
 * El cambio de contraseña va en dos pasos y con un código del correo, no con la
 * contraseña actual. Son dos preguntas distintas: la contraseña actual demuestra
 * que alguien la sabe —también quien la robó—, y el código demuestra que quien
 * pide el cambio tiene la bandeja del dueño. Contra una sesión secuestrada, que
 * es de lo que hay que proteger, solo sirve lo segundo. Y de paso hace posible
 * ponerse contraseña en una cuenta creada con Google, que no tiene ninguna.
 */
@Component({
  selector: 'app-ajustes-de-cuenta',
  imports: [ReactiveFormsModule],
  templateUrl: './ajustes-de-cuenta.html',
  styleUrl: './ajustes-de-cuenta.css',
})
export class AjustesDeCuenta {
  private readonly fb = inject(FormBuilder);
  private readonly usuarios = inject(UserService);
  private readonly auth = inject(AuthService);

  readonly usuario = this.auth.user;

  // ── Datos ────────────────────────────────────────────────────────────────
  readonly formDatos = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    lastName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
  });

  readonly guardandoDatos = signal(false);
  readonly datosGuardados = signal(false);
  readonly errorDatos = signal<string | null>(null);

  // ── Contraseña ───────────────────────────────────────────────────────────
  readonly paso = signal<PasoDeClave>('cerrado');
  readonly enviandoCodigo = signal(false);
  readonly cambiando = signal(false);
  readonly errorClave = signal<string | null>(null);
  readonly avisoClave = signal<string | null>(null);
  /** A qué correo se mandó el código. Se enseña para que se sepa dónde mirar. */
  readonly correoDelCodigo = signal<string | null>(null);

  readonly formClave = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[0-9]{6}$/)]],
    newPassword: ['', [Validators.required, Validators.minLength(10)]],
    repetida: ['', [Validators.required]],
  });

  /**
   * Las dos contraseñas tienen que coincidir.
   *
   * Se comprueba aquí y no con un validador de grupo porque lo que hace falta es
   * un mensaje en pantalla junto al segundo campo, no un formulario inválido sin
   * explicación.
   */
  readonly noCoinciden = computed(() => {
    const v = this.valoresDeClave();
    return v.repetida.length > 0 && v.newPassword !== v.repetida;
  });

  /** Los valores del formulario como señal, para poder derivar de ellos. */
  private readonly valoresDeClave = signal({ newPassword: '', repetida: '' });

  constructor() {
    // Los datos del formulario salen del usuario en sesión, y se vuelven a poner
    // cada vez que cambia: si otra pantalla lo actualiza, esto no se queda atrás.
    effect(() => {
      const user = this.usuario();
      if (!user) return;
      this.formDatos.patchValue(
        { firstName: user.firstName, lastName: user.lastName },
        { emitEvent: false },
      );
    });

    this.formClave.valueChanges.subscribe((v) =>
      this.valoresDeClave.set({ newPassword: v.newPassword ?? '', repetida: v.repetida ?? '' }),
    );
  }

  /** Si no ha tocado nada, no hay nada que guardar. */
  readonly datosCambiados = computed(() => this.formDatos.dirty);

  guardarDatos(): void {
    this.errorDatos.set(null);
    this.datosGuardados.set(false);

    if (this.formDatos.invalid) {
      this.formDatos.markAllAsTouched();
      return;
    }

    this.guardandoDatos.set(true);
    this.usuarios.actualizarPerfil(this.formDatos.getRawValue()).subscribe({
      next: (user) => {
        // La sesión guarda el nombre para pintarlo en la cabecera: si no se
        // actualiza aquí, el saludo sigue diciendo el anterior hasta recargar.
        this.auth.setUser(user);
        this.formDatos.markAsPristine();
        this.guardandoDatos.set(false);
        this.datosGuardados.set(true);
      },
      error: (e: unknown) => {
        this.errorDatos.set(mensajeDeError(e));
        this.guardandoDatos.set(false);
      },
    });
  }

  /** Paso 1: pedir el código. */
  pedirCodigo(): void {
    this.errorClave.set(null);
    this.avisoClave.set(null);
    this.enviandoCodigo.set(true);
    this.paso.set('esperando-codigo');

    this.usuarios.pedirCodigoDeClave().subscribe({
      next: ({ email, expiresInMinutes }) => {
        this.correoDelCodigo.set(email);
        this.avisoClave.set(`Código enviado a ${email}. Caduca en ${expiresInMinutes} minutos.`);
        this.enviandoCodigo.set(false);
        this.paso.set('con-codigo');
      },
      error: (e: unknown) => {
        this.errorClave.set(mensajeDeError(e));
        this.enviandoCodigo.set(false);
        this.paso.set('cerrado');
      },
    });
  }

  /** Paso 2: el código y la contraseña nueva. */
  cambiarClave(): void {
    this.errorClave.set(null);

    if (this.formClave.invalid || this.noCoinciden()) {
      this.formClave.markAllAsTouched();
      return;
    }

    const { code, newPassword } = this.formClave.getRawValue();

    this.cambiando.set(true);
    this.usuarios.cambiarClave({ code, newPassword }).subscribe({
      next: (sesionesCerradas) => {
        this.formClave.reset();
        this.cambiando.set(false);
        this.paso.set('cerrado');
        this.avisoClave.set(
          sesionesCerradas > 0
            ? `Contraseña cambiada. Se cerraron ${sesionesCerradas} ${
                sesionesCerradas === 1 ? 'sesión abierta' : 'sesiones abiertas'
              } en otros dispositivos.`
            : 'Contraseña cambiada.',
        );
      },
      error: (e: unknown) => {
        this.errorClave.set(mensajeDeError(e));
        this.cambiando.set(false);
      },
    });
  }

  cancelarCambio(): void {
    this.formClave.reset();
    this.errorClave.set(null);
    this.avisoClave.set(null);
    this.paso.set('cerrado');
  }
}
