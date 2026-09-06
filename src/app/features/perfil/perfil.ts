import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { toApiError } from '../../core/http/api-error';
import { License, MEDIOS_PAGO, Payment } from '../../core/models/payment.model';
import { Balance } from '../../core/models/rewrite.model';
import { Role, UserStatus } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { FondoService } from '../../core/services/fondo.service';
import { LicenseService } from '../../core/services/license.service';
import { PaymentService } from '../../core/services/payment.service';
import { UserService } from '../../core/services/user.service';
import { AjustesDeCuenta } from '../../shared/cuenta/ajustes-de-cuenta';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * Las cuatro pestañas del perfil.
 *
 * Se miran en momentos distintos: los datos se cambian una vez al año, el
 * conector se consulta al instalarlo y las compras se buscan cuando algo no
 * cuadra. Apiladas en una columna obligaban a recorrer las tres que no
 * interesan para llegar a la que sí.
 */
type PestanaDePerfil = 'datos' | 'clave' | 'metodo' | 'cuenta' | 'compras';

/** Etiquetas en castellano: el backend solo maneja los códigos. */
const ROLES: Record<Role, string> = {
  USER: 'Usuario',
  EDITOR: 'Editor',
  ADMIN: 'Administrador',
};

const ESTADOS: Record<UserStatus, string> = {
  PENDING: 'Pendiente de verificar',
  ACTIVE: 'Activa',
  SUSPENDED: 'Suspendida',
};

const ESTADOS_PAGO: Record<Payment['status'], string> = {
  PENDING: 'Pendiente',
  // El comprobante llegó y está esperando a que un administrador lo mire. Al
  // comprador hay que decírselo así: no ha fallado nada, solo hay que esperar.
  IN_REVIEW: 'En revisión',
  PAID: 'Pagado',
  FAILED: 'Fallido',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
};

/**
 * Cuenta del usuario: sus datos, el saldo del humanizador, las licencias del
 * conector, lo que ha comprado y el cierre de sesión. Todo lo que antes estaba
 * repartido entre la portada y ningún otro sitio.
 */
