import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export type Consentimiento = 'si' | 'no';

/** Lo que eligió la persona en el aviso de cookies. Solo vive en su navegador. */
export const CLAVE_CONSENTIMIENTO = 'consentimiento-analitica';

/**
 * Parámetros de la dirección que sí viajan a Google Analytics: los de las
 * campañas, para saber de dónde vino la visita. Todo lo demás se quita, porque
 * hay pantallas con datos en la dirección (`/auth/verificar-email?email=…`).
 */
const PARAMETROS_DE_CAMPANA = /^(utm_[a-z_]+|gclid|fbclid|ttclid)$/;

type Gtag = (...argumentos: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

/**
 * Google Analytics 4, solo si la persona lo acepta en el aviso de cookies.
 *
 * Mientras no acepta, `gtag.js` no se descarga y no se pone ninguna cookie: no
 * basta con el modo de consentimiento de Google, que carga el script igual.
 * Sin identificador (`GA_MEASUREMENT_ID` vacío, como en local) no hay aviso ni
 * medición.
 *
 * Angular es una sola página, así que la vista de cada pantalla la manda este
 * servicio al cambiar de ruta. Por eso en GA4 hay que tener APAGADO «Cambios de
 * página basados en eventos del historial del navegador» de la medición
 * mejorada: si no, cada pantalla se contaría dos veces y con la dirección
 * entera.
 *
 * Las cuentas de administrador no se miden: sus visitas al panel inflarían las
 * cifras de un negocio en el que el dueño entra a diario.
 */
@Injectable({ providedIn: 'root' })
export class AnaliticaService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly id = environment.analyticsId;

  private readonly elegido = signal<Consentimiento | null>(leerGuardado());
  private cargado = false;

  /** El aviso sale si hay medición configurada y la persona aún no eligió. */
  readonly pendiente = computed(() => Boolean(this.id) && this.elegido() === null);

  /** Se llama una vez al arrancar. Si ya aceptó en otra visita, mide. */
  iniciar(): void {
    if (this.id && this.elegido() === 'si') this.cargar();
  }

  aceptar(): void {
    this.guardar('si');
    this.cargar();
  }

  rechazar(): void {
    this.guardar('no');
    if (this.cargado) {
      window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
      borrarCookiesDeGoogle();
    }
  }

  /** Vuelve a enseñar el aviso, desde «Preferencias de cookies» del pie. */
  reabrir(): void {
    try {
      localStorage.removeItem(CLAVE_CONSENTIMIENTO);
    } catch {
      // Almacenamiento bloqueado: el aviso sale igual en esta visita.
    }
    this.elegido.set(null);
  }

  /** Un evento de GA4 (`sign_up`, `purchase`…). Sin consentimiento no hace nada. */
  evento(nombre: string, parametros: Record<string, unknown> = {}): void {
    if (!this.cargado || this.esAdmin()) return;
    window.gtag?.('event', nombre, parametros);
  }

  private guardar(valor: Consentimiento): void {
    this.elegido.set(valor);
    try {
      localStorage.setItem(CLAVE_CONSENTIMIENTO, valor);
    } catch {
      // Navegación privada: vale para esta visita.
    }
  }

  private cargar(): void {
    if (this.cargado || !this.id) return;
    this.cargado = true;

    window.dataLayer = window.dataLayer ?? [];
    // gtag.js lee `arguments`, no un array: tiene que ser una función clásica.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };

    // Solo la analítica: el aviso no pide permiso para publicidad.
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    window.gtag('js', new Date());
    window.gtag('config', this.id, { send_page_view: false, page_location: direccionLimpia() });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(this.id)}`;
    document.head.appendChild(script);

    this.vista();
    this.router.events
      .pipe(filter((evento) => evento instanceof NavigationEnd))
      .subscribe(() => this.vista());
  }

  private vista(): void {
    if (this.esAdmin()) return;
    const pagina = direccionLimpia();
    // `set` y no solo el evento: los de la medición mejorada (clics, scroll)
    // también llevan la dirección, y tienen que llevar la limpia.
    window.gtag?.('set', { page_location: pagina });
    window.gtag?.('event', 'page_view', { page_location: pagina, page_title: document.title });
  }

  private esAdmin(): boolean {
    return this.auth.hasRole('ADMIN', 'ADMIN_PAIS');
  }
}

function leerGuardado(): Consentimiento | null {
  try {
    const guardado = localStorage.getItem(CLAVE_CONSENTIMIENTO);
    return guardado === 'si' || guardado === 'no' ? guardado : null;
  } catch {
    return null;
  }
}

/** La dirección actual sin `#` ni más parámetros que los de campaña. */
export function direccionLimpia(url: string = location.href): string {
  const direccion = new URL(url);
  for (const clave of [...direccion.searchParams.keys()]) {
    if (!PARAMETROS_DE_CAMPANA.test(clave)) direccion.searchParams.delete(clave);
  }
  direccion.hash = '';
  return direccion.toString();
}

/** Las cookies `_ga` y `_ga_<id>` que puso gtag.js, en este dominio y en el padre. */
function borrarCookiesDeGoogle(): void {
  const dominio = location.hostname.replace(/^www\./, '');
  for (const par of document.cookie.split(';')) {
    const nombre = par.split('=')[0].trim();
    if (!nombre.startsWith('_ga')) continue;
    for (const donde of ['', `; domain=${dominio}`, `; domain=.${dominio}`]) {
      document.cookie = `${nombre}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${donde}`;
    }
  }
}
