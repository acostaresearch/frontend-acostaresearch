import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import {
  AjustesWhatsapp,
  ConversacionAbierta,
  ConversacionWhatsapp,
  EstadoWhatsapp,
  FiltroWhatsapp,
  MOTIVOS,
  MensajeWhatsapp,
  WhatsappService,
} from '../../core/services/whatsapp.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';

type Pestana = 'bandeja' | 'probar' | 'ajustes';

/** Una línea del simulador: lo que se escribió, lo que contestó y por qué. */
interface LineaDePrueba {
  de: 'yo' | 'bot' | 'nota';
  texto: string;
  modelo?: string | null;
}

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
        if (limpiarBorrador) this.borrador.set('');
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
    if (!abierta || !texto || this.enviando()) return;

    this.enviando.set(true);
    this.api.responder(abierta.id, texto).subscribe({
      next: () => {
        this.enviando.set(false);
        this.borrador.set('');
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
        }));
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
