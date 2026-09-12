import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { toApiError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import {
  ColeccionDeZotero,
  EstadoDeZotero,
  ZoteroService,
} from '../../core/services/zotero.service';

/**
 * Conectar el Zotero del propio tesista.
 *
 * TRES DECISIONES QUE SE VEN EN LA PANTALLA
 * -----------------------------------------
 * 1. Se elige UNA COLECCIÓN, no la biblioteca. La de un tesista lleva años de
 *    asignaturas encima, y traerla entera le llenaría sus propias búsquedas de
 *    ruido que él no puso. Por eso, conectar y elegir son dos pasos: al volver
 *    de Zotero no hay nada importado todavía.
 *
 * 2. Nunca se le pide una clave de API. Autoriza en zotero.org y la clave la
 *    emite Zotero a su nombre. Aquí no se enseña, ni entera ni con asteriscos:
 *    no la tenemos y no debe pasar por el navegador.
 *
 * 3. Desconectar no borra sus fuentes. Están citadas en sus capítulos, y
 *    llevárselas le dejaría la tesis con claves que no resuelven. Se dice en la
 *    propia ventana de confirmar, porque es justo lo que teme quien la abre.
 */
@Component({
  selector: 'app-mi-zotero',
  imports: [DatePipe],
  templateUrl: './mi-zotero.html',
  styleUrl: './mi-zotero.css',
})
export class MiZoteroPanel implements OnInit {
  private readonly zotero = inject(ZoteroService);
  private readonly dialogos = inject(DialogoService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly estado = signal<EstadoDeZotero | null>(null);
  readonly colecciones = signal<ColeccionDeZotero[] | null>(null);

  readonly cargando = signal(true);
  readonly conectando = signal(false);
  readonly trayendo = signal(false);
  readonly error = signal<string | null>(null);
  /** El parte de la última pasada pedida a mano. */
  readonly parte = signal<string | null>(null);

  /**
   * Lo que trajo la vuelta desde zotero.org: ok, cancelado o error.
   *
   * Llega en la dirección porque quien redirige es Zotero y no nosotros. Se lee
   * una vez y se limpia de la barra: recargar la página no debería volver a
   * anunciar algo que pasó hace diez minutos.
   */
  readonly vuelta = signal<string | null>(null);

  ngOnInit(): void {
    const resultado = this.ruta.snapshot.queryParamMap.get('zotero');
    if (resultado) {
      this.vuelta.set(resultado);
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { zotero: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    this.cargar();
  }

  private cargar(): void {
    this.zotero.estado().subscribe({
      next: (estado) => {
        this.estado.set(estado);
        this.cargando.set(false);
        // Conectado y sin colección es un intercambio a medias: la lista se
        // pide sola para que no tenga que buscar dónde pulsar.
        if (estado.conectado && !estado.coleccion) this.pedirColecciones();
      },
      error: () => {
        this.estado.set(null);
        this.cargando.set(false);
      },
    });
  }

  conectar(): void {
    if (this.conectando()) return;
    this.conectando.set(true);
    this.error.set(null);

    this.zotero.conectar().subscribe({
      next: ({ url }) => {
        // Navegación completa y en esta misma pestaña: al terminar, Zotero
        // devuelve al tesista aquí. Una pestaña nueva lo dejaría mirando la
        // vieja, que no se entera de nada.
        window.location.href = url;
      },
      error: (fallo) => {
        this.conectando.set(false);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  pedirColecciones(): void {
    this.error.set(null);
    this.zotero.colecciones().subscribe({
      next: (lista) => this.colecciones.set(lista),
      error: (fallo) => {
        this.colecciones.set(null);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  elegir(clave: string): void {
    if (this.trayendo()) return;
    this.trayendo.set(true);
    this.error.set(null);
    this.parte.set(null);

    this.zotero.elegir(clave).subscribe({
      next: () => {
        this.colecciones.set(null);
        // La primera pasada la lanza el servidor por detrás, así que aquí no
        // hay cifras todavía: se vuelve a preguntar el estado en unos segundos.
        this.parte.set('Trayendo tu colección. Tarda unos segundos.');
        setTimeout(() => {
          this.trayendo.set(false);
          this.cargar();
        }, 6000);
      },
      error: (fallo) => {
        this.trayendo.set(false);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  /** Cambiar de colección: se vuelve a enseñar la lista. */
  cambiar(): void {
    this.pedirColecciones();
  }

  sincronizar(): void {
    if (this.trayendo()) return;
    this.trayendo.set(true);
    this.error.set(null);
    this.parte.set(null);

    this.zotero.sincronizar().subscribe({
      next: (resultado) => {
        this.trayendo.set(false);
        this.parte.set(
          resultado.guardadas > 0
            ? `${resultado.guardadas} fuentes nuevas.`
            : 'Ya estaba al día.',
        );
        this.cargar();
      },
      error: (fallo) => {
        this.trayendo.set(false);
        this.error.set(toApiError(fallo).message);
        this.cargar();
      },
    });
  }

  async desconectar(): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: 'Desconectar Zotero',
      mensaje: 'Dejaremos de entrar en tu biblioteca de Zotero.',
      nota: 'Las fuentes que ya se trajeron se quedan donde están: si las quitáramos, las citas que ya escribiste en tus capítulos dejarían de resolver.',
      confirmar: 'Desconectar',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.error.set(null);
    this.zotero.desconectar().subscribe({
      next: () => {
        this.colecciones.set(null);
        this.parte.set(null);
        this.vuelta.set(null);
        this.cargar();
      },
      error: (fallo) => this.error.set(toApiError(fallo).message),
    });
  }
}
