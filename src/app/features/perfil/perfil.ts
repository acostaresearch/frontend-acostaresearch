import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

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
import { InvitarResena } from '../../shared/cuenta/invitar-resena';
import { MiConector } from '../../shared/cuenta/mi-conector';
import { SiteHeader } from '../../shared/layout/site-header';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

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
    AvisoFlotante,
    RouterLink,
    DatePipe,
    DecimalPipe,
    AjustesDeCuenta,
    InvitarResena,
    MiConector,
    SiteHeader,
  ],
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
  private readonly ruta = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);

  readonly usuario = this.auth.user;
  readonly nombre = this.auth.fullName;

  /** El cajón de la cuenta, que se abre con el botón ☰ en cualquier pantalla. */
  readonly cuentaAbierta = signal(false);

  /** Escape cierra el cajón, como cierra cualquier cosa que se abre encima. */
  @HostListener('document:keydown.escape')
  cerrarCuenta(): void {
    this.cuentaAbierta.set(false);
  }

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
  /** El pago cuya constancia se está descargando, para no pedirla dos veces. */
  readonly bajandoConstancia = signal<string | null>(null);
  readonly errorConstancia = signal<string | null>(null);

  // ── Sesión ───────────────────────────────────────────────────────────────
  readonly cerrando = signal(false);

  constructor() {
    // Con la ventana de borrar la cuenta delante, la página no se mueve.
    effect(() => this.fondo.fijar('perfil', this.borrandoCuenta()));

    // Los códigos ya no se canjean aquí sino en /planes. Quien llega con uno en
    // la dirección —un enlace o un marcador de cuando se canjeaba aquí— sigue
    // hasta allí con el código escrito. `?ver=metodo` ya no hace nada.
    const codigo = this.router.parseUrl(this.router.url).queryParamMap.get('codigo')?.trim();
    if (codigo) {
      void this.router.navigate(['/planes'], { queryParams: { codigo }, replaceUrl: true });
    }
  }

  ngOnInit(): void {
    // El perfil se vuelve a pedir al servidor: si cambió el rol o se verificó
    // el correo desde otro dispositivo, aquí se ve al día.
    this.usuarios.me().subscribe({ next: (usuario) => this.auth.setUser(usuario) });

    const ancla = this.ruta.snapshot.fragment;
    if (ancla) this.irAlAncla(ancla);

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

  /**
   * Lleva a la sección que pide el `#ancla` de la dirección.
   *
   * Angular sabe hacer esto solo —`anchorScrolling` está encendido en
   * `app.config`— pero lo intenta UNA vez, al terminar de navegar, y en ese
   * momento la página mide la mitad de lo que va a medir. Encima del ancla
   * están el conector y la tabla de compras, y los dos nacen vacíos y se
   * rellenan cuando contesta el servidor: el salto acierta, y medio segundo
   * después lo que se buscaba está dos pantallas más abajo. Por eso se
   * reintenta durante unos segundos en vez de una sola vez.
   *
   * (El `scroll-margin-top` del ancla lo pone `perfil.css`: la cabecera es
   * pegajosa y sin él el título queda tapado justo debajo.)
   *
   * Se corta en cuanto la persona toca la rueda, la pantalla o una tecla. Si
   * ya está leyendo otra cosa, moverle la página de debajo es peor que no
   * haber saltado nunca.
   */
  private irAlAncla(id: string): void {
    const hasta = Date.now() + 3000;
    let parado = false;

    const parar = () => {
      parado = true;
    };
    const eventos = ['wheel', 'touchstart', 'keydown'] as const;
    for (const evento of eventos) {
      window.addEventListener(evento, parar, { passive: true, once: true });
    }

    const intentar = () => {
      if (parado || Date.now() > hasta) {
        for (const evento of eventos) window.removeEventListener(evento, parar);
        return;
      }

      document.getElementById(id)?.scrollIntoView({ block: 'start' });
      setTimeout(intentar, 150);
    };

    setTimeout(intentar, 0);
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

  /** Solo los pagos cobrados de verdad tienen constancia; una cortesía a 0, no. */
  tieneConstancia(pago: Payment): boolean {
    return pago.status === 'PAID' && pago.amountCents > 0 && Boolean(pago.paidAt);
  }

  /**
   * Descarga la constancia en PDF. La ruta pide sesión, así que no basta un
   * enlace: se baja con el token y se guarda desde aquí.
   */
  descargarConstancia(pago: Payment): void {
    if (this.bajandoConstancia()) return;
    this.bajandoConstancia.set(pago.id);
    this.errorConstancia.set(null);

    this.pagos.constancia(pago.id).subscribe({
      next: (respuesta) => {
        const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
        const nombre = /filename="([^"]+)"/.exec(disposicion)?.[1] ?? 'constancia-de-pago.pdf';
        const url = URL.createObjectURL(respuesta.body as Blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombre;
        enlace.click();
        // Se suelta después: algunos navegadores aún no empezaron a guardar.
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        this.bajandoConstancia.set(null);
      },
      error: () => {
        this.errorConstancia.set('No pudimos descargar la constancia. Inténtalo de nuevo.');
        this.bajandoConstancia.set(null);
      },
    });
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
