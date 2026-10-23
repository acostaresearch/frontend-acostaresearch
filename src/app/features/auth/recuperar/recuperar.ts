import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { toApiError } from '../../../core/http/api-error';
import { ERROR_CODE } from '../../../core/models/api.model';
import { AuthService } from '../../../core/services/auth.service';
import { AvisoFlotante } from '../../../shared/layout/aviso-flotante';
import { AuthCard } from '../auth-card/auth-card';

/** Segundos de espera antes de poder pedir otro código. */
const ESPERA_REENVIO = 60;

/** La misma política que el registro: el servidor la vuelve a comprobar. */
const POLITICA_CLAVE = [
  Validators.required,
  Validators.minLength(10),
  Validators.maxLength(128),
  Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
];

@Component({
  selector: 'app-recuperar',
  imports: [AvisoFlotante, ReactiveFormsModule, RouterLink, AuthCard],
  templateUrl: './recuperar.html',
  styleUrl: './recuperar.css',
})
export class Recuperar {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly formulario = this.fb.nonNullable.group({
    email: [this.ruta.snapshot.queryParamMap.get('email') ?? '', [Validators.required, Validators.email]],
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    newPassword: ['', POLITICA_CLAVE],
  });

  /** 1 = pedir el código · 2 = escribirlo con la contraseña nueva · 3 = hecho. */
  readonly paso = signal<1 | 2 | 3>(1);
  readonly enviando = signal(false);
  readonly verContrasena = signal(false);
  readonly errorGeneral = signal<string | null>(null);
  readonly mensaje = signal<string | null>(null);
  readonly codigoQuemado = signal(false);
  readonly esperaReenvio = signal(0);

  private temporizador: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.pararTemporizador());
  }

  get errorCorreo(): string | null {
    const control = this.formulario.controls.email;
    if (!control.touched || control.valid) return null;
    return control.hasError('required') ? 'Escribe tu correo.' : 'El correo no tiene un formato válido.';
  }

  get errorCodigo(): string | null {
    const control = this.formulario.controls.code;
    if (!control.touched || control.valid) return null;
    return control.hasError('required') ? 'Escribe el código que te enviamos.' : 'El código son 6 dígitos.';
  }

  get errorContrasena(): string | null {
    const control = this.formulario.controls.newPassword;
    if (!control.touched || control.valid) return null;
    if (control.hasError('required')) return 'Escribe tu contraseña nueva.';
    return 'Mínimo 10 caracteres, con una mayúscula, una minúscula y un número.';
  }

  alEscribirCodigo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const limpio = input.value.replace(/\D/g, '').slice(0, 6);
    if (limpio !== input.value) {
      input.value = limpio;
      this.formulario.controls.code.setValue(limpio);
    }
  }

  alternarContrasena(): void {
    this.verContrasena.update((visible) => !visible);
  }

  /** Paso 1: pide el código. También sirve para reenviarlo. */
  pedirCodigo(): void {
    const correo = this.formulario.controls.email;
    correo.markAsTouched();
    this.errorGeneral.set(null);
    this.mensaje.set(null);

    if (correo.invalid || this.enviando() || this.esperaReenvio() > 0) return;

    this.enviando.set(true);
    this.auth.forgotPassword(correo.value).subscribe({
      next: (texto) => {
        this.enviando.set(false);
        this.mensaje.set(texto);
        this.codigoQuemado.set(false);
        this.paso.set(2);
        this.iniciarEspera();
      },
      error: (error: unknown) => {
        this.enviando.set(false);
        this.errorGeneral.set(toApiError(error).message);
      },
    });
  }

  /** Paso 2: el código y la contraseña nueva. */
  cambiar(): void {
    this.formulario.markAllAsTouched();
    this.errorGeneral.set(null);
    this.mensaje.set(null);

    if (this.formulario.invalid || this.enviando()) return;

    this.enviando.set(true);
    const { email, code, newPassword } = this.formulario.getRawValue();
    this.auth.resetPassword(email, code, newPassword).subscribe({
      next: () => {
        this.enviando.set(false);
        this.paso.set(3);
      },
      error: (error: unknown) => {
        const apiError = toApiError(error);
        this.enviando.set(false);
        this.errorGeneral.set(apiError.message);

        // Código agotado o caducado: ya no sirve insistir, hay que pedir otro.
        if (
          apiError.code === ERROR_CODE.TOO_MANY_ATTEMPTS ||
          apiError.code === ERROR_CODE.TOKEN_EXPIRED
        ) {
          this.codigoQuemado.set(true);
          this.esperaReenvio.set(0);
          this.pararTemporizador();
        }
        this.formulario.controls.code.setValue('');
      },
    });
  }

  irALogin(): void {
    const vuelta = this.ruta.snapshot.queryParamMap.get('returnUrl');
    const interna = vuelta?.startsWith('/') && !vuelta.startsWith('//');
    void this.router.navigate(['/auth/login'], interna ? { queryParams: { returnUrl: vuelta } } : {});
  }

  private iniciarEspera(): void {
    this.pararTemporizador();
    this.esperaReenvio.set(ESPERA_REENVIO);

    this.temporizador = setInterval(() => {
      const restante = this.esperaReenvio() - 1;
      this.esperaReenvio.set(restante);
      if (restante <= 0) this.pararTemporizador();
    }, 1000);
  }

  private pararTemporizador(): void {
    if (this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = null;
    }
  }
}
