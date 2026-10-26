import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { fieldErrors, toApiError } from '../../../core/http/api-error';
import { ERROR_CODE } from '../../../core/models/api.model';
import { CanjeHecho } from '../../../core/models/payment.model';
import { rutaPrivada } from '../../../core/router/rutas-privadas';
import { AuthService, VistaDeActivacion } from '../../../core/services/auth.service';
import { BienvenidaService } from '../../../core/services/bienvenida.service';
import { LicenseService } from '../../../core/services/license.service';
import { matchFields } from '../../../shared/validators/match.validator';
import { AvisoFlotante } from '../../../shared/layout/aviso-flotante';
import { AuthCard } from '../auth-card/auth-card';
import { BotonGoogle } from '../boton-google/boton-google';

type Campo = 'firstName' | 'lastName' | 'password' | 'confirmPassword';

/**
 * «Activar mi acceso»: la página del botón del correo del código (26-oct).
 *
 * El código llega detrás de «#» (/auth/activar#ACR-…), que el navegador no
 * manda al servidor. Abrir la página no gasta nada: hay que pulsar «Activar».
 * Gmail y Outlook abren los enlaces de los correos para revisarlos, y sin ese
 * clic el código se gastaría solo.
 *
 * Cuatro caminos, según quién llega:
 *   · Sin cuenta con ese correo → nombre y contraseña, y listo (el servidor crea
 *     la cuenta ya verificada con el correo del código, abre sesión y canjea).
 *   · Ya tiene cuenta, o prefiere Google u otro correo → entra por el acceso de
 *     siempre y, al volver a /planes, el código se canjea solo
 *     (`BienvenidaService.recordarCanje`).
 *   · Ya tenía la sesión abierta → «Activar en mi cuenta».
 *   · El código no sirve → se dice y se ofrece WhatsApp.
 *
 * El correo no se puede cambiar aquí: es el del código, y esa es la prueba de
 * que es suyo. Quien quiera otro va al registro normal, con su código de 6 cifras.
 */
