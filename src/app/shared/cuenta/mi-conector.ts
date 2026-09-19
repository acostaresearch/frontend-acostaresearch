import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { toApiError } from '../../core/http/api-error';
import { License, ProgresoDeArranque } from '../../core/models/payment.model';
import { LicenseService } from '../../core/services/license.service';
import { MiTesis } from './mi-tesis';
import { MiScopusPanel } from './mi-scopus';
import { MisFuentesPanel } from './mis-fuentes';
import { MiZoteroPanel } from './mi-zotero';
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
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MiTesis,
    MisFuentesPanel,
    MiScopusPanel,
    MiZoteroPanel,
    PasosDeArranque,
  ],
  templateUrl: './mi-conector.html',
  styleUrl: './mi-conector.css',
})
export class MiConector implements OnInit {
  private readonly licencias = inject(LicenseService);

  /** Quién lo está mirando. Ver la nota de la clase. */
  readonly modo = input<'comprador' | 'administrador'>('comprador');

  private readonly ruta = inject(ActivatedRoute);

  readonly misLicencias = signal<License[]>([]);

  /**
   * Por dónde va la puesta en marcha. Nulo mientras no ha contestado el
   * servidor: los pasos no se pintan a medias, se pintan cuando se saben.
   */
  readonly progreso = signal<ProgresoDeArranque | null>(null);
  readonly cargando = signal(true);

  /**
   * La pestaña de «Tus herramientas» que se ve. Se abre en Zotero si se vuelve
   * de autorizarlo: ahí es donde está el aviso de cómo fue.
   */
  readonly herramienta = signal<'scopus' | 'zotero' | 'r'>(
    this.ruta.snapshot.queryParamMap.has('zotero') ? 'zotero' : 'scopus',
  );

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

  /**
   * URL recién generada al canjear un código. Solo se puede mostrar en el
   * momento de crearla.
   *
   * La de «URL nueva» ya no sale aquí: cada acceso la pide desde la pestaña de
   * su producto, en «Por dónde vas», y la enseña en su propia ventana.
   */
  readonly urlNueva = signal<string | null>(null);
  readonly errorLicencia = signal<string | null>(null);
  readonly urlCopiada = signal(false);

  readonly codigo = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(6)],
  });
  readonly canjeando = signal(false);

  ngOnInit(): void {
    /*
     * El código que viene puesto en la URL.
     *
     * Lo manda la página de precios, que tiene el campo a la vista pero no
     * puede canjear: canjear pide sesión y la respuesta trae la URL del
     * conector, que solo se puede enseñar en el momento de crearla. Así que
     * allí se escribe y aquí se canjea, con el código ya escrito.
     *
     * Se rellena y nada más: el botón lo pulsa quien mira. Canjear solo por
     * llegar con un parámetro en la dirección significaría gastar el código
     * por abrir un enlace, y un enlace se abre por error o se comparte.
     *
     * Al administrador no le llega: no tiene este formulario.
     */
    const traido = this.ruta.snapshot.queryParamMap.get('codigo')?.trim();
    if (traido && this.modo() === 'comprador') {
      this.codigo.setValue(traido);
      this.codigo.markAsTouched();
    }

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
