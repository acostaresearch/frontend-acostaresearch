import { DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { User } from '../../core/models/user.model';
import { AdminCreado, UserService } from '../../core/services/user.service';
import { DialogoService } from '../../core/services/dialogo.service';
import { PAISES, nombreDePais } from '../../shared/contenido/paises';
import { ListadoFiltrable } from './listado';

/** Las pestañas de la lista: todas las cuentas, o solo las que tienen licencia o no. */
export type FiltroDeLicencia = 'todos' | 'con' | 'sin';

/** Búsqueda paginada de cuentas y formulario para crear administradores. */
export class UsuariosAdmin {
  private readonly usuariosApi = inject(UserService);
  private readonly fb = inject(FormBuilder);
  private readonly dialogos = inject(DialogoService);

  constructor(
    private readonly error: WritableSignal<string | null>,
    private readonly aviso: WritableSignal<string | null> = signal(null),
  ) {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.busquedaPendiente));
  }

  readonly usuarios = signal<User[]>([]);
  readonly cargandoUsuarios = signal(false);
  readonly busquedaUsuarios = signal('');
  readonly paginaDeUsuarios = signal(1);
  readonly paginasDeUsuarios = signal(1);
  readonly totalDeUsuarios = signal(0);

  /**
   * Con licencia o sin ella. «Con» es tener alguna emitida, también revocada o
   * suspendida: es aquí donde se viene a reactivarla. Lo criba el servidor,
   * porque la lista va paginada.
   */
  readonly filtroLicencia = signal<FiltroDeLicencia>('todos');
  /** Cuántas cuentas hay en cada pestaña, con la búsqueda que esté escrita. */
  readonly conteoDeUsuarios = signal<Record<string, number>>({});

  filtrarPorLicencia(filtro: string): void {
    if (filtro !== 'todos' && filtro !== 'con' && filtro !== 'sin') return;
    if (filtro === this.filtroLicencia()) return;
    this.filtroLicencia.set(filtro);
    this.paginaDeUsuarios.set(1);
    this.cargarUsuarios();
  }

  /** Lo que pinta `app-filtros-lista`: el buscador y las tres pestañas. */
  readonly filtrosDeUsuarios: ListadoFiltrable = {
    busca: this.busquedaUsuarios,
    filtro: this.filtroLicencia,
    filtros: [
      { valor: 'todos', etiqueta: 'Todos' },
      { valor: 'con', etiqueta: 'Con licencia' },
      { valor: 'sin', etiqueta: 'Sin licencia' },
    ],
    conteo: this.conteoDeUsuarios,
    buscar: (evento) => this.buscarUsuarios((evento.target as HTMLInputElement).value),
    limpiar: () => this.buscarUsuarios(''),
    filtrar: (valor) => this.filtrarPorLicencia(valor),
  };

  // ── Las licencias de una cuenta, en su ventana ───────────────────────────

  /** La cuenta cuyas licencias están abiertas. Una a la vez. */
  readonly licenciasAbiertasDe = signal<string | null>(null);
  /** Esa cuenta, para la cabecera de la ventana. Si ya no está en la lista, se cierra. */
  readonly cuentaDeLicencias = computed(
    () => this.usuarios().find((u) => u.id === this.licenciasAbiertasDe()) ?? null,
  );
  /** El correo que hay que abrir en cuanto llegue la lista (ver `verLicenciasDe`). */
  private abrirAlCargar: string | null = null;

  alternarLicenciasDe(usuario: User): void {
    this.licenciasAbiertasDe.update((abierta) => (abierta === usuario.id ? null : usuario.id));
  }

  /**
   * Deja la lista en esa cuenta, con sus licencias ya abiertas. Es a donde
   * saltan «Ver licencias» de un acceso y de una alerta.
   */
  verLicenciasDe(correo: string): void {
    clearTimeout(this.busquedaPendiente);
    this.busquedaUsuarios.set(correo);
    this.filtroLicencia.set('todos');
    this.paginaDeUsuarios.set(1);
    this.abrirAlCargar = correo;
    this.cargarUsuarios();
  }

  /**
   * Los administradores, sacados de la misma lista que se acaba de cargar.
   *
   * Sale de lo que ya hay en pantalla y no de otra petición, y eso trae un
   * límite honesto: si hay más administradores de los que caben en la página que
   * se está viendo, aquí faltarán. Con dos o tres personas en el panel eso no
   * pasa, y montar una consulta aparte para un caso que no existe todavía sería
   * pagar por adelantado.
   */
  readonly administradores = computed(() =>
    this.usuarios().filter((u) => u.role === 'ADMIN' || u.role === 'ADMIN_PAIS'),
  );

  private busquedaPendiente?: ReturnType<typeof setTimeout>;

  /**
   * Busca al dejar de teclear.
   *
   * Con 300 ms de espera: cada pulsación es una consulta al servidor, y escribir
   * un correo entero lanzaría veinte para tirar diecinueve.
   */
  buscarUsuarios(texto: string): void {
    this.busquedaUsuarios.set(texto);
    clearTimeout(this.busquedaPendiente);
    this.busquedaPendiente = setTimeout(() => {
      this.paginaDeUsuarios.set(1);
      this.cargarUsuarios();
    }, 300);
  }

  irAPaginaDeUsuarios(pagina: number): void {
    if (pagina < 1 || pagina > this.paginasDeUsuarios()) return;
    this.paginaDeUsuarios.set(pagina);
    this.cargarUsuarios();
  }

  /**
   * Los países que tienen algún administrador: lo que ofrece el selector «ver
   * por país» de la barra de arriba. Sale de su propia petición y no de la
   * lista de usuarios, que va paginada y puede no traerlos a todos.
   */
  readonly paisesConAdministrador = signal<string[]>([]);

  /** Si falla se queda como estaba: el selector sigue con «Todos» y «la casa». */
  cargarPaises(): void {
    this.usuariosApi.paisesConAdministrador().subscribe({
      next: (paises) => this.paisesConAdministrador.set(paises),
      error: () => undefined,
    });
  }

  cargarUsuarios(): void {
    this.cargandoUsuarios.set(true);
    const busqueda = this.busquedaUsuarios().trim();
    const filtro = this.filtroLicencia();

    this.usuariosApi
      .list({
        page: this.paginaDeUsuarios(),
        perPage: 50,
        search: busqueda || undefined,
        licencia: filtro === 'todos' ? undefined : filtro,
      })
      .subscribe({
        next: ({ users, meta, conteo }) => {
          this.usuarios.set(users);
          this.paginasDeUsuarios.set(meta.totalPages);
          this.totalDeUsuarios.set(meta.total);
          // Un servidor anterior no manda el conteo: las pestañas salen sin número.
          this.conteoDeUsuarios.set(conteo ?? {});
          if (this.abrirAlCargar) {
            const correo = this.abrirAlCargar.toLowerCase();
            this.abrirAlCargar = null;
            this.licenciasAbiertasDe.set(
              users.find((u) => u.email.toLowerCase() === correo)?.id ?? null,
            );
          }
          this.cargandoUsuarios.set(false);
        },
        error: (e: unknown) => {
          this.abrirAlCargar = null;
          this.error.set(mensajeDeError(e));
          this.cargandoUsuarios.set(false);
        },
      });
  }

  // ── Suspender y reactivar ────────────────────────────────────────────────

  /** La cuenta que se está suspendiendo o reactivando, para apagar su botón. */
  readonly cambiandoEstado = signal<string | null>(null);

  /**
   * Suspende una cuenta activa o reactiva una suspendida.
   *
   * Pide confirmación porque corta al momento: las sesiones abiertas y el
   * conector de esa persona dejan de funcionar en la petición siguiente. Al
   * reactivarla no vuelve sola: tiene que iniciar sesión otra vez.
   */
  async cambiarEstadoDe(usuario: User): Promise<void> {
    if (this.cambiandoEstado()) return;
    const suspender = usuario.status !== 'SUSPENDED';

    const seguro = await this.dialogos.confirmar(
      suspender
        ? {
            titulo: '¿Suspender esta cuenta?',
            mensaje:
              `${usuario.email} no podrá entrar a la web y su conector dejará de responder ` +
              'ahora mismo, aunque tenga una sesión abierta.',
            nota: 'No se borra nada: sus licencias, sus compras y su tesis se quedan como están. Puedes reactivarla cuando quieras.',
            confirmar: 'Suspender la cuenta',
          }
        : {
            titulo: '¿Reactivar esta cuenta?',
            mensaje: `${usuario.email} podrá volver a entrar y su conector volverá a responder.`,
            nota: 'Tendrá que iniciar sesión de nuevo: las sesiones que tenía antes no se recuperan.',
            confirmar: 'Reactivar la cuenta',
          },
    );
    if (!seguro) return;

    this.cambiandoEstado.set(usuario.id);
    this.error.set(null);
    this.usuariosApi.cambiarEstado(usuario.id, suspender ? 'SUSPENDED' : 'ACTIVE').subscribe({
      next: ({ user, mensaje }) => {
        this.usuarios.update((lista) => lista.map((u) => (u.id === user.id ? { ...u, ...user } : u)));
        this.aviso.set(mensaje || (suspender ? 'Cuenta suspendida.' : 'Cuenta reactivada.'));
        this.cambiandoEstado.set(null);
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cambiandoEstado.set(null);
      },
    });
  }

  // ── Dar y quitar el acceso de administrador ──────────────────────────────

  /** La cuenta a la que se le está dando acceso: abre la ventana de elegir país. */
  readonly dandoAcceso = signal<User | null>(null);
  /** El país elegido en esa ventana. Vacío = administrador general. */
  readonly paisDelAcceso = signal('');
  /** La cuenta cuyo rol se está cambiando, para apagar sus botones. */
  readonly cambiandoRol = signal<string | null>(null);

  abrirAcceso(usuario: User): void {
    this.paisDelAcceso.set('');
    this.error.set(null);
    this.dandoAcceso.set(usuario);
  }

  cerrarAcceso(): void {
    this.dandoAcceso.set(null);
  }

  /** Convierte en administrador la cuenta de la ventana, con el país elegido. */
  darAcceso(): void {
    const usuario = this.dandoAcceso();
    if (!usuario || this.cambiandoRol()) return;
    this.cambiarRol(usuario, 'ADMIN', this.paisDelAcceso() || undefined, () => this.cerrarAcceso());
  }

  /**
   * Le quita el acceso de administrador y la deja como cuenta de usuario.
   *
   * Pide confirmación porque corta al momento: deja de ver el panel en la
   * petición siguiente. Su cuenta, sus licencias y sus compras no se tocan.
   */
  async quitarAcceso(usuario: User): Promise<void> {
    if (this.cambiandoRol()) return;

    const seguro = await this.dialogos.confirmar({
      titulo: '¿Quitarle el acceso de administrador?',
      mensaje: `${usuario.email} dejará de entrar al panel ahora mismo y volverá a ser una cuenta de usuario.`,
      nota: 'No se borra nada: su cuenta, sus licencias y sus compras se quedan como están. Puedes devolvérselo cuando quieras.',
      confirmar: 'Quitar el acceso',
    });
    if (!seguro) return;

    this.cambiarRol(usuario, 'USER');
  }

  private cambiarRol(usuario: User, rol: 'ADMIN' | 'USER', pais?: string, alTerminar?: () => void): void {
    this.cambiandoRol.set(usuario.id);
    this.error.set(null);
    this.usuariosApi.cambiarRol(usuario.id, rol, pais).subscribe({
      next: ({ user, mensaje }) => {
        this.usuarios.update((lista) => lista.map((u) => (u.id === user.id ? { ...u, ...user } : u)));
        this.aviso.set(mensaje || 'Rol cambiado.');
        this.cambiandoRol.set(null);
        this.cargarPaises();
        alTerminar?.();
      },
      error: (e: unknown) => {
        this.error.set(mensajeDeError(e));
        this.cambiandoRol.set(null);
      },
    });
  }

  // ── Crear administrador ──────────────────────────────────────────────────

  readonly formularioAdminAbierto = signal(false);
  readonly creandoAdmin = signal(false);
  /**
   * La cuenta recién creada, con su contraseña si la generó el servidor.
   *
   * Se queda en pantalla hasta que se cierra la ventana a mano: si la ventana se
   * cerrara sola al terminar, la contraseña provisional desaparecería antes de
   * que a nadie le diera tiempo a copiarla, y no hay forma de volver a verla.
   */
  readonly adminCreado = signal<AdminCreado | null>(null);

  readonly formAdmin = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    // Vacía a propósito: lo normal es que la genere el servidor y la mande.
    password: [''],
    // Vacío = administrador como el de siempre, que lo ve todo. Con un país,
    // la cuenta solo ve lo de ese país.
    pais: [''],
  });

  readonly paises = PAISES;
  readonly nombreDePais = nombreDePais;

  abrirFormularioAdmin(): void {
    this.formAdmin.reset();
    this.adminCreado.set(null);
    this.error.set(null);
    this.formularioAdminAbierto.set(true);
  }

  cerrarFormularioAdmin(): void {
    this.formularioAdminAbierto.set(false);
    this.adminCreado.set(null);
  }

  crearAdministrador(): void {
    if (this.creandoAdmin()) return;
    if (this.formAdmin.invalid) {
      this.formAdmin.markAllAsTouched();
      this.error.set('Revisa el nombre, el apellido y el correo.');
      return;
    }

    const { firstName, lastName, email, password, pais } = this.formAdmin.getRawValue();

    this.creandoAdmin.set(true);
    this.usuariosApi
      .crearAdministrador({
        firstName,
        lastName,
        email,
        // Vacío significa «genérala tú», no «contraseña en blanco».
        password: password.trim() || undefined,
        pais: pais || undefined,
      })
      .subscribe({
        next: (creado) => {
          this.adminCreado.set(creado);
          this.creandoAdmin.set(false);
          // La lista se recarga para que la cuenta nueva aparezca detrás.
          this.cargarUsuarios();
          this.cargarPaises();
        },
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e));
          this.creandoAdmin.set(false);
        },
      });
  }

  /** Los estados y roles del servidor, en castellano. */
  estadoUsuario(estado: string): string {
    const nombres: Record<string, string> = {
      ACTIVE: 'Activa',
      PENDING: 'Sin verificar',
      SUSPENDED: 'Suspendida',
    };
    return nombres[estado] ?? estado;
  }

  rolUsuario(rol: string): string {
    const nombres: Record<string, string> = {
      USER: 'Usuario',
      EDITOR: 'Editor',
      ADMIN: 'Administrador',
      ADMIN_PAIS: 'Administrador de país',
    };
    return nombres[rol] ?? rol;
  }
}
