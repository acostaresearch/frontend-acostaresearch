import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { toApiError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import { MendeleyService } from '../../core/services/mendeley.service';
import { EstadoDeZotero, QuePuedeTraer } from '../../core/services/zotero.service';
import { AvisoFlotante } from '../layout/aviso-flotante';
import { GuiaDeUso, MensajeDeEjemplo, PasoDeGuia } from './guia-de-uso';

const PASOS: readonly PasoDeGuia[] = [
  {
    titulo: 'Conecta tu Mendeley',
    detalle:
      'Pulsa «Conectar mi Mendeley» y autoriza en mendeley.com. Mendeley pide permiso completo, pero solo leemos: no cambiamos ni borramos nada, y no tienes que copiar ninguna clave.',
  },
  {
    titulo: 'Elige qué traer',
    detalle:
      'Una carpeta con las fuentes de tu tesis, o toda tu biblioteca. Luego se pone al día sola cada noche.',
  },
  {
    titulo: 'Pídeselo a Claude',
    detalle:
      'En tu conector, pídele que te muestre tus fuentes o que busque en ellas un tema. Las usa para redactar y citar, y tu Word sale con las citas y la bibliografía en la norma de tu proyecto.',
  },
];

const FRASES: readonly string[] = [
  'muéstrame mis fuentes de Mendeley',
  'busca en mis fuentes sobre…',
  'usa mis fuentes de Mendeley para los antecedentes',
];

const EJEMPLO: readonly MensajeDeEjemplo[] = [
  { de: 'tu', texto: 'Muéstrame mis fuentes de Mendeley.' },
  {
    de: 'claude',
    texto:
      'Tienes 42 fuentes de tu carpeta «Tesis». La mayoría son artículos de revista de los últimos cinco años.',
  },
  { de: 'tu', texto: 'Busca en mis fuentes sobre clima organizacional.' },
  {
    de: 'claude',
    texto: 'Encontré 7 que tratan el tema. ¿Las uso para tus antecedentes?',
  },
  { de: 'tu', texto: 'Sí, redacta los antecedentes con ellas.' },
  {
    de: 'claude',
    texto:
      'Listo. Cada párrafo cita a su autor, y en tu Word las citas y la bibliografía salen en la norma de tu proyecto.',
  },
];

/**
 * Conectar el Mendeley del propio tesista.
 *
 * Es el gemelo de `MiZoteroPanel`, y las tres decisiones de aquel valen aquí:
 * se elige QUÉ traer (una carpeta o toda la biblioteca), nunca se pide una
 * clave —autoriza en mendeley.com— y desconectar no borra sus fuentes.
 *
 * Lo que cambia es una advertencia que Zotero no necesita: Mendeley no tiene
 * permiso de solo lectura, así que la autorización que concede el tesista
 * permitiría escribir. No lo hacemos, y la pantalla lo dice en esos términos
 * en vez de prometer «solo lectura».
 */
@Component({
  selector: 'app-mi-mendeley',
  imports: [AvisoFlotante, DatePipe, GuiaDeUso],
  templateUrl: './mi-mendeley.html',
  // Los estilos del panel de Zotero: es la misma pieza con otro servicio.
  styleUrl: './mi-zotero.css',
})
export class MiMendeleyPanel implements OnInit {
  private readonly mendeley = inject(MendeleyService);
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
   * Lo que trajo la vuelta desde mendeley.com: ok, cancelado o error.
   *
   * Llega en la dirección porque quien redirige es Mendeley y no nosotros. Se lee
   * una vez y se limpia de la barra: recargar la página no debería volver a
   * anunciar algo que pasó hace diez minutos.
   */
  readonly vuelta = signal<string | null>(null);

  /**
   * Buscar entre sus colecciones.
   *
   * Quien lleva años en Mendeley tiene decenas de carpetas, y la de la tesis
   * queda enterrada bajo las de cada asignatura. Se busca por el camino entero —«Tesis ›
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

  ngOnInit(): void {
    const resultado = this.ruta.snapshot.queryParamMap.get('mendeley');
    if (resultado) {
      this.vuelta.set(resultado);
      void this.router.navigate([], {
        relativeTo: this.ruta,
        queryParams: { mendeley: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    this.cargar();
  }

  private cargar(): void {
    this.mendeley.estado().subscribe({
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

    this.mendeley.conectar().subscribe({
      next: ({ url }) => {
        // Navegación completa y en esta misma pestaña: al terminar, Mendeley
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
   * El campo está siempre a la vista junto a «Mendeley conectado», también con
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
   * servidor y «Conectar» respondía 429. Después de un fallo se reintenta
   * solo con el botón.
   */
  private pidiendoColecciones = false;
  private readonly fallaronColecciones = signal(false);

  pedirColecciones(): void {
    if (this.pidiendoColecciones) return;
    this.pidiendoColecciones = true;
    this.fallaronColecciones.set(false);
    this.error.set(null);
    this.mendeley.carpetas().subscribe({
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

    this.mendeley.elegir(clave).subscribe({
      next: () => {
        this.colecciones.set(null);
        this.limpiarBusqueda();
        // La primera pasada la lanza el servidor por detrás, así que aquí no
        // hay cifras todavía: se vuelve a preguntar el estado en unos segundos.
        this.parte.set('Trayendo tu carpeta. Tarda unos segundos.');
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

    this.mendeley.sincronizar().subscribe({
      next: (resultado) => {
        this.trayendo.set(false);
        this.parte.set(
          resultado.guardadas > 0 ? `${resultado.guardadas} fuentes nuevas.` : 'Ya estaba al día.',
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
      titulo: 'Desconectar Mendeley',
      mensaje: 'Dejaremos de entrar en tu biblioteca de Mendeley.',
      nota: 'Las fuentes que ya se trajeron se quedan donde están: si las quitáramos, las citas que ya escribiste en tus capítulos dejarían de resolver.',
      confirmar: 'Desconectar',
      tono: 'peligro',
    });
    if (!seguro) return;

    this.error.set(null);
    this.mendeley.desconectar().subscribe({
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
