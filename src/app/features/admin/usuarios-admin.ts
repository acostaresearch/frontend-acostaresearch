import { DestroyRef, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';

import { mensajeDeError } from '../../core/http/api-error';
import { User } from '../../core/models/user.model';
import { AdminCreado, UserService } from '../../core/services/user.service';

/** Búsqueda paginada de cuentas y formulario para crear administradores. */
export class UsuariosAdmin {
  private readonly usuariosApi = inject(UserService);
  private readonly fb = inject(FormBuilder);

  constructor(private readonly error: WritableSignal<string | null>) {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.busquedaPendiente));
  }

  readonly usuarios = signal<User[]>([]);
  readonly cargandoUsuarios = signal(false);
  readonly busquedaUsuarios = signal('');
  readonly paginaDeUsuarios = signal(1);
  readonly paginasDeUsuarios = signal(1);
  readonly totalDeUsuarios = signal(0);

  /**
   * Los administradores, sacados de la misma lista que se acaba de cargar.
   *
   * Sale de lo que ya hay en pantalla y no de otra petición, y eso trae un
   * límite honesto: si hay más administradores de los que caben en la página que
   * se está viendo, aquí faltarán. Con dos o tres personas en el panel eso no
   * pasa, y montar una consulta aparte para un caso que no existe todavía sería
   * pagar por adelantado.
   */
  readonly administradores = computed(() => this.usuarios().filter((u) => u.role === 'ADMIN'));

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

  cargarUsuarios(): void {
    this.cargandoUsuarios.set(true);
    const busqueda = this.busquedaUsuarios().trim();

    this.usuariosApi
      .list({ page: this.paginaDeUsuarios(), perPage: 50, search: busqueda || undefined })
      .subscribe({
        next: ({ users, meta }) => {
          this.usuarios.set(users);
          this.paginasDeUsuarios.set(meta.totalPages);
          this.totalDeUsuarios.set(meta.total);
          this.cargandoUsuarios.set(false);
        },
        error: (e: unknown) => {
          this.error.set(mensajeDeError(e));
          this.cargandoUsuarios.set(false);
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
  });

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

    const { firstName, lastName, email, password } = this.formAdmin.getRawValue();

    this.creandoAdmin.set(true);
    this.usuariosApi
      .crearAdministrador({
        firstName,
        lastName,
        email,
        // Vacío significa «genérala tú», no «contraseña en blanco».
        password: password.trim() || undefined,
      })
      .subscribe({
        next: (creado) => {
          this.adminCreado.set(creado);
          this.creandoAdmin.set(false);
          // La lista se recarga para que la cuenta nueva aparezca detrás.
          this.cargarUsuarios();
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
    };
    return nombres[rol] ?? rol;
  }
}
