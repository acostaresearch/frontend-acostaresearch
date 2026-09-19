import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';

import { toApiError } from '../../core/http/api-error';
import { License } from '../../core/models/payment.model';
import { DialogoService } from '../../core/services/dialogo.service';
import { FondoService } from '../../core/services/fondo.service';
import { LicenseService } from '../../core/services/license.service';
import {
  EtapaDelProyecto,
  Proyecto,
  ProyectoService,
  TesisDelMetodo,
} from '../../core/services/proyecto.service';
import { AvisoFlotante } from '../layout/aviso-flotante';

/** Qué se está bajando: la tesis armada, la bibliografía o el documento que subió, ya citado. */
type Formato = 'word' | 'bib' | 'documento';

/** Las veces que cada tesis puede empezar de cero. El tope lo pone el servidor; esto solo lo cuenta. */
const MAX_REINICIOS = 3;

/** Media lista de fases, con su rótulo: «Fases 1 a 6». */
interface Columna {
  rotulo: string;
  fases: EtapaDelProyecto[];
}

/** Lo que dice el recuadro de «varias tesis», que cambia con el género de la palabra. */
interface TextosDeVarias {
  titulo: string;
  explicacion: string;
  nueva: string;
  usar: string;
  principal: string;
  otra: string;
  activa: string;
  trabajara: string;
  deEsta: string;
  borrar: string;
}

const TEXTOS: Record<NonNullable<Proyecto['tipo']>, TextosDeVarias> = {
  tesis: {
    titulo: 'Qué tesis usar',
    explicacion:
      'Claude trabaja con la activa, y lo que ves debajo es de ella. Elige otra para cambiar.',
    nueva: 'Nueva tesis',
    usar: 'Usar esta',
    principal: 'Tesis principal',
    otra: 'Otra tesis',
    activa: 'tu tesis activa',
    trabajara: 'Claude trabajará con ella',
    deEsta: 'de esta tesis. Tus otras tesis no se tocan.',
    borrar: 'Borrar esta tesis',
  },
  articulo: {
    titulo: 'Qué artículo usar',
    explicacion:
      'Claude trabaja con el activo, y lo que ves debajo es de él. Elige otro para cambiar.',
    nueva: 'Nuevo artículo',
    usar: 'Usar este',
    principal: 'Artículo principal',
    otra: 'Otro artículo',
    activa: 'tu artículo activo',
    trabajara: 'Claude trabajará con él',
    deEsta: 'de este artículo. Tus otros artículos no se tocan.',
    borrar: 'Borrar este artículo',
  },
  informe: {
    titulo: 'Qué informe usar',
    explicacion:
      'Claude trabaja con el activo, y lo que ves debajo es de él. Elige otro para cambiar.',
    nueva: 'Nuevo informe',
    usar: 'Usar este',
    principal: 'Informe principal',
    otra: 'Otro informe',
    activa: 'tu informe activo',
    trabajara: 'Claude trabajará con él',
    deEsta: 'de este informe. Tus otros informes no se tocan.',
    borrar: 'Borrar este informe',
  },
};

/**
 * Por dónde va su tesis.
 *
 * Esto lo escribe el conector, no esta pantalla: según el tesista va cerrando
 * cosas con Claude, el servidor las anota. Aquí solo se leen. Es a propósito —
 * lo que se decide se decide trabajando, y una pantalla donde marcar casillas a
 * mano acabaría diciendo una cosa distinta de la que sabe el asistente.
 *
 * Cada método comprado sale aquí aunque no tenga nada guardado —o se acabe de
 * borrar—, con sus fases en blanco. Sin licencia ni proyecto no se enseña nada.
 */
@Component({
  selector: 'app-mi-tesis',
  imports: [AvisoFlotante, DatePipe],
  templateUrl: './mi-tesis.html',
  styleUrl: './mi-tesis.css',
})
export class MiTesis implements OnInit {
  private readonly proyectos = inject(ProyectoService);
  private readonly dialogos = inject(DialogoService);
  private readonly licenciasApi = inject(LicenseService);
  private readonly fondo = inject(FondoService);

  /**
   * Los accesos de quien mira, que los pide el panel de arriba.
   *
   * Llegan de fuera y no se piden aquí otra vez: `MiConector` ya los trae para
   * saber si enseñar el resto de la pantalla, y pedirlos dos veces serían dos
   * viajes para lo mismo.
   */
  readonly licencias = input<License[]>([]);

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly lista = signal<Proyecto[]>([]);

