import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import {
  AjustesWhatsapp,
  ConversacionAbierta,
  ConversacionWhatsapp,
  DatosImagenWhatsapp,
  EstadoWhatsapp,
  FiltroWhatsapp,
  ImagenWhatsapp,
  MOTIVOS,
  MensajeWhatsapp,
  WhatsappService,
} from '../../core/services/whatsapp.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

type Pestana = 'bandeja' | 'probar' | 'imagenes' | 'ajustes';

/** Una línea del simulador: lo que se escribió, lo que contestó y por qué. */
interface LineaDePrueba {
  de: 'yo' | 'bot' | 'nota';
  texto: string;
  modelo?: string | null;
  imagenId?: string | null;
}

/** Lo que WhatsApp acepta como imagen: PNG o JPG de hasta 5 MB. */
const TIPOS_IMAGEN = ['image/png', 'image/jpeg'];
const MAX_IMAGEN = 5 * 1024 * 1024;

const DATOS_VACIOS: DatosImagenWhatsapp = { nombre: '', cuando: '', pie: '', enBot: true };

const DIAS = [
  { numero: 1, corto: 'Lu' },
  { numero: 2, corto: 'Ma' },
  { numero: 3, corto: 'Mi' },
  { numero: 4, corto: 'Ju' },
  { numero: 5, corto: 'Vi' },
  { numero: 6, corto: 'Sá' },
  { numero: 7, corto: 'Do' },
];

/** Cada cuánto se refresca la bandeja mientras está abierta. */
const REFRESCO_MS = 20_000;

/**
 * El bot de WhatsApp en el panel: la bandeja de conversaciones, un simulador
 * para probarlo sin Meta y sus ajustes.
 *
 * Componente aparte, como los reclamos: la hoja de estilos del panel ya roza el
 * tope de la compilación. Se carga solo al abrir la sección; nada de esto hace
 * falta para el contador de la barra lateral.
 *
 * MIENTRAS NO ESTÉN LAS CLAVES DE META el bot funciona entero en modo maqueta:
 * piensa con Gemini, guarda y se ve aquí, pero nada sale a WhatsApp. Por eso
 * «Probar el bot» es la segunda pestaña y no un rincón escondido.
 */
@Component({
  imports: [AvisoFlotante, DatePipe],
  selector: 'app-whatsapp-admin',
  templateUrl: './whatsapp.html',
  styleUrl: './whatsapp.css',
})
export class WhatsappAdmin implements OnInit {
  private readonly api = inject(WhatsappService);
  private readonly destruir = inject(DestroyRef);
  private readonly dialogos = inject(DialogoService);

  readonly pestana = signal<Pestana>('bandeja');
  readonly estado = signal<EstadoWhatsapp | null>(null);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  // ── Bandeja ──────────────────────────────────────────────────────────────

  readonly filtros: { codigo: FiltroWhatsapp; nombre: string }[] = [
    { codigo: 'TODAS', nombre: 'Todas' },
    { codigo: 'PERSONA', nombre: 'Para una persona' },
    { codigo: 'NO_LEIDAS', nombre: 'Sin leer' },
    { codigo: 'BLOQUEADAS', nombre: 'Bloqueadas' },
  ];
  readonly filtro = signal<FiltroWhatsapp>('TODAS');
  readonly busqueda = signal('');
  readonly conversaciones = signal<ConversacionWhatsapp[]>([]);
  readonly cargando = signal(false);
  readonly abierta = signal<ConversacionAbierta | null>(null);
  readonly borrador = signal('');
  readonly enviando = signal(false);
  /** La imagen que va con la próxima respuesta, y si el selector está abierto. */
  readonly adjunta = signal<ImagenWhatsapp | null>(null);
  readonly eligiendo = signal(false);

  // ── Imágenes ─────────────────────────────────────────────────────────────

  readonly imagenes = signal<ImagenWhatsapp[]>([]);
  /** Vista previa de cada imagen (URL de un blob), pedida con el token. */
  readonly miniaturas = signal<Record<string, string>>({});
  private readonly pedidas = new Set<string>();
  readonly nueva = signal<DatosImagenWhatsapp>({ ...DATOS_VACIOS });
  readonly nuevoArchivo = signal<File | null>(null);
  readonly nuevaPrevia = signal<string | null>(null);
  readonly subiendo = signal(false);
  /** Lo que se ha cambiado en cada tarjeta y aún no se ha guardado. */
  readonly cambios = signal<Record<string, Partial<DatosImagenWhatsapp>>>({});

