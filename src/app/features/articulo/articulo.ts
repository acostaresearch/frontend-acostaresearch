import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SkillPublica, SkillService } from '../../core/services/skill.service';
import { DESCRIPCIONES } from '../../shared/contenido/metodo';
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
 * rejilla de fases, y eso vive en los estilos globales.
 *
 * Si algún día hay cuatro productos, esto se convierte en una ruta con
 * parámetro. Con dos, dos páginas se mantienen mejor que una llena de «si es
 * tesis… si es artículo…».
 */
@Component({
  selector: 'app-articulo',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './articulo.html',
  styleUrl: './articulo.css',
})
export class Articulo implements OnInit {
  private readonly skillsApi = inject(SkillService);

  readonly publicadas = signal<SkillPublica[]>([]);
  readonly cargando = signal(true);

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

  /** Quita del nombre la posición que ya pinta la propia lista («3 · …»). */
  private ficha(skill: SkillPublica, conNumero = true) {
    const parte = Articulo.FASE.exec(skill.code);
    const letra = parte?.[2]?.toUpperCase() ?? '';

    return {
      numero: conNumero && parte ? parte[1] + letra : '',
      /** Una variante ocupa la fila entera y dice a cuál sustituye. */
      alternativa: letra ? `En lugar de la fase ${parte?.[1]}` : '',
      nombre: skill.displayName.replace(/^\s*\d+\s*·\s*/, ''),
      ...(DESCRIPCIONES[skill.code] ?? { descripcion: skill.summary, entregable: '' }),
    };
  }

  /**
   * Las fases de la ruta, numeradas.
   *
   * El listado sale del catálogo, no de un array escrito aquí: si mañana se
   * publica una fase más desde el panel, aparece sola. `DESCRIPCIONES` añade la
   * descripción larga y el entregable; la que no la tenga cae a su propio
   * resumen, que es el que lee el investigador dentro de Claude.
   */
  readonly fases = computed(() =>
    this.publicadas()
      .filter((skill) => skill.code.startsWith('articulo-fase'))
      .map((skill) => this.ficha(skill)),
  );

  /**
   * Lo que viene con el paquete pero no es una fase de la ruta: hoy, el
   * Humanizador académico.
   *
   * Va aparte porque el `orden` de un capítulo es uno solo para toda la casa, y
   * el del Humanizador está entre los de tesis. Sin separarlo, esta página
   * empezaba en «01 · Humanizador» y la Fase 0 quedaba de segunda: una ruta que
   * no arranca por su principio se lee como si estuviera mal montada.
   */
  readonly complementos = computed(() =>
    this.publicadas()
      .filter((skill) => !skill.code.startsWith('articulo-fase'))
      .map((skill) => this.ficha(skill, false)),
  );

  ngOnInit(): void {
    this.skillsApi.catalogo(GRUPO).subscribe({
      next: (skills) => {
        this.publicadas.set(skills);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
