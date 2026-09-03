import { DestroyRef, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { toApiError } from '../../../core/http/api-error';
import { ERROR_CODE } from '../../../core/models/api.model';
import { AuthService } from '../../../core/services/auth.service';
import { AuthCard } from '../auth-card/auth-card';

/** Segundos de espera antes de poder pedir otro código. */
const ESPERA_REENVIO = 60;

@Component({
  selector: 'app-verify-email',
  imports: [ReactiveFormsModule, RouterLink, AuthCard],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.css',
})
export class VerifyEmail implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly formulario = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  readonly enviando = signal(false);
  readonly verificado = signal(false);
  readonly errorGeneral = signal<string | null>(null);
  readonly codigoQuemado = signal(false);

  readonly reenviando = signal(false);
  readonly mensajeReenvio = signal<string | null>(null);
  readonly esperaReenvio = signal(0);

  /** Aviso cuando el registro creó la cuenta pero el correo no llegó a salir. */
  readonly correoNoEnviado = this.ruta.snapshot.queryParamMap.get('sinCorreo') === '1';

  private temporizador: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    const email = this.ruta.snapshot.queryParamMap.get('email');
    if (email) {
      this.formulario.controls.email.setValue(email);
    }

    // Al venir del registro ya se envió un código: la cuenta atrás evita que
    // el usuario pida otro de inmediato y se quede con dos códigos en el correo.
    if (email && !this.correoNoEnviado) {
      this.iniciarEspera();
    }

    this.destroyRef.onDestroy(() => this.pararTemporizador());
  }

  get errorCodigo(): string | null {
    const control = this.formulario.controls.code;
    if (!control.touched || control.valid) return null;
    if (control.hasError('required')) return 'Escribe el código que te enviamos.';
    return 'El código son 6 dígitos.';
  }

  /** Solo dígitos, y envía solo cuando ya hay 6. */
  alEscribirCodigo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const limpio = input.value.replace(/\D/g, '').slice(0, 6);

    if (limpio !== input.value) {
      input.value = limpio;
      this.formulario.controls.code.setValue(limpio);
    }

    if (limpio.length === 6 && this.formulario.valid && !this.enviando()) {
      this.enviar();
    }
  }

  enviar(): void {
    this.formulario.markAllAsTouched();
    this.errorGeneral.set(null);
    this.mensajeReenvio.set(null);

    if (this.formulario.invalid || this.enviando()) return;

    const { email, code } = this.formulario.getRawValue();
    this.enviando.set(true);

    this.auth.verifyEmail(email, code).subscribe({
      next: () => {
        this.enviando.set(false);
        this.verificado.set(true);
      },
      error: (error: unknown) => {
        const apiError = toApiError(error);
        this.enviando.set(false);
        this.errorGeneral.set(apiError.message);

        // Código agotado o caducado: ya no sirve insistir, hay que pedir otro.
        const quemado =
          apiError.code === ERROR_CODE.TOO_MANY_ATTEMPTS ||
          apiError.code === ERROR_CODE.TOKEN_EXPIRED;

        if (quemado) {
          this.codigoQuemado.set(true);
          this.esperaReenvio.set(0);
          this.pararTemporizador();
        }

        this.formulario.controls.code.setValue('');
      },
    });
  }

  reenviar(): void {
    const email = this.formulario.controls.email.value;
    if (!email || this.reenviando() || this.esperaReenvio() > 0) return;

    this.reenviando.set(true);
    this.errorGeneral.set(null);

    this.auth.resendVerification(email).subscribe({
      next: (mensaje) => {
        this.mensajeReenvio.set(mensaje);
        this.reenviando.set(false);
        this.codigoQuemado.set(false);
        this.iniciarEspera();
      },
      error: (error: unknown) => {
        this.errorGeneral.set(toApiError(error).message);
        this.reenviando.set(false);
      },
    });
  }

  irALogin(): void {
    void this.router.navigate(['/auth/login']);
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
