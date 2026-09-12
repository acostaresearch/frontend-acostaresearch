import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { toApiError } from '../../../core/http/api-error';
import { AuthService } from '../../../core/services/auth.service';
import { GoogleAuthService } from '../../../core/services/google-auth.service';
import { UserService } from '../../../core/services/user.service';

/**
 * Botón «Continuar con Google», con el intercambio ya resuelto.
 *
 * Login y registro lo comparten porque hacen exactamente lo mismo: el backend
 * tiene una sola ruta para entrar y darse de alta, así que aquí solo cambia el
 * texto del botón.
 *
 * El renderizado se hace en `afterNextRender` porque Google necesita un
 * elemento ya en el documento con un ancho medible; hacerlo en el constructor
 * dibujaría un botón de cero píxeles.
 */
@Component({
  selector: 'app-boton-google',
  template: `
    @if (google.disponible) {
      <div class="separador"><span>o</span></div>

      <div #contenedor class="contenedor" [class.ocupado]="enviando()"></div>

      @if (error(); as mensaje) {
        <p class="error-google" role="alert">{{ mensaje }}</p>
      }
    }
  `,
  styles: `
    .separador {
      display: flex;
      gap: 12px;
      align-items: center;
      margin: 20px 0 16px;
      font-size: 12.5px;
      color: var(--color-texto-tenue);
    }

    .separador::before,
    .separador::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-borde);
    }

    .contenedor {
      display: flex;
      justify-content: center;
      min-height: 44px;
    }

    /* Mientras se cambia el token por la sesión, el botón deja de responder:
       pulsarlo dos veces abriría dos flujos y el segundo fallaría solo. */
    .contenedor.ocupado {
      pointer-events: none;
      opacity: 0.6;
    }

    .error-google {
      margin: 10px 0 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--color-error);
    }
  `,
})
export class BotonGoogle {
  protected readonly google = inject(GoogleAuthService);
  private readonly auth = inject(AuthService);
  private readonly usuarios = inject(UserService);
  private readonly router = inject(Router);

  /** «continue_with» en login, «signup_with» en el alta. */
  readonly texto = input<'signin_with' | 'signup_with' | 'continue_with'>('continue_with');
  /** Adónde ir al entrar. La pantalla lo decide: puede haber un `returnUrl`. */
  readonly destino = input('/');
  readonly fallo = output<string>();

  private readonly contenedor = viewChild<ElementRef<HTMLElement>>('contenedor');

  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);

  /** El ancho con el que está dibujado ahora mismo, para no repetir trabajo. */
  private anchoDibujado = 0;

  constructor() {
    const destruccion = inject(DestroyRef);

    afterNextRender(() => {
      const elemento = this.contenedor()?.nativeElement;
      if (!elemento) return;

      void this.dibujar(elemento);

      /*
       * Google dibuja su botón con un ancho fijo, el que mide el contenedor en
       * ese instante. Si la ventana cambia después —girar el teléfono es el
       * caso real—, el botón se queda con el ancho de antes: entrabas en
       * vertical con un botón de 270 px y en horizontal seguía midiendo 270
       * debajo de un «Entrar» de 400.
       *
       * El umbral de 8 px es para no redibujar por un píxel de barra de
       * desplazamiento, y no se toca nada mientras se está entrando: rehacer
       * el botón en medio del intercambio tiraría la respuesta de Google.
       */
      const observador = new ResizeObserver(() => {
        if (this.enviando()) return;

        const ancho = Math.round(elemento.offsetWidth);
        if (!ancho || Math.abs(ancho - this.anchoDibujado) < 8) return;

        void this.dibujar(elemento);
      });

      observador.observe(elemento);
      destruccion.onDestroy(() => observador.disconnect());
    });
  }

  private async dibujar(elemento: HTMLElement): Promise<void> {
    this.anchoDibujado = Math.round(elemento.offsetWidth);

    try {
      await this.google.render(elemento, (credential) => this.entrar(credential), this.texto());
    } catch {
      this.error.set('No se pudo cargar el acceso con Google. Entra con tu correo.');
    }
  }

  private entrar(credential: string): void {
    if (this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);

    this.auth.loginWithGoogle(credential).subscribe({
      next: () => {
        // Igual que en el login normal: se recarga el perfil para tener la
        // versión canónica del servidor (rol, estado) y no la del alta.
        this.usuarios.me().subscribe({
          next: (usuario) => {
            this.auth.setUser(usuario);
            void this.router.navigateByUrl(this.destino());
          },
          error: () => void this.router.navigateByUrl(this.destino()),
        });
      },
      error: (e: unknown) => {
        const mensaje = toApiError(e).message;
        this.enviando.set(false);
        this.error.set(mensaje);
        this.fallo.emit(mensaje);
      },
    });
  }
}
