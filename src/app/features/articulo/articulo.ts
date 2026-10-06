import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { Plan } from '../../core/models/rewrite.model';
import { BillingService } from '../../core/services/billing.service';
import { SkillPublica, SkillService } from '../../core/services/skill.service';
import { DESCRIPCIONES } from '../../shared/contenido/metodo';
import {
  CIFRAS_DE_LA_REVISION,
  CIFRAS_DEL_ARTICULO,
  GARANTIAS_DE_LA_REVISION,
  GARANTIAS_DEL_ARTICULO,
  SEÑAS_DE_LA_REVISION,
  SEÑAS_DEL_ARTICULO,
  SeñaDeFase,
} from '../../shared/contenido/skills-del-articulo';
import { DiferenciasArticulos } from '../../shared/layout/diferencias-articulos';
import { IconoRuta } from '../../shared/layout/icono-ruta';
import { LineasNoche } from '../../shared/layout/lineas-noche';
import { PublicacionesAutor } from '../../shared/layout/publicaciones-autor';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

export type TipoDeArticulo = 'empirico' | 'revision';

/**
 * Los dos productos que vende esta página: el artículo empírico y el de
 * revisión. `grupo` es el mismo código que su plan. Se elige con
 * `?tipo=revision` en la URL, para que el enlace se pueda compartir.
 *
 * Son productos distintos con skills distintas (`articulo-fase*` y
 * `revision-fase*`): lo único que comparten es el Humanizador.
 */
const PRODUCTOS: Record<
  TipoDeArticulo,
  {
    grupo: string;
    pestana: string;
    rotulo: string;
    titulo: string;
    entrada: string;
    fasesTitulo: string;
    fasesNota: string;
    cierre: string;
    cifras: { valor: string; pie: string }[];
    garantias: { icono: string; titulo: string; texto: string }[];
    señas: Record<string, SeñaDeFase>;
  }
> = {
  empirico: {
    grupo: 'ARTICULO_SCIENTIFICOS',
    pestana: 'Artículo empírico',
    rotulo: 'Ruta del Artículo Científico',
    titulo: 'De una idea a un artículo enviado a una revista real',
    entrada:
      'Diez fases en estructura IMRyD y variante para revisión. Se instalan en Claude, ChatGPT o ' +
      'Grok para redactar a tu lado, paso a paso y con tus fuentes científicas. No tienes que ' +
      'empezar desde la primera fase: entra directo en la etapa donde estés hoy.',
    fasesTitulo: 'Doce, en el orden en que se publica un artículo',
    fasesNota:
      'Las de número azul forman la ruta. La 3B es la variante bibliométrica, que reemplaza a ' +
      'la 03, y el Humanizador se usa en cualquier momento.',
    cierre: 'Quiero la ruta completa',
    cifras: CIFRAS_DEL_ARTICULO,
    garantias: GARANTIAS_DEL_ARTICULO,
    señas: SEÑAS_DEL_ARTICULO,
  },
  revision: {
    grupo: 'ARTICULOS_REVIEW',
    pestana: 'Artículo de revisión',
    rotulo: 'Ruta del Artículo de Revisión',
    titulo: 'De una pregunta a una revisión publicada',
    entrada:
      'Nueve fases para revisiones sistemáticas (PRISMA 2020), de alcance (PRISMA-ScR) y ' +
      'bibliométricas. Se instalan en Claude, ChatGPT o Grok y trabajan con lo que ya está ' +
      'publicado: no recoges datos, los sintetizas. Entra directo en la fase donde estés hoy.',
    fasesTitulo: 'Nueve, del protocolo a la respuesta a revisores',
    fasesNota:
      'No hay fase 3: en una revisión, el protocolo de la fase 1 reemplaza a la revisión de la ' +
      'literatura. El Humanizador se usa en cualquier momento.',
    cierre: 'Quiero la ruta de revisión',
    cifras: CIFRAS_DE_LA_REVISION,
    garantias: GARANTIAS_DE_LA_REVISION,
    señas: SEÑAS_DE_LA_REVISION,
  },
};

