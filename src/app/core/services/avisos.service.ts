import { Injectable, signal } from '@angular/core';

export type TipoAviso = 'error' | 'exito' | 'info';

export interface Aviso {
  readonly id: number;
  readonly tipo: TipoAviso;
  readonly texto: string;
  /** Lo que hay que hacer cuando se va, además de quitarlo de la pila. */
  readonly alCerrar?: () => void;
}

/** Lo que tarda en irse un aviso que no es un error. */
const DURACION_MS = 6000;

/**
 * La pila de avisos que bajan desde arriba, compartida por todo el sitio.
 *
 * Una sola pila montada en la raíz (`app-avisos`): si dos partes de la misma
 * página avisan a la vez, los avisos se apilan en vez de taparse. Los errores
 * se quedan hasta que se cierran, porque hay que leerlos; el resto se va solo.
 *
 * Las páginas no suelen llamarlo directamente: enlazan sus señales de siempre
 * con `<app-aviso-flotante [(error)]="error" [(aviso)]="aviso" />`.
 */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  private readonly lista = signal<readonly Aviso[]>([]);
  readonly avisos = this.lista.asReadonly();

  private siguienteId = 1;
  private readonly relojes = new Map<number, ReturnType<typeof setTimeout>>();

  /** Enseña un aviso y devuelve su id, para poder quitarlo luego. */
  mostrar(tipo: TipoAviso, texto: string, alCerrar?: () => void): number {
    const id = this.siguienteId++;
    this.lista.update((avisos) => [...avisos, { id, tipo, texto, alCerrar }]);
    if (tipo !== 'error') {
      this.relojes.set(
        id,
        setTimeout(() => this.cerrar(id), DURACION_MS),
      );
    }
    return id;
  }

  error(texto: string): number {
    return this.mostrar('error', texto);
  }

  exito(texto: string): number {
    return this.mostrar('exito', texto);
  }

  info(texto: string): number {
    return this.mostrar('info', texto);
  }

  /** Lo cierra quien lo lee, o su reloj: avisa a quien lo puso. */
  cerrar(id: number): void {
    const aviso = this.lista().find((a) => a.id === id);
    if (!aviso) return;
    this.quitar(id);
    aviso.alCerrar?.();
  }

  /** Lo retira quien lo puso, sin volver a avisarle. */
  quitar(id: number): void {
    const reloj = this.relojes.get(id);
    if (reloj) clearTimeout(reloj);
    this.relojes.delete(id);
    this.lista.update((avisos) => avisos.filter((a) => a.id !== id));
  }
}
