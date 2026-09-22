import { DOCUMENT, Injectable, inject } from '@angular/core';

import { Parametros3DS } from '../models/payment.model';

/**
 * Culqi en el navegador: el formulario de pago (Checkout Custom) y la
 * verificación del banco (Culqi3DS).
 *
 * Lo que hace cada pieza, según la documentación oficial (docs.culqi.com,
 * «Culqi Checkout Custom» y «Culqi3DS v1», consultadas el 21-sep-2026):
 *
 *  - `https://js.culqi.com/checkout-js` define `CulqiCheckout`. Con la llave
 *    PÚBLICA abre un formulario de Culqi donde el cliente escribe su tarjeta o
 *    su código de Yape, y devuelve un token de un solo uso. Los datos de la
 *    tarjeta nunca pasan por esta web ni por nuestro servidor.
 *  - `https://3ds.culqi.com` define `Culqi3DS`: la huella del dispositivo que
 *    pide el antifraude y, si el banco lo exige, la ventana donde el cliente
 *    confirma la compra. El resultado llega por `postMessage`.
 *
 * El cobro lo hace siempre nuestro servidor, con la llave secreta. Aquí solo
 * se consigue el token y, si hace falta, los parámetros de 3DS.
 */

/** Lo que devuelve el formulario de Culqi al cerrarse con éxito o con error. */
export type ResultadoCheckout =
  | { tipo: 'token'; token: string; email: string | null }
  | { tipo: 'error'; mensaje: string };

interface CulqiInstancia {
  token?: { id: string; email?: string } | null;
  order?: unknown;
  error?: { user_message?: string; merchant_message?: string } | null;
  culqi?: () => void;
  open(): void;
  close(): void;
}

type CulqiCheckoutCtor = new (publicKey: string, config: object) => CulqiInstancia;

interface Culqi3DSGlobal {
  publicKey: string;
  settings: object;
  options: object;
  generateDevice(): Promise<string | null>;
  initAuthentication(tokenId: string): Promise<void>;
  reset(): void;
}

interface VentanaConCulqi {
  CulqiCheckout?: CulqiCheckoutCtor;
  Culqi3DS?: Culqi3DSGlobal;
}

const SCRIPT_CHECKOUT = 'https://js.culqi.com/checkout-js';
const SCRIPT_3DS = 'https://3ds.culqi.com';

/** Colores de la web (--color-primario), para que el formulario no desentone. */
const AZUL = '#1d4ed8';

@Injectable({ providedIn: 'root' })
export class CulqiSdkService {
  private readonly document = inject(DOCUMENT);
  private readonly cargas = new Map<string, Promise<void>>();

  private get ventana(): VentanaConCulqi {
    return this.document.defaultView as unknown as VentanaConCulqi;
  }

  /** Carga un script una sola vez por pestaña. */
  private cargar(src: string, comprobar: () => boolean): Promise<void> {
    const existente = this.cargas.get(src);
    if (existente) return existente;

    const carga = new Promise<void>((resolve, reject) => {
      const script = this.document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        if (comprobar()) {
          resolve();
        } else {
          this.cargas.delete(src);
          reject(new Error(`${src} cargó pero no definió lo esperado.`));
        }
      };
      script.onerror = () => {
        this.cargas.delete(src);
        script.remove();
        reject(new Error(`No se pudo cargar ${src}.`));
      };
      this.document.body.appendChild(script);
    });