  /** Qué capítulos se ven desplegados. Empiezan todos cerrados. */
  private readonly abiertos = signal<ReadonlySet<string>>(new Set());

  /**
   * El proyecto que se ve, cuando tiene más de uno (tesis y artículo).
   *
   * Uno a la vez, en pestañas: los dos apilados eran dos pantallas enteras de
   * capítulos, y el segundo quedaba tan abajo que parecía otra sección. Sin
   * elegir, el primero, que es el último que tocó.
   */
  private readonly elegido = signal<string | null>(null);
  readonly proyecto = computed(
    () => this.lista().find((p) => p.productCode === this.elegido()) ?? this.lista()[0] ?? null,
  );

  readonly fases = computed(() => this.proyecto()?.etapas.filter((e) => !e.apoyo) ?? []);
  readonly apoyos = computed(() => this.proyecto()?.etapas.filter((e) => e.apoyo) ?? []);

  /**
   * Las fases en dos columnas, partidas por la mitad.
   *
   * Por la mitad y no por capítulos: el artículo tiene once fases con una 3B
   * en medio, y cualquier corte «por sentido» habría que mantenerlo a mano cada
   * vez que cambie el catálogo.
   */
  readonly columnas = computed<Columna[]>(() => {
    const fases = this.fases();
    const mitad = Math.ceil(fases.length / 2);
    return [fases.slice(0, mitad), fases.slice(mitad)]
      .filter((trozo) => trozo.length > 0)
      .map((trozo) => ({ rotulo: this.rotulo(trozo), fases: trozo }));
  });

  /** Si se ve el recuadro de cómo retomarlo en Claude. */
  readonly retomarAbierto = signal(false);
  readonly copiado = signal(false);

  /**
   * Elegir por qué fase retomar.
   *
   * Con varias a medias, la regla —la primera en curso— no sabe cuál quiere
   * seguir hoy: a quien tenía Tema, Capítulo I y Resultados empezados se le
   * mandaba siempre al Tema. Se guarda en el servidor y no aquí, porque el
   * conector la usa cuando le dice a Claude «sigamos».
   */
  readonly eligiendoRetomar = signal(false);
  readonly guardandoRetomar = signal(false);
  readonly errorRetomar = signal<string | null>(null);
  /** Las fases que se pueden elegir: las que no están terminadas, en su orden. */
  readonly abiertasParaRetomar = computed(() => this.fases().filter((f) => f.estado !== 'LISTO'));

  elegirRetomar(p: Proyecto, capitulo: string | null): void {
    if (this.guardandoRetomar()) return;
    // Pulsar la que ya está elegida no cambia nada: solo se cierra la lista.
    if (capitulo !== null && capitulo === p.siguiente?.code && p.retomarElegido) {
      this.eligiendoRetomar.set(false);
      return;
    }

    this.guardandoRetomar.set(true);
    this.errorRetomar.set(null);
    const fallo = (e: unknown) => {
      this.guardandoRetomar.set(false);
      this.errorRetomar.set(toApiError(e).message);
    };

    this.proyectos.elegirRetomar(p.productCode, capitulo).subscribe({
      next: () => {
        this.elegido.set(p.productCode);
        // La frase de «cómo retomarlo» nombra la fase: se cierra para que no
        // quede a la vista la de antes mientras llega la nueva.
        this.retomarAbierto.set(false);
        this.copiado.set(false);
        this.proyectos.mios().subscribe({
          next: (datos) => {
            this.lista.set(datos);
            this.guardandoRetomar.set(false);
            this.eligiendoRetomar.set(false);
          },
          error: fallo,
        });
      },
      error: fallo,
    });
  }

  elegir(productCode: string): void {
    this.elegido.set(productCode);
    this.retomarAbierto.set(false);
    this.eligiendoRetomar.set(false);
    this.errorRetomar.set(null);
    this.copiado.set(false);
    this.errorBorrado.set(null);
    this.avisoBorrado.set(null);
    // El fallo al generar la URL era del acceso de la OTRA pestaña.
    this.errorLicencia.set(null);
  }

  // ── El acceso del conector ───────────────────────────────────────────────
  //
  // Su URL y lo que lleva gastado, del producto que está a la vista. Antes era
  // una lista de accesos aparte, debajo de todo: con tres métodos comprados
  // había que emparejar a mano cada acceso con su pestaña, y la única pregunta
  // que se le hace a esa lista —«dame la URL de esto que estoy mirando»— se
  // contesta aquí sin buscar.

