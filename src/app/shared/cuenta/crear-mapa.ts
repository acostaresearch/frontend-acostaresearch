import { DecimalPipe, NgTemplateOutlet, TitleCasePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { toApiError } from '../../core/http/api-error';
import {
  MapaDeVosviewer,
  MapasService,
  PedidoDeMapa,
  Recuento,
  TipoDeAnalisis,
  UmbralDelMapa,
  UnidadDeAnalisis,
} from '../../core/services/mapas.service';
import { MisFuentesService } from '../../core/services/mis-fuentes.service';
import { ANALISIS, NOMBRE_DEL_ENLACE, NOMBRE_DEL_RECUENTO, UNIDADES } from './mapa-catalogo';
import { AvisoFlotante } from '../layout/aviso-flotante';

/** Los pasos del asistente, en el orden del «Create Map» de VOSviewer. */
type Paso = 'tipo-datos' | 'fuente' | 'busqueda' | 'mis-fuentes' | 'analisis' | 'campos' | 'umbral' | 'numero' | 'verificar';

const TITULOS: Record<Paso, string> = {
  'tipo-datos': 'Elegir el tipo de datos',
  fuente: 'Elegir la fuente de datos',
  busqueda: 'Buscar en OpenAlex',
  'mis-fuentes': 'Tus fuentes',
  analisis: 'Elegir el tipo de análisis y el método de recuento',
  campos: 'Elegir los campos y el método de recuento',
  umbral: 'Elegir el umbral',
  numero: 'Elegir el número',
  verificar: 'Verificar la selección',
};

/** El tope del mapa: lo que admite el servidor y lo que el visor pinta con soltura. */
const MAXIMO_EN_EL_MAPA = 1000;

const ANIO_ACTUAL = new Date().getFullYear();

/** Lo que devuelve el asistente al pulsar «Finalizar»: el mapa y cómo se pidió. */
export interface MapaCreado {
  mapa: MapaDeVosviewer;
  pedido: PedidoDeMapa;
}

/**
 * El asistente «Crear mapa», copiado del «Create Map» de VOSviewer.
 *
 * Mismos pasos, mismo orden y mismos botones —Atrás, Siguiente, Finalizar,
 * Cancelar— para que quien haya visto un tutorial de VOSviewer lo reconozca
 * sin leer nada, y para que quien aprenda aquí sepa usar luego el de
 * escritorio. Lo que cambia es de dónde salen los datos: una búsqueda en
 * OpenAlex o sus fuentes, en vez de un archivo de Scopus.
 *
 * Como en VOSviewer, «Finalizar» funciona desde el paso del análisis: lo que
 * falte se hace con los valores por defecto.
 *
 * El estado se conserva al cerrar: volver a abrirlo es retocar el mapa, no
 * empezar de cero, que es lo que hace «Create…» en el programa.
 */
@Component({
  selector: 'app-crear-mapa',
  imports: [AvisoFlotante, DecimalPipe, NgTemplateOutlet, TitleCasePipe],
  templateUrl: './crear-mapa.html',
  styleUrl: './crear-mapa.css',
})
export class CrearMapa {
  private readonly mapas = inject(MapasService);
  private readonly fuentes = inject(MisFuentesService);

  readonly abierto = input(false);
  readonly listo = output<MapaCreado>();
  readonly cerrar = output<void>();

  private readonly ventana = viewChild<ElementRef<HTMLElement>>('ventana');

  readonly anioActual = ANIO_ACTUAL;
  readonly catalogo = ANALISIS.filter((a) => a.valor !== 'terminos');
  readonly nombres = UNIDADES;
  readonly nombresDeRecuento = NOMBRE_DEL_RECUENTO;

  // ── Lo que se elige ──────────────────────────────────────────────────────
  readonly tipoDatos = signal<'bibliograficos' | 'texto'>('bibliograficos');
  readonly origen = signal<'openalex' | 'mis-fuentes'>('openalex');
  readonly tema = signal('');
  readonly desdeAnio = signal<number | null>(ANIO_ACTUAL - 10);
  readonly hastaAnio = signal<number | null>(null);
  readonly cuantas = signal(500);

  readonly analisis = signal<TipoDeAnalisis>('coocurrencia');
  readonly unidad = signal<UnidadDeAnalisis>('palabras-openalex');
  readonly recuento = signal<Recuento>('completo');
  readonly campo = signal<'titulo-resumen' | 'titulo'>('titulo-resumen');
  readonly recuentoTexto = signal<'binario' | 'completo'>('binario');
  readonly tesauro = signal('');
  readonly nombreTesauro = signal<string | null>(null);
  readonly editarTesauro = signal(false);

  readonly minimo = signal<number | null>(null);
  readonly minimoCitas = signal<number | null>(0);
  readonly ignorarMuchosAutores = signal(true);
  readonly maxAutores = signal(25);
  readonly numero = signal<number | null>(null);

  // ── Lo que llega del servidor ────────────────────────────────────────────
  readonly datosUmbral = signal<UmbralDelMapa | null>(null);
  private claveUmbral = '';
  private claveNumero = '';
  private claveFuente = '';
  readonly previo = signal<MapaDeVosviewer | null>(null);
  private clavePrevio = '';
  readonly marcadas = signal<Set<string>>(new Set());
  readonly misFuentes = signal<{ total: number; sinResumen: number } | null>(null);

  readonly cargando = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly indice = signal(0);

  // ── Derivados ────────────────────────────────────────────────────────────
  readonly esTexto = computed(() => this.tipoDatos() === 'texto');
  readonly analisisReal = computed<TipoDeAnalisis>(() => (this.esTexto() ? 'terminos' : this.analisis()));
  readonly unidadReal = computed<UnidadDeAnalisis>(() => (this.esTexto() ? this.campo() : this.unidad()));

  readonly pasos = computed<Paso[]>(() => [
    'tipo-datos',
    'fuente',
    this.origen() === 'openalex' ? 'busqueda' : 'mis-fuentes',
    this.esTexto() ? 'campos' : 'analisis',
    'umbral',
    'numero',
    'verificar',
  ]);
  readonly paso = computed(() => this.pasos()[this.indice()]);
  readonly titulo = computed(() => {
    const p = this.paso();
    const u = this.nombres[this.unidadReal()];
    if (p === 'numero') return `Elegir el número de ${u.plural}`;
    if (p === 'verificar') return `Verificar ${u.art} ${u.plural} seleccionad${u.art === 'las' ? 'as' : 'os'}`;
    return TITULOS[p];
  });

  readonly unidadesDisponibles = computed(() =>
    (ANALISIS.find((a) => a.valor === this.analisis())?.unidades ?? []).filter(
      (u) => this.origen() === 'mis-fuentes' || u !== 'palabras-autor',
    ),
  );
  /** Qué pregunta responde el análisis elegido: debajo de los radios. */
  readonly preguntaActual = computed(() => ANALISIS.find((a) => a.valor === this.analisis())?.pregunta ?? '');

  readonly admiteFraccionado = computed(() => ['coocurrencia', 'coautoria', 'cocitacion'].includes(this.analisis()));

  readonly conMinimo = computed(() => this.unidadReal() !== 'documentos');
  readonly conMinimoCitas = computed(() =>
    ['coautoria', 'citacion', 'acoplamiento'].includes(this.analisisReal()),
  );

  /** «De los 1 552 autores, 87 cumplen los umbrales», mientras se escribe. */
  readonly cumplen = computed(() => {
    const d = this.datosUmbral();
    if (!d) return 0;
    const docs = this.conMinimo() ? this.minimo() ?? d.propuesto ?? 1 : 0;
    const citas = this.conMinimoCitas() ? this.minimoCitas() ?? 0 : 0;
    // En documentos el umbral es de citas y va en el segundo campo.
    if (this.unidadReal() === 'documentos') return d.pares.filter(([, c]) => c >= citas).length;
    return d.pares.filter(([n, c]) => n >= docs && c >= citas).length;
  });

  readonly numeroPorDefecto = computed(() => {
    const n = this.cumplen();
    return this.esTexto() ? Math.max(1, Math.round(n * 0.6)) : Math.min(n, MAXIMO_EN_EL_MAPA);
  });

  readonly nombreDelEnlace = computed(() => NOMBRE_DEL_ENLACE[this.analisisReal()]);

  readonly puedeSeguir = computed(() => {
    if (this.cargando()) return false;
    switch (this.paso()) {
      case 'busqueda':
        return this.tema().trim().length >= 3;
      case 'mis-fuentes':
        return (this.misFuentes()?.total ?? 0) > 0;
      case 'umbral':
        return !!this.datosUmbral() && this.cumplen() >= 2;
      case 'numero':
        return (this.numero() ?? 0) >= 2;
      case 'verificar':
        return false;
      default:
        return true;
    }
  });

  /** «Finalizar», como en VOSviewer: desde que el análisis está elegido. */
  readonly puedeFinalizar = computed(() => {
    if (this.cargando()) return false;
    const i = this.pasos().indexOf(this.esTexto() ? 'campos' : 'analisis');
    if (this.indice() < i) return false;
    if (this.origen() === 'openalex' && this.tema().trim().length < 3) return false;
    if (this.paso() === 'verificar') return this.marcadas().size >= 2;
    return true;
  });

  readonly todasMarcadas = computed(() => {
    const p = this.previo();
    return !!p && p.resumen.filas.every((f) => this.marcadas().has(f.clave));
  });

  constructor() {
    // Al abrir: el foco a la ventana, para que Escape y el teclado vayan ahí.
    effect(() => {
      if (this.abierto()) setTimeout(() => this.ventana()?.nativeElement.focus());
    });

    // Al llegar a cada paso, lo que ese paso necesita del servidor.
    effect(() => {
      const paso = this.paso();
      if (!this.abierto()) return;
      untracked(() => {
        if (paso === 'mis-fuentes') this.cargarMisFuentes();
        if (paso === 'umbral') this.cargarUmbral();
        if (paso === 'numero') this.proponerNumero();
        if (paso === 'verificar') this.cargarPrevio();
      });
    });
  }

  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    if (this.abierto() && !this.cargando()) this.cancelar();
  }

  // ── Elecciones ───────────────────────────────────────────────────────────

  elegirTipoDatos(tipo: 'bibliograficos' | 'texto'): void {
    this.tipoDatos.set(tipo);
  }

  elegirOrigen(origen: 'openalex' | 'mis-fuentes'): void {
    this.origen.set(origen);
    // Con sus fuentes, lo natural son SUS palabras clave: las que puso el autor.
    if (this.analisis() === 'coocurrencia') {
      this.unidad.set(origen === 'mis-fuentes' ? 'palabras-autor' : 'palabras-openalex');
    }
  }

  elegirAnalisis(analisis: TipoDeAnalisis): void {
    this.analisis.set(analisis);
    const disponibles = this.unidadesDisponibles();
    if (!disponibles.includes(this.unidad())) this.unidad.set(disponibles[0]);
    if (!this.admiteFraccionado()) this.recuento.set('completo');
  }

  numeroDe(evento: Event): number | null {
    const valor = (evento.target as HTMLInputElement).value;
    return valor === '' ? null : Math.max(0, Math.floor(Number(valor)));
  }

  textoDe(evento: Event): string {
    return (evento.target as HTMLInputElement).value;
  }

  cambiarMaxAutores(evento: Event): void {
    this.maxAutores.set(Math.max(1, this.numeroDe(evento) ?? 25));
    this.recargarUmbral();
  }

  cambiarIgnorar(evento: Event): void {
    this.ignorarMuchosAutores.set((evento.target as HTMLInputElement).checked);
    this.recargarUmbral();
  }

  private temporizador: ReturnType<typeof setTimeout> | null = null;

  /** El tope de autores cambia qué documentos cuentan: se vuelve a pedir, sin prisa. */
  private recargarUmbral(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargarUmbral(), 400);
  }

  /** Un tesauro de VOSviewer (label / replace by), leído en el navegador. */
  cargarTesauro(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    if (archivo.size > 60_000) {
      this.error.set('Ese archivo es demasiado grande para un tesauro (más de 60 KB).');
      return;
    }
    archivo.text().then(
      (texto) => {
        this.tesauro.set(texto.replace(/^﻿/, ''));
        this.nombreTesauro.set(archivo.name);
        this.error.set(null);
      },
      () => this.error.set('No se pudo leer ese archivo.'),
    );
  }

  quitarTesauro(): void {
    this.tesauro.set('');
    this.nombreTesauro.set(null);
  }

  marcar(clave: string, evento: Event): void {
    const marcada = (evento.target as HTMLInputElement).checked;
    this.marcadas.update((actual) => {
      const nuevo = new Set(actual);
      if (marcada) nuevo.add(clave);
      else nuevo.delete(clave);
      return nuevo;
    });
  }

  marcarTodas(evento: Event): void {
    const todas = (evento.target as HTMLInputElement).checked;
    this.marcadas.set(new Set(todas ? this.previo()?.resumen.filas.map((f) => f.clave) ?? [] : []));
  }

  // ── Navegación ───────────────────────────────────────────────────────────

  atras(): void {
    this.error.set(null);
    this.indice.update((i) => Math.max(0, i - 1));
  }

  siguiente(): void {
    if (!this.puedeSeguir()) return;
    this.error.set(null);
    this.indice.update((i) => Math.min(this.pasos().length - 1, i + 1));
  }

  cancelar(): void {
    this.error.set(null);
    this.cerrar.emit();
  }

  /** «Finalizar»: el mapa con lo elegido, y lo que falte con los valores por defecto. */
  finalizar(): void {
    if (!this.puedeFinalizar()) return;

    const previo = this.previo();
    if (this.paso() === 'verificar' && previo && this.todasMarcadas()) {
      this.entregar(previo, this.pedido());
      return;
    }

    const pedido = this.paso() === 'verificar' ? { ...this.pedido(), seleccion: [...this.marcadas()] } : this.pedido();
    this.cargando.set('Creando el mapa…');
    this.error.set(null);
    this.mapas.crear(pedido).subscribe({
      next: (mapa) => {
        this.cargando.set(null);
        this.entregar(mapa, pedido);
      },
      error: (fallo) => {
        this.cargando.set(null);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  private entregar(mapa: MapaDeVosviewer, pedido: PedidoDeMapa): void {
    this.listo.emit({ mapa, pedido });
  }

  // ── Lo que se pide al servidor ───────────────────────────────────────────

  /** El pedido con todo lo elegido hasta ahora. */
  pedido(): PedidoDeMapa {
    const analisis = this.analisisReal();
    const unidad = this.unidadReal();
    const numero = this.numero() ?? this.numeroPorDefecto();
    return {
      origen: this.origen(),
      analisis,
      unidad,
      recuento: this.esTexto() ? this.recuentoTexto() : this.recuento(),
      ...(this.origen() === 'openalex' && {
        tema: this.tema().trim(),
        desdeAnio: this.desdeAnio(),
        hastaAnio: this.hastaAnio(),
        cuantas: this.cuantas(),
      }),
      minimo: this.conMinimo() ? this.minimo() : null,
      minimoCitas: this.conMinimoCitas() || unidad === 'documentos' ? this.minimoCitas() : null,
      maxAutores: analisis === 'coautoria' ? (this.ignorarMuchosAutores() ? this.maxAutores() : 1000) : null,
      maximo: analisis === 'terminos' ? 100 : Math.min(Math.max(numero || 100, 5), MAXIMO_EN_EL_MAPA),
      cuantosTerminos: analisis === 'terminos' && numero ? numero : null,
      sinonimos: this.tesauro(),
    };
  }

  /** Lo que determina los datos del umbral: si cambia, hay que volver a pedirlos. */
  private claveDeDatos(): string {
    const p = this.pedido();
    return JSON.stringify([p.origen, p.tema, p.desdeAnio, p.hastaAnio, p.cuantas, p.analisis, p.unidad, p.recuento, p.maxAutores, p.sinonimos]);
  }

  private cargarMisFuentes(): void {
    if (this.misFuentes()) return;
    this.cargando.set('Contando tus fuentes…');
    this.fuentes.resumen().subscribe({
      next: (r) => {
        this.cargando.set(null);
        this.misFuentes.set({ total: r.total, sinResumen: r.sinResumen });
      },
      error: (fallo) => {
        this.cargando.set(null);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  private cargarUmbral(): void {
    const clave = this.claveDeDatos();
    if (clave === this.claveUmbral && this.datosUmbral()) return;

    // Solo una búsqueda nueva va a OpenAlex; lo demás sale de lo ya leído.
    const p = this.pedido();
    const fuente = JSON.stringify([p.origen, p.tema, p.desdeAnio, p.hastaAnio, p.cuantas]);
    const nueva = fuente !== this.claveFuente;
    this.claveFuente = fuente;
    this.cargando.set(nueva ? 'Leyendo los datos… Puede tardar hasta 20 segundos.' : 'Contando…');
    this.error.set(null);

    // El mínimo propuesto se pone solo si cambió lo que se analiza; si solo
    // cambió el tope de autores, se respeta el que el tesista escribió.
    const mismoAnalisis = this.datosUmbral()?.analisis === this.analisisReal() && this.datosUmbral()?.unidad === this.unidadReal();

    this.mapas.umbral({ ...this.pedido(), minimo: null }).subscribe({
      next: (datos) => {
        this.cargando.set(null);
        this.claveUmbral = clave;
        this.datosUmbral.set(datos);
        if (!mismoAnalisis) {
          this.minimo.set(datos.propuesto);
          this.minimoCitas.set(0);
          this.numero.set(null);
        }
      },
      error: (fallo) => {
        this.cargando.set(null);
        this.datosUmbral.set(null);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  private proponerNumero(): void {
    const clave = `${this.claveUmbral}|${this.minimo()}|${this.minimoCitas()}`;
    if (clave !== this.claveNumero || this.numero() === null) {
      this.claveNumero = clave;
      this.numero.set(this.numeroPorDefecto());
    }
  }

  private cargarPrevio(): void {
    const pedido = this.pedido();
    const clave = JSON.stringify(pedido);
    if (clave === this.clavePrevio && this.previo()) return;

    this.cargando.set('Calculando la fuerza de los enlaces…');
    this.error.set(null);
    this.mapas.crear(pedido).subscribe({
      next: (mapa) => {
        this.cargando.set(null);
        this.clavePrevio = clave;
        this.previo.set(mapa);
        this.marcadas.set(new Set(mapa.resumen.filas.map((f) => f.clave)));
      },
      error: (fallo) => {
        this.cargando.set(null);
        this.previo.set(null);
        this.error.set(toApiError(fallo).message);
      },
    });
  }
}
