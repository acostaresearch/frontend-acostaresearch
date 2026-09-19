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

import { toApiError } from '../../core/http/api-error';
import { FilaDelMapa, MapaDeVosviewer, MapasService, PedidoDeMapa } from '../../core/services/mapas.service';
import { TemaService } from '../../core/services/tema.service';
import { CrearMapa, MapaCreado } from './crear-mapa';
import { ANALISIS, NOMBRE_DEL_RECUENTO, UNIDADES, metodoDelMapa } from './mapa-catalogo';
import { AvisoFlotante } from '../layout/aviso-flotante';

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

/** Una columna de la tabla: cabecera, cómo se lee de la fila y cómo se escribe. */
interface Columna {
  titulo: string;
  valor: (f: FilaDelMapa) => number | null | undefined;
  decimales?: string;
}

/**
 * Los mapas bibliométricos de VOSviewer, con sus análisis.
 *
 * Lo que el tesista haría en VOSviewer de escritorio —exportar, abrir el
 * programa, «Create map», elegir el tipo de análisis y la unidad, el método de
 * recuento y el umbral, revisar la lista de lo seleccionado— en el mismo asistente
 * (`CrearMapa`), paso a paso.
 * El servidor cuenta; la disposición y los clústeres los calcula VOSviewer
 * Online aquí mismo, con el algoritmo del de escritorio. El mapa que sale es de
 * VOSviewer de verdad, y se cita como tal.
 *
 * Y se lleva los archivos: el JSON y el par `map`/`network` abren en el
 * VOSviewer de escritorio para quien quiera retocarlo allí.
 */
@Component({
  selector: 'app-mi-mapa-vosviewer',
  imports: [AvisoFlotante, DecimalPipe, CrearMapa],
  templateUrl: './mi-mapa-vosviewer.html',
  styleUrl: './mi-mapa-vosviewer.css',
})
export class MiMapaVosviewer implements OnDestroy {
  private readonly mapas = inject(MapasService);
  private readonly temas = inject(TemaService);

  private readonly lienzo = viewChild<ElementRef<HTMLDivElement>>('lienzo');
  private visor: VisorMontado | null = null;

  readonly nombresDeUnidad = UNIDADES;
  readonly nombresDeRecuento = NOMBRE_DEL_RECUENTO;

  /** La ventana «Crear mapa». Se abre sola la primera vez que se entra. */
  readonly asistenteAbierto = signal(true);
  readonly creando = signal(false);
  readonly cargandoVisor = signal(false);
  readonly error = signal<string | null>(null);
  readonly mapa = signal<MapaDeVosviewer | null>(null);
  readonly copiado = signal(false);

  /** Cómo se pidió el mapa que se ve: para «Quitar» y para el párrafo. */
  private ultimoPedido: PedidoDeMapa | null = null;

  readonly analisisDelMapa = computed(() => {
    const m = this.mapa();
    return m ? ANALISIS.find((a) => a.valor === m.analisis) ?? null : null;
  });

  /** Las columnas de la tabla, según lo que son los círculos. */
  readonly columnas = computed<Columna[]>(() => {
    const m = this.mapa();
    if (!m) return [];
    const enlaces: Columna[] = [
      { titulo: 'Enlaces', valor: (f) => f.enlaces },
      { titulo: 'Fuerza total', valor: (f) => f.fuerza, decimales: '1.0-2' },
    ];
    const anio: Columna[] = m.resumen.conAnio
      ? [
          {
            titulo: m.perfil === 'terminos' || m.perfil === 'unidades' ? 'Año prom.' : 'Año',
            valor: (f) => f.anio,
            decimales: '1.0-1',
          },
        ]
      : [];
    switch (m.perfil) {
      case 'unidades':
        return [
          { titulo: 'Documentos', valor: (f) => f.documentos },
          { titulo: 'Citas', valor: (f) => f.citas },
          ...enlaces,
          ...anio,
        ];
      case 'documentos':
        return [
          { titulo: 'Citas', valor: (f) => f.citas },
          { titulo: 'Citas norm.', valor: (f) => f.citasNorm, decimales: '1.2-2' },
          ...enlaces,
          ...anio,
        ];
      case 'referencias':
        return [{ titulo: 'Citas', valor: (f) => f.citas }, ...enlaces, ...anio];
      default:
        return [
          { titulo: 'Ocurrencias', valor: (f) => f.ocurrencias },
          ...enlaces,
          ...anio,
          ...(m.analisis === 'terminos'
            ? [{ titulo: 'Relevancia', valor: (f: FilaDelMapa) => f.extra, decimales: '1.2-2' }]
            : []),
        ];
    }
  });

