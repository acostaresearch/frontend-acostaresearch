import { DOCUMENT, Injectable, inject } from '@angular/core';

import { environment } from '../../../environments/environment';

/** Lo poco que usamos de la librería de Google, para no depender de `any`. */
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (respuesta: { credential: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }): void;
      renderButton(
        contenedor: HTMLElement,
        opciones: {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'small' | 'medium' | 'large';
          text?: 'signin_with' | 'signup_with' | 'continue_with';
          shape?: 'rectangular' | 'pill';
          logo_alignment?: 'left' | 'center';
          width?: number;
          locale?: string;
        },
      ): void;
    };
  };
}

const SCRIPT = 'https://accounts.google.com/gsi/client';

/**
 * Acceso con Google.
 *
 * La librería de Google se carga UNA sola vez y bajo demanda: son ~90 KB de un
 * tercero, y quien nunca abre el login no tiene por qué descargarlos. La misma
 * promesa se reparte entre las dos pantallas que la piden.
 *
 * Sin `googleClientId` configurado el servicio se declara no disponible y las
 * pantallas ocultan el botón, igual que hace PayPal. Es preferible a mostrar un
 * botón que no puede funcionar.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuthService {
  private readonly documento = inject(DOCUMENT);
  private cargando: Promise<GoogleIdentity> | null = null;

  readonly clientId = environment.googleClientId;

  get disponible(): boolean {
    return Boolean(this.clientId);
  }

  /**
   * Dibuja el botón oficial de Google dentro del contenedor.
   *
   * Tiene que ser el suyo: el diseño y el texto los fija Google en sus
   * condiciones de marca, y un botón propio que abriera el flujo por debajo
   * incumpliría esas condiciones además de romperse en cada cambio suyo.
   */
  async render(
    contenedor: HTMLElement,
    onCredential: (credential: string) => void,
    texto: 'signin_with' | 'signup_with' | 'continue_with' = 'continue_with',
  ): Promise<void> {
    if (!this.disponible) return;

    const google = await this.cargar();

    google.accounts.id.initialize({
      client_id: this.clientId,
      callback: ({ credential }) => onCredential(credential),
      // Nada de aparecer solo: el usuario pulsa cuando quiere entrar.
      auto_select: false,
      cancel_on_tap_outside: true,
    });

    google.accounts.id.renderButton(contenedor, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: texto,
      shape: 'rectangular',
      logo_alignment: 'left',
      width: contenedor.offsetWidth || 320,
      locale: 'es',
    });
  }

  private cargar(): Promise<GoogleIdentity> {
    if (this.cargando) return this.cargando;

    this.cargando = new Promise<GoogleIdentity>((resolver, rechazar) => {
      const ventana = this.documento.defaultView as (Window & { google?: GoogleIdentity }) | null;
      if (ventana?.google) {
        resolver(ventana.google);
        return;
      }

      const etiqueta = this.documento.createElement('script');
      etiqueta.src = SCRIPT;
      etiqueta.async = true;
      etiqueta.defer = true;
      etiqueta.onload = () => {
        const cargado = (this.documento.defaultView as Window & { google?: GoogleIdentity })?.google;
        if (cargado) resolver(cargado);
        else rechazar(new Error('La librería de Google cargó pero no se inicializó.'));
      };
      etiqueta.onerror = () => {
        // Si falla, se olvida la promesa para que el siguiente intento vuelva a
        // pedir el script en vez de heredar el error para siempre.
        this.cargando = null;
        rechazar(new Error('No se pudo cargar el acceso con Google.'));
      };

      this.documento.head.appendChild(etiqueta);
    });

    return this.cargando;
  }
}
