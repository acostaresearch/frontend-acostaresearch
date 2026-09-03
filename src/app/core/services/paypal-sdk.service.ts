import { DOCUMENT, Injectable, inject } from '@angular/core';

import { environment } from '../../../environments/environment';

/** Lo poco del SDK de PayPal que usamos, tipado para no acabar en `any`. */
export interface PaypalButtonsConfig {
  style?: Record<string, string | number>;
  /** Devuelve el `orderID` que abrió nuestro servidor. */
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void> | void;
  onCancel?: (data: { orderID?: string }) => void;
  onError?: (error: unknown) => void;
}

export interface PaypalButtons {
  render(container: HTMLElement): Promise<void>;
  close(): void;
}

export interface PaypalNamespace {
  Buttons(config: PaypalButtonsConfig): PaypalButtons;
}

@Injectable({ providedIn: 'root' })
export class PaypalSdkService {
  private readonly document = inject(DOCUMENT);

  /** Una sola carga por pestaña, compartida por todas las vistas. */
  private carga: Promise<PaypalNamespace> | null = null;

  get configurado(): boolean {
    return Boolean(environment.paypalClientId);
  }

  load(currency = 'USD'): Promise<PaypalNamespace> {
    if (!this.configurado) {
      return Promise.reject(new Error('Falta paypalClientId en environment.'));
    }

    this.carga ??= new Promise<PaypalNamespace>((resolve, reject) => {
      const parametros = new URLSearchParams({
        'client-id': environment.paypalClientId,
        currency,
        intent: 'capture',
        components: 'buttons',
        locale: 'es_PE',
        // Sin esto, PayPal ofrece financiación y tarjetas que en Perú no aplican.
        'disable-funding': 'paylater,credit',
      });

      const script = this.document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?${parametros.toString()}`;
      script.async = true;

      script.onload = () => {
        const paypal = (window as unknown as { paypal?: PaypalNamespace }).paypal;
        if (paypal) {
          resolve(paypal);
        } else {
          this.carga = null;
          reject(new Error('El SDK de PayPal cargó pero no se registró.'));
        }
      };

      script.onerror = () => {
        // Se limpia la promesa para que un segundo intento vuelva a probar.
        this.carga = null;
        reject(new Error('No se pudo cargar el SDK de PayPal.'));
      };

      this.document.head.appendChild(script);
    });

    return this.carga;
  }
}
