import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { toApiError } from '../../core/http/api-error';
import { AvisosService } from '../../core/services/avisos.service';
import { MisFuentesService } from '../../core/services/mis-fuentes.service';
import {
  AliciaService,
  BusquedaDeAlicia,
  TipoDeAlicia,
} from '../../core/services/alicia.service';

/**
 * Lo que encuentra ALICIA (CONCYTEC) con la búsqueda que el tesista acaba de
 * hacer en Scopus: tesis peruanas de pregrado, maestría y doctorado, y
 * artículos de revistas de las universidades.
 *
 * Va DEBAJO de la tabla de Scopus y no mezclado con ella: ALICIA no tiene
 * recuento de citas ni DOI, y meter sus tesis en una tabla ordenada por citas
 * las mandaría todas al fondo. Aquí se ven como lo que son: los antecedentes
 * nacionales.
 *
 * No se escribe nada: toma la ecuación de los resultados de Scopus y el
 * servidor la lleva a ALICIA con los términos también en español. Si la
 * traducción no le convence, puede cambiar la consulta a mano.
 */
@Component({
  selector: 'app-mi-alicia',
  imports: [DecimalPipe],
  templateUrl: './mi-alicia.html',
  styleUrl: './mi-alicia.css',
})
export class MiAlicia {
  private readonly alicia = inject(AliciaService);
  private readonly avisos = inject(AvisosService);
  private readonly misFuentes = inject(MisFuentesService);

  /** La ecuación de los resultados de Scopus que se ven. */
  readonly ecuacion = input<string | null>(null);

  readonly busqueda = signal<BusquedaDeAlicia | null>(null);
  readonly buscando = signal(false);
  readonly error = signal<string | null>(null);
  readonly abierto = signal(true);

  readonly tipos: readonly { valor: TipoDeAlicia; texto: string }[] = [
    { valor: 'pregrado', texto: 'Tesis de pregrado' },
    { valor: 'maestria', texto: 'Tesis de maestría' },
    { valor: 'doctorado', texto: 'Tesis doctorales' },
    { valor: 'articulos', texto: 'Artículos' },
  ];
  /** Vacío es «todos». */
  readonly tiposElegidos = signal<ReadonlySet<TipoDeAlicia>>(new Set());

  /** La consulta corregida a mano, mientras la está editando o después. */
  readonly editando = signal(false);
  readonly consultaPropia = signal<string | null>(null);
  readonly borrador = signal('');

  readonly marcados = signal<ReadonlySet<string>>(new Set());
  readonly guardando = signal(false);
  readonly resumenesAbiertos = signal<ReadonlySet<string>>(new Set());

  /** Solo vale la respuesta de la última petición: un filtro rápido no la pisa. */
  private turno = 0;

  constructor() {
    // Cada búsqueda nueva en Scopus empieza de cero aquí: sin la consulta que
    // corrigió para la anterior y sin filtros que ya no vienen al caso.
    effect(() => {
      const ecuacion = this.ecuacion();
      untracked(() => {
        this.consultaPropia.set(null);
        this.editando.set(false);
        this.tiposElegidos.set(new Set());
        if (ecuacion) this.buscar(1);
        else this.busqueda.set(null);
      });
    });
  }

  buscar(pagina = 1): void {
    const ecuacion = this.ecuacion();
    if (!ecuacion) return;

    const anterior = this.busqueda();
    const propia = this.consultaPropia();
    const turno = ++this.turno;

    this.buscando.set(true);
    this.error.set(null);
    this.marcados.set(new Set());
    this.resumenesAbiertos.set(new Set());

    this.alicia
      .buscar({
        ecuacion,
        pagina,
        tipos: [...this.tiposElegidos()],
        // Con la consulta suya se mandan también los años que salieron de la
        // ecuación: corregir las palabras no tiene por qué quitar el filtro.
        ...(propia ? { consulta: propia, desde: anterior?.desde ?? null, hasta: anterior?.hasta ?? null } : {}),
      })
      .subscribe({
        next: (resultado) => {
          // Si mientras tanto buscó otra cosa, esta respuesta ya no es la de
          // lo que ve.
          if (turno !== this.turno) return;
          this.busqueda.set(resultado);
          this.buscando.set(false);
        },
        error: (fallo: unknown) => {
          if (turno !== this.turno) return;
          this.buscando.set(false);
          this.error.set(toApiError(fallo).message);
        },
      });
  }

  alternarTipo(tipo: TipoDeAlicia): void {
    const elegidos = new Set(this.tiposElegidos());
    if (elegidos.has(tipo)) elegidos.delete(tipo);
    else elegidos.add(tipo);
    this.tiposElegidos.set(elegidos);
    this.buscar(1);
  }

  todosLosTipos(): void {
    if (this.tiposElegidos().size === 0) return;
    this.tiposElegidos.set(new Set());
    this.buscar(1);
  }

  empezarAEditar(): void {
    this.borrador.set(this.busqueda()?.consulta ?? '');
    this.editando.set(true);
  }

  aplicarConsulta(): void {
    const texto = this.borrador().trim();
    if (!texto) return;
    this.consultaPropia.set(texto);
    this.editando.set(false);
    this.buscar(1);
  }

  /** Vuelve a la consulta que sale de la ecuación de Scopus. */
  deshacerConsulta(): void {
    this.consultaPropia.set(null);
    this.editando.set(false);
    this.buscar(1);
  }

  marcar(id: string): void {
    const marcados = new Set(this.marcados());
    if (marcados.has(id)) marcados.delete(id);
    else marcados.add(id);
    this.marcados.set(marcados);
  }

  alternarResumen(id: string): void {
    const abiertos = new Set(this.resumenesAbiertos());
    if (abiertos.has(id)) abiertos.delete(id);
    else abiertos.add(id);
    this.resumenesAbiertos.set(abiertos);
  }

  guardar(): void {
    const ids = [...this.marcados()];
    if (ids.length === 0 || this.guardando()) return;

    this.guardando.set(true);
    this.alicia.importar(ids).subscribe({
      next: ({ datos, mensaje }) => {
        this.guardando.set(false);
        this.marcados.set(new Set());
        this.avisos.exito(mensaje ?? `${datos.guardadas} guardadas en tus fuentes.`);
        // Pasan a «ya la tienes», para que la lista cuadre con lo que hay.
        const busqueda = this.busqueda();
        if (busqueda) {
          this.busqueda.set({
            ...busqueda,
            resultados: busqueda.resultados.map((r) =>
              ids.includes(r.id) ? { ...r, yaLaTienes: true } : r,
            ),
          });
        }
        // La cifra de «fuentes tuyas» vive en otro componente.
        this.misFuentes.avisarDeCambio();
      },
      error: (fallo: unknown) => {
        this.guardando.set(false);
        this.avisos.error(toApiError(fallo).message);
      },
    });
  }

  /** «Universidad César Vallejo» o «Revista X · Universidad Y». */
  procedencia(r: BusquedaDeAlicia['resultados'][number]): string {
    return [r.revista, r.universidad].filter(Boolean).join(' · ');
  }
}
