import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { toApiError } from '../../core/http/api-error';
import { License, ProgresoDeArranque } from '../../core/models/payment.model';
import { DialogoService } from '../../core/services/dialogo.service';
import { LicenseService } from '../../core/services/license.service';
import { MiTesis } from './mi-tesis';
import { MisFuentesPanel } from './mis-fuentes';
import { PasosDeArranque } from './pasos-de-arranque';

/**
 * El conector de Claude de quien está mirando: sus licencias, la URL y la guía.
 *
 * Vive en `shared` por lo mismo que `AjustesDeCuenta`: lo usan el perfil del
 * comprador y el panel del administrador. Antes solo estaba en el perfil, y el
 * administrador no llega ahí —su botón de la cabecera va a «Administrar»—, así
 * que el dueño del producto era el único que no tenía dónde ver su propio
 * conector.
 *
 * Lo que cambia entre los dos usos es poco y cabe en `modo`: el administrador no
 * canjea códigos (los genera él, y canjearse uno a sí mismo apuntaría una venta
 * que no existió) y tampoco se le ofrece comprar lo que ya tiene.
 */
@Component({
  selector: 'app-mi-conector',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, MiTesis, MisFuentesPanel, PasosDeArranque],
  templateUrl: './mi-conector.html',
  styleUrl: './mi-conector.css',
})
export class MiConector implements OnInit {
  private readonly licencias = inject(LicenseService);
  private readonly dialogos = inject(DialogoService);

  /** Quién lo está mirando. Ver la nota de la clase. */
  readonly modo = input<'comprador' | 'administrador'>('comprador');

  readonly misLicencias = signal<License[]>([]);

  /**
   * Por dónde va la puesta en marcha. Nulo mientras no ha contestado el
   * servidor: los pasos no se pintan a medias, se pintan cuando se saben.
   */
  readonly progreso = signal<ProgresoDeArranque | null>(null);
  readonly cargando = signal(true);

  /**
   * Guía de instalación en PDF. Cadena vacía = el archivo no está y no se
   * ofrece la descarga; lo resuelve el generador de environments al compilar.
   */
  readonly guiaUrl = environment.guiaUrl;

  /** El WhatsApp de la casa, para quien ya probó el video y la guía. */
  readonly whatsappUrl = environment.whatsappUrl;

  /**
   * El mismo número, escrito para leerlo.
   *
   * Sale del enlace y no de una constante aparte para que no puedan
   * discrepar: el que se enseña es siempre al que se llama.
   */
  readonly whatsappTexto = MiConector.telefonoDe(environment.whatsappUrl);

  private static telefonoDe(url: string): string {
    const digitos = url.replace(/\D/g, '');
    if (digitos.length < 8) return '';
    // +51 923 095 940: prefijo de dos y el resto en grupos de tres.
    const pais = digitos.slice(0, digitos.length - 9);
    const resto = digitos.slice(-9);
    return `+${pais} ${resto.slice(0, 3)} ${resto.slice(3, 6)} ${resto.slice(6)}`;
  }

  /**
   * Cuántos días le quedan a una licencia, o `null` si ya pasó su fecha.
   *
   * Se cuenta por días enteros hacia arriba: a quien le caduca esta noche le
   * queda «1 día», no «0». Cero se lee como caducada y no lo está todavía.
   */
  diasQueFaltan(licencia: License): number | null {
    if (!licencia.expiresAt) return null;
    const faltan = new Date(licencia.expiresAt).getTime() - Date.now();
    return faltan > 0 ? Math.ceil(faltan / 86_400_000) : null;
  }

  /** Porcentaje del tope diario ya gastado, para la barra. */
  gastoDelDia(licencia: License): number {
    const tope = licencia.callsPerDay ?? 0;
    if (tope <= 0) return 0;
    return Math.min(100, Math.round(((licencia.usage?.callsToday ?? 0) / tope) * 100));
  }

  /**
   * ¿Tiene acceso vigente?
   *
   * No basta con que exista una fila de licencia: una revocada o una caducada
   * también aparecen ahí, y a quien está en cualquiera de esos dos casos no se
   * le ofrece la guía de instalación. Lo que necesita es renovar o escribirnos,
   * no un manual para conectar algo que ya no le va a responder.
   */
  readonly tieneAccesoVigente = computed(() =>
    this.misLicencias().some(
      (licencia) =>
        licencia.status === 'ACTIVE' &&
        (licencia.expiresAt === null || new Date(licencia.expiresAt) > new Date()),
    ),
  );

  /** URL recién generada. Solo se puede mostrar en el momento de crearla. */
  readonly urlNueva = signal<string | null>(null);
  readonly rotando = signal<string | null>(null);
  readonly errorLicencia = signal<string | null>(null);
  readonly urlCopiada = signal(false);

  readonly codigo = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(6)],
  });
  readonly canjeando = signal(false);

  ngOnInit(): void {
    this.licencias.mine().subscribe({
      next: ({ licencias, progreso }) => {
        this.misLicencias.set(licencias);
        this.progreso.set(progreso);
        this.cargando.set(false);
      },
      error: () => {
        this.misLicencias.set([]);
        this.cargando.set(false);
      },
    });
  }

  async regenerarUrl(licencia: License): Promise<void> {
    if (this.rotando()) return;

    const seguro = await this.dialogos.confirmar({
      titulo: 'Generar una URL nueva',
      mensaje: 'La anterior dejará de funcionar en el acto.',
      nota: 'Tendrás que pegar la nueva en Claude para seguir usando el conector.',
      confirmar: 'Generar URL nueva',
      tono: 'aviso',
    });
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

  canjearCodigo(): void {
    if (this.codigo.invalid || this.canjeando()) {
      this.codigo.markAsTouched();
      return;
    }

    this.canjeando.set(true);
    this.errorLicencia.set(null);
    this.urlNueva.set(null);

    this.licencias.redeem(this.codigo.value.trim()).subscribe({
      next: ({ license, connectorUrl }) => {
        this.urlNueva.set(connectorUrl);
        this.misLicencias.update((lista) => [license, ...lista]);
        this.codigo.reset();
        this.canjeando.set(false);
      },
      error: (error: unknown) => {
        this.errorLicencia.set(toApiError(error).message);
        this.canjeando.set(false);
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
}