  /**
   * El acceso del proyecto elegido.
   *
   * De haber varios del mismo método —una renovación sobre la anterior— manda
   * el que sirve: enseñar el gasto de una licencia muerta teniendo otra viva al
   * lado diría que el conector no está contando.
   */
  readonly licenciaActual = computed(() => {
    const producto = this.proyecto()?.productCode;
    if (!producto) return null;

    const suyas = this.licencias().filter((l) => l.productCode === producto);
    return suyas.find((l) => this.puedeRotar(l)) ?? suyas[0] ?? null;
  });

  /**
   * ¿Se le puede pedir una URL nueva?
   *
   * Solo a un acceso vivo. A uno caducado o revocado se le daría una URL que
   * el conector rechazaría en la primera consulta, y el tesista creería que lo
   * pegó mal en Claude.
   */
  puedeRotar(licencia: License): boolean {
    return (
      licencia.status === 'ACTIVE' &&
      !licencia.retirado &&
      (!licencia.expiresAt || new Date(licencia.expiresAt) > new Date())
    );
  }

  /**
   * Lo único que quedaba de las fichas de acceso y hace falta saber: que a este
   * se le acaba el tiempo. Callado mientras no urge —quince días es cuando aún
   * da tiempo a renovar sin quedarse a medias de un capítulo—, porque un aviso
   * permanente deja de leerse.
   */
  readonly avisoDeAcceso = computed(() => {
    const licencia = this.licenciaActual();
    if (!licencia || !licencia.expiresAt) return null;

    const faltan = new Date(licencia.expiresAt).getTime() - Date.now();
    if (faltan <= 0) return 'Tu acceso a este método caducó. Renuévalo para seguir usándolo en Claude.';

    const dias = Math.ceil(faltan / 86_400_000);
    return dias <= 15 ? `A tu acceso a este método le quedan ${dias} días.` : null;
  });

  /** La URL recién hecha, con el producto del que es. Solo se puede enseñar al crearla. */
  readonly urlNueva = signal<{ url: string; producto: string } | null>(null);
  readonly urlCopiada = signal(false);
  readonly rotando = signal(false);
  readonly errorLicencia = signal<string | null>(null);

  constructor() {
    // Congela la página mientras la ventana de la URL está delante.
    effect(() => this.fondo.fijar('url-del-conector', this.urlNueva() !== null));
  }

  /**
   * Genera una URL nueva para este método y anula la anterior.
   *
   * Es la única forma de recuperar el acceso cuando se pierde la URL: del token
   * solo se guarda su hash. Por eso se pregunta antes —la de Claude deja de
   * funcionar en el acto— y por eso la nueva sale en una ventana y no en un
   * rincón de la pantalla.
   */
  async generarUrl(p: Proyecto, licencia: License): Promise<void> {
    if (this.rotando()) return;

    const nombre = this.nombreCorto(p);
    const seguro = await this.dialogos.confirmar({
      titulo: `Generar una URL nueva de ${nombre}`,
      mensaje: 'La anterior dejará de funcionar en el acto.',
      nota: 'Tendrás que pegar la nueva en Claude para seguir usando el conector.',
      confirmar: 'Generar URL nueva',
      tono: 'aviso',
    });
    if (!seguro || this.rotando()) return;

    this.rotando.set(true);
    this.errorLicencia.set(null);
    this.urlCopiada.set(false);

    this.licenciasApi.rotate(licencia.id).subscribe({
      next: ({ connectorUrl }) => {
        this.urlNueva.set({ url: connectorUrl, producto: nombre });
        this.rotando.set(false);
      },
      error: (e) => {
        this.errorLicencia.set(toApiError(e).message);
        this.rotando.set(false);
      },
    });
  }

  async copiarUrl(): Promise<void> {
    const nueva = this.urlNueva();
    if (!nueva) return;

    try {
      await navigator.clipboard.writeText(nueva.url);
      this.urlCopiada.set(true);
    } catch {
      // La URL sigue a la vista para copiarla a mano, que es lo que se haría
      // de todos modos. La ventana no se cierra sola por esto.
      this.errorLicencia.set('No pudimos copiar. Selecciona la URL y cópiala a mano.');
    }
  }

