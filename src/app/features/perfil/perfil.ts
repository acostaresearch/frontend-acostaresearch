import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { toApiError } from '../../core/http/api-error';
import { License, Payment } from '../../core/models/payment.model';
import { Balance } from '../../core/models/rewrite.model';
import { Role, UserStatus } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { LicenseService } from '../../core/services/license.service';
import { PaymentService } from '../../core/services/payment.service';
import { UserService } from '../../core/services/user.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

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

/**
 * Cómo se llama cada medio de pago en la tabla de compras.
 *
 * El servidor guarda el código en mayúsculas y sin acentos, que es lo correcto
 * para una columna, y horrible para el cliente que abre su perfil y lee
 * «WESTERN_UNION» donde esperaba el nombre de algo que reconoce. Lo que no esté
 * en la lista se enseña tal cual: es preferible un código feo a un hueco.
 */
const MEDIOS_PAGO: Record<string, string> = {
  PAYPAL: 'PayPal',
  YAPE: 'Yape',
  PLIN: 'Plin',
  TRANSFERENCIA: 'Transferencia',
  WESTERN_UNION: 'Western Union',
  CORTESIA: 'Cortesía',
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
  imports: [ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe, SiteHeader, SiteFooter],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class Perfil implements OnInit {
  private readonly billing = inject(BillingService);
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
  regenerarUrl(licencia: License): void {
    const seguro = confirm(
      'Se generará una URL nueva y la anterior dejará de funcionar. ' +
        'Tendrás que actualizarla en Claude. ¿Continuar?',
    );
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
  salirDeTodos(): void {
    const seguro = confirm(
      'Se cerrará tu sesión en todos los dispositivos donde hayas entrado. ¿Continuar?',
    );
    if (!seguro || this.cerrando()) return;

    this.cerrando.set(true);
    this.auth.logoutEverywhere().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.router.navigate(['/']),
    });
  }
}
