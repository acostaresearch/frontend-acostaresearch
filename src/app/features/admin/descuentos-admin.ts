import { WritableSignal, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { CodigoDescuento } from '../../core/models/admin.model';
import { AdminService } from '../../core/services/admin.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { Listado } from './listado';

/** Rebaja mínima que acepta el servidor, en céntimos de sol. */
const DESCUENTO_MINIMO = 1000;

/** Listado, formulario y publicación de códigos promocionales. */
export class DescuentosAdmin {
  private readonly admin = inject(AdminService);
  private readonly dialogos = inject(DialogoService);
  private readonly fb = inject(FormBuilder);

  constructor(
    private readonly error: WritableSignal<string | null>,
    private readonly trabajando: WritableSignal<boolean>,
    private readonly copiados: WritableSignal<boolean>,
  ) {}

  readonly descuentos = signal<CodigoDescuento[]>([]);
  readonly descuentoNuevo = signal<CodigoDescuento | null>(null);
  readonly formularioDescuentoAbierto = signal(false);

  readonly listaDescuentos = new Listado(this.descuentos, {
    filtros: [
      { valor: 'todos', etiqueta: 'Todos' },
      { valor: 'activos', etiqueta: 'Activos' },
      { valor: 'agotados', etiqueta: 'Agotados' },
      { valor: 'caducados', etiqueta: 'Caducados' },
      { valor: 'apagados', etiqueta: 'Apagados' },
    ],
    texto: (d) => [d.code, d.planCode, d.note],
    // Cada pestaña es un estado en plural: 'activos' mira los 'activo'.
    pasa: (d, filtro) => filtro === `${this.estadoDescuento(d)}s`,
  });

  readonly formDescuento = this.fb.nonNullable.group({
    // En soles, que es como piensa el precio; se convierte a céntimos al enviar.
    soles: [20, [Validators.required, Validators.min(DESCUENTO_MINIMO / 100)]],
    planCode: [''],
    code: [''],
    maxUses: [0, [Validators.min(0)]],
    // Días hasta que deje de valer. 0 = no caduca, que es lo que hacía siempre
    // hasta ahora: el servidor aceptaba una fecha y el panel no la pedía, así
    // que una promo de septiembre seguía canjeándose en enero.
    expiraEnDias: [0, [Validators.min(0), Validators.max(365)]],
    note: [''],
  });

  /**
   * En qué está de verdad un código promocional.
   *
   * `active` solo dice si lo apagamos a mano. Un código que ya gastó sus usos,
   * o al que se le pasó la fecha, sigue con `active: true` y en la tabla se
   * leía «Activo» aunque la web lo rechace: justo lo contrario de lo que hace.
   */
  estadoDescuento(promo: CodigoDescuento): 'activo' | 'apagado' | 'agotado' | 'caducado' {
    if (!promo.active) return 'apagado';
    if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) return 'caducado';
    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) return 'agotado';
    return 'activo';
  }

  etiquetaDescuento(promo: CodigoDescuento): string {
    const nombres: Record<string, string> = {
      activo: 'Activo',
      apagado: 'Apagado',
      agotado: 'Agotado',
      caducado: 'Caducado',
    };
    return nombres[this.estadoDescuento(promo)];
  }

  // ── Descuentos ───────────────────────────────────────────────────────────

  abrirFormularioDescuento(): void {
    this.error.set(null);
    // El código de la vez anterior se quita al abrir: dejarlo puesto haría
    // pensar que el nuevo es ese, y son códigos que se reparten.
    this.descuentoNuevo.set(null);
    this.formularioDescuentoAbierto.set(true);
  }

  cerrarFormularioDescuento(): void {
    if (this.trabajando()) return;
    this.formularioDescuentoAbierto.set(false);
  }
  crearDescuento(): void {
    if (this.formDescuento.invalid || this.trabajando()) {
      this.formDescuento.markAllAsTouched();
      return;
    }

    this.trabajando.set(true);
    this.error.set(null);
    this.descuentoNuevo.set(null);

    const { soles, planCode, code, maxUses, expiraEnDias, note } = this.formDescuento.getRawValue();

    this.admin
      .crearDescuento({
        amountCents: Math.round(soles * 100),
        planCode: planCode || undefined,
        code: code.trim() || undefined,
        maxUses,
        expiraEnDias: expiraEnDias > 0 ? expiraEnDias : undefined,
        note: note || undefined,
      })
      .subscribe({
        next: (descuento) => {
          this.descuentoNuevo.set(descuento);
          this.descuentos.update((lista) => [descuento, ...lista]);
          this.formDescuento.patchValue({ code: '', note: '' });
          this.trabajando.set(false);
          this.formularioDescuentoAbierto.set(false);
        },
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e));
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
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /**
   * Anuncia el código en la página de precios, o lo esconde.
   *
   * Publicar un código es enseñárselo a cualquiera que mire los precios, así
   * que se pregunta antes: un código negociado con una persona concreta,
   * publicado por descuido, se lo lleva todo el mundo y no hay forma de
   * deshacerlo salvo apagarlo. Esconderlo no se pregunta, que deshacer no
   * cuesta nada.
   */
  async alternarPublicacion(descuento: CodigoDescuento): Promise<void> {
    const publicar = !descuento.publico;

    if (publicar) {
      const seguro = await this.dialogos.confirmar({
        titulo: `Anunciar «${descuento.code}» en la web`,
        mensaje: `Cualquiera que mire los precios lo verá y podrá usarlo.`,
        nota: 'Para un código negociado con una persona concreta, no lo publiques.',
        confirmar: 'Anunciarlo',
        tono: 'aviso',
      });
      if (!seguro) return;
    }

    this.admin.publicarDescuento(descuento.id, publicar).subscribe({
      next: (actualizado) =>
        this.descuentos.update((lista) =>
          lista.map((d) => (d.id === actualizado.id ? actualizado : d)),
        ),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
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
}
