import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { toApiError } from '../../core/http/api-error';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { User } from '../../core/models/user.model';
import { Balance } from '../../core/models/rewrite.model';
import { BillingService } from '../../core/services/billing.service';
import { License } from '../../core/models/payment.model';
import { LicenseService } from '../../core/services/license.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** Página protegida mínima: confirma que la sesión y el rol llegan bien. */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DecimalPipe, DatePipe, SiteHeader, SiteFooter],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly usuarios = inject(UserService);
  private readonly billing = inject(BillingService);
  private readonly licencias = inject(LicenseService);

  readonly usuario = this.auth.user;
  readonly nombre = this.auth.fullName;

  readonly listado = signal<User[] | null>(null);
  readonly errorListado = signal<string | null>(null);
  readonly cargandoListado = signal(false);

  readonly esAdmin = () => this.auth.hasRole('ADMIN');

  readonly saldo = signal<Balance | null>(null);

  readonly misLicencias = signal<License[]>([]);
  /** URL recién generada. Solo se puede mostrar en el momento de crearla. */
  readonly urlNueva = signal<string | null>(null);
  readonly rotando = signal<string | null>(null);
  readonly errorLicencia = signal<string | null>(null);
  readonly urlCopiada = signal(false);

  ngOnInit(): void {
    // Si falla, la tarjeta del humanizador se muestra igual pero sin el saldo.
    this.billing.balance().subscribe({
      next: (balance) => this.saldo.set(balance),
      error: () => this.saldo.set(null),
    });

    this.licencias.mine().subscribe({
      next: (licencias) => this.misLicencias.set(licencias),
      error: () => this.misLicencias.set([]),
    });
  }

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

  cargarUsuarios(): void {
    if (this.cargandoListado()) return;

    this.cargandoListado.set(true);
    this.errorListado.set(null);

    this.usuarios.list({ perPage: 10 }).subscribe({
      next: ({ users }) => {
        this.listado.set(users);
        this.cargandoListado.set(false);
      },
      error: (error: unknown) => {
        this.errorListado.set(toApiError(error).message);
        this.cargandoListado.set(false);
      },
    });
  }

}
