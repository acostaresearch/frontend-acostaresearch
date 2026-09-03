import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { Plan } from '../../core/models/rewrite.model';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { TEXTO_PENDIENTE } from '../../shared/texto-pendiente';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

@Component({
  selector: 'app-home',
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, SiteHeader, SiteFooter],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  readonly texto = new FormControl('', { nonNullable: true });
  readonly palabras = signal(0);
  readonly planes = signal<Plan[]>([]);

  /** El método se vende como licencia; el humanizador, como bolsas de palabras. */
  readonly metodo = computed(() => this.planes().find((p) => p.kind === 'LICENSE') ?? null);
  readonly bolsas = computed(() =>
    this.planes().filter((p) => p.kind === 'WORDS' && p.priceCents > 0),
  );

  ngOnInit(): void {
    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });

    this.texto.valueChanges.subscribe((valor) => {
      const limpio = valor.trim();
      this.palabras.set(limpio ? limpio.split(/\s+/).length : 0);
    });
  }

  /**
   * Lleva el texto al humanizador. Si no hay sesión, se guarda en la pestaña y
   * se recupera al entrar: quien se toma el trabajo de pegar su párrafo no
   * debería perderlo por registrarse.
   */
  probar(): void {
    const valor = this.texto.value.trim();

    if (valor) {
      try {
        sessionStorage.setItem(TEXTO_PENDIENTE, valor);
      } catch {
        // Modo privado o almacenamiento bloqueado: se sigue sin guardar nada.
      }
    }

    this.router.navigate(this.auth.isAuthenticated() ? ['/humanizador'] : ['/auth/registro']);
  }

  precio(plan: Plan): string {
    return `S/ ${(plan.priceCents / 100).toFixed(2)}`;
  }

  porMil(plan: Plan): string {
    return `S/ ${((plan.priceCents / 100 / plan.words) * 1000).toFixed(2)}`;
  }
}
