import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Plan } from '../../core/models/rewrite.model';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { LicenseService } from '../../core/services/license.service';
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
  private readonly licencias = inject(LicenseService);
  protected readonly auth = inject(AuthService);

  readonly cifras = CIFRAS;
  readonly razones = RAZONES;

  readonly nombre = this.auth.fullName;
  readonly planes = signal<Plan[]>([]);

  /**
   * Si quien mira tiene conector. Nulo mientras no ha contestado el servidor.
   *
   * No se pregunta para el administrador: su banda no depende de esto y
   * pedírselo sería un viaje para nada.
   */
  private readonly tieneConector = signal<boolean | null>(null);

  /**
   * Qué banda de saludo toca a quien ya entró.
   *
   * La misma frase valía para los tres y no era verdad para ninguno salvo el
   * comprador. Al administrador se le mandaba a «Mi perfil» cuando su sitio es
   * el panel —igual que hace la cabecera—, y a quien acaba de crear la cuenta
   * se le prometía «tu conector y tus compras» sin tener ni lo uno ni lo otro:
   * llegaba a un perfil vacío sin que nadie le dijera qué le faltaba.
   *
   * Mientras no se sabe se saluda y nada más. Es un instante, pero enseñar el
   * enlace que luego cambia deja peor sabor que enseñarlo un momento después.
   */
  readonly saludo = computed<'admin' | 'cliente' | 'nuevo' | 'cargando' | null>(() => {
    if (!this.auth.isAuthenticated()) return null;
    if (this.auth.hasRole('ADMIN')) return 'admin';

    const conector = this.tieneConector();
    if (conector === null) return 'cargando';
    return conector ? 'cliente' : 'nuevo';
  });

  /**
   * Las dos rutas, con su precio de verdad.
   *
   * El precio sale del plan que devuelve la API, nunca escrito aquí: es el
   * mismo número con el que se cobra, y si la portada dijera una cifra y el
   * cobro otra, el problema no sería de maquetación.
   *
   * De tesis hay dos planes —con Humanizador y sin él—, así que se anuncia
   * «desde» el más barato: prometer el precio bajo y cobrar el alto sería
   * mentir, y enseñar el alto espantaría a quien no necesita el Humanizador.
   * La elección entre los dos se hace en «Planes», que es donde se compara.
   *
   * Una ruta cuyo plan no exista no se pinta. Es la única forma honesta de
   * fallar: enseñar una tarjeta que lleva a un producto retirado es peor que
   * no enseñarla.
   */
  readonly rutas = computed(() => {
    const de = (code: string) => this.planes().find((p) => p.code === code) ?? null;

    const tesis = de('METODO_9_SKILLS') ?? de('METODO_DE_TESIS_HUMANIZADOR');
    const articulo = de('ARTICULO_SCIENTIFICOS');

    return [
      tesis && {
        titulo: 'Tesis',
        texto:
          'De «no sé qué investigar» al abstract, capítulo por capítulo. Cada fase cierra con ' +
          'un Word en APA 7 que puedes llevar a asesoría. Incluye 30 minutos conmigo.',
        detalle: `9 fases · ${tesis.durationDays} días de acceso`,
        precio: this.precio(tesis),
        antes: this.precioAntes(tesis),
        desde: true,
        enlace: '/metodo',
        verbo: 'Ver las 11 Skills',
      },
      articulo && {
        titulo: 'Artículo científico',
        texto:
          'De una idea a un manuscrito enviado a una revista real: se elige el destino, se ' +
          'escribe en estructura IMRyD y se responde a los revisores. Incluye el Humanizador.',
        detalle: `10 fases · ${articulo.durationDays} días de acceso`,
        precio: this.precio(articulo),
        antes: this.precioAntes(articulo),
        desde: false,
        enlace: '/articulo',
        verbo: 'Ver la ruta completa',
      },
    ].filter((ruta) => ruta !== null);
  });

  ngOnInit(): void {
    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });

    if (this.auth.isAuthenticated() && !this.auth.hasRole('ADMIN')) {
      this.licencias.mine().subscribe({
        // Cuenta cualquier licencia, incluidas las caducadas o revocadas: quien
        // ya compró una vez no es a quien hay que invitar a comprar, es a quien
        // hay que llevar a su perfil, que es donde se ve en qué estado está.
        next: ({ licencias }) => this.tieneConector.set(licencias.length > 0),
        // Si la consulta falla no se empuja a comprar a quien quizá ya compró.
        // Se le manda al perfil, que es el enlace que nunca sobra.
        error: () => this.tieneConector.set(true),
      });
    }
  }

  precio(plan: Plan): string {
    return `S/ ${(plan.priceCents / 100).toFixed(0)}`;
  }

  /**
   * Lo que costaba antes, para tacharlo. Null = este plan no está de oferta.
   *
   * Sale del catálogo, igual que el precio: si mañana se quita la oferta desde
   * el panel, la portada deja de anunciarla sola. Se exige que sea mayor que
   * el vigente porque un tachado por debajo del precio que se cobra sería
   * anunciar una rebaja al revés.
   */
  precioAntes(plan: Plan): string | null {
    const antes = plan.listPriceCents;
    if (!antes || antes <= plan.priceCents) return null;
    return `S/ ${(antes / 100).toFixed(0)}`;
  }
}
