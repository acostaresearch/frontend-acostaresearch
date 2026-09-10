import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { toApiError } from '../../core/http/api-error';
import { MEDIOS_PAGO, Payment } from '../../core/models/payment.model';
import { Balance } from '../../core/models/rewrite.model';
import { Role, UserStatus } from '../../core/models/user.model';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { FondoService } from '../../core/services/fondo.service';
import { PaymentService } from '../../core/services/payment.service';
import { UserService } from '../../core/services/user.service';
import { AjustesDeCuenta } from '../../shared/cuenta/ajustes-de-cuenta';
import { MiConector } from '../../shared/cuenta/mi-conector';
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
  imports: [RouterLink, DatePipe, DecimalPipe, AjustesDeCuenta, MiConector, SiteHeader],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class Perfil implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly dialogos = inject(DialogoService);
  private readonly fondo = inject(FondoService);
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

  // ── Compras ──────────────────────────────────────────────────────────────
  readonly compras = signal<Payment[]>([]);
  readonly cargandoCompras = signal(true);

  // ── Sesión ───────────────────────────────────────────────────────────────
  readonly cerrando = signal(false);

  constructor() {
    // Con la ventana de borrar la cuenta delante, la página no se mueve.
    effect(() => this.fondo.fijar('perfil', this.borrandoCuenta()));

    // `/perfil?ver=metodo` ya no lleva a ninguna parte, y no hace falta: lo
    // usaba el atajo de la página de precios para quien pagó por Yape y venía
    // con un código sin saber dónde meterlo. Ahora «¿Compraste por Yape o
    // transferencia?» está en la primera fila, sin pestaña que abrir. El enlace
    // sigue funcionando; el parámetro, sencillamente, ya no hace nada.
  }

  ngOnInit(): void {
    // El perfil se vuelve a pedir al servidor: si cambió el rol o se verificó
    // el correo desde otro dispositivo, aquí se ve al día.
    this.usuarios.me().subscribe({ next: (usuario) => this.auth.setUser(usuario) });

    this.billing.balance().subscribe({
      next: (balance) => this.saldo.set(balance),
      error: () => this.saldo.set(null),
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
