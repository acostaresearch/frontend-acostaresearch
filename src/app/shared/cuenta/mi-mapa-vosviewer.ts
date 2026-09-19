import { DecimalPipe } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { toApiError } from '../../core/http/api-error';
import { MapaDeCoocurrencia, MapasService, PedidoDeMapa } from '../../core/services/mapas.service';
import { TemaService } from '../../core/services/tema.service';

/**
 * El script del visor. La versión va en el nombre: al cambiarla se construye
 * otro archivo (ver `vosviewer/construir.mjs`) y ningún navegador se queda con
 * el viejo en caché.
 */
const SCRIPT_DEL_VISOR = '/vosviewer/vosviewer-1.2.4.js';

interface VisorMontado {
  desmontar(): void;
}

declare global {
  interface Window {
    AcostaVosviewer?: {
      montar(elemento: HTMLElement, datos: unknown, parametros: Record<string, unknown>): VisorMontado;
    };
  }
}

/**
 * Carga el visor una sola vez por visita.
 *
 * Son 3,6 MB —React y VOSviewer Online enteros— y solo los necesita quien
 * abre un mapa, así que no van en el build de Angular: se piden al pulsar
 * «Crear mapa» y quedan para los siguientes.
 */
let cargaDelVisor: Promise<void> | null = null;

function cargarVisor(): Promise<void> {
  if (window.AcostaVosviewer) return Promise.resolve();
  cargaDelVisor ??= new Promise<void>((resolver, rechazar) => {
    const script = document.createElement('script');
    script.src = SCRIPT_DEL_VISOR;
    script.async = true;
    script.onload = () => resolver();
    script.onerror = () => {
      // Que el siguiente intento vuelva a pedirlo, en vez de fallar para siempre.
      cargaDelVisor = null;
      script.remove();
      rechazar(new Error('No se pudo cargar el visor de VOSviewer.'));
    };
    document.head.appendChild(script);
  });
  return cargaDelVisor;
}

