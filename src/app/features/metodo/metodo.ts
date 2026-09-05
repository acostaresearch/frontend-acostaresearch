import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { SkillPublica, SkillService } from '../../core/services/skill.service';
import { DESCRIPCIONES } from '../../shared/contenido/metodo';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * El método: los capítulos publicados, uno por uno.
 *
 * La lista sale del catálogo de la API y no de un array escrito aquí: cuando
 * el administrador publica un capítulo desde el panel, aparece en esta página
 * sin tocar código.
 */
@Component({
  selector: 'app-metodo',
  imports: [RouterLink, SiteHeader, SiteFooter],
  templateUrl: './metodo.html',
  styleUrl: './metodo.css',
})
export class Metodo implements OnInit {
  private readonly skillsApi = inject(SkillService);

  readonly publicadas = signal<SkillPublica[]>([]);
  readonly cargando = signal(true);

  /**
   * `DESCRIPCIONES` aporta el texto de venta —más largo, y con el entregable—
   * de los capítulos que ya lo tienen escrito. El que no, se muestra con su
   * propio resumen, que es el mismo que lee el tesista dentro de Claude.
   */
  readonly capitulos = computed(() =>
    this.publicadas().map((skill, i) => ({
      numero: String(i + 1).padStart(2, '0'),
      // El displayName lleva delante su posición en el método («3 · Capítulo
      // II · …»), que aquí sobra porque ya la pinta la propia lista.
      nombre: skill.displayName.replace(/^\s*\d+\s*·\s*/, ''),
      ...(DESCRIPCIONES[skill.code] ?? { descripcion: skill.summary, entregable: '' }),
    })),
  );

  ngOnInit(): void {
    this.skillsApi.catalogo().subscribe({
      next: (skills) => {
        this.publicadas.set(skills);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
