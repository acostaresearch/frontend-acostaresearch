import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, input, output, signal } from '@angular/core';

import { mensajeDeError } from '../../core/http/api-error';
import { Conversacion, Mensaje, PedidoService } from '../../core/services/pedido.service';

/** Cada cuánto se vuelve a preguntar mientras la conversación está abierta. */
const CADA_CUANTO_MS = 20000;

/** El techo del servidor. */
const MAXIMO_BYTES = 25 * 1024 * 1024;

/**
 * La conversación de un encargo, para los dos lados.
 *
 * UN SOLO COMPONENTE Y DOS LLAVES
 * -------------------------------
 * El tesista entra con el código de su pedido y el asesor con su enlace, pero
 * lo que ven es lo mismo: un hilo, una caja para escribir y un clip para
 * adjuntar. Hacer dos componentes habría sido mantener dos veces la misma
 * pantalla y que una se quedara atrás.
 *
 * SE REFRESCA SOLA
 * ----------------
 * Cada veinte segundos mientras está abierta. No es un chat en vivo —no hay
 * nada que empuje desde el servidor—, pero sí evita lo que mata la sensación
 * de estar hablando con alguien: escribir, quedarte mirando la pantalla y
 * tener que recargar para saber si contestaron.
 */
@Component({
  selector: 'app-conversacion',
  imports: [DatePipe],
  templateUrl: './conversacion.html',
  styleUrl: './conversacion.css',
})
export class ConversacionDelEncargo implements OnInit, OnDestroy {
  private readonly api = inject(PedidoService);

  /** Quién mira, que decide de qué lado se pintan los mensajes. */
  readonly modo = input.required<'tesista' | 'asesor'>();
  /** La llave del tesista. */
  readonly codigo = input('');
  /** Las del asesor. */
  readonly token = input('');
  readonly pedidoId = input('');
  /** Con quién habla, para la cabecera: «Rosa Quispe» o «Luis Ramírez». */
  readonly conQuien = input('');

  /** Llegaron mensajes nuevos: el de fuera recarga sus contadores. */
  readonly movimiento = output<void>();

  readonly abierta = signal(false);
  readonly mensajes = signal<Mensaje[]>([]);
  readonly cargando = signal(true);
  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);

  readonly texto = signal('');
  readonly archivo = signal<File | null>(null);
  readonly errorArchivo = signal<string | null>(null);
  readonly bajando = signal('');

  private reloj: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.cargar(true);
    this.reloj = setInterval(() => this.cargar(false), CADA_CUANTO_MS);
  }

  ngOnDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
  }

  private peticion() {
    return this.modo() === 'tesista'
      ? this.api.mensajesDelTesista(this.codigo())
      : this.api.mensajesDelAsesor(this.token(), this.pedidoId());
  }

  /**
   * `avisar` en falso para el refresco de fondo: un error de red a los veinte
   * segundos no tiene por qué pintar de rojo una conversación que se está
   * leyendo bien.
   */
  private cargar(avisar: boolean): void {
    this.peticion().subscribe({
      next: (conversacion: Conversacion) => {
        const antes = this.mensajes().length;
        this.abierta.set(conversacion.abierta);
        this.mensajes.set(conversacion.mensajes);
        this.cargando.set(false);
        if (conversacion.mensajes.length !== antes) this.movimiento.emit();
      },
      error: (e: unknown) => {
        this.cargando.set(false);
        if (avisar) this.error.set(mensajeDeError(e));
      },
    });
  }

  escribir(evento: Event): void {
    this.texto.set((evento.target as HTMLTextAreaElement).value);
  }

  elegirArchivo(evento: Event): void {
    const elegido = (evento.target as HTMLInputElement).files?.[0] ?? null;
    this.errorArchivo.set(null);
    this.archivo.set(null);
    if (!elegido) return;

    if (!/\.docx$/i.test(elegido.name)) {
      this.errorArchivo.set('Solo se puede adjuntar Word (.docx).');
      return;
    }
    if (elegido.size > MAXIMO_BYTES) {
      this.errorArchivo.set('El documento pasa de 25 MB.');
      return;
    }
    this.archivo.set(elegido);
  }

  quitarArchivo(): void {
    this.archivo.set(null);
    this.errorArchivo.set(null);
  }

  enviar(): void {
    const texto = this.texto().trim();
    if (!texto || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);

    const archivo = this.archivo();
    const peticion =
      this.modo() === 'tesista'
        ? this.api.escribirComoTesista(this.codigo(), texto, archivo)
        : this.api.escribirComoAsesor(this.token(), this.pedidoId(), texto, archivo);

    peticion.subscribe({
      next: (mensaje) => {
        this.enviando.set(false);
        this.texto.set('');
        this.archivo.set(null);
        this.mensajes.update((lista) => [...lista, mensaje]);
        this.movimiento.emit();
      },
      error: (e: unknown) => {
        this.enviando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /** ¿Lo escribí yo? Decide de qué lado se pinta la burbuja. */
  mio(mensaje: Mensaje): boolean {
    return this.modo() === 'tesista' ? mensaje.de === 'TESISTA' : mensaje.de === 'ASESOR';
  }

  quien(mensaje: Mensaje): string {
    if (this.mio(mensaje)) return 'Tú';
    return this.conQuien() || (mensaje.de === 'ASESOR' ? 'Tu asesor' : 'El tesista');
  }

  /**
   * El adjunto se baja como blob y se guarda desde memoria.
   *
   * No puede ser un enlace normal: el archivo lo sirve la API comprobando que
   * esa conversación es tuya, y un `target="_blank"` no manda lo que hace falta
   * para esa comprobación.
   */
  bajar(mensaje: Mensaje): void {
    if (this.bajando()) return;
    this.bajando.set(mensaje.id);

    const peticion =
      this.modo() === 'tesista'
        ? this.api.adjuntoDelTesista(this.codigo(), mensaje.id)
        : this.api.adjuntoDelAsesor(this.token(), this.pedidoId(), mensaje.id);

    peticion.subscribe({
      next: (blob) => {
        this.bajando.set('');
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = mensaje.archivoNombre;
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (e: unknown) => {
        this.bajando.set('');
        this.error.set(mensajeDeError(e));
      },
    });
  }

  peso(bytes: number): string {
    const megas = bytes / (1024 * 1024);
    return megas < 1 ? `${Math.round(bytes / 1024)} KB` : `${megas.toFixed(1)} MB`;
  }
}
