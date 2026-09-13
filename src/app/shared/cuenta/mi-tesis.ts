import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';

import { toApiError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import {
  CatalogoDeNormas,
  EtapaDelProyecto,
  Proyecto,
  ProyectoService,
  TesisDelMetodo,
} from '../../core/services/proyecto.service';

/** Qué se está bajando: el documento o solo la bibliografía. */
type Formato = 'word' | 'bib';

/** Media lista de fases, con su rótulo: «Fases 1 a 6». */
interface Columna {
  rotulo: string;
  fases: EtapaDelProyecto[];
}

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
  imports: [DatePipe],
  templateUrl: './mi-tesis.html',
  styleUrl: './mi-tesis.css',
})
export class MiTesis implements OnInit {
  private readonly proyectos = inject(ProyectoService);
  private readonly dialogos = inject(DialogoService);

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

  elegir(productCode: string): void {
    this.elegido.set(productCode);
    this.retomarAbierto.set(false);
    this.copiado.set(false);
    this.errorBorrado.set(null);
    this.avisoBorrado.set(null);
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
    // Las normas se piden aparte: si fallan, el panel sigue y solo falta el
    // selector, que es lo único que las necesita.
    this.proyectos.normas().subscribe({
      next: (catalogo) => this.catalogoNormas.set(catalogo),
      error: () => this.catalogoNormas.set(null),
    });

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
    this.errorDescarga.set(null);

    const peticion =
      formato === 'bib' ? this.proyectos.bib(p.productCode) : this.proyectos.word(p.productCode);

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
        void this.explicar(e).then((mensaje) => this.errorDescarga.set(mensaje));
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

  // ── La norma de citas ────────────────────────────────────────────────────
  readonly catalogoNormas = signal<CatalogoDeNormas | null>(null);
  /** El proyecto cuya norma se está guardando. */
  readonly guardandoNorma = signal<string | null>(null);
  readonly normaGuardada = signal<string | null>(null);
  readonly errorNorma = signal<string | null>(null);

  /**
   * Cambia la norma o el idioma de las citas.
   *
   * Se guarda al elegir, sin botón: es una sola decisión y se ve al momento qué
   * quedó puesto. No hay que rehacer nada del texto, porque las citas se
   * escriben al descargar.
   */
  cambiarNorma(p: Proyecto, cambio: { estilo?: string; idioma?: string }): void {
    const estilo = cambio.estilo ?? p.norma.estilo;
    const idioma = cambio.idioma ?? p.norma.idioma;
    if (estilo === p.norma.estilo && idioma === p.norma.idioma) return;

    this.guardandoNorma.set(p.productCode);
    this.normaGuardada.set(null);
    this.errorNorma.set(null);

    this.proyectos.cambiarNorma(p.productCode, estilo, idioma).subscribe({
      next: (norma) => {
        this.lista.update((lista) =>
          lista.map((x) => (x.productCode === p.productCode ? { ...x, norma } : x)),
        );
        this.guardandoNorma.set(null);
        this.normaGuardada.set(`Hecho. Tu próxima descarga saldrá en ${norma.nombre}.`);
      },
      error: (e) => {
        this.guardandoNorma.set(null);
        this.errorNorma.set(toApiError(e).message);
      },
    });
  }

  /** El valor de un <select>, sin tener que tipar el evento en la plantilla. */
  valorDe(evento: Event): string {
    return (evento.target as HTMLSelectElement).value;
  }

  // ── La plantilla de su facultad ──────────────────────────────────────────
  /**
   * Las marcas que se escriben en la portada de la plantilla.
   *
   * En el componente y no en la plantilla HTML: las llaves dobles ahí serían
   * una interpolación de Angular.
   */
  readonly marcasDePortada = '{{TITULO}}, {{AUTOR}}, {{CARRERA}}, {{UNIVERSIDAD}} y {{AÑO}}';
  readonly subiendoPlantilla = signal(false);
  readonly errorPlantilla = signal<string | null>(null);
  readonly plantillaPuesta = signal<string | null>(null);

  elegirPlantilla(evento: Event, p: Proyecto): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    // Se limpia el input para que elegir el MISMO archivo otra vez —tras
    // corregirlo en Word— vuelva a disparar el evento.
    entrada.value = '';
    if (archivo) this.subirPlantilla(archivo, p);
  }

  private subirPlantilla(archivo: File, p: Proyecto): void {
    this.subiendoPlantilla.set(true);
    this.errorPlantilla.set(null);
    this.plantillaPuesta.set(null);

    this.proyectos.subirPlantilla(p.productCode, archivo).subscribe({
      next: ({ cuantos }) => {
        this.subiendoPlantilla.set(false);
        this.plantillaPuesta.set(
          `Listo: ${cuantos} estilos de «${archivo.name}». Tu próxima descarga sale con ese formato.`,
        );
        this.recargar();
      },
      error: (e) => {
        this.subiendoPlantilla.set(false);
        // El servidor manda aquí mensajes escritos para el tesista —«eso es un
        // .doc antiguo, guárdalo como .docx»—, así que se enseñan tal cual.
        this.errorPlantilla.set(toApiError(e).message);
      },
    });
  }