    this.cargas.set(src, carga);
    return carga;
  }

  /** Las dos librerías, en paralelo. */
  preparar(): Promise<void> {
    return Promise.all([
      this.cargar(SCRIPT_CHECKOUT, () => Boolean(this.ventana.CulqiCheckout)),
      this.cargar(SCRIPT_3DS, () => Boolean(this.ventana.Culqi3DS)),
    ]).then(() => undefined);
  }

  /**
   * Abre el formulario de Culqi.
   *
   * `alResultado` se llama cada vez que el formulario termina algo: con el
   * token cuando el cliente paga, o con el error si Culqi rechaza lo escrito
   * (el cliente puede corregirlo y volver a intentar en el mismo formulario,
   * y entonces llega otra llamada). Culqi no avisa cuando se cierra sin pagar:
   * por eso no hay promesa que esperar ni pantalla que bloquear.
   */
  abrir(
    publicKey: string,
    datos: { amountCents: number; email: string | null },
    alResultado: (resultado: ResultadoCheckout) => void,
  ): void {
    const Ctor = this.ventana.CulqiCheckout;
    if (!Ctor) throw new Error('Culqi no está cargado.');

    const config = {
      settings: {
        title: 'Acosta | IA & Research',
        currency: 'PEN',
        amount: datos.amountCents,
      },
      client: datos.email ? { email: datos.email } : {},
      options: {
        lang: 'auto',
        installments: false,
        modal: true,
        paymentMethods: { tarjeta: true, yape: true },
        paymentMethodsSort: ['tarjeta', 'yape'],
      },
      appearance: {
        menuType: 'sidebar',
        buttonCardPayText: 'Pagar',
        defaultStyle: {
          bannerColor: AZUL,
          buttonBackground: AZUL,
          menuColor: AZUL,
          linksColor: AZUL,
          buttonTextColor: '#ffffff',
          priceColor: AZUL,
        },
      },
    };

    const culqi = new Ctor(publicKey, config);
    culqi.culqi = () => {
      if (culqi.token?.id) {
        const token = culqi.token.id;
        const email = culqi.token.email ?? null;
        culqi.close();
        alResultado({ tipo: 'token', token, email });
        return;
      }
      const error = culqi.error;
      alResultado({
        tipo: 'error',
        mensaje:
          error?.user_message ??
          error?.merchant_message ??
          'Culqi no pudo procesar los datos. Revísalos e inténtalo de nuevo.',
      });
    };
    culqi.open();
  }

  /**
   * Huella del dispositivo para el antifraude de Culqi. Si no se consigue, se
   * cobra sin ella: es un dato de apoyo, no un requisito del cargo.
   */
  async huella(publicKey: string): Promise<string | null> {
    const culqi3ds = this.ventana.Culqi3DS;
    if (!culqi3ds) return null;
    try {
      culqi3ds.publicKey = publicKey;
      return await culqi3ds.generateDevice();
    } catch {
      return null;
    }
  }

  /**
   * Verificación del banco (3-D Secure). Abre la ventana de Culqi3DS y espera
   * sus parámetros, que el servidor manda en el segundo intento de cobro.
   */
  verificar(
    publicKey: string,
    datos: { token: string; amountCents: number; email: string },
  ): Promise<Parametros3DS> {
    const culqi3ds = this.ventana.Culqi3DS;
    const ventana = this.document.defaultView;
    if (!culqi3ds || !ventana) return Promise.reject(new Error('Culqi3DS no está cargado.'));

    return new Promise<Parametros3DS>((resolve, reject) => {
      const alRecibir = (evento: MessageEvent) => {
        if (evento.origin !== ventana.location.origin) return;
        const respuesta = evento.data as { parameters3DS?: Parametros3DS; error?: string } | null;
        if (!respuesta || typeof respuesta !== 'object') return;

        if (respuesta.parameters3DS) {
          terminar();
          resolve(respuesta.parameters3DS);
        } else if (respuesta.error) {
          terminar();
          reject(new Error(respuesta.error));
        }
      };
      const terminar = () => {
        ventana.removeEventListener('message', alRecibir);
        culqi3ds.reset();
      };

      ventana.addEventListener('message', alRecibir);

      culqi3ds.publicKey = publicKey;
      culqi3ds.settings = {
        charge: {
          totalAmount: datos.amountCents,
          returnUrl: ventana.location.href,
          currency: 'PEN',
        },
        card: { email: datos.email },
      };
      culqi3ds.options = {
        showModal: true,
        showLoading: true,
        showIcon: true,
        style: { btnColor: AZUL, btnTextColor: '#FFFFFF' },
      };

      culqi3ds.initAuthentication(datos.token).catch((error: unknown) => {
        terminar();
        reject(error instanceof Error ? error : new Error('No se pudo iniciar la verificación.'));
      });
    });
  }
}
