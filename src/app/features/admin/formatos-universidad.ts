import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { DialogoService } from '../../core/services/dialogo.service';
import {
  CapituloDeGuia,
  FichaDeFormato,
  FormatoUniversidad,
  FormatoUniversidadService,
  GRADOS_DE_FORMATO,
  MetodoConFases,
} from '../../core/services/formato-universidad.service';
import { AvisoFlotante } from '../../shared/layout/aviso-flotante';
import { MenuFila } from './menu-fila';

/** Las dos pestañas: lo que espera revisión y lo que ya se ofrece. */
type Filtro = 'porAprobar' | 'biblioteca';

/** Qué hace la ventana de la ficha al guardar. */
type ModoFicha = 'nuevo' | 'editar' | 'aprobar';

const FICHA_VACIA: FichaDeFormato = { universidad: '', alias: '', facultad: '', grado: 'cualquiera', notas: '' };

/**
 * La biblioteca de formatos de universidad, en /admin (28-oct).
 *
 * Cada formato es el .docx de la plantilla de una universidad. Cuando un
 * tesista le dice a Claude de qué universidad es, el servidor busca aquí por el
 * nombre y sus otros nombres y se lo pone sin que lo suba. Puede llevar además
 * los capítulos de la guía de esa universidad, que se copian a su tesis.
 *
 * «Por aprobar» son las plantillas que subieron los tesistas. No se ofrecen a
 * nadie hasta aprobarlas: hay que abrirlas antes, porque suelen traer el nombre
 * de otro tesista en la portada. Rechazar es borrarla.
 *
 * Componente aparte, como Sorteos: carga lo suyo al abrirse y la hoja de
 * estilos del panel ya roza su tope.
 */
@Component({
  selector: 'app-formatos-universidad-admin',
  imports: [AvisoFlotante, FormsModule, MenuFila],
  templateUrl: './formatos-universidad.html',
  styleUrls: ['./ventana-admin.css', './formatos-universidad.css'],
})
export class FormatosUniversidadAdmin implements OnInit {
  private readonly api = inject(FormatoUniversidadService);
  private readonly dialogos = inject(DialogoService);

  readonly grados = GRADOS_DE_FORMATO;