  quitarPlantilla(p: Proyecto): void {
    this.subiendoPlantilla.set(true);
    this.errorPlantilla.set(null);
    this.plantillaPuesta.set(null);

    this.proyectos.quitarPlantilla(p.productCode).subscribe({
      next: () => {
        this.subiendoPlantilla.set(false);
        this.recargar();
      },
      error: (e) => {
        this.subiendoPlantilla.set(false);
        this.errorPlantilla.set(toApiError(e).message);
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

    const palabras = this.palabrasTotales(p);
    const escrito = await this.dialogos.pedirTexto({
      titulo: `Borrar tu progreso de ${this.nombreCorto(p)}`,
      mensaje:
        'Se borra para siempre: el tema, lo anotado en cada fase, ' +
        (palabras > 0 ? `los capítulos escritos (${palabras} palabras), ` : '') +
        'el análisis, la norma de citas y el formato de tu facultad. Tus fases volverán a quedar sin empezar.\n' +
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
      next: () => {
        this.borrando.set(false);
        this.abiertos.set(new Set());
        this.retomarAbierto.set(false);
        this.normaGuardada.set(null);
        this.plantillaPuesta.set(null);
        // Se queda en su pestaña: al vaciarse pasa a ser el último proyecto
        // tocado, y sin esto la pantalla saltaría al otro si tiene dos.
        this.elegido.set(p.productCode);
        this.avisoBorrado.set(
          `Tu progreso de ${this.nombreCorto(p)} volvió al comienzo. La próxima vez que trabajes ` +
            'con Claude, empezará de cero.',
        );
        this.recargar();
      },
      error: (e) => {
        this.borrando.set(false);
        this.errorBorrado.set(toApiError(e).message);
      },
    });
  }

  // ── Varias tesis del mismo método (administradores) ──────────────────────
  readonly cambiandoTesis = signal(false);
  readonly errorTesis = signal<string | null>(null);
  readonly avisoTesis = signal<string | null>(null);

  /** Cómo se llama una tesis en la lista: su nombre, o si no tiene, «Tesis principal». */
  nombreDeTesis(t: TesisDelMetodo): string {
    return t.nombre ?? 'Tesis principal';
  }

  /** Lo que se pinta de la tesis activa en la pantalla, al empezar a trabajar con otra. */
  private limpiarAvisos(): void {
    this.abiertos.set(new Set());
    this.retomarAbierto.set(false);
    this.copiado.set(false);
    this.normaGuardada.set(null);
    this.plantillaPuesta.set(null);
    this.errorBorrado.set(null);
    this.avisoBorrado.set(null);
    this.errorTesis.set(null);
    this.avisoTesis.set(null);
  }

  async nuevaTesis(p: Proyecto): Promise<void> {
    if (this.cambiandoTesis()) return;

    const nombre = await this.dialogos.pedirTexto({
      titulo: `Otra tesis de ${this.nombreCorto(p)}`,
      mensaje:
        'Se abre en blanco y pasa a ser la activa: Claude trabajará con ella hasta que elijas otra. ' +
        'Las que ya tienes no se tocan.',
      confirmar: 'Crear y usar',
      campo: {
        etiqueta: 'Nombre, para distinguirla',
        placeholder: 'Prueba con tema de salud',
        obligatorio: true,
        maxlength: 80,
      },
    });
    if (nombre === null || nombre.trim() === '') return;

    this.limpiarAvisos();
    this.cambiandoTesis.set(true);
    this.proyectos.crearTesis(p.productCode, nombre.trim()).subscribe({
      next: () => this.trasCambiarTesis(p, `«${nombre.trim()}» es ahora tu tesis activa.`),
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
        this.trasCambiarTesis(p, `Ahora usas «${this.nombreDeTesis(t)}». Claude trabajará con ella.`),
      error: (e) => {
        this.cambiandoTesis.set(false);
        this.errorTesis.set(toApiError(e).message);
      },
    });
  }

  async borrarTesis(p: Proyecto, t: TesisDelMetodo): Promise<void> {
    if (this.cambiandoTesis()) return;

    const escrito = await this.dialogos.pedirTexto({
      titulo: `Borrar «${this.nombreDeTesis(t)}»`,
      mensaje:
        'Se borra para siempre: el tema, lo anotado en cada fase, ' +
        (t.palabras > 0 ? `los capítulos escritos (${t.palabras} palabras), ` : '') +
        'el análisis y el formato de facultad de esta tesis. Tus otras tesis no se tocan.',
      tono: 'peligro',
      confirmar: 'Borrar esta tesis',
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
      next: () => this.trasCambiarTesis(p, `«${this.nombreDeTesis(t)}» se borró.`),
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
