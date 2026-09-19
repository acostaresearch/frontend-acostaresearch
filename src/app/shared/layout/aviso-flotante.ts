import {
  Component,
  DestroyRef,
  ModelSignal,
  effect,
  inject,
  model,
  untracked,
} from '@angular/core';

import { AvisosService, TipoAviso } from '../../core/services/avisos.service';

/**
 * Enlaza las señales de mensaje de una página con la pila de avisos del sitio.
 *
 * No pinta nada donde se coloca: cuando `error`, `aviso` o `info` traen texto,
 * lo manda a `AvisosService`, que lo enseña flotando arriba (`app-avisos`).
 * Cuando alguien cierra el aviso, la señal vuelve a `null`; y si la página la
 * limpia antes (porque reintenta, por ejemplo), el aviso se retira solo.
 *
 * `<app-aviso-flotante [(error)]="error" [(aviso)]="aviso" />`
 */
@Component({
  selector: 'app-aviso-flotante',
  template: '',
})
export class AvisoFlotante {
  readonly error = model<string | null | undefined>(null);
  readonly aviso = model<string | null | undefined>(null);
  readonly info = model<string | null | undefined>(null);

  private readonly avisos = inject(AvisosService);

  constructor() {
    this.enlazar('error', this.error);
    this.enlazar('exito', this.aviso);
    this.enlazar('info', this.info);
  }

  private enlazar(tipo: TipoAviso, senal: ModelSignal<string | null | undefined>): void {
    let id: number | null = null;
    let destruido = false;
    const retirar = () => {
      if (id !== null) this.avisos.quitar(id);
      id = null;
    };

    effect(() => {
      const texto = senal();
      untracked(() => {
        retirar();
        if (texto) {
          const este = this.avisos.mostrar(tipo, texto, () => {
            if (id === este) id = null;
            // Con la página ya cerrada no queda señal a la que avisar.
            if (!destruido) senal.set(null);
          });
          id = este;
        }
      });
    });

    // Si la página se va, sus avisos de error se van con ella; los de éxito
    // se dejan terminar su tiempo, que suelen anunciar justo el cambio de página.
    inject(DestroyRef).onDestroy(() => {
      destruido = true;
      if (tipo === 'error') retirar();
    });
  }
}