  cerrarUrl(): void {
    this.urlNueva.set(null);
    this.urlCopiada.set(false);
  }

  /** «Método de Tesis · 9 Capítulos + …» → «Método de Tesis», para la pestaña. */
  nombreCorto(p: Proyecto): string {
    return (p.productName ?? p.productCode).split(' · ')[0];
  }

  /** Lo que se le escribe a Claude para seguir por donde lo dejó. */
  frase(p: Proyecto): string {
    return p.siguiente ? `Sigamos con «${p.siguiente.displayName}», con el método.` : '';
  }

  copiarFrase(p: Proyecto): void {
    navigator.clipboard?.writeText(this.frase(p)).then(
      () => this.copiado.set(true),
      // Sin permiso para el portapapeles la frase sigue a la vista para
      // copiarla a mano, que es lo que se haría de todos modos.
      () => this.copiado.set(false),
    );
  }

  /** «7 · Capítulo IV…» → «7»; «Fase 3B — …» → «3B». */
  private numero(fase: EtapaDelProyecto): string {
    return /^\s*(?:fase\s+)?(\d+[a-z]?)/i.exec(fase.displayName)?.[1] ?? '';
  }

  private rotulo(fases: EtapaDelProyecto[]): string {
    const primera = this.numero(fases[0]);
    const ultima = this.numero(fases[fases.length - 1]);
    if (!primera || !ultima) return 'Fases';
    return primera === ultima ? `Fase ${primera}` : `Fases ${primera} a ${ultima}`;
  }

  /**
   * Qué se está bajando, si es que hay algo.
   *
   * Lleva el formato además del producto porque hay dos botones por proyecto:
   * con solo el código, pulsar «Word» dejaba también el `.bib` en «Preparando…»
   * y parecía que se estaban armando los dos.
   */
  readonly bajando = signal<{ productCode: string; formato: Formato } | null>(null);
  readonly errorDescarga = signal<string | null>(null);

  ngOnInit(): void {
    this.proyectos.mios().subscribe({
      next: (datos) => {
        this.lista.set(datos);
        this.cargando.set(false);
      },
      error: (e) => {
        // Que esto falle no puede estropear el panel entero: es información de
        // apoyo, y el conector sigue funcionando sin ella.
        this.error.set(toApiError(e).message);
        this.cargando.set(false);
      },
    });
  }

  /** Palabras escritas en todo el proyecto. Cero = no hay nada que descargar. */
  palabrasTotales(p: Proyecto): number {
    return p.etapas.reduce((suma, e) => suma + (e.palabras ?? 0), 0);
  }

  /** ¿Se está armando este archivo de este proyecto? */
  seEstaBajando(p: Proyecto, formato: Formato): boolean {
    const enCurso = this.bajando();
    return enCurso?.productCode === p.productCode && enCurso.formato === formato;
  }

  /**
   * Baja el Word o la bibliografía en BibTeX.
   *
   * El archivo llega como datos, no como un enlace: la ruta va autenticada y un
   * `<a href>` normal no lleva la sesión. Se crea una dirección temporal en el
   * navegador, se pulsa sola y se suelta enseguida — si no se suelta, el archivo
   * se queda en memoria hasta que el tesista recargue la página.
   */
  descargar(p: Proyecto, formato: Formato = 'word'): void {
    if (this.bajando()) return;

    this.bajando.set({ productCode: p.productCode, formato });
    // El error del documento sale en su recuadro, que es donde se pulsó.
    const aviso = formato === 'documento' ? this.errorDocumento : this.errorDescarga;
    aviso.set(null);

    const peticion =
      formato === 'bib'
        ? this.proyectos.bib(p.productCode)
        : formato === 'documento'
          ? this.proyectos.documento(p.productCode)
          : this.proyectos.word(p.productCode);

    peticion.subscribe({
      next: ({ archivo, nombre }) => {
        const url = URL.createObjectURL(archivo);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombre;
        enlace.click();
        URL.revokeObjectURL(url);
        this.bajando.set(null);
      },
      error: (e) => {
        this.bajando.set(null);
        void this.explicar(e).then((mensaje) => aviso.set(mensaje));
      },
    });
  }

