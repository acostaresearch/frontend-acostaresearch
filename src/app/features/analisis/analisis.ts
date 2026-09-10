import { Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { environment } from '../../../environments/environment';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * Analizar los datos sin instalar nada.
 *
 * RStudio de verdad, servido desde una máquina nuestra y metido en esta página.
 * El tesista entra, sube su matriz de Excel y trabaja: no descarga R, no
 * descarga RStudio, no configura nada.
 *
 * POR QUÉ RSTUDIO Y NO R EN EL NAVEGADOR
 * --------------------------------------
 * Se probó WebR —R compilado a WebAssembly— y funcionaba: cargaba, instalaba
 * `psych` en 2,7 segundos y el análisis tardaba 0,6. Se retiró por una razón
 * que no arregla ninguna cantidad de código: **el jurado y el asesor piden
 * RStudio**. Un análisis hecho en otro sitio, por bien que salga, no le sirve
 * al tesista que tiene que declarar el software y enseñar cómo lo hizo.
 *
 * Esto sí es RStudio. La misma interfaz, los mismos scripts, la misma captura
 * de pantalla. Puede decir «usé RStudio» y es verdad.
 *
 * POR QUÉ EN OTRO SERVIDOR
 * ------------------------
 * Una sesión de RStudio es prácticamente una consola en la máquina que la
 * sirve: `system()` es una función normal de R. En la máquina de la API viven
 * los secretos, los capítulos de todos y los comprobantes de pago. Por eso
 * RStudio va en una aparte y vacía, y por eso `rstudioUrl` es otro dominio.
 *
 * SIN CONFIGURAR, ESTA PÁGINA NO EXISTE
 * -------------------------------------
 * `rstudioUrl` vacío quita la ruta del router. Nadie llega aquí a ver un hueco:
 * una función a medio conectar enseña a desconfiar del resto de la plataforma.
 */
@Component({
  selector: 'app-analisis',
  imports: [SiteHeader, SiteFooter],
  templateUrl: './analisis.html',
  styleUrl: './analisis.css',
})
export class Analisis {
  private readonly sanitizer = inject(DomSanitizer);

  /**
   * La dirección del iframe, marcada como de confianza.
   *
   * Angular bloquea las URL de iframe por defecto, y hace bien: un iframe con
   * una dirección que venga de fuera es una vía de entrada. Esta NO viene de
   * fuera —la fija el build desde `RSTUDIO_URL`, que solo puede poner quien
   * despliega—, así que marcarla de confianza es decir lo que ya es cierto.
   */
  readonly url: SafeResourceUrl | null = environment.rstudioUrl
    ? this.sanitizer.bypassSecurityTrustResourceUrl(environment.rstudioUrl)
    : null;

  /** Para el enlace de «ábrelo en una pestaña», que no pasa por el sanitizador. */
  readonly urlCruda = environment.rstudioUrl;

  /**
   * Si el iframe llegó a cargar.
   *
   * RStudio Server bloquea el enmarcado salvo que se le configure
   * `www-frame-origin`, y la directiva que usa —`ALLOW-FROM`— está obsoleta:
   * los navegadores modernos la ignoran. Cuando eso pasa, el iframe se queda
   * EN BLANCO y no lanza ningún error que se pueda capturar.
   *
   * Por eso se cuenta el tiempo en vez de escuchar un fallo: si a los ocho
   * segundos no ha avisado de que cargó, se enseña la salida —abrirlo en una
   * pestaña— en lugar de dejar al tesista mirando un rectángulo vacío sin
   * saber si tarda o está roto.
   */
  readonly cargado = signal(false);
  readonly tardaDemasiado = signal(false);

  readonly hayProblema = computed(() => this.tardaDemasiado() && !this.cargado());

  constructor() {
    setTimeout(() => this.tardaDemasiado.set(true), 8000);
  }

  alCargar(): void {
    this.cargado.set(true);
  }
}
