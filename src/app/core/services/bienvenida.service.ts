import { Injectable, signal } from '@angular/core';

/** Lo que se acaba de canjear, para darle la bienvenida en el panel. */
export interface CanjeReciente {
  producto: string;
  /** La URL del conector. Nula si el código renovó un acceso que ya tenía. */
  url: string | null;
  renovada: boolean;
  hasta: string | null;
}

/**
 * El puente entre /planes, donde se canjea el código, y el panel, donde se da
 * la bienvenida.
 *
 * Quien canjea ya no se queda en /planes: se le lleva a su panel y allí se le
 * saluda y se le enseña el recorrido (pedido del 13-oct). La URL del conector
 * solo viaja en la respuesta del canje —del token se guarda el hash—, así que
 * tiene que cruzar con él de una página a otra.
 *
 * Vive en memoria y nada más: una URL de acceso no se deja en el
 * almacenamiento del navegador. Si se recarga la página antes de copiarla,
 * está en el correo y se puede generar otra desde «Por dónde vas».
 */
@Injectable({ providedIn: 'root' })
export class BienvenidaService {
  readonly pendiente = signal<CanjeReciente | null>(null);

  /**
   * El código que alguien pulsó «Canjear» sin sesión (26-oct). Al volver del
   * acceso o del registro, /planes lo canjea solo. En memoria también: abrir el
   * enlace del correo, sin más, sigue sin gastar el código.
   */
  private codigoTrasEntrar: string | null = null;

  recordarCanje(codigo: string): void {
    this.codigoTrasEntrar = codigo;
  }

  /** Si este es el código que se pidió canjear antes de entrar. Lo olvida al mirarlo. */
  tomarCanje(codigo: string): boolean {
    const era = this.codigoTrasEntrar === codigo;
    this.codigoTrasEntrar = null;
    return era;
  }

  anunciar(canje: CanjeReciente): void {
    this.pendiente.set(canje);
  }

  cerrar(): void {
    this.pendiente.set(null);
  }
}