/** Baja un texto como archivo, sin pasar por el servidor. */
function descargar(nombre: string, contenido: string, tipo: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ANIO_ACTUAL = new Date().getFullYear();

/**
 * El mapa de coocurrencia de palabras clave, con VOSviewer.
 *
 * Lo que hace el tesista en VOSviewer de escritorio —exportar de Scopus, abrir
 * el programa, elegir «co-occurrence» y «all keywords», poner el umbral— en un
 * formulario. El servidor cuenta las coocurrencias; la disposición y los
 * clústeres los calcula VOSviewer Online aquí mismo, en el navegador, con el
 * algoritmo del de escritorio. El mapa que sale es de VOSviewer de verdad, y
 * se cita como tal.
 *
 * Y se lleva los archivos: el JSON y el par `map`/`network` abren en el
 * VOSviewer de escritorio para quien quiera retocarlo allí.
 */
@Component({
  selector: 'app-mi-mapa-vosviewer',
  imports: [DecimalPipe, ReactiveFormsModule],
  templateUrl: './mi-mapa-vosviewer.html',
  styleUrl: './mi-mapa-vosviewer.css',
})
export class MiMapaVosviewer implements OnDestroy {
  private readonly mapas = inject(MapasService);
  private readonly temas = inject(TemaService);

  private readonly lienzo = viewChild<ElementRef<HTMLDivElement>>('lienzo');
  private visor: VisorMontado | null = null;

  readonly anioActual = ANIO_ACTUAL;

  readonly origen = signal<'openalex' | 'mis-fuentes'>('openalex');
  readonly ajustesAbiertos = signal(false);
  readonly creando = signal(false);
  readonly cargandoVisor = signal(false);
  readonly error = signal<string | null>(null);
  readonly mapa = signal<MapaDeCoocurrencia | null>(null);
  readonly copiado = signal(false);

  readonly formulario = new FormGroup({
    tema: new FormControl('', { nonNullable: true }),
    desdeAnio: new FormControl<number | null>(ANIO_ACTUAL - 10),
    hastaAnio: new FormControl<number | null>(null),
    cuantas: new FormControl(500, { nonNullable: true }),
    minimo: new FormControl<number | null>(null),
    maximo: new FormControl(100, { nonNullable: true }),
    excluir: new FormControl('', { nonNullable: true }),
    sinonimos: new FormControl('', { nonNullable: true }),
  });

  /** Los veinte primeros de la tabla: los que caben en una tabla de la tesis. */
  readonly primeros = computed(() => this.mapa()?.resumen.terminos.slice(0, 20) ?? []);

  /**
   * El párrafo para la metodología, con las cifras de ESTE mapa.
   *
   * Es lo primero que pide un asesor de un mapa de VOSviewer: de dónde salieron
   * los datos, cuántos documentos, qué umbral y cuántos términos. Escrito así
   * se pega y se ajusta, y las cifras no se copian a mano.
   */
  readonly parrafoMetodo = computed(() => {
    const m = this.mapa();
    if (!m) return '';
    const r = m.resumen;
    const o = m.origen;
    const n = (x: number) => x.toLocaleString('es-PE');

    const datos =
      o.tipo === 'openalex'
        ? `Se recuperaron de OpenAlex (Priem et al., 2022) los ${n(o.analizados)} artículos más citados de ` +
          `los ${n(o.total)} que contenían «${o.tema}» en el título o el resumen` +
          (o.desdeAnio || o.hastaAnio
            ? `, publicados entre ${o.desdeAnio ?? 'el inicio del registro'} y ${o.hastaAnio ?? ANIO_ACTUAL}`
            : '') +
          `. Se emplearon las palabras clave que OpenAlex asigna a cada trabajo con una puntuación ` +
          `de pertinencia de al menos 0,4, excluidas las diecinueve disciplinas generales de su ` +
          `clasificación; ${n(r.documentosConTerminos)} documentos tenían al menos una.`
        : // No dice «de autor»: sus fuentes pueden venir de Zotero o de un DOI, y
          // entonces las palabras no las puso el autor. El tesista sabe de dónde
          // salieron las suyas y lo precisa al pegarlo.
          `Se analizaron las palabras clave de ${n(r.documentosConTerminos)} documentos ` +
          `recuperados de las bases de datos consultadas.`;

    return (
      `${datos} Con VOSviewer (van Eck y Waltman, 2010) se construyó un mapa de coocurrencia de ` +
      `palabras clave mediante recuento completo. De ${n(r.terminosDistintos)} términos distintos, ` +
      `${n(r.cumplenMinimo)} alcanzaron el umbral mínimo de ${r.minimo} ocurrencias; se representaron ` +
      `${n(r.enElMapa)} términos conectados por ${n(r.enlaces)} enlaces, y los clústeres se ` +
      `identificaron con el algoritmo de agrupamiento del propio programa.`
    );
  });

  readonly referencias = [
    'Priem, J., Piwowar, H., & Orr, R. (2022). OpenAlex: A fully-open index of scholarly works, authors, venues, institutions, and concepts. arXiv. https://doi.org/10.48550/arXiv.2205.01833',
    'van Eck, N. J., & Waltman, L. (2010). Software survey: VOSviewer, a computer program for bibliometric mapping. Scientometrics, 84(2), 523–538. https://doi.org/10.1007/s11192-009-0146-3',
  ];

  constructor() {
    // Al cambiar el tema de la web, el visor cambia con ella. Se vuelve a
    // montar porque VOSviewer lee `dark_ui` solo al arrancar.
    effect(() => {
      this.temas.tema();
      if (untracked(() => this.mapa())) void untracked(() => this.montar());
    });
  }

  elegirOrigen(origen: 'openalex' | 'mis-fuentes'): void {
    this.origen.set(origen);
    this.error.set(null);
  }

  crear(): void {
    const v = this.formulario.getRawValue();
    const origen = this.origen();

    if (origen === 'openalex' && v.tema.trim().length < 3) {
      this.error.set('Escribe el tema que quieres mapear, mejor en inglés.');
      return;
    }

    const pedido: PedidoDeMapa = {
      origen,
      ...(origen === 'openalex' && {
        tema: v.tema.trim(),
        desdeAnio: v.desdeAnio || null,
        hastaAnio: v.hastaAnio || null,
        cuantas: v.cuantas,
      }),
      minimo: v.minimo || null,
      maximo: v.maximo,
      excluir: v.excluir,
      sinonimos: v.sinonimos,
    };

    this.creando.set(true);
    this.error.set(null);

    this.mapas.coocurrencia(pedido).subscribe({
      next: (mapa) => {
        this.creando.set(false);
        this.mapa.set(mapa);
        // El lienzo aparece con el mapa: se monta en el siguiente ciclo.
        setTimeout(() => void this.montar());
      },
      error: (fallo) => {
        this.creando.set(false);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  private async montar(): Promise<void> {
    const mapa = this.mapa();
    const elemento = this.lienzo()?.nativeElement;
    if (!mapa || !elemento) return;

    this.cargandoVisor.set(true);
    try {
      await cargarVisor();
    } catch {
      this.cargandoVisor.set(false);
      this.error.set('No se pudo cargar el visor de VOSviewer. Recarga la página e inténtalo otra vez.');
      return;
    }
    this.cargandoVisor.set(false);

    this.visor?.desmontar();
    this.visor = window.AcostaVosviewer!.montar(elemento, mapa.vosviewer, {
      dark_ui: this.temas.tema() === 'oscuro',
    });
  }

  private nombreBase(): string {
    const o = this.mapa()?.origen;
    const tema = (o?.tipo === 'openalex' ? o.tema ?? 'mapa' : 'mis-fuentes')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return `vosviewer-${tema || 'mapa'}`;
  }

  bajarJson(): void {
    const m = this.mapa();
    if (m) descargar(`${this.nombreBase()}.json`, JSON.stringify(m.vosviewer, null, 1), 'application/json');
  }

  bajarMapa(): void {
    const m = this.mapa();
    if (m) descargar(`${this.nombreBase()}-map.txt`, m.archivos.mapa, 'text/plain;charset=utf-8');
  }

  bajarRed(): void {
    const m = this.mapa();
    if (m) descargar(`${this.nombreBase()}-network.txt`, m.archivos.red, 'text/plain;charset=utf-8');
  }

  /**
   * La tabla de términos para Excel.
   *
   * Con punto y coma y la línea `sep=;` al principio: así Excel la abre en
   * columnas en cualquier configuración regional, también en la de Perú, que
   * con coma la dejaba toda en la columna A.
   */
  bajarTabla(): void {
    const m = this.mapa();
    if (!m) return;
    const celda = (x: string | number | null) => {
      const texto = x === null ? '' : String(x);
      return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const filas = [
      'sep=;',
      ['Término', 'Ocurrencias', 'Enlaces', 'Fuerza total de enlace', 'Año promedio', 'Citas promedio'].join(';'),
      ...m.resumen.terminos.map((t) =>
        [t.termino, t.ocurrencias, t.enlaces, t.fuerza, t.anioPromedio, t.citasPromedio].map(celda).join(';'),
      ),
    ];
    descargar(`${this.nombreBase()}-terminos.csv`, '﻿' + filas.join('\r\n'), 'text/csv;charset=utf-8');
  }

  copiarParrafo(): void {
    const texto = [this.parrafoMetodo(), '', ...this.referencias].join('\n');
    navigator.clipboard?.writeText(texto).then(
      () => {
        this.copiado.set(true);
        setTimeout(() => this.copiado.set(false), 2500);
      },
      () => {},
    );
  }

  ngOnDestroy(): void {
    this.visor?.desmontar();
    this.visor = null;
  }
}
