import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { toApiError } from '../../core/http/api-error';
import {
  ActivationCode,
  Alerta,
  CodigoDescuento,
  LicenciaAdmin,
  PackAdmin,
  PagoAdmin,
} from '../../core/models/admin.model';
import { Plan } from '../../core/models/rewrite.model';
import { AdminService } from '../../core/services/admin.service';
import { BillingService } from '../../core/services/billing.service';
import { AnalisisBundle, Skill, SkillService } from '../../core/services/skill.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

type Seccion = 'ventas' | 'skills' | 'descuentos' | 'licencias' | 'alertas' | 'movimientos';

/** Rebaja mínima que acepta el servidor, en céntimos de sol. */
const DESCUENTO_MINIMO = 1000;

/** Métodos de pago que acepta el backend para una activación manual. */
const METODOS = ['YAPE', 'PLIN', 'TRANSFERENCIA', 'PAYPAL', 'WESTERN_UNION', 'CORTESIA'] as const;

/**
 * Panel de administración.
 *
 * Es una herramienta de trabajo, no un escaparate: lo que se mira a diario va
 * primero —vender y vigilar— y el histórico queda detrás.
 */
@Component({
  selector: 'app-admin',
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, SiteHeader, SiteFooter],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly admin = inject(AdminService);
  private readonly billing = inject(BillingService);

  readonly metodos = METODOS;
  readonly seccion = signal<Seccion>('ventas');

  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  // ── Datos ────────────────────────────────────────────────────────────────
  readonly planes = signal<Plan[]>([]);
  readonly licencias = signal<LicenciaAdmin[]>([]);
  readonly alertas = signal<Alerta[]>([]);
  readonly codigos = signal<ActivationCode[]>([]);
  readonly bolsas = signal<PackAdmin[]>([]);
  readonly pagos = signal<PagoAdmin[]>([]);
  readonly descuentos = signal<CodigoDescuento[]>([]);
  readonly descuentoNuevo = signal<CodigoDescuento | null>(null);

  /** Códigos recién generados. Se muestran una vez y no vuelven. */
  readonly codigosNuevos = signal<string[]>([]);
  readonly copiados = signal(false);
  readonly trabajando = signal(false);

  readonly planesLicencia = computed(() => this.planes().filter((p) => p.kind === 'LICENSE'));
  readonly planesPalabras = computed(() =>
    this.planes().filter((p) => p.kind === 'WORDS' && p.priceCents > 0),
  );

  /** Lo que hay que mirar hoy: alertas sin resolver y licencias caídas. */
  readonly alertasGraves = computed(
    () => this.alertas().filter((a) => a.level === 'SOSPECHA_ALTA').length,
  );
  readonly licenciasActivas = computed(
    () => this.licencias().filter((l) => l.status === 'ACTIVE').length,
  );
  readonly licenciasRevocadas = computed(
    () => this.licencias().filter((l) => l.status === 'REVOKED').length,
  );
  readonly codigosSinUsar = computed(
    () => this.codigos().filter((c) => c.status === 'AVAILABLE').length,
  );

  // ── Formularios ──────────────────────────────────────────────────────────
  readonly formCodigos = this.fb.nonNullable.group({
    cantidad: [1, [Validators.required, Validators.min(1), Validators.max(100)]],
    productCode: ['METODO_9_SKILLS'],
    buyerEmail: [''],
    note: [''],
  });

  readonly formDescuento = this.fb.nonNullable.group({
    // En soles, que es como piensa el precio; se convierte a céntimos al enviar.
    soles: [20, [Validators.required, Validators.min(DESCUENTO_MINIMO / 100)]],
    planCode: [''],
    code: [''],
    maxUses: [0, [Validators.min(0)]],
    note: [''],
  });

  readonly formBolsa = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    planCode: ['TESISTA', Validators.required],
    paymentMethod: ['YAPE', Validators.required],
    paymentRef: [''],
    note: [''],
  });

  // ── Capítulos del método ─────────────────────────────────────────────────
  private readonly skillsApi = inject(SkillService);

  readonly skills = signal<Skill[]>([]);
  readonly archivo = signal<File | null>(null);
  readonly analisis = signal<AnalisisBundle | null>(null);
  readonly editando = signal<Skill | null>(null);

  readonly formSkill = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    summary: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    orden: [0, [Validators.required, Validators.min(0)]],
    active: [true],
  });

  ngOnInit(): void {
    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
    this.recargar();
  }

  /**
   * Al elegir un .skill se inspecciona antes de guardar nada.
   *
   * Así el formulario llega relleno con lo que trae el archivo y, sobre todo,
   * se avisa si va a reemplazar un capítulo existente. Subir por error encima
   * de uno bueno es el fallo que hay que hacer difícil.
   */
  elegirArchivo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0] ?? null;

    this.archivo.set(archivo);
    this.analisis.set(null);
    this.error.set(null);
    this.aviso.set(null);
    if (!archivo) return;

    this.trabajando.set(true);
    this.skillsApi.inspeccionar(archivo).subscribe({
      next: (analisis) => {
        this.analisis.set(analisis);
        this.formSkill.patchValue({
          displayName: analisis.reemplaza?.displayName ?? analisis.displayNameSugerido,
          summary: analisis.reemplaza?.summary ?? analisis.summarySugerido,
          orden: analisis.reemplaza?.orden ?? this.skills().length + 1,
          active: analisis.reemplaza?.active ?? true,
        });
        this.trabajando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.archivo.set(null);
        entrada.value = '';
        this.trabajando.set(false);
      },
    });
  }

  subirSkill(): void {
    const archivo = this.archivo();
    if (!archivo || this.formSkill.invalid || this.trabajando()) {
      this.formSkill.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);

    this.skillsApi.subir(archivo, this.formSkill.getRawValue()).subscribe({
      next: ({ skill, tramos }) => {
        this.aviso.set(
          `«${skill.displayName}» está disponible en el conector: ${tramos} tramos. ` +
            'Los tesistas lo ven al instante, sin reinstalar nada.',
        );
        this.cancelarSubida();
        this.cargarSkills();
        this.trabajando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.trabajando.set(false);
      },
    });
  }

  cancelarSubida(): void {
    this.archivo.set(null);
    this.analisis.set(null);
    this.formSkill.reset({ displayName: '', summary: '', orden: 0, active: true });
  }

  editarSkill(skill: Skill): void {
    this.editando.set(skill);
    this.analisis.set(null);
    this.archivo.set(null);
    this.formSkill.patchValue({
      displayName: skill.displayName,
      summary: skill.summary,
      orden: skill.orden,
      active: skill.active,
    });
  }

  guardarFicha(): void {
    const skill = this.editando();
    if (!skill || this.formSkill.invalid || this.trabajando()) {
      this.formSkill.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);

    this.skillsApi.actualizar(skill.id, this.formSkill.getRawValue()).subscribe({
      next: (actualizada) => {
        this.skills.update((lista) => lista.map((s) => (s.id === actualizada.id ? actualizada : s)));
        this.aviso.set(`Ficha de «${actualizada.displayName}» actualizada.`);
        this.editando.set(null);
        this.cancelarSubida();
        this.trabajando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(toApiError(e).message);
        this.trabajando.set(false);
      },
    });
  }

  /** Activa o desactiva sin abrir el formulario: es el gesto más frecuente. */
  alternarSkill(skill: Skill): void {
    this.skillsApi.actualizar(skill.id, { active: !skill.active }).subscribe({
      next: (actualizada) =>
        this.skills.update((lista) => lista.map((s) => (s.id === actualizada.id ? actualizada : s))),
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  eliminarSkill(skill: Skill): void {
    if (!confirm(`¿Quitar «${skill.displayName}» del catálogo? El archivo .skill se conserva.`)) {
      return;
    }

    this.skillsApi.eliminar(skill.id).subscribe({
      next: () => {
        this.skills.update((lista) => lista.filter((s) => s.id !== skill.id));
        this.aviso.set(`«${skill.displayName}» ya no aparece en el conector.`);
      },
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  private cargarSkills(): void {
    this.skillsApi.list().subscribe({
      next: (skills) => this.skills.set(skills),
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  recargar(): void {
    this.cargarSkills();
    this.admin.licenciasTodas().subscribe({
      next: (l) => this.licencias.set(l),
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
    this.admin.alertas().subscribe({ next: (a) => this.alertas.set(a) });
    this.admin.codigos().subscribe({ next: (c) => this.codigos.set(c) });
    this.admin.bolsasRecientes().subscribe({ next: (b) => this.bolsas.set(b) });
    this.admin.pagosRecientes().subscribe({ next: (p) => this.pagos.set(p) });
    this.admin.descuentos().subscribe({ next: (d) => this.descuentos.set(d) });
  }

  // ── Descuentos ───────────────────────────────────────────────────────────

  crearDescuento(): void {
    if (this.formDescuento.invalid || this.trabajando()) {
      this.formDescuento.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.descuentoNuevo.set(null);

    const { soles, planCode, code, maxUses, note } = this.formDescuento.getRawValue();

    this.admin
      .crearDescuento({
        amountCents: Math.round(soles * 100),
        planCode: planCode || undefined,
        code: code.trim() || undefined,
        maxUses,
        note: note || undefined,
      })
      .subscribe({
        next: (descuento) => {
          this.descuentoNuevo.set(descuento);
          this.descuentos.update((lista) => [descuento, ...lista]);
          this.formDescuento.patchValue({ code: '', note: '' });
          this.trabajando.set(false);
        },
        error: (e: unknown) => {
          this.error.set(toApiError(e).message);
          this.trabajando.set(false);
        },
      });
  }

  alternarDescuento(descuento: CodigoDescuento): void {
    this.admin.activarDescuento(descuento.id, !descuento.active).subscribe({
      next: (actualizado) =>
        this.descuentos.update((lista) =>
          lista.map((d) => (d.id === actualizado.id ? actualizado : d)),
        ),
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  async copiarDescuento(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.copiados.set(true);
      setTimeout(() => this.copiados.set(false), 2500);
    } catch {
      this.error.set('No pudimos copiar. Selecciónalo y cópialo a mano.');
    }
  }

  ir(seccion: Seccion): void {
    this.seccion.set(seccion);
    this.error.set(null);
    this.aviso.set(null);
  }

  // ── Vender ───────────────────────────────────────────────────────────────

  generarCodigos(): void {
    if (this.formCodigos.invalid || this.trabajando()) return;

    this.trabajando.set(true);
    this.error.set(null);
    this.codigosNuevos.set([]);

    const { cantidad, productCode, buyerEmail, note } = this.formCodigos.getRawValue();

    this.admin
      .generarCodigos({
        cantidad,
        productCode: productCode || undefined,
        buyerEmail: buyerEmail || undefined,
        note: note || undefined,
      })
      .subscribe({
        next: ({ codes }) => {
          this.codigosNuevos.set(codes);
          this.formCodigos.patchValue({ buyerEmail: '', note: '' });
          this.trabajando.set(false);
          this.admin.codigos().subscribe({ next: (c) => this.codigos.set(c) });
        },
        error: (e: unknown) => {
          this.error.set(toApiError(e).message);
          this.trabajando.set(false);
        },
      });
  }

  async copiarCodigos(): Promise<void> {
    const codigos = this.codigosNuevos();
    if (codigos.length === 0) return;

    try {
      await navigator.clipboard.writeText(codigos.join('\n'));
      this.copiados.set(true);
      setTimeout(() => this.copiados.set(false), 2500);
    } catch {
      this.error.set('No pudimos copiar. Selecciónalos y cópialos a mano.');
    }
  }

  activarBolsa(): void {
    if (this.formBolsa.invalid || this.trabajando()) {
      this.formBolsa.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.aviso.set(null);

    const datos = this.formBolsa.getRawValue();

    this.admin
      .activarBolsa({
        email: datos.email,
        planCode: datos.planCode,
        paymentMethod: datos.paymentMethod,
        paymentRef: datos.paymentRef || undefined,
        note: datos.note || undefined,
      })
      .subscribe({
        next: ({ pack }) => {
          this.aviso.set(
            `Activadas ${pack.wordsTotal.toLocaleString('es')} palabras para ${datos.email}.`,
          );
          this.formBolsa.patchValue({ email: '', paymentRef: '', note: '' });
          this.trabajando.set(false);
          this.admin.bolsasRecientes().subscribe({ next: (b) => this.bolsas.set(b) });
        },
        error: (e: unknown) => {
          this.error.set(toApiError(e).message);
          this.trabajando.set(false);
        },
      });
  }

  anularCodigo(codigo: ActivationCode): void {
    if (!confirm(`Se anulará el código …${codigo.hint}. No se podrá canjear. ¿Continuar?`)) return;

    this.admin.anularCodigo(codigo.id).subscribe({
      next: () => this.admin.codigos().subscribe({ next: (c) => this.codigos.set(c) }),
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  // ── Licencias ────────────────────────────────────────────────────────────

  revocar(licencia: LicenciaAdmin): void {
    const motivo = prompt(
      `Revocar la licencia de ${licencia.user.email}. El conector dejará de responderle.\n\n` +
        'Motivo (queda guardado):',
      'Uso compartido',
    );
    if (motivo === null) return;

    this.admin.revocar(licencia.id, motivo || undefined).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.aviso.set(`Licencia de ${licencia.user.email} revocada.`);
      },
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  reactivar(licencia: LicenciaAdmin): void {
    this.admin.reactivar(licencia.id).subscribe({
      next: (actualizada) => {
        this.reemplazar(actualizada);
        this.aviso.set(`Licencia de ${licencia.user.email} reactivada.`);
      },
      error: (e: unknown) => this.error.set(toApiError(e).message),
    });
  }

  /** La respuesta no trae el comprador, así que se conserva el que ya teníamos. */
  private reemplazar(actualizada: LicenciaAdmin): void {
    this.licencias.update((lista) =>
      lista.map((l) => (l.id === actualizada.id ? { ...l, ...actualizada } : l)),
    );
  }

  // ── Presentación ─────────────────────────────────────────────────────────

  importe(cents: number | null, moneda = 'PEN'): string {
    if (cents === null) return '—';
    return `${moneda === 'USD' ? '$' : 'S/ '}${(cents / 100).toFixed(2)}`;
  }

  nombreCorto(alerta: Alerta): string {
    const nombres: Record<Alerta['kind'], string> = {
      VOLUMEN: 'Volumen inusual',
      SESIONES_SOLAPADAS: 'Sesiones solapadas',
      CONSULTAS_INCOHERENTES: 'Consultas incoherentes',
      EXTRACCION: 'Intentos de extracción',
    };
    return nombres[alerta.kind];
  }
}
