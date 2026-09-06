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
})
export class Articulo implements OnInit {
  private readonly skillsApi = inject(SkillService);

  readonly publicadas = signal<SkillPublica[]>([]);
  readonly cargando = signal(true);

  /** Quita del nombre la posición que ya pinta la propia lista («3 · …»). */
  private ficha(skill: SkillPublica, numero?: number) {
    return {
      numero: numero === undefined ? '' : String(numero).padStart(2, '0'),
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
      .map((skill, i) => this.ficha(skill, i + 1)),
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
      .map((skill) => this.ficha(skill)),
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
