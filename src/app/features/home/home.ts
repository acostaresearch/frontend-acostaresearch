import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Plan } from '../../core/models/rewrite.model';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { CIFRAS, RAZONES } from '../../shared/contenido/metodo';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * Inicio.
 *
 * Es una portada, no el sitio entero: presenta la propuesta, dice por qué el
 * método se hace así y reparte hacia las páginas que lo desarrollan. Antes todo
 * esto vivía en una sola página larga y obligaba a desplazarse por seis
 * secciones para llegar al precio.
 *
 * El precio NO está escrito aquí. Se lee del plan que devuelve la API, que es
 * el mismo número con el que se cobra: si la portada dijera una cifra y el
 * cobro otra, el problema no sería de maquetación.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly billing = inject(BillingService);
  protected readonly auth = inject(AuthService);

  readonly cifras = CIFRAS;
  readonly razones = RAZONES;

  readonly nombre = this.auth.fullName;
  readonly planes = signal<Plan[]>([]);
  readonly metodo = computed(() => this.planes().find((p) => p.kind === 'LICENSE') ?? null);

  ngOnInit(): void {
    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
  }

  precio(plan: Plan): string {
    return `S/ ${(plan.priceCents / 100).toFixed(0)}`;
  }
}
