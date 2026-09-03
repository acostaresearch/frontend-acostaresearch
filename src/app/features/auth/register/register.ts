import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { fieldErrors, toApiError } from '../../../core/http/api-error';
import { ERROR_CODE } from '../../../core/models/api.model';
import { AuthService } from '../../../core/services/auth.service';
import { matchFields } from '../../../shared/validators/match.validator';
import { AuthCard } from '../auth-card/auth-card';

type CampoRegistro = 'firstName' | 'lastName' | 'email' | 'password' | 'confirmPassword';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
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

  readonly enviando = signal(false);
  readonly errorGeneral = signal<string | null>(null);
  readonly erroresServidor = signal<Record<string, string>>({});

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
