import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { environment } from '../../../environments/environment';
import { Plan } from '../../core/models/rewrite.model';
import { AuthService } from '../../core/services/auth.service';
import { BillingService } from '../../core/services/billing.service';
import { LicenseService } from '../../core/services/license.service';
import { RecorridoWeb } from '../../core/services/recorrido-web.service';
import {
  ResenaPublica,
  ResenaService,
  estrellas,
  nota,
} from '../../core/services/resena.service';
import { TourService } from '../../core/services/tour.service';
import { TOUR_WEB } from '../../shared/contenido/tour-de-la-web';
import {
  CIFRAS,
  FASES_ARTICULO,
  FASES_TESIS,
  RAZONES,
} from '../../shared/contenido/metodo';
import { LineasNoche } from '../../shared/layout/lineas-noche';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';
import { Contador } from './contador';
import { HeroNetwork } from './hero-network/hero-network';

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
  imports: [RouterLink, SiteHeader, SiteFooter, HeroNetwork, Contador, LineasNoche],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly billing = inject(BillingService);
  private readonly licencias = inject(LicenseService);
  private readonly resenasApi = inject(ResenaService);
  private readonly tour = inject(TourService);
  private readonly recorrido = inject(RecorridoWeb);
  protected readonly auth = inject(AuthService);

  readonly cifras = CIFRAS;
  /** El cierre ofrece WhatsApp solo si el entorno trae número. */
  readonly whatsapp = environment.whatsappUrl;
  readonly razones = RAZONES;

  readonly nombre = this.auth.fullName;
  readonly planes = signal<Plan[]>([]);

  readonly estrellas = estrellas;
  readonly nota = nota;

  /**
   * Las reseñas destacadas, con su resumen.
   *
   * Solo las que se eligen a mano desde el panel: la portada tiene sitio para
   * tres o cuatro, no para todas. Las demás están en /resenas, que es lo que
   * hace que estas se puedan creer.
   *
   * Sin ninguna destacada, la banda entera no se pinta. Un apartado de
   * testimonios vacío —o con una sola reseña— dice justo lo contrario de lo
   * que va a decir.
   */
  readonly resenas = signal<ResenaPublica[]>([]);
  private readonly totalResenas = signal(0);
  private readonly mediaResenas = signal<number | null>(null);

  /**
   * El «4,8 de 5», solo con unas cuantas detrás.
   *
   * Con dos reseñas eso no es una media, es una coincidencia con aspecto de
   * dato. Mismo criterio que la nota de los asesores.
   */
  readonly resumenDeResenas = computed(() => {
    const media = this.mediaResenas();
    if (media === null || this.totalResenas() < 5) return null;
    return { media, total: this.totalResenas() };
  });

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
        icono: 'birrete',
        titulo: 'Tesis',
        subtitulo: 'Si tienes que sustentar · pregrado, maestría o doctorado',
        destacado: 'El más elegido',
        texto:
          'De "no sé qué investigar" al abstract, capítulo por capítulo, con tus fuentes.',
        fases: FASES_TESIS,
        incluye: [
          'Tu tesis en un solo Word, en la norma que te pidan',
          'Con tus fuentes: Scopus, PDF, Zotero y más',
          'Análisis en R',
          'Videos guía',
        ],
        precio: this.precio(tesis),
        antes: this.precioAntes(tesis),
        desde: true,
        meses: this.meses(tesis),
        comprar: 'Empezar la ruta de tesis',
        enlace: '/metodo',
        verbo: 'Ver las 12 Skills',
      },
      articulo && {
        icono: 'documento',
        titulo: 'Artículo científico',
        subtitulo: 'Si quieres publicar en una revista indexada',
        destacado: null,
        texto:
          'De una idea a un manuscrito enviado a una revista real, con respuesta a los ' +
          'revisores.',
        fases: FASES_ARTICULO,
        incluye: [
          'Revista con cuartil verificado',
          'Manuscrito IMRyD en la norma de la revista',
          'Carta de presentación',
          'Respuesta a revisores',
        ],
        precio: this.precio(articulo),
        antes: this.precioAntes(articulo),
        desde: false,
        meses: this.meses(articulo),
        comprar: 'Empezar la ruta del artículo',
        enlace: '/articulo',
        verbo: 'Ver las 10 fases',
      },
    ].filter((ruta) => ruta !== null);
  });

  ngOnInit(): void {
    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });

    // Si falla, la banda no se pinta y la portada sigue entera: son opiniones,
    // no el precio.
    this.resenasApi.publicas(true).subscribe({
      next: ({ resenas, total, nota }) => {
        this.resenas.set(resenas.slice(0, 3));
        this.totalResenas.set(total);
        this.mediaResenas.set(nota);
      },
    });

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

    this.ofrecerElRecorrido();
  }

  /**
   * El recorrido de la web, la primera vez que alguien llega.
   *
   * A cualquiera, haya entrado o no: la portada es por donde entra todo el
   * mundo, y es de donde el recorrido arranca su vuelta por el sitio.
   *
   * La espera es porque media portada depende de lo que conteste el servidor
   * —los planes pintan las dos rutas, las licencias la banda de arriba— y los
   * pasos que señalan algo ausente se caen al empezar. Sin este respiro, el
   * recorrido empezaría cojo.
   */
  private ofrecerElRecorrido(): void {
    if (!this.tour.leToca(TOUR_WEB)) return;

    setTimeout(
      () =>
        this.recorrido.ofrecerElCompleto({
          conSesion: this.auth.isAuthenticated(),
          esAdmin: this.auth.hasRole('ADMIN'),
          tieneConector: this.tieneConector() === true,
        }),
      1200,
    );
  }

  /**
   * El acceso, en meses. En días («365 días de acceso») obligaba a dividir
   * mentalmente para saber si era un año.
   */
  meses(plan: Plan): string {
    const meses = Math.round(plan.durationDays / 30);
    return meses === 1 ? '1 mes' : `${meses} meses`;
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
