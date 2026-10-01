import { Injectable, computed, signal } from '@angular/core';

/**
 * Dónde se recuerda el carrito entre visitas: solo los códigos de los planes.
 *
 * Los precios NO se guardan: los pone el catálogo de `/planes` al pintar. Un
 * carrito con precios de la semana pasada enseñaría una cifra y cobraría otra.
 */
const CLAVE_CARRITO = 'acosta.carrito';

function leer(): string[] {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_CARRITO) ?? '[]');
    return Array.isArray(guardado) ? guardado.filter((c) => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function guardar(codigos: string[]): void {
  try {
    if (codigos.length > 0) localStorage.setItem(CLAVE_CARRITO, JSON.stringify(codigos));
    else localStorage.removeItem(CLAVE_CARRITO);
  } catch {
    // Navegación privada o almacenamiento bloqueado: el carrito vale para esta visita.
  }
}

/**
 * El carrito: los productos que el comprador va juntando para pagarlos de una vez.
 *
 * Vive aquí y no en `/planes` porque lo enseña también la cabecera —un icono
 * con el número— en cualquier página. Solo guarda códigos de plan; qué es cada
 * uno y cuánto cuesta lo sabe el catálogo.
 */
@Injectable({ providedIn: 'root' })
export class CarritoService {
  private readonly codigosInterno = signal<string[]>(leer());

  readonly codigos = this.codigosInterno.asReadonly();
  readonly cantidad = computed(() => this.codigosInterno().length);

  tiene(codigo: string): boolean {
    return this.codigosInterno().includes(codigo);
  }

  /** Lo mete o lo saca. Un producto va una vez: dos licencias iguales no suman nada. */
  alternar(codigo: string): void {
    this.cambiar((codigos) =>
      codigos.includes(codigo) ? codigos.filter((c) => c !== codigo) : [...codigos, codigo],
    );
  }

  /** Saca lo que se acaba de pagar, se haya pagado junto o suelto. */
  quitar(codigos: string[]): void {
    this.cambiar((actuales) => actuales.filter((c) => !codigos.includes(c)));
  }

  /** Deja solo lo que sigue a la venta: lo retirado del catálogo desaparece solo. */
  conservar(vendibles: string[]): void {
    this.cambiar((actuales) => actuales.filter((c) => vendibles.includes(c)));
  }

  vaciar(): void {
    this.cambiar(() => []);
  }

  private cambiar(paso: (codigos: string[]) => string[]): void {
    const antes = this.codigosInterno();
    const despues = paso(antes);
    if (despues.length === antes.length && despues.every((c, i) => c === antes[i])) return;
    this.codigosInterno.set(despues);
    guardar(despues);
  }
}