/**
 * Las rutas de artículos: las fases de cada producto, una por una.
 *
 * Es la gemela de «El método», y está escrita aparte a propósito: una tesis se
 * entrega a un asesor y un artículo se envía a una revista, y casi todo el
 * texto que las rodea cambia. Lo que sí se comparte de verdad es la
 * presentación, y eso vive en `shared/estilos/ruta.css`.
 *
 * Los dos productos de artículos, en cambio, sí viven en la misma página: se
 * parecen tanto que quien llega necesita verlos uno al lado del otro. Un
 * selector en el encabezado cambia de uno a otro.
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
    DiferenciasArticulos,
  ],
  templateUrl: './articulo.html',
  styleUrls: ['../../shared/estilos/ruta.css', './articulo.css'],
})
export class Articulo implements OnInit {
  private readonly skillsApi = inject(SkillService);
  private readonly billing = inject(BillingService);
  private readonly ruta = inject(ActivatedRoute);

  /** Las pestañas del selector, en su orden. */
  readonly tipos = (Object.keys(PRODUCTOS) as TipoDeArticulo[]).map((clave) => ({
    clave,
    nombre: PRODUCTOS[clave].pestana,
  }));

  /** El producto que se está mirando, sacado de la URL. */
  readonly tipo = toSignal(
    this.ruta.queryParamMap.pipe(
      map((q): TipoDeArticulo => (q.get('tipo') === 'revision' ? 'revision' : 'empirico')),
    ),
    { initialValue: 'empirico' as TipoDeArticulo },
  );

  /** Los textos y las listas del producto elegido. */
  readonly producto = computed(() => PRODUCTOS[this.tipo()]);

  /** Lo que devolvió el catálogo, por grupo: cambiar de producto no lo vuelve a pedir. */
  private readonly catalogos = signal<Record<string, SkillPublica[]>>({});
  readonly publicadas = computed(() => this.catalogos()[this.producto().grupo] ?? []);
  readonly cargando = computed(() => !(this.producto().grupo in this.catalogos()));
  private readonly planes = signal<Plan[]>([]);

  /**
   * De qué fase es cada skill, sacado de su código.
   *
   * `articulo-fase3-…` es la fase 3; `articulo-fase3b-…` es una VARIANTE de la
   * 3, no la cuarta de la fila. La letra es lo que las distingue, y estaba ahí
   * desde que se publicaron: antes se ignoraba y la lista contaba 3B como un
   * paso más, así que numeraba once fases donde hay diez y desplazaba una
   * posición todo lo que venía detrás.
   */
  private static readonly FASE = /^(?:articulo|revision)-fase(\d+)([a-z])?/;

  /**
   * Por número de fase, con lo que no es fase (el Humanizador) al final. El
   * catálogo de revisión trae el Humanizador primero, porque su orden en el
   * panel es anterior al de las fases de revisión.
   */
  private readonly ordenadas = computed(() => {
    const clave = (code: string) => {
      const parte = Articulo.FASE.exec(code);
      return parte ? Number(parte[1]) + (parte[2] ? 0.5 : 0) : Infinity;
    };
    return [...this.publicadas()].sort((a, b) => clave(a.code) - clave(b.code));
  });

  /**
   * Las fases de la ruta y lo que viene con el paquete sin serlo, en una sola
   * lista. Sale del catálogo, no de un array escrito aquí: si mañana se publica
   * una fase más desde el panel, aparece sola. `DESCRIPCIONES` pone el texto y
   * el entregable, y las señas de cada producto, el icono y la etiqueta.
   */
  readonly fases = computed(() =>
    this.ordenadas().map((skill) => {
      const parte = Articulo.FASE.exec(skill.code);
      const letra = parte?.[2]?.toUpperCase() ?? '';
      const seña = this.producto().señas[skill.code];

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
   * El plan del producto elegido. Sale del catálogo de planes, que es con el
   * que se cobra: escribir aquí el precio o la vigencia es la forma de que un
   * día la página diga una cifra y el checkout otra.
   */
  private readonly plan = computed(() =>
    this.planes().find((p) => p.code === this.producto().grupo),
  );

  readonly codigoPlan = computed(() => this.producto().grupo);

  readonly precio = computed(() => {
    const plan = this.plan();
    return plan ? `S/ ${(plan.priceCents / 100).toFixed(0)}` : null;
  });

  /** «12 meses de acceso», «10 meses de acceso». */
  readonly vigencia = computed(() => {
    const dias = this.plan()?.durationDays ?? 0;
    if (dias <= 0) return 'Acceso';
    const meses = Math.round(dias / 30);
    return meses === 1 ? 'Un mes de acceso' : `${meses} meses de acceso`;
  });

  ngOnInit(): void {
    // Los dos catálogos de una vez: son pequeños y así cambiar de producto es
    // instantáneo. Uno que falle queda vacío y la página lo dice.
    for (const { grupo } of Object.values(PRODUCTOS)) {
      this.skillsApi.catalogo(grupo).subscribe({
        next: (skills) => this.catalogos.update((c) => ({ ...c, [grupo]: skills })),
        error: () => this.catalogos.update((c) => ({ ...c, [grupo]: [] })),
      });
    }

    this.billing.plans().subscribe({ next: (planes) => this.planes.set(planes) });
  }
}