  /** Los treinta primeros: los que caben en una tabla de la tesis. */
  readonly primeros = computed(() => this.mapa()?.resumen.filas.slice(0, 30) ?? []);

  readonly metodo = computed(() => {
    const m = this.mapa();
    return m ? metodoDelMapa(m, this.ultimoPedido?.maxAutores ?? null) : null;
  });

  constructor() {
    // Al cambiar el tema de la web, el visor cambia con ella. Se vuelve a
    // montar porque VOSviewer lee `dark_ui` solo al arrancar.
    effect(() => {
      this.temas.tema();
      if (untracked(() => this.mapa())) void untracked(() => this.montar());
    });
  }

  /** Lo que entrega el asistente al pulsar «Finalizar». */
  alCrear({ mapa, pedido }: MapaCreado): void {
    this.asistenteAbierto.set(false);
    this.ultimoPedido = pedido;
    this.error.set(null);
    this.mapa.set(mapa);
    // El lienzo aparece con el mapa: se monta en el siguiente ciclo.
    setTimeout(() => void this.montar());
  }

  /**
   * Quita una fila y rehace el mapa con las demás: lo mismo que desmarcarla
   * en «Verificar», sin volver a abrir el asistente.
   */
  quitar(fila: FilaDelMapa): void {
    const m = this.mapa();
    if (!m || !this.ultimoPedido || this.creando()) return;
    const pedido = {
      ...this.ultimoPedido,
      seleccion: m.resumen.filas.map((f) => f.clave).filter((c) => c !== fila.clave),
    };

    this.creando.set(true);
    this.error.set(null);
    this.mapas.crear(pedido).subscribe({
      next: (mapa) => {
        this.creando.set(false);
        this.alCrear({ mapa, pedido });
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
    const m = this.mapa();
    const o = m?.origen;
    const tema = (o?.tipo === 'openalex' ? o.tema ?? 'mapa' : 'mis-fuentes')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return `vosviewer-${m?.analisis ?? 'mapa'}-${m?.unidad ?? ''}-${tema || 'mapa'}`;
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
   * La tabla para Excel, con las columnas de este mapa.
   *
   * Con punto y coma y la línea `sep=;` al principio: así Excel la abre en
   * columnas en cualquier configuración regional, también en la de Perú, que
   * con coma la dejaba toda en la columna A.
   */
  bajarTabla(): void {
    const m = this.mapa();
    if (!m) return;
    const celda = (x: string | number | null | undefined) => {
      const texto = x === null || x === undefined ? '' : String(x);
      return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const columnas = this.columnas();
    const primera = UNIDADES[m.unidad].nombre;
    const filas = [
      'sep=;',
      [primera, ...columnas.map((c) => c.titulo), 'Enlace'].map(celda).join(';'),
      ...m.resumen.filas.map((f) => [f.etiqueta, ...columnas.map((c) => c.valor(f)), f.url].map(celda).join(';')),
    ];
    descargar(`${this.nombreBase()}-tabla.csv`, '﻿' + filas.join('\r\n'), 'text/csv;charset=utf-8');
  }

  copiarParrafo(): void {
    const metodo = this.metodo();
    if (!metodo) return;
    const texto = [metodo.parrafo, '', ...metodo.referencias].join('\n');
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
