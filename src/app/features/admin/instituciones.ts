import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { Grupo, GruposService, MEDIOS_DE_GRUPO } from '../../core/services/grupos.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

/**
 * «Universidades y asesores»: cupos del método vendidos a un grupo.
 *
 * La venta se cierra fuera (cotización por WhatsApp, factura, transferencia) y
 * aquí se da de alta: nombre, producto, cupos, coordinador y lo cobrado. El
 * coordinador tiene que tener cuenta —su panel de seguimiento cuelga de ella— y
 * el cobro queda como un pago suyo, así que entra en las ventas del mes.
 *
 * Luego se le pasa el enlace del grupo, y él lo reparte a sus alumnos.
 */
@Component({
  selector: 'app-instituciones-admin',
  imports: [AvisoFlotante, DatePipe, DecimalPipe, ReactiveFormsModule],
  templateUrl: './instituciones.html',
  styleUrls: ['./embudo.css', './instituciones.css'],
})
export class InstitucionesAdmin implements OnInit {
  private readonly api = inject(GruposService);
  private readonly fb = inject(FormBuilder);

  /** Los productos de licencia que se pueden vender, del panel. */
  readonly productos = input.required<{ code: string; name: string }[]>();

  readonly medios = MEDIOS_DE_GRUPO;
  readonly grupos = signal<Grupo[]>([]);
  readonly cargando = signal(true);
  readonly creando = signal(false);
  readonly abierto = signal(false);
  readonly copiado = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    productCode: ['', Validators.required],
    cupos: [20, [Validators.required, Validators.min(1), Validators.max(1000)]],
    /** 0 = los días del plan. */
    duracionDias: [0, [Validators.required, Validators.min(0), Validators.max(1095)]],
    cierraAt: [''],
    coordinadorEmail: ['', [Validators.required, Validators.email]],
    paymentMethod: ['TRANSFERENCIA'],
    /** En soles, con decimales: se pasa a céntimos al enviar. */
    importe: [0, [Validators.min(0)]],
    paymentRef: [''],
    note: [''],
  });

  ngOnInit(): void {
    this.api.listar().subscribe({
      next: (lista) => {
        this.grupos.set(lista);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  crear(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.creando()) return;
    const v = this.form.getRawValue();
    const cortesia = v.paymentMethod === 'CORTESIA';

    this.creando.set(true);
    this.api
      .crear({
        nombre: v.nombre.trim(),
        productCode: v.productCode,
        cupos: v.cupos,
        duracionDias: v.duracionDias,
        cierraAt: v.cierraAt || null,
        coordinadorEmail: v.coordinadorEmail.trim(),
        paymentMethod: v.paymentMethod,
        amountCents: cortesia ? null : Math.round(Number(v.importe) * 100),
        paymentRef: v.paymentRef.trim() || null,
        note: v.note.trim() || null,
      })
      .subscribe({
        next: (grupo) => {
          this.grupos.update((lista) => [grupo, ...lista]);
          this.creando.set(false);
          this.abierto.set(false);
          this.form.reset();
          this.aviso.set(`«${grupo.nombre}» creado. Pásale el enlace a ${grupo.coordinador.email}.`);
        },
        error: (e: unknown) => {
          this.creando.set(false);
          this.error.set(mensajeDeError(e));
        },
      });
  }

  encender(grupo: Grupo): void {
    this.cambiar(grupo, { activo: !grupo.activo });
  }

  ampliar(grupo: Grupo): void {
    const texto = prompt(`¿Cuántos cupos en total para «${grupo.nombre}»? Ahora tiene ${grupo.cupos}.`);
    const cupos = Number(texto);
    if (!texto || !Number.isInteger(cupos) || cupos < 1) return;
    this.cambiar(grupo, { cupos });
  }

  async copiar(grupo: Grupo): Promise<void> {
    try {
      await navigator.clipboard.writeText(grupo.url);
      this.copiado.set(grupo.id);
      setTimeout(() => this.copiado.set(null), 2500);
    } catch {
      this.error.set('No se pudo copiar. Selecciona el enlace y cópialo a mano.');
    }
  }

  private cambiar(grupo: Grupo, cambios: { activo?: boolean; cupos?: number }): void {
    this.api.cambiar(grupo.id, cambios).subscribe({
      next: (actualizado) =>
        this.grupos.update((lista) => lista.map((g) => (g.id === actualizado.id ? actualizado : g))),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }
}
