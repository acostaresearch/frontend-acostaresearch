import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Plan } from '../../core/models/rewrite.model';
import { BillingService } from '../../core/services/billing.service';
import { SkillPublica, SkillService } from '../../core/services/skill.service';
import { DESCRIPCIONES } from '../../shared/contenido/metodo';
import {
  CIFRAS_DEL_ARTICULO,
  GARANTIAS_DEL_ARTICULO,
  SEÑAS_DEL_ARTICULO,
} from '../../shared/contenido/skills-del-articulo';
import { IconoRuta } from '../../shared/layout/icono-ruta';
import { LineasNoche } from '../../shared/layout/lineas-noche';
import { PublicacionesAutor } from '../../shared/layout/publicaciones-autor';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/** El producto que vende esta página. Es el mismo código que su plan. */
const GRUPO = 'ARTICULO_SCIENTIFICOS';

/**
 * La Ruta del Artículo Científico: las diez fases, una por una.
 *
 * Es la gemela de «El método», y está escrita aparte a propósito. Podría ser la
 * misma página con el grupo en la URL, pero las dos venden a personas distintas
 * —una tesis se entrega a un asesor, un artículo se envía a una revista— y casi
 * todo el texto que las rodea cambia. Lo que sí se comparte de verdad es la
 * presentación, y eso vive en `shared/estilos/ruta.css`.
 *
 * Si algún día hay cuatro productos, esto se convierte en una ruta con
 * parámetro. Con dos, dos páginas se mantienen mejor que una llena de «si es
 * tesis… si es artículo…».
 */
@Component({
  selector: 'app-articulo',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    SiteHeader,
    SiteFooter,
    PublicacionesAutor,
    IconoRuta,
    LineasNoche,
  ],
  templateUrl: './articulo.html',
  styleUrls: ['../../shared/estilos/ruta.css', './articulo.css'],
})
export class Articulo implements OnInit {
  private readonly skillsApi = inject(SkillService);
  private readonly billing = inject(BillingService);

  readonly publicadas = signal<SkillPublica[]>([]);
  readonly cargando = signal(true);
  private readonly planes = signal<Plan[]>([]);

  readonly cifras = CIFRAS_DEL_ARTICULO;
  readonly garantias = GARANTIAS_DEL_ARTICULO;

  /**
   * De qué fase es cada skill, sacado de su código.
   *
   * `articulo-fase3-…` es la fase 3; `articulo-fase3b-…` es una VARIANTE de la
   * 3, no la cuarta de la fila. La letra es lo que las distingue, y estaba ahí
   * desde que se publicaron: antes se ignoraba y la lista contaba 3B como un
   * paso más, así que numeraba once fases donde hay diez y desplazaba una
   * posición todo lo que venía detrás.
   */
  private static readonly FASE = /^articulo-fase(\d+)([a-z])?/;

  /**
   * Las fases de la ruta y lo que viene con el paquete sin serlo, en una sola
   * lista. Sale del catálogo, no de un array escrito aquí: si mañana se publica
   * una fase más desde el panel, aparece sola. `DESCRIPCIONES` pone el texto y
   * el entregable, y las señas de esta página, el icono y la etiqueta.
   */
  readonly fases = computed(() =>
    this.publicadas().map((skill) => {
      const parte = Articulo.FASE.exec(skill.code);
      const letra = parte?.[2]?.toUpperCase() ?? '';
      const seña = SEÑAS_DEL_ARTICULO[skill.code];

      return {
        // El Humanizador no es una fase y no lleva número: un «11» ahí diría
        // que hay un paso más que dar, y no lo hay.
        numero: parte ? (parte[1] + letra).padStart(2, '0') : '+',
        nombre: skill.displayName.replace(/^\s*(Fase\s*\d+[a-zA-Z]?\s*[—–-]|\d+\s*·)\s*/, ''),
        etiqueta: seña?.etiqueta ?? '',
        icono: seña?.icono ?? 'diana',
        fuera: seña?.fuera ?? false,
        ...(DESCRIPCIONES[skill.code] ?? { descripcion: skill.summary, entregable: '' }),
      };
    }),
  );

  /** Las dos columnas: impares a la izquierda, pares a la derecha. */
  readonly columnaIzquierda = computed(() => this.fases().filter((_, i) => i % 2 === 0));
  readonly columnaDerecha = computed(() => this.fases().filter((_, i) => i % 2 === 1));

  /** Un trazo por fase, gris para las que no son un paso en orden. */
  readonly trazos = computed(() =>
    this.fases().map((f, i) => ({
      fuera: f.fuera,
      peso: 0.35 + (0.65 * i) / Math.max(1, this.fases().length - 1),
    })),
  );

  /**
   * El precio de la ruta, para el cierre. Sale del catálogo de planes, que es
   * con el que se cobra: escribirlo aquí es la forma de que un día la página
   * diga una cifra y el checkout otra.
   */
  readonly precio = computed(() => {
    const plan = this.planes().find((p) => p.code === GRUPO);
    return plan ? `S/ ${(plan.priceCents / 100).toFixed(0)}` : null;
  });

  ngOnInit(): void {
    this.skillsApi.catalogo(GRUPO).subscribe({
      next: (skills) => {
        this.publicadas.set(skills);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });

    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
  }
}
