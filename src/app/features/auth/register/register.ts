import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { fieldErrors, toApiError } from '../../../core/http/api-error';
import { ERROR_CODE } from '../../../core/models/api.model';
import { AuthService } from '../../../core/services/auth.service';
import { matchFields } from '../../../shared/validators/match.validator';
import { AuthCard } from '../auth-card/auth-card';
import { BotonGoogle } from '../boton-google/boton-google';

type CampoRegistro = 'firstName' | 'lastName' | 'email' | 'password' | 'confirmPassword';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, AuthCard, BotonGoogle],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Las reglas replican exactamente las de `auth.schema.js` en el backend. */
  readonly formulario = this.fb.nonNullable.group(
    {
      firstName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      lastName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(10),
          Validators.maxLength(128),
          Validators.pattern(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
        ],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: matchFields('password', 'confirmPassword') },
  );

  readonly whatsappUrl = environment.whatsappUrl;

  readonly enviando = signal(false);
  readonly errorGeneral = signal<string | null>(null);
  readonly erroresServidor = signal<Record<string, string>>({});

  /** Los dos ojos, independientes: se puede revelar una sin revelar la otra. */
  readonly verContrasena = signal(false);
  readonly verRepetida = signal(false);
  readonly mayusculasActivas = signal(false);

  /**
   * Espejos de lo escrito.
   *
   * Los formularios reactivos no son señales, así que sin esto nada de lo que
   * se calcula abajo se recalcularía al teclear.
   */
  private readonly valorEmail = toSignal(this.formulario.controls.email.valueChanges, {
    initialValue: '',
  });
  private readonly valorPass = toSignal(this.formulario.controls.password.valueChanges, {
    initialValue: '',
  });
  private readonly valorRepetida = toSignal(
    this.formulario.controls.confirmPassword.valueChanges,
    { initialValue: '' },
  );

  /**
   * Requisitos de la contraseña, comprobados mientras se escribe.
   *
   * Son los mismos que aplica `auth.schema.js` en el servidor. Enseñarlos en
   * vivo, en vez de soltar «debe incluir una minúscula, una mayúscula y un
   * número» cuando ya se ha rendido, es la diferencia entre completar el
   * registro y abandonarlo: nadie adivina una regla que solo aparece al fallar.
   */
  readonly requisitos = computed(() => {
    const v = this.valorPass();
    return [
      { texto: 'Al menos 10 caracteres', cumple: v.length >= 10 },
      { texto: 'Una letra mayúscula', cumple: /[A-Z]/.test(v) },
      { texto: 'Una letra minúscula', cumple: /[a-z]/.test(v) },
      { texto: 'Un número', cumple: /\d/.test(v) },
    ];
  });

  /** Solo se enseña la lista cuando ya hay algo escrito: en blanco estorba. */
  readonly mostrarRequisitos = computed(() => this.valorPass().length > 0);
  readonly contrasenaLista = computed(() => this.requisitos().every((r) => r.cumple));

  readonly emailListo = computed(
    () => this.valorEmail().length > 0 && this.formulario.controls.email.valid,
  );

  /** Ni «coinciden» ni «no coinciden» hasta que haya algo con lo que comparar. */
  readonly repetidaEstado = computed(() => {
    const a = this.valorPass();
    const b = this.valorRepetida();
    if (!b) return 'vacia';
    return a === b ? 'coincide' : 'difiere';
  });

  errorDe(campo: CampoRegistro): string | null {
    const control = this.formulario.controls[campo];
    const delServidor = this.erroresServidor()[campo];
    if (delServidor) return delServidor;
    if (!control.touched || control.valid) return null;

    if (control.hasError('required')) return 'Este campo es obligatorio.';
    if (control.hasError('email')) return 'El correo no tiene un formato válido.';
    if (control.hasError('minlength')) {
      return campo === 'password'
        ? 'La contraseña debe tener al menos 10 caracteres.'
        : 'Debe tener al menos 2 caracteres.';
    }
    if (control.hasError('pattern')) {
      return 'Debe incluir una minúscula, una mayúscula y un número.';
    }
    if (control.hasError('noCoincide')) return 'Las contraseñas no coinciden.';
    return null;
  }

  alternarContrasena(): void {
    this.verContrasena.update((v) => !v);
  }

  alternarRepetida(): void {
    this.verRepetida.update((v) => !v);
  }

  /** Bloq Mayús puesto: la causa más común de «la escribí bien y no entra». */
  vigilarMayusculas(evento: Event): void {
    const teclado = evento as KeyboardEvent;
    if (typeof teclado.getModifierState !== 'function') return;
    this.mayusculasActivas.set(teclado.getModifierState('CapsLock'));
  }

  enviar(): void {
    this.formulario.markAllAsTouched();
    this.errorGeneral.set(null);
    this.erroresServidor.set({});

    if (this.formulario.invalid || this.enviando()) return;

    const { firstName, lastName, email, password } = this.formulario.getRawValue();
    this.enviando.set(true);

    this.auth.register({ firstName, lastName, email, password }).subscribe({
      next: ({ email, emailSent }) => {
        this.enviando.set(false);
        // Todavía no hay cuenta: los datos esperan y el usuario nace al acertar
        // el código, así que se le lleva directo a introducirlo.
        void this.router.navigate(['/auth/verificar-email'], {
          queryParams: { email, ...(emailSent ? {} : { sinCorreo: '1' }) },
        });
      },
      error: (error: unknown) => {
        const apiError = toApiError(error);
        this.enviando.set(false);

        if (apiError.code === ERROR_CODE.VALIDATION_ERROR) {
          this.erroresServidor.set(fieldErrors(apiError));
          return;
        }
        if (apiError.code === ERROR_CODE.EMAIL_ALREADY_REGISTERED) {
          this.erroresServidor.set({ email: apiError.message });
          return;
        }
        this.errorGeneral.set(apiError.message);
      },
    });
  }
}