  // ── Probar el bot ────────────────────────────────────────────────────────

  /** Cada «empezar de nuevo» es otra conversación de prueba, sin historial. */
  private readonly clavePrueba = signal(this.nuevaClave());
  readonly lineas = signal<LineaDePrueba[]>([]);
  readonly prueba = signal('');
  readonly probando = signal(false);

  // ── Ajustes ──────────────────────────────────────────────────────────────

  readonly dias = DIAS;
  readonly ajustes = signal<AjustesWhatsapp | null>(null);
  readonly guardando = signal(false);
  readonly diasElegidos = computed(() =>
    (this.ajustes()?.diasLaborables ?? '')
      .split(',')
      .map(Number)
      .filter((d) => d >= 1 && d <= 7),
  );

  ngOnInit(): void {
    this.cargarEstado();
    this.cargarConversaciones();
    this.api.ajustes().subscribe({
      next: (ajustes) => this.ajustes.set(ajustes),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
    this.cargarImagenes();
    this.destruir.onDestroy(() => {
      Object.values(this.miniaturas()).forEach((url) => URL.revokeObjectURL(url));
      const previa = this.nuevaPrevia();
      if (previa) URL.revokeObjectURL(previa);
    });

    // Los mensajes llegan solos: la bandeja abierta se refresca sola.
    const reloj = setInterval(() => {
      if (this.pestana() !== 'bandeja' || document.hidden) return;
      this.cargarConversaciones(false);
      const abierta = this.abierta();
      if (abierta) this.abrir(abierta, false);
    }, REFRESCO_MS);
    this.destruir.onDestroy(() => clearInterval(reloj));
  }

  cambiarPestana(pestana: Pestana): void {
    this.pestana.set(pestana);
    if (pestana === 'bandeja') this.cargarConversaciones();
    if (pestana === 'imagenes') this.cargarImagenes();
  }

  cargarEstado(): void {
    this.api.estado().subscribe({
      next: (estado) => this.estado.set(estado),
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  // ── Bandeja ──────────────────────────────────────────────────────────────

  cargarConversaciones(conIndicador = true): void {
    if (conIndicador) this.cargando.set(true);
    this.api.conversaciones(this.filtro(), this.busqueda()).subscribe({
      next: (lista) => {
        this.conversaciones.set(lista);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  elegirFiltro(filtro: FiltroWhatsapp): void {
    this.filtro.set(filtro);
    this.cargarConversaciones();
  }

  buscar(evento: Event): void {
    this.busqueda.set((evento.target as HTMLInputElement).value);
    this.cargarConversaciones(false);
  }

  abrir(conversacion: ConversacionWhatsapp, limpiarBorrador = true): void {
    this.api.abrir(conversacion.id).subscribe({
      next: (abierta) => {
        this.abierta.set(abierta);
        this.verMiniaturas(abierta.mensajes.map((m) => m.imagenId));
        if (limpiarBorrador) {
          this.borrador.set('');
          this.adjunta.set(null);
          this.eligiendo.set(false);
        }
        // Abrirla la da por leída: el número rojo de la lista se apaga ya.
        this.conversaciones.update((lista) =>
          lista.map((c) => (c.id === abierta.id ? { ...c, noLeidos: 0 } : c)),
        );
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  cerrar(): void {
    this.abierta.set(null);
  }

  escribir(evento: Event): void {
    this.borrador.set((evento.target as HTMLTextAreaElement).value);
  }

  /** Enter manda; Mayúsculas+Enter, salto de línea. Como en WhatsApp Web. */
  teclaEnRespuesta(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      this.responder();
    }
  }

  responder(): void {
    const abierta = this.abierta();
    const texto = this.borrador().trim();
    const imagen = this.adjunta();
    if (!abierta || (!texto && !imagen) || this.enviando()) return;

    this.enviando.set(true);
    this.api.responder(abierta.id, texto, imagen?.id).subscribe({
      next: () => {
        this.enviando.set(false);
        this.borrador.set('');
        this.adjunta.set(null);
        this.eligiendo.set(false);
        this.abrir(abierta, false);
        this.cargarConversaciones(false);
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(e));
        this.abrir(abierta, false);
      },
    });
  }

  tomar(modo: 'BOT' | 'HUMANO'): void {
    const abierta = this.abierta();
    if (!abierta) return;
    this.api.cambiarModo(abierta.id, modo).subscribe({
      next: () => {
        this.aviso.set(
          modo === 'HUMANO'
            ? 'La llevas tú: el bot no contestará en esta conversación.'
            : 'Devuelta al bot: vuelve a contestar él.',
        );
        this.abrir(abierta, false);
        this.cargarConversaciones(false);
        this.cargarEstado();
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  bloquear(): void {
    const abierta = this.abierta();
    if (!abierta) return;
    const bloqueado = !abierta.bloqueado;
    this.api.bloquear(abierta.id, bloqueado).subscribe({
      next: () => {
        this.aviso.set(bloqueado ? 'Número bloqueado: nadie le contestará.' : 'Número desbloqueado.');
        this.abrir(abierta, false);
        this.cargarConversaciones(false);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  async borrar(): Promise<void> {
    const abierta = this.abierta();
    if (!abierta) return;
    const seguro = await this.dialogos.confirmar({
      titulo: `Borrar la conversación con ${this.quien(abierta)}`,
      mensaje: 'Se borran todos sus mensajes del panel.',
      nota: 'En su WhatsApp no cambia nada. Si vuelve a escribir, empieza una conversación nueva.',
      confirmar: 'Borrar',
      tono: 'peligro',
    });
    if (!seguro) return;
    this.api.borrar(abierta.id).subscribe({
      next: () => {
        this.abierta.set(null);
        this.aviso.set('Conversación borrada.');
        this.cargarConversaciones(false);
        this.cargarEstado();
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  // ── Ayudas para la plantilla ─────────────────────────────────────────────

  esPrueba(c: ConversacionWhatsapp): boolean {
    return c.telefono.startsWith('prueba-');
  }

  /** «+51 987 654 321», o «Prueba del panel». */
  numero(c: ConversacionWhatsapp): string {
    if (this.esPrueba(c)) return 'Prueba del panel';
    const t = c.telefono;
    return t.length > 9 ? `+${t.slice(0, t.length - 9)} ${t.slice(-9).replace(/(\d{3})(?=\d)/g, '$1 ')}` : `+${t}`;
  }

  quien(c: ConversacionWhatsapp): string {
    return c.nombre || this.numero(c);
  }

  iniciales(c: ConversacionWhatsapp): string {
    const partes = (c.nombre || '#').trim().split(/\s+/);
    return ((partes[0]?.[0] ?? '#') + (partes[1]?.[0] ?? '')).toUpperCase();
  }

  estadoDe(c: ConversacionWhatsapp): { texto: string; clase: string } {
    if (c.bloqueado) return { texto: 'Bloqueada', clase: 'gris' };
    if (c.modo === 'HUMANO') return { texto: 'La llevas tú', clase: 'aviso' };
    if (c.pideHumano) return { texto: 'Pide una persona', clase: 'error' };
    return { texto: 'Bot', clase: 'exito' };
  }

  etiquetaDeEnvio(m: MensajeWhatsapp): string {
    switch (m.envio) {
      case 'SIMULADO':
        return 'simulado';
      case 'FALLIDO':
        return 'no salió';
      case 'ENVIADO':
        return 'enviado';
      default:
        return '';
    }
  }

  /** El texto de la burbuja. Si se ve la imagen, sobra la línea «[Imagen: …]». */
  textoVisible(m: { texto: string; imagenId?: string | null }): string {
    if (!m.imagenId || !this.miniaturas()[m.imagenId]) return m.texto;
    return m.texto.replace(/^\[Imagen: [^\]\n]*\]\n?/, '');
  }

  autor(m: MensajeWhatsapp): string {
    if (m.autor === 'BOT') return 'Bot';
    if (m.autor === 'ADMIN') return 'Tú';
    return '';
  }

  // ── Probar el bot ────────────────────────────────────────────────────────

  private nuevaClave(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  escribirPrueba(evento: Event): void {
    this.prueba.set((evento.target as HTMLInputElement).value);
  }

  teclaEnPrueba(evento: KeyboardEvent): void {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      this.probar();
    }
  }

  probar(): void {
    const texto = this.prueba().trim();
    if (!texto || this.probando()) return;

    this.probando.set(true);
    this.prueba.set('');
    this.lineas.update((l) => [...l, { de: 'yo', texto }]);

    this.api.simular(texto, this.clavePrueba()).subscribe({
      next: ({ motivo, respuestas }) => {
        this.probando.set(false);
        const nuevas: LineaDePrueba[] = respuestas.map((r) => ({
          de: 'bot',
          texto: r.texto,
          modelo: r.modelo,
          imagenId: r.imagenId,
        }));
        this.verMiniaturas(respuestas.map((r) => r.imagenId));
        if (motivo !== 'respondido') nuevas.push({ de: 'nota', texto: MOTIVOS[motivo] ?? motivo });
        this.lineas.update((l) => [...l, ...nuevas]);
        this.cargarEstado();
      },
      error: (e: unknown) => {
        this.probando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  empezarDeNuevo(): void {
    this.clavePrueba.set(this.nuevaClave());
    this.lineas.set([]);
    this.prueba.set('');
  }

  // ── Imágenes ─────────────────────────────────────────────────────────────

  cargarImagenes(): void {
    this.api.imagenes().subscribe({
      next: (lista) => {
        this.imagenes.set(lista);
        this.verMiniaturas(lista.map((i) => i.id));
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  /** Pide las vistas previas que falten. Una imagen borrada se queda sin ella. */
  verMiniaturas(ids: (string | null | undefined)[]): void {
    for (const id of ids) {
      if (!id || this.pedidas.has(id)) continue;
      this.pedidas.add(id);
      this.api.archivoImagen(id).subscribe({
        next: (blob) => this.miniaturas.update((m) => ({ ...m, [id]: URL.createObjectURL(blob) })),
        error: () => {},
      });
    }
  }

  /** Comprueba en el navegador lo mismo que el servidor, para avisar antes de subir. */
  private archivoValido(archivo: File): boolean {
    if (!TIPOS_IMAGEN.includes(archivo.type)) {
      this.error.set('WhatsApp solo manda imágenes PNG o JPG.');
      return false;
    }
    if (archivo.size > MAX_IMAGEN) {
      this.error.set('WhatsApp no acepta imágenes de más de 5 MB.');
      return false;
    }
    return true;
  }

  /** «qr-yape.png» → «qr yape». */
  private nombreDeArchivo(archivo: File): string {
    return archivo.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 80) || 'Imagen';
  }

  elegirArchivo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo || !this.archivoValido(archivo)) return;

    const previa = this.nuevaPrevia();
    if (previa) URL.revokeObjectURL(previa);
    this.nuevoArchivo.set(archivo);
    this.nuevaPrevia.set(URL.createObjectURL(archivo));
    if (!this.nueva().nombre.trim()) {
      this.nueva.update((d) => ({ ...d, nombre: this.nombreDeArchivo(archivo) }));
    }
  }

  campoNueva(campo: 'nombre' | 'cuando' | 'pie', evento: Event): void {
    const valor = (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.nueva.update((d) => ({ ...d, [campo]: valor }));
  }

  casillaNueva(evento: Event): void {
    const enBot = (evento.target as HTMLInputElement).checked;
    this.nueva.update((d) => ({ ...d, enBot }));
  }

  subirNueva(): void {
    const archivo = this.nuevoArchivo();
    const datos = this.nueva();
    if (!archivo || !datos.nombre.trim() || this.subiendo()) return;

    this.subiendo.set(true);
    this.api.subirImagen(archivo, datos).subscribe({
      next: () => {
        this.subiendo.set(false);
        const previa = this.nuevaPrevia();
        if (previa) URL.revokeObjectURL(previa);
        this.nuevaPrevia.set(null);
        this.nuevoArchivo.set(null);
        this.nueva.set({ ...DATOS_VACIOS });
        this.aviso.set(datos.enBot ? 'Imagen guardada. El bot ya puede mandarla.' : 'Imagen guardada.');
        this.cargarImagenes();
      },
      error: (e: unknown) => {
        this.subiendo.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /** Lo que muestra la tarjeta: lo guardado con lo cambiado encima. */
  datosDe(imagen: ImagenWhatsapp): DatosImagenWhatsapp {
    return { ...imagen, ...this.cambios()[imagen.id] };
  }

  hayCambios(imagen: ImagenWhatsapp): boolean {
    return Boolean(this.cambios()[imagen.id]);
  }

  campoImagen(imagen: ImagenWhatsapp, campo: 'nombre' | 'cuando' | 'pie', evento: Event): void {
    const valor = (evento.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.cambios.update((c) => ({ ...c, [imagen.id]: { ...c[imagen.id], [campo]: valor } }));
  }

  casillaImagen(imagen: ImagenWhatsapp, evento: Event): void {
    const enBot = (evento.target as HTMLInputElement).checked;
    this.cambios.update((c) => ({ ...c, [imagen.id]: { ...c[imagen.id], enBot } }));
  }

  guardarImagen(imagen: ImagenWhatsapp): void {
    const cambios = this.cambios()[imagen.id];
    if (!cambios) return;
    this.api.editarImagen(imagen.id, cambios).subscribe({
      next: (guardada) => {
        this.imagenes.update((lista) => lista.map((i) => (i.id === guardada.id ? guardada : i)));
        this.cambios.update((c) => {
          const resto = { ...c };
          delete resto[imagen.id];
          return resto;
        });
        this.aviso.set('Imagen actualizada.');
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  async borrarImagen(imagen: ImagenWhatsapp): Promise<void> {
    const seguro = await this.dialogos.confirmar({
      titulo: `Borrar «${imagen.nombre}»`,
      mensaje: 'El bot dejará de mandarla y ya no se podrá elegir en el panel.',
      nota: 'Las conversaciones donde ya se mandó no cambian.',
      confirmar: 'Borrar',
      tono: 'peligro',
    });
    if (!seguro) return;
    this.api.borrarImagen(imagen.id).subscribe({
      next: () => {
        this.imagenes.update((lista) => lista.filter((i) => i.id !== imagen.id));
        if (this.adjunta()?.id === imagen.id) this.adjunta.set(null);
        this.aviso.set('Imagen borrada.');
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  // ── Adjuntar una imagen al responder ─────────────────────────────────────

  alternarSelector(): void {
    this.eligiendo.update((v) => !v);
  }

  adjuntar(imagen: ImagenWhatsapp): void {
    this.adjunta.set(imagen);
    this.eligiendo.set(false);
  }

  quitarAdjunta(): void {
    this.adjunta.set(null);
  }

  /** Una imagen suelta: se guarda en la galería solo para el panel y se adjunta. */
  subirYAdjuntar(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo || !this.archivoValido(archivo) || this.subiendo()) return;

    this.subiendo.set(true);
    const datos = { nombre: this.nombreDeArchivo(archivo), cuando: '', pie: '', enBot: false };
    this.api.subirImagen(archivo, datos).subscribe({
      next: (imagen) => {
        this.subiendo.set(false);
        this.imagenes.update((lista) => [...lista, imagen]);
        this.verMiniaturas([imagen.id]);
        this.adjuntar(imagen);
      },
      error: (e: unknown) => {
        this.subiendo.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  // ── Ajustes ──────────────────────────────────────────────────────────────

  cambiar<K extends keyof AjustesWhatsapp>(campo: K, valor: AjustesWhatsapp[K]): void {
    this.ajustes.update((a) => (a ? { ...a, [campo]: valor } : a));
  }

  texto(campo: 'horaInicio' | 'horaFin' | 'bienvenida' | 'instrucciones' | 'palabrasHumano', evento: Event): void {
    this.cambiar(campo, (evento.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  casilla(campo: 'activo' | 'usarHorario', evento: Event): void {
    this.cambiar(campo, (evento.target as HTMLInputElement).checked);
  }

  alternarDia(numero: number): void {
    const elegidos = new Set(this.diasElegidos());
    if (elegidos.has(numero)) elegidos.delete(numero);
    else elegidos.add(numero);
    this.cambiar('diasLaborables', [...elegidos].sort().join(','));
  }

  guardarAjustes(): void {
    const ajustes = this.ajustes();
    if (!ajustes || this.guardando()) return;

    this.guardando.set(true);
    this.api
      .guardarAjustes({ ...ajustes, diasLaborables: this.diasElegidos() })
      .subscribe({
        next: (guardados) => {
          this.guardando.set(false);
          this.ajustes.set(guardados);
          this.aviso.set('Ajustes guardados. El bot los usa desde el próximo mensaje.');
        },
        error: (e: unknown) => {
          this.guardando.set(false);
          this.error.set(mensajeDeError(e));
        },
      });
  }

  copiar(texto: string): void {
    navigator.clipboard?.writeText(texto).then(
      () => this.aviso.set('Copiado.'),
      () => this.error.set('No se pudo copiar: selecciónalo a mano.'),
    );
  }
}
