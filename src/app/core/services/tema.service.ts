import { Injectable, computed, signal } from '@angular/core';

export type Tema = 'claro' | 'oscuro';

/** La misma clave la lee el script de `index.html` antes de que arranque Angular. */
export const CLAVE_TEMA = 'tema';

/**
 * El modo claro u oscuro del sitio.
 *
 * Mientras la persona no elige, manda el de su sistema, y si lo cambia con la
 * página abierta, la página lo sigue. En cuanto pulsa el botón de la cabecera,
 * su elección queda guardada y gana al sistema en adelante.
 *
 * Lo que cambia los colores es el atributo `data-tema` de `<html>`: todas las
 * variables de `styles.css` cuelgan de él. El script de `index.html` lo pone
 * antes de pintar; este servicio lo mantiene al día después. Sin ese script,
 * quien prefiere el oscuro vería un fogonazo blanco en cada carga.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly consulta = window.matchMedia?.('(prefers-color-scheme: dark)');

  private readonly elegido = signal<Tema | null>(leerGuardado());
  private readonly delSistema = signal<Tema>(this.consulta?.matches ? 'oscuro' : 'claro');

  readonly tema = computed(() => this.elegido() ?? this.delSistema());

  constructor() {
    this.consulta?.addEventListener('change', (evento) => {
      this.delSistema.set(evento.matches ? 'oscuro' : 'claro');
      this.aplicar();
    });
    this.aplicar();
  }

  alternar(): void {
    const nuevo: Tema = this.tema() === 'oscuro' ? 'claro' : 'oscuro';
    this.elegido.set(nuevo);
    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // Navegación privada o almacenamiento bloqueado: vale para esta visita.
    }
    this.aplicar();
  }

  private aplicar(): void {
    document.documentElement.dataset['tema'] = this.tema();
  }
}

function leerGuardado(): Tema | null {
  try {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    return guardado === 'claro' || guardado === 'oscuro' ? guardado : null;
  } catch {
    return null;
  }
}
