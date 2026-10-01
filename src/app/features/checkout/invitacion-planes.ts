import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { toApiError } from '../../core/http/api-error';
import { AuthService } from '../../core/services/auth.service';
import { RetencionService } from '../../core/services/retencion.service';

const VISITANTE = 'ar.visitante';
const REFERIDO = 'ar.ref';

/** localStorage puede no estar (ventana privada, bloqueado): nunca rompe. */
function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: string | null): void {
  try {
    if (valor) localStorage.setItem(clave, valor);
    else localStorage.removeItem(clave);
  } catch {
    // Sin almacenamiento vale solo para esta visita.
  }
}

/**
 * Lo que /planes hace además de vender, sin tocar su lógica de pago:
 *
 * 1. Avisa de que alguien vio los precios (el primer paso del embudo). Con un
 *    número al azar que guarda el navegador: una visita por persona y día.
 * 2. El código de quien lo invitó. Llega en el enlace (?ref=ANAK7Q2) o se
 *    escribe aquí. Se guarda en el navegador, porque lo normal es llegar sin
 *    cuenta, registrarse y volver: cuando vuelve con sesión se apunta solo, y
 *    así los días extra le llegan al pagar sin que tenga que acordarse.
 */
@Component({
  selector: 'app-invitacion-planes',
  template: `
    @if (invitador(); as inv) {
      <p class="invitacion" role="status">
        <span class="icono" aria-hidden="true">🎁</span>
        @if (apuntado()) {
          <span>
            Te invitó <strong>{{ inv.nombre }}</strong>. Al empezar el método recibes
            <strong>{{ inv.dias }} días extra</strong>, y {{ inv.nombre }} también gana días.
          </span>
        } @else {
          <span>
            Te invitó <strong>{{ inv.nombre }}</strong>: al empezar el método recibes
            <strong>{{ inv.dias }} días extra</strong>.
            @if (!auth.isAuthenticated()) {
              Entra o crea tu cuenta antes de pagar para que cuente.
            }
          </span>
        }
      </p>
    } @else {
      <!-- A la vista y no detrás de un enlace: va bajo el canje, en la
           cabecera, y un campo se entiende sin tener que pulsar nada antes. -->
      <form class="codigo" (submit)="$event.preventDefault(); usar()">
        <input
          aria-label="Código de un compañero"
          [value]="codigo()"
          (input)="codigo.set($any($event.target).value)"
          placeholder="Código de un compañero"
          autocomplete="off"
          maxlength="24"
        />
        <button type="submit" [disabled]="codigo().trim().length < 5 || enviando()">
          Aplicar
        </button>
      </form>
    }
    @if (error(); as e) {
      <p class="error">{{ e }}</p>
    }
  `,
  styles: `
    :host { display: block; margin: 10px 0 0; }
    .invitacion {
      display: flex; gap: 10px; align-items: flex-start; margin: 0; padding: 10px 14px;
      font-size: 13.5px; line-height: 1.5; color: var(--color-texto);
      background: var(--color-exito-suave); border-radius: 10px;
    }
    .icono { font-size: 18px; line-height: 1.2; }
    .codigo {
      display: flex; overflow: hidden;
      background: var(--color-superficie);
      border: 1px solid var(--color-borde-fuerte); border-radius: 10px;
    }
    .codigo:focus-within { border-color: var(--color-primario); }
    .codigo input {
      flex: 1; min-width: 0; padding: 10px 14px; font: inherit; font-size: 14px;
      color: var(--color-texto); background: none; border: 0;
    }
    .codigo input:focus { outline: none; }
    .codigo input::placeholder { color: var(--color-texto-tenue); }
    .codigo button {
      flex: none; padding: 0 18px; font: inherit; font-size: 14px; font-weight: 600;
      color: var(--color-primario); background: var(--color-primario-suave);
      border: 0; cursor: pointer;
    }
    .codigo button:disabled { cursor: default; opacity: 0.6; }
    .error { margin: 8px 0 0; font-size: 13.5px; color: var(--color-error); }
  `,
})
export class InvitacionPlanes implements OnInit {
  private readonly api = inject(RetencionService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly invitador = signal<{ nombre: string; dias: number } | null>(null);
  readonly apuntado = signal(false);
  readonly codigo = signal('');
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const params = this.ruta.snapshot.queryParamMap;
    const traido = params.get('ref')?.trim() || null;
    if (traido) guardar(REFERIDO, traido);

    this.contarVisita(params.get('utm_source') ?? (traido ? 'referido' : null));

    const ref = traido ?? leer(REFERIDO);
    if (ref) this.saludar(ref);
  }

  /** Escrito a mano. Sin sesión, lleva a entrar y vuelve con el código. */
  usar(): void {
    const codigo = this.codigo().trim().toUpperCase();
    if (codigo.length < 5) return;
    guardar(REFERIDO, codigo);
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/planes?ref=${encodeURIComponent(codigo)}` },
      });
      return;
    }
    this.saludar(codigo, true);
  }

  private contarVisita(origen: string | null): void {
    let visitante = leer(VISITANTE);
    if (!visitante) {
      visitante = crypto.randomUUID();
      guardar(VISITANTE, visitante);
    }
    // Si falla no pasa nada: es una cifra del panel, no algo del comprador.
    this.api.visita(visitante, origen?.slice(0, 60) ?? null).subscribe({ error: () => undefined });
  }

  /** Enseña de quién es el código y, con sesión, lo apunta. */
  private saludar(codigo: string, aMano = false): void {
    this.error.set(null);
    this.enviando.set(true);

    if (!this.auth.isAuthenticated()) {
      this.api.deQuienEs(codigo).subscribe({
        next: (inv) => {
          this.enviando.set(false);
          this.invitador.set(inv);
        },
        error: (e: unknown) => this.descartar(e, aMano),
      });
      return;
    }

    this.api.apuntarse(codigo).subscribe({
      next: (r) => {
        this.enviando.set(false);
        this.invitador.set({ nombre: r.nombre, dias: r.dias });
        this.apuntado.set(true);
      },
      error: (e: unknown) => this.descartar(e, aMano),
    });
  }

  /**
   * Un código que no vale se olvida. Si llegó solo (por el enlace o guardado)
   * no se dice nada: quien ya tiene el método y abre el enlace de un compañero
   * no tiene por qué ver un error. Si lo escribió él, sí.
   */
  private descartar(e: unknown, aMano: boolean): void {
    this.enviando.set(false);
    guardar(REFERIDO, null);
    if (aMano) this.error.set(toApiError(e).message);
  }
}