  /**
   * Saca el mensaje de un error de descarga.
   *
   * Al pedir el archivo en crudo, el cuerpo de un error también llega en crudo:
   * el «todavía no hay ningún capítulo escrito» del servidor viene envuelto como
   * datos binarios, y leerlo con el camino de siempre daría un mensaje genérico
   * justo en el caso más probable.
   */
  private async explicar(error: unknown): Promise<string> {
    const cuerpo = (error as { error?: unknown })?.error;

    if (cuerpo instanceof Blob) {
      try {
        const { message } = JSON.parse(await cuerpo.text());
        if (message) return message;
      } catch {
        // Cuerpo que no era JSON: se cae al mensaje de abajo.
      }
    }

    return (
      toApiError(error).message ||
      'No se pudo armar el documento. Inténtalo otra vez en un momento.'
    );
  }

  // ── El documento que escribió por su cuenta ──────────────────────────────
  //
  // Lo sube aquí y Claude lo cita en la conversación. La norma ya no se elige
  // en esta pantalla: se la pregunta Claude cuando va a citar, que es cuando
  // hace falta, y el formato es el de su propio Word.
  readonly subiendoDocumento = signal(false);
  readonly documentoSubido = signal<string | null>(null);
  readonly errorDocumento = signal<string | null>(null);

