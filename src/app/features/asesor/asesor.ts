import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';

import { mensajeDeError } from '../../core/http/api-error';
import { Encargo, FichaDelAsesor, PedidoService } from '../../core/services/pedido.service';
import { SiteFooter } from '../../shared/layout/site-footer';
import { SiteHeader } from '../../shared/layout/site-header';

/**
 * La pantalla del asesor: /asesor/<token>.
 *
 * SU LLAVE ES EL ENLACE
 * ---------------------
 * No hay cuenta ni contraseña. El encargo le llega directo del tesista que lo
 * eligió, y para eso tiene que poder entrar hoy: montarle registro,
 * contraseña y recuperación de contraseña para que dos asesores revisen tesis
 * es construir el edificio antes de saber si alguien va a vivir en él. Es la
 * misma decisión que los enlaces de subida que reparte el conector.
 *
 * ACEPTAR ES LO QUE ABRE EL DOCUMENTO
 * -----------------------------------
 * Mientras no acepte ve el tema, el capítulo, la universidad y qué le preocupa
 * al tesista: de sobra para decidir. El Word aparece al aceptar, y el servidor
 * lo comprueba por su cuenta —no basta con que el botón no se dibuje—.
 *
 * Eso no es una formalidad: es lo que impide recorrer el catálogo leyendo tesis
 * ajenas sin comprometerse a nada.
 */
@Component({
  selector: 'app-asesor',
  imports: [DatePipe, SiteHeader, SiteFooter],
  templateUrl: './asesor.html',
  styleUrl: './asesor.css',
})
export class PanelAsesor implements OnInit, OnDestroy {
  private readonly api = inject(PedidoService);
  private readonly meta = inject(Meta);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly ficha = signal<FichaDelAsesor | null>(null);
  readonly encargos = signal<Encargo[]>([]);
  readonly cargando = signal(true);
  readonly guardando = signal(false);
  readonly bajando = signal('');
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  /** El encargo abierto en la ventana, y qué se está haciendo con él. */
  readonly abierto = signal<Encargo | null>(null);
  readonly rechazando = signal(false);
  readonly motivo = signal('');
  readonly enlace = signal('');

  readonly esperando = computed(() => this.encargos().filter((e) => e.estado === 'ESPERANDO'));
  readonly enRevision = computed(() => this.encargos().filter((e) => e.estado === 'EN_REVISION'));
  readonly cerrados = computed(() =>
    this.encargos().filter((e) => e.estado === 'ENTREGADO' || e.estado === 'RECHAZADO'),
  );

  ngOnInit(): void {
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.cargar();
  }

  ngOnDestroy(): void {
    this.meta.removeTag("name='robots'");
  }

  private cargar(): void {
    this.api.panelDelAsesor(this.token).subscribe({
      next: (panel) => {
        this.ficha.set(panel.asesor);
        this.encargos.set(panel.encargos);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cargando.set(false);
      },
    });
  }

  escribir(senal: 'motivo' | 'enlace', evento: Event): void {
    this[senal].set((evento.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  /** Apagarse cuando está lleno, sin que nadie tenga que rechazarlo. */
  cambiarDisponibilidad(): void {
    const ficha = this.ficha();
    if (!ficha || this.guardando()) return;

    this.guardando.set(true);
    this.api.disponibilidad(this.token, !ficha.visible).subscribe({
      next: (panel) => {
        this.guardando.set(false);
        this.ficha.set(panel.asesor);
        this.aviso.set(
          panel.asesor.visible
            ? 'Vuelves a salir en el directorio.'
            : 'Ya no sales en el directorio. No te llegarán encargos nuevos.',
        );
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  abrir(encargo: Encargo): void {
    this.abierto.set(encargo);
    this.rechazando.set(false);
    this.motivo.set('');
    this.enlace.set(encargo.enlaceObservaciones);
    this.error.set(null);
  }

  cerrar(): void {
    this.abierto.set(null);
  }

  aceptar(): void {
    const encargo = this.abierto();
    if (!encargo || this.guardando()) return;

    this.guardando.set(true);
    this.api.aceptar(this.token, encargo.id).subscribe({
      next: (guardado) => {
        this.guardando.set(false);
        this.abierto.set(guardado);
        this.aviso.set('Aceptado. Ya puedes abrir el documento.');
        this.cargar();
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  rechazar(): void {
    const encargo = this.abierto();
    const motivo = this.motivo().trim();
    if (!encargo || motivo.length < 5 || this.guardando()) return;

    this.guardando.set(true);
    this.api.rechazar(this.token, encargo.id, motivo).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrar();
        this.aviso.set('Rechazado. El tesista podrá elegir a otro.');
        this.cargar();
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  entregar(): void {
    const encargo = this.abierto();
    const enlace = this.enlace().trim();
    if (!encargo || !enlace || this.guardando()) return;

    this.guardando.set(true);
    this.api.entregar(this.token, encargo.id, enlace).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrar();
        this.aviso.set('Entregado. El tesista ya puede leer tus observaciones.');
        this.cargar();
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /**
   * El documento se baja como blob y se guarda desde memoria.
   *
   * No puede ser un enlace normal: el archivo lo sirve la API comprobando que
   * el encargo es suyo y que ya lo aceptó, y un `target="_blank"` no manda lo
   * que hace falta para esa comprobación.
   */
  bajar(encargo: Encargo): void {
    if (this.bajando()) return;
    this.bajando.set(encargo.id);

    this.api.documentoDelEncargo(this.token, encargo.id).subscribe({
      next: (blob) => {
        this.bajando.set('');
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = `${encargo.codigo}-${encargo.archivoNombre}`;
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (e: unknown) => {
        this.bajando.set('');
        this.error.set(mensajeDeError(e));
      },
    });
  }

  /** «1,4 MB», para que sepa lo que va a abrir antes de aceptar. */
  peso(bytes: number): string {
    const megas = bytes / (1024 * 1024);
    return megas < 1 ? `${Math.round(bytes / 1024)} KB` : `${megas.toFixed(1)} MB`;
  }

  estrellas(valor: number): string {
    const llenas = Math.round(valor);
    return '★★★★★'.slice(0, llenas) + '☆☆☆☆☆'.slice(0, 5 - llenas);
  }

  nota(valor: number): string {
    return valor.toFixed(1).replace('.', ',');
  }
}
