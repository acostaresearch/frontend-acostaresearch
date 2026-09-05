import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { fieldErrors, toApiError } from '../../../core/http/api-error';
import { ERROR_CODE } from '../../../core/models/api.model';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';
import { AuthCard } from '../auth-card/auth-card';
import { BotonGoogle } from '../boton-google/boton-google';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthCard, BotonGoogle],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly usuarios = inject(UserService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly formulario = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  /**
   * Espejo del correo escrito.
   *
   * Los formularios reactivos no son señales: sin esto, `emailListo` no se
   * recalcularía al teclear y el check verde no aparecería nunca.
   */
  private readonly valorEmail = toSignal(this.formulario.controls.email.valueChanges, {
    initialValue: '',
  });

  readonly whatsappUrl = environment.whatsappUrl;

  readonly enviando = signal(false);
  /** El ojo del campo de contraseña. Ver lo que se teclea evita medio soporte. */
  readonly verContrasena = signal(false);
  /**
   * Bloq Mayús pulsado.
   *
   * Es la causa más común de «mi contraseña no funciona» y la única que el
   * navegador nos deja detectar: el evento de teclado lo dice, pero solo
   * mientras se teclea, así que se consulta en cada pulsación.
   */
  readonly mayusculasActivas = signal(false);
  readonly errorGeneral = signal<string | null>(null);
  readonly erroresServidor = signal<Record<string, string>>({});
  /** Se activa cuando el backend responde EMAIL_NOT_VERIFIED. */
  readonly correoSinVerificar = signal(false);

  /** Marca de correo válido. Se enseña solo cuando ya hay algo escrito. */
  readonly emailListo = computed(() => {
    const control = this.formulario.controls.email;
    return this.valorEmail().length > 0 && control.valid;
  });

  /** El interceptor redirige aquí con `expirada=1` cuando muere el refresh. */
  readonly sesionExpirada = this.ruta.snapshot.queryParamMap.get('expirada') === '1';

  /** Adónde vuelve quien entró por Google. El mismo destino que el formulario. */
  readonly destinoTrasEntrar = this.ruta.snapshot.queryParamMap.get('returnUrl') ?? '/';

  errorDe(campo: 'email' | 'password'): string | null {
    const control = this.formulario.controls[campo];
    const delServidor = this.erroresServidor()[campo];
    if (delServidor) return delServidor;
    if (!control.touched || control.valid) return null;

    if (control.hasError('required')) {
      return campo === 'email' ? 'Escribe tu correo.' : 'Escribe tu contraseña.';
    }
    if (control.hasError('email')) return 'El correo no tiene un formato válido.';
    return null;
  }

  enviar(): void {
    this.formulario.markAllAsTouched();
    this.errorGeneral.set(null);
    this.erroresServidor.set({});
    this.correoSinVerificar.set(false);

    if (this.formulario.invalid || this.enviando()) return;

    this.enviando.set(true);
    this.auth.login(this.formulario.getRawValue()).subscribe({
      next: () => {
        // El login ya devuelve el usuario; se recarga el perfil para tener
        // siempre la versión canónica del servidor (rol, estado, etc.).
        this.usuarios.me().subscribe({
          next: (usuario) => {
            this.auth.setUser(usuario);
            this.irADestino();
          },
          error: () => this.irADestino(),
        });
      },
      error: (error: unknown) => {
        const apiError = toApiError(error);
        this.enviando.set(false);

        if (apiError.code === ERROR_CODE.VALIDATION_ERROR) {
          this.erroresServidor.set(fieldErrors(apiError));
          return;
        }
        if (apiError.code === ERROR_CODE.EMAIL_NOT_VERIFIED) {
          this.correoSinVerificar.set(true);
        }
        this.errorGeneral.set(apiError.message);
      },
    });
  }

  alternarContrasena(): void {
    this.verContrasena.update((visible) => !visible);
  }

  /** Mira si Bloq Mayús está puesto. Solo el teclado lo sabe. */
  vigilarMayusculas(evento: Event): void {
    const teclado = evento as KeyboardEvent;
    if (typeof teclado.getModifierState !== 'function') return;
    this.mayusculasActivas.set(teclado.getModifierState('CapsLock'));
  }

  /** Lleva a la pantalla del código con el correo ya escrito. */
  irAVerificar(): void {
    void this.router.navigate(['/auth/verificar-email'], {
      queryParams: { email: this.formulario.controls.email.value },
    });
  }

  private irADestino(): void {
    const destino = this.ruta.snapshot.queryParamMap.get('returnUrl') ?? '/';
    void this.router.navigateByUrl(destino);
  }
}