  elegirDocumento(evento: Event, p: Proyecto): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    // Se limpia el input para que elegir el MISMO archivo otra vez —tras
    // corregirlo en Word— vuelva a disparar el evento.
    entrada.value = '';
    if (archivo) this.subirDocumento(archivo, p);
  }

  private subirDocumento(archivo: File, p: Proyecto): void {
    this.subiendoDocumento.set(true);
    this.documentoSubido.set(null);
    this.errorDocumento.set(null);

    this.proyectos.subirDocumento(p.productCode, archivo).subscribe({
      next: (mensaje) => {
        this.subiendoDocumento.set(false);
        // El servidor dice cuántos párrafos leyó y qué decirle a Claude.
        this.documentoSubido.set(mensaje || 'Listo. Ahora abre Claude y dile: «cita mi documento».');
        this.recargar();
      },
      error: (e) => {
        this.subiendoDocumento.set(false);
        // Mensajes escritos para el tesista —«eso es un .doc antiguo»—: tal cual.
        this.errorDocumento.set(toApiError(e).message);
      },
    });
  }

  async quitarDocumento(p: Proyecto): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: 'Quitar tu documento',
      mensaje:
        'Se borra el documento que subiste y las citas que Claude le puso. Tu Word original, el que ' +
        'tienes en tu computadora, no se toca.',
      confirmar: 'Quitarlo',
    });
    if (!seguro) return;

    this.subiendoDocumento.set(true);
    this.documentoSubido.set(null);
    this.errorDocumento.set(null);
    this.proyectos.quitarDocumento(p.productCode).subscribe({
      next: () => {
        this.subiendoDocumento.set(false);
        this.recargar();
      },
      error: (e) => {
        this.subiendoDocumento.set(false);
        this.errorDocumento.set(toApiError(e).message);
      },
    });
  }

  // ── Empezar de cero ──────────────────────────────────────────────────────
  readonly borrando = signal(false);
  readonly errorBorrado = signal<string | null>(null);
  /** Se enseña junto al botón, que es donde está mirando al pulsarlo. */
  readonly avisoBorrado = signal<string | null>(null);

  /**
   * Pide confirmación en la ventana del sitio y devuelve el proyecto al comienzo.
   *
   * Se pide escribir la palabra y no un «¿seguro?», como al borrar la cuenta: a
   * un «¿seguro?» se le da que sí sin leerlo, y esto no tiene vuelta atrás. La
   * ventana solo exige que el campo no esté vacío; la palabra se comprueba aquí
   * para no mandar la petición en balde, y el servidor la vuelve a comprobar.
   */
  async borrarProgreso(p: Proyecto): Promise<void> {
    if (this.borrando()) return;

    this.errorBorrado.set(null);
    this.avisoBorrado.set(null);

    const restantes = this.reiniciosRestantes(p);
    if (restantes === 0) return;

    const palabras = this.palabrasTotales(p);
    const escrito = await this.dialogos.pedirTexto({
      titulo: `Borrar tu progreso de ${this.nombreCorto(p)}`,
      mensaje:
        this.recordatorioDeReinicios(restantes) +
        'Se borra para siempre: el tema, lo anotado en cada fase, ' +
        (palabras > 0 ? `los capítulos escritos (${palabras} palabras), ` : '') +
        'el análisis, la norma de citas y el documento que subiste. Tus fases volverán a quedar sin empezar.\n' +
        'Si quieres conservar el texto, descarga antes tu Word.',
      nota:
        'Tu licencia y tu Zotero siguen igual. Tus conversaciones en Claude no se borran, pero el ' +
        'conector ya no le recordará nada.',
      tono: 'peligro',
      confirmar: 'Borrar mi progreso',
      campo: {
        etiqueta: 'Escribe «eliminar» para confirmar',
        placeholder: 'eliminar',
        obligatorio: true,
        maxlength: 20,
      },
    });

    if (escrito === null) return;
    if (escrito.trim().toLowerCase() !== 'eliminar') {
      this.errorBorrado.set('No se borró nada: para confirmar hay que escribir «eliminar».');
      return;
    }

    this.borrando.set(true);

    this.proyectos.borrar(p.productCode, escrito).subscribe({
      next: ({ restantes: quedan }) => {
        this.borrando.set(false);
        this.abiertos.set(new Set());
        this.retomarAbierto.set(false);
        this.documentoSubido.set(null);
        // Se queda en su pestaña: al vaciarse pasa a ser el último proyecto
        // tocado, y sin esto la pantalla saltaría al otro si tiene dos.
        this.elegido.set(p.productCode);
        this.avisoBorrado.set(
          `Tu progreso de ${this.nombreCorto(p)} volvió al comienzo. La próxima vez que trabajes ` +
            'con Claude, empezará de cero.' +
            (quedan === null
              ? ''
              : quedan === 0
                ? ' Era la última vez que podías empezar de cero esta tesis.'
                : ` Te ${quedan === 1 ? 'queda 1 vez' : `quedan ${quedan} veces`} más para empezar de cero.`),
        );
        this.recargar();
      },
      error: (e) => {
        this.borrando.set(false);
        this.errorBorrado.set(toApiError(e).message);
      },
    });
  }

  /**
   * Cuántas veces más puede empezar de cero. Null = sin tope: el administrador,
   * o un backend anterior que todavía no lo cuenta.
   */
  reiniciosRestantes(p: Proyecto): number | null {
    return p.reiniciosRestantes ?? null;
  }

  /**
   * El primer párrafo de la ventana: se recuerda cada vez, no solo la última,
   * porque quien lo gasta sin saberlo ya no puede recuperarlo.
   */
  private recordatorioDeReinicios(restantes: number | null): string {
    if (restantes === null) return '';
    const despues =
      restantes === 1
        ? 'Esta es la última: después ya no podrás volver a empezar de cero.'
        : `Si lo haces, te ${restantes - 1 === 1 ? 'quedará 1 vez' : `quedarán ${restantes - 1} veces`}.`;
    return `Recuerda: cada tesis puede empezar de cero solo ${MAX_REINICIOS} veces. ${despues}
`;
  }

  // ── Varias tesis del mismo método (administradores) ──────────────────────
  readonly cambiandoTesis = signal(false);
  readonly errorTesis = signal<string | null>(null);
  readonly avisoTesis = signal<string | null>(null);

  /**
   * Las palabras del recuadro según lo que se escribe.
   *
   * El recuadro sale igual en el artículo y en el informe, y decirle «tesis» a
   * quien escribe un artículo parecía que la pestaña no había cambiado.
   */
  textos(p: Proyecto): TextosDeVarias {
    return TEXTOS[p.tipo ?? 'tesis'];
  }

  /** Cómo se llama una tesis en la lista: su nombre, o si no tiene, «Tesis principal». */
  nombreDeTesis(p: Proyecto, t: TesisDelMetodo): string {
    return t.nombre ?? this.textos(p).principal;
  }

  /** Lo que se pinta de la tesis activa en la pantalla, al empezar a trabajar con otra. */
  private limpiarAvisos(): void {
    this.abiertos.set(new Set());
    this.retomarAbierto.set(false);
    this.eligiendoRetomar.set(false);
    this.errorRetomar.set(null);
    this.copiado.set(false);
    this.documentoSubido.set(null);
    this.errorDocumento.set(null);
    this.errorBorrado.set(null);
    this.avisoBorrado.set(null);
    this.errorTesis.set(null);
    this.avisoTesis.set(null);
  }

  async nuevaTesis(p: Proyecto): Promise<void> {
    if (this.cambiandoTesis()) return;

    const nombre = await this.dialogos.pedirTexto({
      titulo: `${this.textos(p).otra} de ${this.nombreCorto(p)}`,
      mensaje:
        `Se abre en blanco y ${this.textos(p).trabajara} hasta que cambies. ` +
        'Lo que ya tienes no se toca.',
      confirmar: 'Crear y usar',
      campo: {
        etiqueta: 'Nombre, para reconocer cuál es',
        placeholder: 'Prueba con tema de salud',
        obligatorio: true,
        maxlength: 80,
      },
    });
    if (nombre === null || nombre.trim() === '') return;

    this.limpiarAvisos();
    this.cambiandoTesis.set(true);
    this.proyectos.crearTesis(p.productCode, nombre.trim()).subscribe({
      next: () => this.trasCambiarTesis(p, `«${nombre.trim()}» es ahora ${this.textos(p).activa}.`),
      error: (e) => {
        this.cambiandoTesis.set(false);
        this.errorTesis.set(toApiError(e).message);
      },
    });
  }

  usarTesis(p: Proyecto, t: TesisDelMetodo): void {
    if (this.cambiandoTesis() || t.activa) return;

    this.limpiarAvisos();
    this.cambiandoTesis.set(true);
    this.proyectos.activarTesis(p.productCode, t.id).subscribe({
      next: () =>
        this.trasCambiarTesis(p, `Ahora usas «${this.nombreDeTesis(p, t)}». ${this.textos(p).trabajara}.`),
      error: (e) => {
        this.cambiandoTesis.set(false);
        this.errorTesis.set(toApiError(e).message);
      },
    });
  }

  async borrarTesis(p: Proyecto, t: TesisDelMetodo): Promise<void> {
    if (this.cambiandoTesis()) return;

    const escrito = await this.dialogos.pedirTexto({
      titulo: `Borrar «${this.nombreDeTesis(p, t)}»`,
      mensaje:
        'Se borra para siempre: el tema, lo anotado en cada fase, ' +
        (t.palabras > 0 ? `los capítulos escritos (${t.palabras} palabras), ` : '') +
        `el análisis y el documento subido ${this.textos(p).deEsta}`,
      tono: 'peligro',
      confirmar: this.textos(p).borrar,
      campo: {
        etiqueta: 'Escribe «eliminar» para confirmar',
        placeholder: 'eliminar',
        obligatorio: true,
        maxlength: 20,
      },
    });
    if (escrito === null) return;

    this.limpiarAvisos();
    if (escrito.trim().toLowerCase() !== 'eliminar') {
      this.errorTesis.set('No se borró nada: para confirmar hay que escribir «eliminar».');
      return;
    }

    this.cambiandoTesis.set(true);
    this.proyectos.borrarTesis(p.productCode, t.id, escrito).subscribe({
      next: () => this.trasCambiarTesis(p, `«${this.nombreDeTesis(p, t)}» se borró.`),
      error: (e) => {
        this.cambiandoTesis.set(false);
        this.errorTesis.set(toApiError(e).message);
      },
    });
  }

  /** Se queda en la pestaña del método y vuelve a pedir lo que hay, ya con la nueva activa. */
  private trasCambiarTesis(p: Proyecto, aviso: string): void {
    this.elegido.set(p.productCode);
    this.proyectos.mios().subscribe({
      next: (datos) => {
        this.lista.set(datos);
        this.cambiandoTesis.set(false);
        this.avisoTesis.set(aviso);
      },
      error: (e) => {
        this.cambiandoTesis.set(false);
        this.errorTesis.set(toApiError(e).message);
      },
    });
  }

  /** Vuelve a pedir los proyectos, para que la pantalla diga lo que hay. */
  private recargar(): void {
    this.proyectos.mios().subscribe({ next: (datos) => this.lista.set(datos) });
  }

  estaAbierto(code: string): boolean {
    return this.abiertos().has(code);
  }

  alternar(code: string): void {
    const copia = new Set(this.abiertos());
    if (copia.has(code)) copia.delete(code);
    else copia.add(code);
    this.abiertos.set(copia);
  }

  /** La marca que se pinta al lado del capítulo. */
  marca(estado: string): string {
    if (estado === 'LISTO') return 'listo';
    if (estado === 'EN_CURSO') return 'en-curso';
    return 'pendiente';
  }

  etiqueta(estado: string): string {
    if (estado === 'LISTO') return 'Terminada';
    if (estado === 'EN_CURSO') return 'En curso';
    return 'Sin empezar';
  }
}