@Component({
  selector: 'app-perfil',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DatePipe,
    DecimalPipe,
    AjustesDeCuenta,
    SiteHeader,
    SiteFooter,
  ],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class Perfil implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly dialogos = inject(DialogoService);
  private readonly fondo = inject(FondoService);
  private readonly licencias = inject(LicenseService);
  private readonly pagos = inject(PaymentService);
  private readonly usuarios = inject(UserService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly usuario = this.auth.user;
  readonly nombre = this.auth.fullName;

  /** Iniciales para el avatar: no pedimos foto, así que se dibuja con letras. */
  readonly iniciales = computed(() => {
    const user = this.usuario();
    if (!user) return '';
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  });

  readonly rol = computed(() => {
    const user = this.usuario();
    return user ? ROLES[user.role] : '';
  });

  readonly estado = computed(() => {
    const user = this.usuario();
    return user ? ESTADOS[user.status] : '';
  });

  // ── Saldo del humanizador ────────────────────────────────────────────────
  readonly saldo = signal<Balance | null>(null);

  /** Bolsas que aún cuentan. Las agotadas o revocadas solo harían ruido. */
  readonly bolsasActivas = computed(() =>
    (this.saldo()?.packs ?? []).filter((pack) => pack.status === 'ACTIVE'),
  );

  // ── Licencias del conector ───────────────────────────────────────────────
  readonly misLicencias = signal<License[]>([]);

  /**
   * Guía de instalación en PDF. Cadena vacía = el archivo no está y no se
   * ofrece la descarga; lo resuelve el generador de environments al compilar.
   */
  readonly guiaUrl = environment.guiaUrl;

  /**
   * ¿Tiene acceso pagado y vigente?
   *
   * No basta con que exista una fila de licencia: una revocada o una caducada
   * también aparecen ahí, y a quien está en cualquiera de esos dos casos no se
   * le ofrece la guía de instalación. Lo que necesita es renovar o escribirnos,
   * no un manual para conectar algo que ya no le va a responder.
   */
  readonly tieneAccesoVigente = computed(() =>
    this.misLicencias().some(
      (licencia) =>
        licencia.status === 'ACTIVE' &&
        (licencia.expiresAt === null || new Date(licencia.expiresAt) > new Date()),
    ),
  );
  /** URL recién generada. Solo se puede mostrar en el momento de crearla. */
  readonly urlNueva = signal<string | null>(null);
  readonly rotando = signal<string | null>(null);
  readonly errorLicencia = signal<string | null>(null);
  readonly urlCopiada = signal(false);

  readonly codigo = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(6)],
  });
  readonly canjeando = signal(false);

  // ── Compras ──────────────────────────────────────────────────────────────
  readonly compras = signal<Payment[]>([]);
  readonly cargandoCompras = signal(true);

  // ── Sesión ───────────────────────────────────────────────────────────────
  readonly cerrando = signal(false);

  /**
   * Qué pestaña se está viendo.
   *
   * Arranca en «Tus datos» y no en el conector porque quien entra a su perfil
   * suele venir a cambiar algo suyo; quien busca la URL del conector ya sabe
   * dónde está y viene a por ella.
   */
  readonly pestana = signal<PestanaDePerfil>('datos');

  verPestana(pestana: PestanaDePerfil): void {
    this.pestana.set(pestana);
  }

  constructor() {
    // Con la ventana de borrar la cuenta delante, la página no se mueve.
    effect(() => this.fondo.fijar('perfil', this.borrandoCuenta()));
  }

  ngOnInit(): void {
    // El perfil se vuelve a pedir al servidor: si cambió el rol o se verificó
    // el correo desde otro dispositivo, aquí se ve al día.
    this.usuarios.me().subscribe({ next: (usuario) => this.auth.setUser(usuario) });

    this.billing.balance().subscribe({
      next: (balance) => this.saldo.set(balance),
      error: () => this.saldo.set(null),
    });

    this.licencias.mine().subscribe({
      next: (lista) => this.misLicencias.set(lista),
      error: () => this.misLicencias.set([]),
    });

    this.pagos.mine().subscribe({
      next: (lista) => {
        this.compras.set(lista);
        this.cargandoCompras.set(false);
      },
      error: () => {
        this.compras.set([]);
        this.cargandoCompras.set(false);
      },
    });
  }

  // ── Método de tesis ──────────────────────────────────────────────────────

  /**
   * Genera una URL nueva para la licencia. La anterior deja de funcionar en el
   * acto, así que se avisa antes de hacerlo.
   */
  async regenerarUrl(licencia: License): Promise<void> {
    if (this.rotando()) return;

    const seguro = await this.dialogos.confirmar({
      titulo: 'Generar una URL nueva',
      mensaje: 'La anterior dejará de funcionar en el acto.',
      nota: 'Tendrás que pegar la nueva en Claude para seguir usando el conector.',
      confirmar: 'Generar URL nueva',
      tono: 'aviso',
    });
    if (!seguro || this.rotando()) return;

    this.rotando.set(licencia.id);
    this.errorLicencia.set(null);
    this.urlNueva.set(null);

    this.licencias.rotate(licencia.id).subscribe({
      next: ({ license, connectorUrl }) => {
        this.urlNueva.set(connectorUrl);
        this.misLicencias.update((lista) =>
          lista.map((item) => (item.id === license.id ? license : item)),
        );
        this.rotando.set(null);
      },
      error: (error: unknown) => {
        this.errorLicencia.set(toApiError(error).message);
        this.rotando.set(null);
      },
    });
  }

  /** Canjea un código comprado fuera de la web (Yape, transferencia). */
  canjearCodigo(): void {
    if (this.codigo.invalid || this.canjeando()) {
      this.codigo.markAsTouched();
      return;
    }

    this.canjeando.set(true);
    this.errorLicencia.set(null);
    this.urlNueva.set(null);

    this.licencias.redeem(this.codigo.value.trim()).subscribe({
      next: ({ license, connectorUrl }) => {
        this.urlNueva.set(connectorUrl);
        this.misLicencias.update((lista) => [license, ...lista]);
        this.codigo.reset();
        this.canjeando.set(false);
      },
      error: (error: unknown) => {
        this.errorLicencia.set(toApiError(error).message);
        this.canjeando.set(false);
      },
    });
  }

  async copiarUrlNueva(): Promise<void> {
    const url = this.urlNueva();
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      this.urlCopiada.set(true);
      setTimeout(() => this.urlCopiada.set(false), 2500);
    } catch {
      this.errorLicencia.set('No pudimos copiar. Selecciona la URL y cópiala a mano.');
    }
  }

  // ── Presentación ─────────────────────────────────────────────────────────

  precio(pago: Payment): string {
    const simbolo = pago.currency === 'USD' ? '$' : 'S/ ';
    return `${simbolo}${(pago.amountCents / 100).toFixed(2)}`;
  }

  estadoPago(pago: Payment): string {
    return ESTADOS_PAGO[pago.status];
  }

  /** El medio de pago, con el nombre que el cliente reconoce. */
  medioPago(pago: Payment): string {
    return MEDIOS_PAGO[pago.provider] ?? pago.provider;
  }

  /** Porcentaje consumido de una bolsa, para la barra de progreso. */
  consumido(usadas: number, totales: number): number {
    return totales > 0 ? Math.min(100, Math.round((usadas / totales) * 100)) : 0;
  }

  // ── Sesión ───────────────────────────────────────────────────────────────

  salir(): void {
    if (this.cerrando()) return;

    this.cerrando.set(true);
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.router.navigate(['/']),
    });
  }

  /** Cierra la sesión en todos los dispositivos: útil si se perdió el equipo. */
  async salirDeTodos(): Promise<void> {
    if (this.cerrando()) return;

    const seguro = await this.dialogos.confirmar({
      titulo: 'Cerrar sesión en todos los dispositivos',
      mensaje: 'Se cerrará tu sesión donde quiera que hayas entrado, incluido este equipo.',
      nota: 'Tendrás que volver a entrar con tu correo y contraseña.',
      confirmar: 'Cerrar todas las sesiones',
      tono: 'aviso',
    });
    if (!seguro || this.cerrando()) return;

    this.cerrando.set(true);
    this.auth.logoutEverywhere().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.router.navigate(['/']),
    });
  }

  // ── Borrar la cuenta ─────────────────────────────────────────────────────

  readonly borrandoCuenta = signal(false);
  readonly borrando = signal(false);
  readonly errorBorrado = signal<string | null>(null);
  readonly palabraBorrado = signal('');
  readonly correoBorrado = signal('');

  /**
   * El botón no se enciende hasta que las dos cosas están escritas.
   *
   * Se piden dos y ninguna sobra: la palabra impide el clic sin querer, y el
   * correo impide equivocarse de cuenta, que es el error de verdad cuando
   * alguien tiene abiertas la suya y la de otro. «Eliminar» a secas se escribe
   * en piloto automático; tu propio correo obliga a mirar cuál es.
   *
   * Se comparan sin mayúsculas ni espacios de sobra: lo que se comprueba es la
   * intención, no la mecanografía.
   */
  readonly puedeBorrarCuenta = computed(() => {
    const user = this.usuario();
    if (!user) return false;

    return (
      this.palabraBorrado().trim().toLowerCase() === 'eliminar' &&
      this.correoBorrado().trim().toLowerCase() === user.email.toLowerCase()
    );
  });

  abrirBorradoDeCuenta(): void {
    this.palabraBorrado.set('');
    this.correoBorrado.set('');
    this.errorBorrado.set(null);
    this.borrandoCuenta.set(true);
  }

  cerrarBorradoDeCuenta(): void {
    this.borrandoCuenta.set(false);
  }

  eliminarCuenta(): void {
    if (!this.puedeBorrarCuenta() || this.borrando()) return;
    this.errorBorrado.set(null);
    this.borrando.set(true);

    this.usuarios
      .eliminarCuenta({
        confirmacion: this.palabraBorrado().trim().toLowerCase(),
        email: this.correoBorrado().trim().toLowerCase(),
      })
      .subscribe({
        next: () => {
          // La sesión del navegador se limpia a mano: el servidor ya revocó los
          // tokens, pero el estado del cliente sigue creyendo que hay alguien
          // dentro hasta que se le dice que no.
          this.auth.clearSession();
          this.router.navigate(['/']);
        },
        error: (e: unknown) => {
          this.errorBorrado.set(toApiError(e).message);
          this.borrando.set(false);
        },
      });
  }
}
