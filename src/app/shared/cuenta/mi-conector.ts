import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { License, ProgresoDeArranque } from '../../core/models/payment.model';
import { LicenseService } from '../../core/services/license.service';
import { TourService } from '../../core/services/tour.service';
import { TOUR_DEL_PANEL, TOUR_PANEL } from '../contenido/tour-del-panel';
import { MiTesis } from './mi-tesis';
import { MiMapaVosviewer } from './mi-mapa-vosviewer';
import { MiScopusPanel } from './mi-scopus';
import { MisFuentesPanel } from './mis-fuentes';
import { MiAnalisisR } from './mi-analisis-r';
import { MiAtlasTi } from './mi-atlas-ti';
import { MiZoteroPanel } from './mi-zotero';
import { MiMendeleyPanel } from './mi-mendeley';
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
 * Lo que cambia entre los dos usos es poco y cabe en `modo`: al administrador no
 * se le ofrece comprar lo que ya tiene. Los códigos ya no se canjean aquí sino
 * en /planes, que es el único sitio donde se hace.
 */
@Component({
  selector: 'app-mi-conector',
  imports: [
    MiAnalisisR,
    MiAtlasTi,
    RouterLink,
    MiTesis,
    MisFuentesPanel,
    MiScopusPanel,
    MiZoteroPanel,
    MiMendeleyPanel,
    MiMapaVosviewer,
    PasosDeArranque,
  ],
  templateUrl: './mi-conector.html',
  styleUrl: './mi-conector.css',
})
export class MiConector implements OnInit {
  private readonly licencias = inject(LicenseService);
  private readonly tour = inject(TourService);

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
   * La pestaña de «Tus herramientas» que se ve. Se abre en Zotero o en
   * Mendeley si se vuelve de autorizarlo: ahí es donde está el aviso de cómo fue.
   */
  readonly herramienta = signal<'scopus' | 'zotero' | 'mendeley' | 'r' | 'atlas' | 'mapa'>(
    this.ruta.snapshot.queryParamMap.has('zotero')
      ? 'zotero'
      : this.ruta.snapshot.queryParamMap.has('mendeley')
        ? 'mendeley'
        : 'scopus',
  );

  /**
   * Si ya abrió alguna vez la pestaña del mapa. Hasta entonces no se pinta:
   * ver la nota del panel en la plantilla. Se queda en verdadero para no
   * perder el mapa al cambiar de pestaña.
   */
  readonly mapaVisto = signal(false);

  /**
   * El recorrido guiado, a mano. El de la primera vez lo ofrece `ngOnInit`.
   */
  verElRecorrido(): void {
    this.tour.empezar(TOUR_PANEL, TOUR_DEL_PANEL);
  }

  abrirMapa(): void {
    this.herramienta.set('mapa');
    this.mapaVisto.set(true);
  }


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

  ngOnInit(): void {
    this.licencias.mine().subscribe({
      next: ({ licencias, progreso }) => {
        this.misLicencias.set(licencias);
        this.progreso.set(progreso);
        this.cargando.set(false);
        this.ofrecerElRecorrido();
      },
      error: () => {
        this.misLicencias.set([]);
        this.cargando.set(false);
      },
    });
  }

  /**
   * El recorrido de la primera vez.
   *
   * Solo al comprador y solo con acceso vigente: a quien no lo tiene, medio
   * panel no se le pinta y el recorrido se quedaría en dos pasos que no
   * explican nada. El administrador no está arrancando nada.
   *
   * La espera es porque «Por dónde vas» pide lo suyo al servidor por su cuenta
   * y todavía no está en pantalla: los pasos que señalan algo ausente se caen
   * al empezar, y sin este respiro se caerían los tres del medio.
   */
  private ofrecerElRecorrido(): void {
    if (this.modo() !== 'comprador' || !this.tieneAccesoVigente()) return;
    if (!this.tour.leToca(TOUR_PANEL)) return;

    setTimeout(() => this.tour.ofrecer(TOUR_PANEL, TOUR_DEL_PANEL), 900);
  }
}