@Component({
  selector: 'app-activar',
  imports: [AvisoFlotante, ReactiveFormsModule, RouterLink, AuthCard, BotonGoogle],
  templateUrl: './activar.html',
  styleUrls: ['../register/register.css', './activar.css'],
})
export class Activar implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly licencias = inject(LicenseService);
  private readonly bienvenida = inject(BienvenidaService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  readonly whatsappUrl = environment.whatsappUrl;

  readonly codigo = signal('');
  readonly vista = signal<VistaDeActivacion | null>(null);
  readonly cargando = signal(true);
  /** El código no sirve (no existe, ya se usó, caducó). */
  readonly errorCodigo = signal<string | null>(null);

  readonly enviando = signal(false);
  readonly errorGeneral = signal<string | null>(null);
  readonly erroresServidor = signal<Record<string, string>>({});
  readonly verContrasena = signal(false);

  readonly conSesion = this.auth.isAuthenticated;
  readonly correoDeLaSesion = computed(() => this.auth.user()?.email ?? null);

  /** Adónde vuelve quien entra por el acceso de siempre: allí se canjea solo. */
  readonly vuelta = computed(() => `/planes?codigo=${encodeURIComponent(this.codigo())}`);

  /** Las reglas replican las de `auth.schema.js`, igual que el registro. */
  readonly formulario = this.fb.nonNullable.group(
    {
      firstName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
      lastName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
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

  private readonly valorPass = toSignal(this.formulario.controls.password.valueChanges, {
    initialValue: '',
  });

  readonly requisitos = computed(() => {
    const v = this.valorPass();
    return [
      { texto: 'Al menos 10 caracteres', cumple: v.length >= 10 },
      { texto: 'Una letra mayúscula', cumple: /[A-Z]/.test(v) },
      { texto: 'Una letra minúscula', cumple: /[a-z]/.test(v) },
      { texto: 'Un número', cumple: /\d/.test(v) },
    ];
  });
  readonly mostrarRequisitos = computed(() => this.valorPass().length > 0);

  ngOnInit(): void {
    const codigo = decodeURIComponent(this.ruta.snapshot.fragment ?? '').trim();
    this.codigo.set(codigo);

    if (codigo.length < 6) {
      this.cargando.set(false);
      this.errorCodigo.set('Este enlace no trae el código completo. Ábrelo otra vez desde tu correo.');
      return;
    }

    // Si entra por el acceso de siempre (Google, otra cuenta, otro correo), al
    // volver a /planes se canjea solo. En memoria: abrir el enlace no gasta nada.
    if (!this.conSesion()) this.bienvenida.recordarCanje(codigo);

    this.auth.verActivacion(codigo).subscribe({
      next: (vista) => {
        this.vista.set(vista);
        this.cargando.set(false);
      },
      error: (error: unknown) => {
        this.errorCodigo.set(toApiError(error).message);
        this.cargando.set(false);
      },
    });
  }

  errorDe(campo: Campo): string | null {
    const control = this.formulario.controls[campo];
    const delServidor = this.erroresServidor()[campo];
    if (delServidor) return delServidor;
    if (!control.touched || control.valid) {
      if (campo === 'confirmPassword' && control.touched && this.formulario.hasError('noCoincide')) {
        return 'Las contraseñas no coinciden.';
      }
      return null;
    }
    if (control.hasError('required')) return 'Este campo es obligatorio.';
    if (control.hasError('minlength')) {
      return campo === 'password'
        ? 'La contraseña debe tener al menos 10 caracteres.'
        : 'Debe tener al menos 2 caracteres.';
    }
    if (control.hasError('pattern')) return 'Debe incluir una minúscula, una mayúscula y un número.';
    return null;
  }

  /** Cuenta nueva: nombre y contraseña, y el servidor hace el resto. */
  activar(): void {
    this.formulario.markAllAsTouched();
    this.errorGeneral.set(null);
    this.erroresServidor.set({});
    if (this.formulario.invalid || this.enviando()) return;

    const { firstName, lastName, password } = this.formulario.getRawValue();
    this.enviando.set(true);

    this.auth.activar({ codigo: this.codigo(), firstName, lastName, password }).subscribe({
      next: (canje) => {
        this.bienvenida.tomarCanje(this.codigo());
        this.irTrasActivar(canje);
      },
      error: (error: unknown) => {
        this.enviando.set(false);
        const apiError = toApiError(error);
        if (apiError.code === ERROR_CODE.VALIDATION_ERROR) {
          this.erroresServidor.set(fieldErrors(apiError));
          return;
        }
        // Alguien creó la cuenta con este correo entre medias: que entre con ella.
        if (apiError.code === ERROR_CODE.EMAIL_ALREADY_REGISTERED) {
          this.vista.update((v) => (v ? { ...v, tieneCuenta: true } : v));
        }
        this.errorGeneral.set(apiError.message);
      },
    });
  }

  /** Ya tenía la sesión abierta: se canjea en esa cuenta. */
  activarEnMiCuenta(): void {
    if (this.enviando()) return;
    this.errorGeneral.set(null);

    // Los códigos los genera el administrador: canjearse uno a sí mismo
    // apuntaría una venta que no existió (igual que en /planes).
    if (this.auth.hasRole('ADMIN', 'ADMIN_PAIS')) {
      this.errorGeneral.set('Con la cuenta de administrador no se canjean códigos.');
      return;
    }

    this.enviando.set(true);
    this.licencias.redeem(this.codigo()).subscribe({
      next: (canje) => this.irTrasActivar(canje),
      error: (error: unknown) => {
        this.enviando.set(false);
        this.errorGeneral.set(toApiError(error).message);
      },
    });
  }

  /** Lo mismo que hace /planes tras canjear: el conector al panel, los documentos a su herramienta. */
  private irTrasActivar({ license, connectorUrl, membresia, renovada }: CanjeHecho): void {
    if (membresia) {
      void this.router.navigateByUrl(rutaPrivada('preparar'));
      return;
    }
    this.bienvenida.anunciar({
      producto: license?.productName ?? license?.productCode ?? this.vista()?.producto ?? 'tu acceso',
      url: connectorUrl ?? null,
      renovada: Boolean(renovada),
      hasta: license?.expiresAt ?? null,
    });
    void this.router.navigateByUrl(rutaPrivada('perfil'));
  }
}