  readonly formatos = signal<FormatoUniversidad[]>([]);
  readonly metodos = signal<MetodoConFases[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  readonly filtro = signal<Filtro>('biblioteca');
  readonly buscar = signal('');

  readonly porAprobar = computed(() => this.formatos().filter((f) => !f.aprobado));
  readonly enBiblioteca = computed(() => this.formatos().filter((f) => f.aprobado));

  /** Lo que se ve: la pestaña y lo que se busca por nombre. */
  readonly visibles = computed(() => {
    const lista = this.filtro() === 'porAprobar' ? this.porAprobar() : this.enBiblioteca();
    const texto = sinTildes(this.buscar());
    if (!texto) return lista;
    return lista.filter((f) => sinTildes(`${f.universidad} ${f.alias} ${f.facultad} ${f.archivoNombre}`).includes(texto));
  });

  // ── La ficha (subir, editar o aprobar) ──────────────────────────────────
  readonly modo = signal<ModoFicha | null>(null);
  readonly abierto = signal<FormatoUniversidad | null>(null);
  ficha: FichaDeFormato = { ...FICHA_VACIA };
  readonly archivo = signal<File | null>(null);
  readonly guardando = signal(false);

  // ── Los capítulos de la guía ────────────────────────────────────────────
  readonly conCapitulos = signal<FormatoUniversidad | null>(null);
  readonly metodoElegido = signal<string>('');
  readonly capitulos = signal<CapituloDeGuia[]>([]);
  readonly fasesDelMetodo = computed(
    () => this.metodos().find((m) => m.productCode === this.metodoElegido())?.fases ?? [],
  );

  ngOnInit(): void {
    this.cargar(true);
    this.api.metodos().subscribe({ next: (m) => this.metodos.set(m), error: () => this.metodos.set([]) });
  }

  cargar(primeraVez = false): void {
    this.api.todos().subscribe({
      next: (formatos) => {
        this.formatos.set(formatos);
        this.cargando.set(false);
        // Al entrar, lo que espera revisión primero, si hay algo.
        if (primeraVez && formatos.some((f) => !f.aprobado)) this.filtro.set('porAprobar');
      },
      error: (e: unknown) => {
        this.cargando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }

  peso(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  // ── Ficha ───────────────────────────────────────────────────────────────

  abrirFicha(modo: ModoFicha, formato: FormatoUniversidad | null = null): void {
    this.modo.set(modo);
    this.abierto.set(formato);
    this.archivo.set(null);
    this.ficha = formato
      ? {
          universidad: formato.universidad,
          alias: formato.alias,
          facultad: formato.facultad,
          grado: formato.grado,
          notas: formato.notas,
        }
      : { ...FICHA_VACIA };
  }

  cerrarFicha(): void {
    this.modo.set(null);
    this.abierto.set(null);
  }

  elegirArchivo(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    this.archivo.set(entrada.files?.[0] ?? null);
  }

  puedeGuardar(): boolean {
    if (this.guardando()) return false;
    if (this.modo() === 'nuevo' && !this.archivo()) return false;
    return this.ficha.universidad.trim().length >= 3;
  }

  guardarFicha(): void {
    if (!this.puedeGuardar()) return;
    const modo = this.modo();
    const abierto = this.abierto();
    const archivo = this.archivo();
    this.guardando.set(true);

    const terminar = (mensaje: string) => {
      this.guardando.set(false);
      this.cerrarFicha();
      this.aviso.set(mensaje);
      this.cargar();
    };
    const fallar = (e: unknown) => {
      this.guardando.set(false);
      this.error.set(mensajeDeError(e));
    };

    if (modo === 'nuevo' && archivo) {
      this.api.crear(this.ficha, archivo).subscribe({
        next: (f) => terminar(`Formato de «${f.universidad}» subido. Ya se ofrece a sus tesistas.`),
        error: fallar,
      });
      return;
    }
    if (!abierto) return;

    const cambios = { ...this.ficha, ...(modo === 'aprobar' ? { aprobado: true } : {}) };
    this.api.actualizar(abierto.id, cambios).subscribe({
      next: (f) => {
        if (!archivo) {
          terminar(modo === 'aprobar' ? `Aprobado: ya se ofrece a los tesistas de «${f.universidad}».` : 'Formato guardado.');
          return;
        }
        this.api.cambiarArchivo(f.id, archivo).subscribe({
          next: () => terminar('Formato y archivo guardados.'),
          error: fallar,
        });
      },
      error: fallar,
    });
  }

  // ── Revisar, rechazar, borrar ───────────────────────────────────────────

  /** Bajarlo para abrirlo en Word: con la sesión, porque la ruta es del administrador. */
  descargar(formato: FormatoUniversidad): void {
    this.api.descargar(formato.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = formato.archivoNombre || 'formato.docx';
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  async borrar(formato: FormatoUniversidad): Promise<void> {
    const pendiente = !formato.aprobado;
    const seguro = await this.dialogos.confirmar({
      titulo: pendiente ? 'Rechazar esta plantilla' : `Borrar el formato de ${formato.universidad}`,
      mensaje: pendiente
        ? 'Se borra el archivo y no se le ofrece a nadie. El tesista que la subió conserva la suya.'
        : 'Deja de ofrecerse a los tesistas nuevos. Los que ya lo tienen puesto lo conservan.',
      confirmar: pendiente ? 'Rechazar' : 'Borrar',
      tono: 'peligro',
    });
    if (!seguro) return;
    this.api.borrar(formato.id).subscribe({
      next: () => {
        this.aviso.set(pendiente ? 'Plantilla rechazada y borrada.' : 'Formato borrado.');
        this.cargar();
      },
      error: (e: unknown) => this.error.set(mensajeDeError(e)),
    });
  }

  // ── Capítulos de la guía ────────────────────────────────────────────────

  abrirCapitulos(formato: FormatoUniversidad): void {
    this.conCapitulos.set(formato);
    this.metodoElegido.set(formato.esquemaProducto ?? this.metodos()[0]?.productCode ?? '');
    this.capitulos.set(
      formato.esquema?.capitulos.map((c) => ({ titulo: c.titulo, de: [...(c.de ?? [])] })) ?? [
        { titulo: '', de: [] },
      ],
    );
  }

  cerrarCapitulos(): void {
    this.conCapitulos.set(null);
  }

  /** Al cambiar de método, las fases elegidas ya no valen. */
  elegirMetodo(codigo: string): void {
    this.metodoElegido.set(codigo);
    this.capitulos.update((lista) => lista.map((c) => ({ ...c, de: [] })));
  }

  ponerTitulo(i: number, titulo: string): void {
    this.capitulos.update((lista) => lista.map((c, j) => (j === i ? { ...c, titulo } : c)));
  }

  /** Una fase va en un solo capítulo: marcarla en uno la quita de los demás. */
  alternarFase(i: number, code: string): void {
    this.capitulos.update((lista) =>
      lista.map((c, j) => {
        const de = c.de ?? [];
        if (j === i) return { ...c, de: de.includes(code) ? de.filter((x) => x !== code) : [...de, code] };
        return { ...c, de: de.filter((x) => x !== code) };
      }),
    );
  }

  anadirCapitulo(): void {
    this.capitulos.update((lista) => [...lista, { titulo: '', de: [] }]);
  }

  quitarCapitulo(i: number): void {
    this.capitulos.update((lista) => lista.filter((_, j) => j !== i));
  }

  mover(i: number, paso: -1 | 1): void {
    this.capitulos.update((lista) => {
      const j = i + paso;
      if (j < 0 || j >= lista.length) return lista;
      const copia = [...lista];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  guardarCapitulos(): void {
    const formato = this.conCapitulos();
    if (!formato) return;
    const capitulos = this.capitulos()
      .map((c) => ({ titulo: c.titulo.trim(), ...(c.de?.length ? { de: c.de } : {}) }))
      .filter((c) => c.titulo);
    const cambios =
      capitulos.length === 0
        ? { esquema: null, esquemaProducto: null }
        : { esquema: { capitulos }, esquemaProducto: this.metodoElegido() };
    this.guardando.set(true);
    this.api.actualizar(formato.id, cambios).subscribe({
      next: () => {
        this.guardando.set(false);
        this.cerrarCapitulos();
        this.aviso.set(capitulos.length === 0 ? 'Capítulos quitados.' : 'Capítulos de la guía guardados.');
        this.cargar();
      },
      error: (e: unknown) => {
        this.guardando.set(false);
        this.error.set(mensajeDeError(e));
      },
    });
  }
}

/** Para buscar sin que importen las tildes ni las mayúsculas. */
function sinTildes(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
