import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import { CanjeHecho } from '../models/payment.model';
import {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
  Role,
  User,
} from '../models/user.model';

/** Lo que dice el servidor de un código antes de activarlo. */
export interface VistaDeActivacion {
  /** El correo al que se mandó el código. Nulo si el panel no puso ninguno. */
  email: string | null;
  producto: string;
  /** Si entrega el conector (con URL) o una membresía de documentos. */
  conector: boolean;
  /** Ese correo ya tiene cuenta: hay que entrar con ella. */
  tieneCuenta: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auth`;

  /**
   * El access token vive SOLO en memoria: en localStorage sería robable por XSS.
   * La sesión persiste entre recargas gracias a la cookie httpOnly del refresh,
   * que el navegador envía sola y JavaScript no puede leer.
   */
  private readonly accessTokenSignal = signal<string | null>(null);
  private readonly userSignal = signal<User | null>(null);

  readonly accessToken = this.accessTokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);
  readonly fullName = computed(() => {
    const user = this.userSignal();
    return user ? `${user.firstName} ${user.lastName}` : '';
  });

  /**
   * Refresco en curso, compartido. Si varias peticiones reciben 401 a la vez,
   * todas esperan al mismo refresh en lugar de disparar uno cada una: el backend
   * rota el token y las rotaciones simultáneas se anularían entre sí.
   */
  private refreshInFlight: Observable<string> | null = null;

  // ── Sesión ────────────────────────────────────────────────────────────────

  register(payload: RegisterRequest): Observable<RegisterResponse> {
    return this.http
      .post<ApiResponse<RegisterResponse>>(`${this.base}/register`, payload)
      .pipe(map((res) => res.data));
  }

  login(payload: LoginRequest): Observable<User> {
    return this.http.post<ApiResponse<LoginResponse>>(`${this.base}/login`, payload).pipe(
      map((res) => res.data),
      tap(({ user, accessToken }) => {
        this.accessTokenSignal.set(accessToken);
        this.userSignal.set(user);
      }),
      map(({ user }) => user),
    );
  }

  /**
   * Entrar o darse de alta con Google. Es la misma llamada para ambas cosas:
   * el servidor decide si crea la cuenta o abre la que ya existía.
   */
  loginWithGoogle(credential: string): Observable<User> {
    return this.http.post<ApiResponse<LoginResponse>>(`${this.base}/google`, { credential }).pipe(
      map((res) => res.data),
      tap(({ user, accessToken }) => {
        this.accessTokenSignal.set(accessToken);
        this.userSignal.set(user);
      }),
      map(({ user }) => user),
    );
  }

  /** La página del botón «Activar mi acceso»: qué entrega el código y a qué correo. */
  verActivacion(codigo: string): Observable<VistaDeActivacion> {
    return this.http
      .post<ApiResponse<VistaDeActivacion>>(`${this.base}/activar/ver`, { codigo })
      .pipe(map((res) => res.data));
  }

  /**
   * Activa con una cuenta nueva en un solo paso: el servidor crea la cuenta con
   * el correo del código, abre la sesión y canjea. Devuelve lo canjeado.
   */
  activar(datos: {
    codigo: string;
    firstName: string;
    lastName: string;
    password: string;
  }): Observable<CanjeHecho> {
    return this.http
      .post<ApiResponse<LoginResponse & { canje: CanjeHecho }>>(`${this.base}/activar`, datos)
      .pipe(
        map((res) => res.data),
        tap(({ user, accessToken }) => {
          this.accessTokenSignal.set(accessToken);
          this.userSignal.set(user);
        }),
        map(({ canje }) => canje),
      );
  }

  logout(): Observable<void> {
    // La sesión local se limpia pase lo que pase: si el backend no responde,
    // dejar al usuario "dentro" sería peor que cerrarle igualmente.
    return this.http.post<void>(`${this.base}/logout`, {}).pipe(
      catchError(() => of(void 0)),
      finalize(() => this.clearSession()),
      map(() => void 0),
    );
  }

  /** Cierra la sesión en todos los dispositivos. */
  logoutEverywhere(): Observable<void> {
    return this.http.post<void>(`${this.base}/logout-all`, {}).pipe(
      catchError(() => of(void 0)),
      finalize(() => this.clearSession()),
      map(() => void 0),
    );
  }

  /**
   * Pide un access token nuevo con la cookie de refresh. Devuelve siempre el
   * mismo observable mientras haya un refresco en vuelo.
   */
  refreshAccessToken(): Observable<string> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = this.http
      .post<ApiResponse<RefreshResponse>>(`${this.base}/refresh`, {})
      .pipe(
        map((res) => res.data.accessToken),
        tap((token) => this.accessTokenSignal.set(token)),
        catchError((error: unknown) => {
          this.clearSession();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.refreshInFlight;
  }

  /**
   * Restaura la sesión al arrancar la aplicación. Falla en silencio: no tener
   * cookie válida es el caso normal de un visitante anónimo.
   */
  restoreSession(): Observable<User | null> {
    return this.refreshAccessToken().pipe(
      // El refresh solo devuelve el token; el perfil se pide aparte.
      map(() => null),
      catchError(() => of(null)),
    );
  }

  clearSession(): void {
    this.accessTokenSignal.set(null);
    this.userSignal.set(null);
  }

  setUser(user: User | null): void {
    this.userSignal.set(user);
  }

  hasRole(...roles: Role[]): boolean {
    const role = this.userSignal()?.role;
    return role !== undefined && roles.includes(role);
  }

  // ── Verificación de correo ────────────────────────────────────────────────

  /**
   * La contraseña del registro que se acaba de enviar, para no volver a pedirla
   * al teclear el código.
   *
   * Solo en memoria: ni en la URL, ni en el historial, ni en `localStorage`. Si
   * se recarga la página o se confirma desde otro equipo, se pierde y la
   * pantalla del código la pide.
   */
  private altaReciente: { email: string; password: string } | null = null;

  recordarAlta(email: string, password: string): void {
    this.altaReciente = { email, password };
  }

  contrasenaDeAlta(email: string): string | null {
    return this.altaReciente?.email === email.trim().toLowerCase() ? this.altaReciente.password : null;
  }

  olvidarAlta(): void {
    this.altaReciente = null;
  }

  /**
   * Canjea el código de 6 dígitos que llegó por correo. Va con la contraseña del
   * registro: sin ella, quien registrara el mismo correo detrás se quedaba la cuenta.
   */
  verifyEmail(email: string, code: string, password: string): Observable<void> {
    return this.http
      .post<ApiResponse<unknown>>(`${this.base}/verify-email`, { email, code, password })
      .pipe(map(() => undefined));
  }

  resendVerification(email: string): Observable<string> {
    return this.http
      .post<ApiResponse<null>>(`${this.base}/resend-verification`, { email })
      .pipe(map((res) => res.message ?? 'Correo reenviado.'));
  }

  // ── Olvidé mi contraseña ──────────────────────────────────────────────────

  /** Pide el código al correo. El servidor responde igual exista o no la cuenta. */
  forgotPassword(email: string): Observable<string> {
    return this.http
      .post<ApiResponse<null>>(`${this.base}/forgot-password`, { email })
      .pipe(map((res) => res.message ?? 'Te enviamos un código.'));
  }

  resetPassword(email: string, code: string, newPassword: string): Observable<void> {
    return this.http
      .post<ApiResponse<null>>(`${this.base}/reset-password`, { email, code, newPassword })
      .pipe(map(() => undefined));
  }
}
