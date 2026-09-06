import { Injectable, signal } from '@angular/core';

/** Cómo se pinta la ventana: cambia el color del icono y del botón de confirmar. */
export type TonoDialogo = 'normal' | 'peligro' | 'aviso';

/** Un campo de texto dentro de la ventana, para cuando además hay que escribir algo. */
export interface CampoDialogo {
  etiqueta: string;
  /** Lo que aparece escrito de entrada. */
  valor?: string;
  placeholder?: string;
  /** Si es true, no se puede confirmar con el campo vacío. */
  obligatorio?: boolean;
  maxlength?: number;
}

export interface OpcionesDialogo {
  titulo: string;
  /** Párrafo principal. Los saltos de línea separan párrafos. */
  mensaje?: string;
  /** Segunda línea, en gris y más pequeña: el matiz que casi nadie lee. */
  nota?: string;
  confirmar?: string;
  cancelar?: string;
  tono?: TonoDialogo;
  campo?: CampoDialogo;
}

/** Lo que el componente necesita para pintarse: las opciones ya con sus valores por defecto. */
export interface DialogoAbierto extends OpcionesDialogo {
  confirmar: string;
  cancelar: string;
  tono: TonoDialogo;
}

/**
 * Las ventanas de confirmar del sitio.
 *
 * Sustituye a `confirm()` y `prompt()` del navegador. No es capricho estético:
 * los diálogos nativos escriben el dominio en la cabecera —«acostaresearch.com
 * dice»— con la tipografía del sistema, no se pueden maquetar y en algunos
 * navegadores se pueden silenciar. Aquí la ventana es nuestra.
 *
 * Solo hay una abierta a la vez. Si llega una segunda petición mientras hay
 * otra en pantalla, la anterior se resuelve como cancelada antes de abrirse la
 * nueva: así ninguna promesa queda colgada esperando para siempre.
 */
@Injectable({ providedIn: 'root' })
export class DialogoService {
  /** La ventana en pantalla, o null si no hay ninguna. Lo lee el componente. */
  readonly abierto = signal<DialogoAbierto | null>(null);

  /** Quien espera la respuesta de la ventana abierta. */
  private resolver: ((respuesta: string | null) => void) | null = null;

  /**
   * Pregunta sí o no.
   *
   * @returns true si se confirmó; false si se canceló, se pulsó Escape o se
   *   cerró desde fuera.
   */
  confirmar(opciones: OpcionesDialogo): Promise<boolean> {
    return this.abrir({ ...opciones, campo: undefined }).then((r) => r !== null);
  }

  /**
   * Pide escribir algo.
   *
   * @returns lo escrito —puede ser cadena vacía si el campo no es obligatorio—
   *   o null si se canceló.
   */
  pedirTexto(opciones: OpcionesDialogo & { campo: CampoDialogo }): Promise<string | null> {
    return this.abrir(opciones);
  }

  /** Responde la ventana abierta. Lo llama el componente. */
  responder(respuesta: string | null): void {
    const resolver = this.resolver;
    this.resolver = null;
    this.abierto.set(null);
    resolver?.(respuesta);
  }

  private abrir(opciones: OpcionesDialogo): Promise<string | null> {
    // Si había otra en pantalla, se cierra como cancelada.
    if (this.resolver) this.responder(null);

    this.abierto.set({
      ...opciones,
      confirmar: opciones.confirmar ?? 'Continuar',
      cancelar: opciones.cancelar ?? 'Cancelar',
      tono: opciones.tono ?? 'normal',
    });

    return new Promise<string | null>((resolve) => {
      this.resolver = resolve;
    });
  }
}
