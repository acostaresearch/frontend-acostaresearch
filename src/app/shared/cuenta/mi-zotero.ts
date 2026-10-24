import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { toApiError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import { EstadoDeZotero, QuePuedeTraer, ZoteroService } from '../../core/services/zotero.service';
import { AvisoFlotante } from '../layout/aviso-flotante';
import { GuiaDeUso, MensajeDeEjemplo, PasoDeGuia } from './guia-de-uso';

const PASOS: readonly PasoDeGuia[] = [
  {
    titulo: 'Conecta tu Zotero',
    detalle:
      'Pulsa «Conectar mi Zotero» y autoriza en zotero.org. Es solo lectura: no cambiamos ni borramos nada de tu biblioteca, y no tienes que copiar ninguna clave.',
  },
  {
    titulo: 'Elige qué traer',
    detalle:
      'Una colección con las fuentes de tu tesis, o toda tu biblioteca. Se trae al momento y luego se pone al día sola cada noche.',
  },
  {
    titulo: 'Pídeselo a Claude',
    detalle:
      'En tu conector, pídele que te muestre tus fuentes o que busque en ellas un tema. Las usa para redactar y citar, y tu Word sale con las citas listas.',
  },
];

const FRASES: readonly string[] = [
  'muéstrame mis fuentes de Zotero',
  'busca en mis fuentes sobre…',
  'usa mis fuentes de Zotero para los antecedentes',
];

const EJEMPLO: readonly MensajeDeEjemplo[] = [
  { de: 'tu', texto: 'Muéstrame mis fuentes de Zotero.' },
  {
    de: 'claude',
    texto:
      'Tienes 38 fuentes de tu colección «Tesis». Las más recientes son de 2024 y 2025, casi todas artículos de revista.',
  },
  { de: 'tu', texto: 'Busca en mis fuentes sobre satisfacción laboral.' },
  {
    de: 'claude',
    texto:
      'Encontré 6 que tratan el tema. También busqué en inglés, «job satisfaction», porque la mitad de tus fuentes están en ese idioma. ¿Las uso para tus antecedentes?',
  },
  { de: 'tu', texto: 'Sí, redacta los antecedentes con ellas.' },
  {
    de: 'claude',
    texto:
      'Listo. Cada párrafo cita a su autor y al final va la lista de referencias. En tu Word las citas salen enlazadas a tus ítems de Zotero.',
  },
];

/**
 * Conectar el Zotero del propio tesista.
 *
 * TRES DECISIONES QUE SE VEN EN LA PANTALLA
 * -----------------------------------------
 * 1. Se elige QUÉ traer, y conectar no lo trae: al volver de Zotero todavía no
 *    hay nada importado. Lo recomendable es una colección —la biblioteca de un
 *    tesista lleva años de asignaturas encima, y entera le llenaría sus propias
 *    búsquedas de ruido que él no puso— pero traerlo todo es una opción de
 *    primera fila, porque hay quien no usa carpetas y a ese no se le puede
 *    mandar a crearlas para poder empezar.
 *
 * 2. Nunca se le pide una clave de API. Autoriza en zotero.org y la clave la
 *    emite Zotero a su nombre. Aquí no se enseña, ni entera ni con asteriscos:
 *    no la tenemos y no debe pasar por el navegador.
 *
 * 3. Desconectar no borra sus fuentes. Están citadas en sus capítulos, y
 *    llevárselas le dejaría la tesis con claves que no resuelven. Se dice en la
 *    propia ventana de confirmar, porque es justo lo que teme quien la abre.
 */
@Component({
  selector: 'app-mi-zotero',
  imports: [AvisoFlotante, DatePipe, GuiaDeUso],
  templateUrl: './mi-zotero.html',
  styleUrl: './mi-zotero.css',
})
export class MiZoteroPanel implements OnInit {
  private readonly zotero = inject(ZoteroService);
  private readonly dialogos = inject(DialogoService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly estado = signal<EstadoDeZotero | null>(null);

  readonly pasos = PASOS;
  readonly frases = FRASES;
  readonly ejemplo = EJEMPLO;

  /** Por dónde va: sin conectar, sin elegir qué traer, o ya con sus fuentes. */
  readonly pasoActual = computed(() => {
    const datos = this.estado();
    if (!datos?.conectado) return 0;
    return datos.coleccion ? 2 : 1;
  });
  readonly colecciones = signal<QuePuedeTraer | null>(null);

  readonly cargando = signal(true);
  readonly conectando = signal(false);
  readonly trayendo = signal(false);
  readonly error = signal<string | null>(null);
  /** El parte de la última pasada pedida a mano. */
  readonly parte = signal<string | null>(null);

  /**
   * Lo que trajo la vuelta desde zotero.org: ok, cancelado o error.
   *
   * Llega en la dirección porque quien redirige es Zotero y no nosotros. Se lee
   * una vez y se limpia de la barra: recargar la página no debería volver a
   * anunciar algo que pasó hace diez minutos.
   */
  readonly vuelta = signal<string | null>(null);

  /**
   * Buscar entre sus colecciones.
   *
   * Quien lleva años en Zotero tiene decenas, y la de la tesis queda enterrada
   * bajo las de cada asignatura. Se busca por el camino entero —«Tesis ›
   * Antecedentes»—, sin distinguir mayúsculas ni tildes: nadie escribe
   * «Metodología» con la tilde cuando busca deprisa.
   */
  readonly busqueda = signal('');

  readonly encontradas = computed(() => {
    const colecciones = this.colecciones()?.colecciones ?? [];
    const texto = normalizar(this.busqueda().trim());
    if (!texto) return colecciones;
    return colecciones.filter((coleccion) => normalizar(coleccion.nombre).includes(texto));
  });

  /** Algo de la lista tiene PDFs sin ficha: se explica por qué no cuentan. */
  readonly hayPdfsSinFicha = computed(() => {
    const puede = this.colecciones();
    if (!puede) return false;
    return Boolean(puede.biblioteca.sinFicha) || puede.colecciones.some((c) => c.sinFicha);
  });

  ngOnInit(): void {
    const resultado = this.ruta.snapshot.queryParamMap.get('zotero');
    if (resultado) {
      this.vuelta.set(resultado);
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { zotero: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    this.cargar();
  }

  private cargar(): void {
    this.zotero.estado().subscribe({
      next: (estado) => {
        this.estado.set(estado);
        this.cargando.set(false);
        // Conectado y sin colección es un intercambio a medias: la lista se
        // pide sola para que no tenga que buscar dónde pulsar.
        if (estado.conectado && !estado.coleccion) this.pedirColecciones();
      },
      error: () => {
        this.estado.set(null);
        this.cargando.set(false);
      },
    });
  }

  conectar(): void {
    if (this.conectando()) return;
    this.conectando.set(true);
    this.error.set(null);

    this.zotero.conectar().subscribe({
      next: ({ url }) => {
        // Navegación completa y en esta misma pestaña: al terminar, Zotero
        // devuelve al tesista aquí. Una pestaña nueva lo dejaría mirando la
        // vieja, que no se entera de nada.
        window.location.href = url;
      },
      error: (fallo) => {
        this.conectando.set(false);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  /**
   * El campo está siempre a la vista junto a «Zotero conectado», también con
   * la lista cerrada: al entrar en él se pide la lista para filtrarla.
   */
  abrirBusqueda(): void {
    if (!this.colecciones() && !this.trayendo()) this.pedirColecciones();
  }

  /** Escribir no reintenta una lista que falló: eso lo hace volver a entrar al campo. */
  buscar(texto: string): void {
    this.busqueda.set(texto);
    if (!this.fallaronColecciones()) this.abrirBusqueda();
  }

  limpiarBusqueda(): void {
    this.busqueda.set('');
  }

  /**
   * Una sola petición a la vez, y tras un fallo no se repite sola.
   *
   * El buscador la pide al escribir mientras no haya lista. Si fallaba, la lista
   * seguía vacía y cada tecla lanzaba otra: en segundos se gastaba el límite del
   * servidor y «Conectar Zotero» respondía 429. Después de un fallo se reintenta
   * solo con el botón.
   */
  private pidiendoColecciones = false;
  private readonly fallaronColecciones = signal(false);

  pedirColecciones(): void {
    if (this.pidiendoColecciones) return;
    this.pidiendoColecciones = true;
    this.fallaronColecciones.set(false);
    this.error.set(null);
    this.zotero.colecciones().subscribe({
      next: (lo) => {
        this.pidiendoColecciones = false;
        this.colecciones.set(lo);
      },
      error: (fallo) => {
        this.pidiendoColecciones = false;
        this.fallaronColecciones.set(true);
        this.colecciones.set(null);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  elegir(clave: string): void {
    if (this.trayendo()) return;
    this.trayendo.set(true);
    this.error.set(null);
    this.parte.set(null);

    this.zotero.elegir(clave).subscribe({
      next: () => {
        this.colecciones.set(null);
        this.limpiarBusqueda();
        // La primera pasada la lanza el servidor por detrás, así que aquí no
        // hay cifras todavía: se vuelve a preguntar el estado en unos segundos.
        this.parte.set('Trayendo tu colección. Tarda unos segundos.');
        setTimeout(() => {
          this.trayendo.set(false);
          this.cargar();
        }, 6000);
      },
      error: (fallo) => {
        this.trayendo.set(false);
        this.error.set(toApiError(fallo).message);
      },
    });
  }

  /** Cambiar de colección: se vuelve a enseñar la lista. */
  cambiar(): void {
    this.limpiarBusqueda();
    this.pedirColecciones();
  }

  sincronizar(): void {
    if (this.trayendo()) return;
    this.trayendo.set(true);
    this.error.set(null);
    this.parte.set(null);

    this.zotero.sincronizar().subscribe({
      next: (resultado) => {
        this.trayendo.set(false);
        // Si quedó en 0, no se dice «ya estaba al día»: lo explica el aviso
        // de los PDF sin ficha, que sale al recargar el estado.
        const fuera = resultado.sinFicha
          ? ` ${resultado.sinFicha} PDF sin ficha se quedaron fuera.`
          : '';
        this.parte.set(
          resultado.guardadas > 0
            ? `${resultado.guardadas} fuentes nuevas.${fuera}`
            : resultado.total > 0
              ? `Ya estaba al día.${fuera}`
              : null,
        );
        this.cargar();
      },
      error: (fallo) => {
        this.trayendo.set(false);
        this.error.set(toApiError(fallo).message);
        this.cargar();
      },
    });
  }

  async desconectar(): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: 'Desconectar Zotero',
      mensaje: 'Dejaremos de entrar en tu biblioteca de Zotero.',
      nota: 'Las fuentes que ya se trajeron se quedan donde están: si las quitáramos, las citas que ya escribiste en tus capítulos dejarían de resolver.',
      confirmar: 'Desconectar',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.error.set(null);
    this.zotero.desconectar().subscribe({
      next: () => {
        this.colecciones.set(null);
        this.limpiarBusqueda();
        this.parte.set(null);
        this.vuelta.set(null);
        this.cargar();
      },
      error: (fallo) => this.error.set(toApiError(fallo).message),
    });
  }
}

/** Minúsculas y sin tildes: «Metodología» y «metodologia» son la misma búsqueda. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
