import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Plan } from '../../core/models/rewrite.model';
import { BillingService } from '../../core/services/billing.service';
import { SkillPublica, SkillService } from '../../core/services/skill.service';
import { LIBROS } from '../../shared/contenido/metodo';
import {
  CIFRAS_DEL_METODO,
  FICHAS_DEL_METODO,
  PANEL_DEL_METODO,
} from '../../shared/contenido/skills-del-metodo';
import { IconoRuta } from '../../shared/layout/icono-ruta';
import { LineasNoche } from '../../shared/layout/lineas-noche';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * El producto que vende esta página.
 *
 * Sin filtro, el catálogo devuelve TODOS los capítulos de la casa, y esta
 * página acababa listando el humanizador y las diez fases del artículo
 * científico debajo de las nueve del método: la página se llama «Las 11 Skills»
 * y enseñaba veinte.
 *
 * Va aquí y no en el servidor porque es una decisión de esta página, no del
 * catálogo. El día que el artículo científico tenga la suya, pedirá su grupo.
 *
 * Es el grupo que está a la venta, con Bajar similitud incluida: el antiguo
 * `METODO_9_SKILLS` se retiró y se quedó en diez, así que la página decía
 * «11 Skills» y listaba diez.
 */
const GRUPO_DEL_METODO = 'METODO_DE_TESIS_HUMANIZADOR';

/**
 * El método: los capítulos publicados, uno por uno.
 *
 * La lista sale del catálogo de la API y no de un array escrito aquí: cuando
 * el administrador publica un capítulo desde el panel, aparece en esta página
 * sin tocar código. Lo que sí está escrito es la ficha de cada uno —el texto
 * corto, el icono y el capítulo que entrega—, porque es cómo se presenta aquí
 * y no algo que el catálogo tenga por qué saber.
 */
@Component({
  selector: 'app-metodo',
  imports: [NgTemplateOutlet, RouterLink, SiteHeader, SiteFooter, IconoRuta, LineasNoche],
  templateUrl: './metodo.html',
  styleUrls: ['../../shared/estilos/ruta.css', './metodo.css'],
})
export class Metodo implements OnInit {
  private readonly skillsApi = inject(SkillService);
  private readonly billing = inject(BillingService);

  readonly publicadas = signal<SkillPublica[]>([]);
  readonly cargando = signal(true);
  private readonly planes = signal<Plan[]>([]);

  readonly libros = LIBROS;
  readonly cifras = CIFRAS_DEL_METODO;
  readonly panel = PANEL_DEL_METODO;

  /**
   * Los capítulos con su ficha. El que no tenga ficha escrita se muestra con
   * el nombre y el resumen del catálogo: es preferible una ficha sobria a que
   * un capítulo recién publicado desaparezca de la página.
   */
  readonly capitulos = computed(() =>
    this.publicadas().map((skill, i) => {
      const ficha = FICHAS_DEL_METODO[skill.code];
      return {
        numero: String(i + 1).padStart(2, '0'),
        // El displayName lleva delante su posición y su capítulo («3 ·
        // Capítulo II · Marco teórico»), que aquí van en su propio sitio.
        nombre: ficha?.nombre ?? skill.displayName.replace(/^\s*\d+\s*·\s*/, ''),
        capitulo: ficha?.capitulo ?? '',
        icono: ficha?.icono ?? 'diana',
        descripcion: ficha?.descripcion ?? skill.summary,
        entregable: ficha?.entregable ?? '',
        video: ficha?.video ?? '',
        fuera: ficha?.fuera ?? false,
      };
    }),
  );

  /** Las dos columnas de seis: impares a la izquierda, pares a la derecha. */
  readonly columnaIzquierda = computed(() => this.capitulos().filter((_, i) => i % 2 === 0));
  readonly columnaDerecha = computed(() => this.capitulos().filter((_, i) => i % 2 === 1));

  /** Un trazo por capítulo, gris para los que están fuera de la ruta. */
  readonly trazos = computed(() =>
    this.capitulos().map((c, i) => ({
      fuera: c.fuera,
      // Los de la ruta van aclarándose hacia el final: la tira se lee como el
      // avance de la tesis, no como doce rayas iguales.
      peso: 0.35 + (0.65 * i) / Math.max(1, this.capitulos().length - 1),
    })),
  );

  /**
   * El precio del paquete, para el cierre. Sale del catálogo de planes, que es
   * con el que se cobra: escribirlo aquí es la forma de que un día la página
   * diga una cifra y el checkout otra.
   */
  readonly precio = computed(() => {
    const plan =
      this.planes().find((p) => p.code === 'METODO_9_SKILLS') ??
      this.planes().find((p) => p.code === GRUPO_DEL_METODO);
    return plan ? `S/ ${(plan.priceCents / 100).toFixed(0)}` : null;
  });

  ngOnInit(): void {
    this.skillsApi.catalogo(GRUPO_DEL_METODO).subscribe({
      next: (skills) => {
        this.publicadas.set(skills);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });

    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
  }
}
