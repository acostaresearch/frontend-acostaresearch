import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { toApiError } from '../../core/http/api-error';
import { ERROR_CODE } from '../../core/models/api.model';
import {
  Balance,
  CAPITULOS,
  MODOS,
  Plan,
  RewriteMode,
  ThesisChapter,
} from '../../core/models/rewrite.model';
import { BillingService } from '../../core/services/billing.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';
import { TEXTO_PENDIENTE } from '../../shared/texto-pendiente';
import { RewriteService } from '../../core/services/rewrite.service';

@Component({
  selector: 'app-rewriter',
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, DatePipe, SiteHeader, SiteFooter],
  templateUrl: './rewriter.html',
  styleUrl: './rewriter.css',
})
export class Rewriter implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly rewrites = inject(RewriteService);
  private readonly billing = inject(BillingService);

  readonly capitulos = CAPITULOS;
  readonly modos = MODOS;
  readonly whatsappUrl = environment.whatsappUrl;

  readonly formulario = this.fb.nonNullable.group({
    text: [''],
    chapter: ['GENERAL' as ThesisChapter],
    mode: ['ESTANDAR' as RewriteMode],
  });

  readonly palabras = signal(0);
  readonly saldo = signal<Balance | null>(null);
  readonly resultado = signal<string | null>(null);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly sinSaldo = signal(false);
  readonly planes = signal<Plan[]>([]);
  readonly copiado = signal(false);

  /** Pista de por qué el capítulo elegido cambia el resultado. */
  readonly pistaCapitulo = computed(() => {
    const actual = this.formulario.controls.chapter.value;
    return this.capitulos.find((c) => c.value === actual)?.hint ?? '';
  });

  readonly excedeEnvio = computed(() => {
    const maximo = this.saldo()?.maxWordsPerRequest;
    return maximo !== undefined && this.palabras() > maximo;
  });

  readonly excedeSaldo = computed(() => {
    const disponible = this.saldo()?.wordsAvailable;
    return disponible !== undefined && this.palabras() > disponible;
  });

  readonly puedeEnviar = computed(
    () => this.palabras() >= 10 && !this.excedeEnvio() && !this.excedeSaldo() && !this.enviando(),
  );

  ngOnInit(): void {
    this.cargarSaldo();
    this.recuperarTextoDeLaPortada();

    this.formulario.controls.text.valueChanges.subscribe((texto) => {
      this.palabras.set(this.contarPalabras(texto));
    });
  }

  /**
   * Recoge el párrafo que el visitante escribió en la portada antes de entrar.
   * Se consume una sola vez: si se quedara guardado, reaparecería en cada
   * visita al humanizador y sería desconcertante.
   */
  private recuperarTextoDeLaPortada(): void {
    try {
      const pendiente = sessionStorage.getItem(TEXTO_PENDIENTE);
      if (!pendiente) return;

      sessionStorage.removeItem(TEXTO_PENDIENTE);
      this.formulario.controls.text.setValue(pendiente);
    } catch {
      // Almacenamiento bloqueado: no había nada que recuperar.
    }
  }

  private contarPalabras(texto: string): number {
    const limpio = texto.trim();
    return limpio ? limpio.split(/\s+/).length : 0;
  }

  private cargarSaldo(): void {
    this.billing.balance().subscribe({
      next: (balance) => this.saldo.set(balance),
      error: () => this.saldo.set(null),
    });
  }

  private cargarPlanes(): void {
    if (this.planes().length > 0) return;
    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
  }

  enviar(): void {
    if (!this.puedeEnviar()) return;

    this.error.set(null);
    this.sinSaldo.set(false);
    this.resultado.set(null);
    this.copiado.set(false);
    this.enviando.set(true);

    this.rewrites.create(this.formulario.getRawValue()).subscribe({
      next: (rewrite) => {
        this.resultado.set(rewrite.resultText ?? '');
        this.enviando.set(false);
        // El saldo cambió: se recarga para que el contador diga la verdad.
        this.cargarSaldo();
      },
      error: (error: unknown) => {
        const apiError = toApiError(error);
        this.enviando.set(false);
        this.error.set(apiError.message);

        if (apiError.code === ERROR_CODE.NO_BALANCE) {
          this.sinSaldo.set(true);
          this.cargarPlanes();
        }
      },
    });
  }

  async copiar(): Promise<void> {
    const texto = this.resultado();
    if (!texto) return;

    try {
      await navigator.clipboard.writeText(texto);
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      // Algunos navegadores bloquean el portapapeles sin gesto directo.
      this.error.set('No pudimos copiar. Selecciona el texto y cópialo a mano.');
    }
  }

  usarResultado(): void {
    const texto = this.resultado();
    if (!texto) return;

    // Permite encadenar pasadas: el resultado vuelve al cuadro de entrada.
    this.formulario.controls.text.setValue(texto);
    this.resultado.set(null);
  }

  limpiar(): void {
    this.formulario.controls.text.setValue('');
    this.resultado.set(null);
    this.error.set(null);
    this.sinSaldo.set(false);
  }

  precio(plan: Plan): string {
    return `S/ ${(plan.priceCents / 100).toFixed(2)}`;
  }
}
