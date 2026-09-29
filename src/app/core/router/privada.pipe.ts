import { Pipe, PipeTransform } from '@angular/core';

import { Privada, rutaPrivada } from './rutas-privadas';

/**
 * La dirección de esta sesión para una página privada, en las plantillas:
 * `[routerLink]="'perfil' | privada"`. Impura a propósito: las claves cambian
 * al entrar y salir, y leerlas cuesta lo mismo que no leerlas.
 */
@Pipe({ name: 'privada', pure: false })
export class PrivadaPipe implements PipeTransform {
  transform(pagina: Privada): string {
    return rutaPrivada(pagina);
  }
}
