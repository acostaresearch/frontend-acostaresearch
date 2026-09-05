import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.model';
import {
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
  Role,
  User,
} from '../models/user.model';

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

  /** Canjea el código de 6 dígitos que llegó por correo. */
  verifyEmail(email: string, code: string): Observable<User> {
    return this.http
      .post<ApiResponse<{ user: User }>>(`${this.base}/verify-email`, { email, code })
      .pipe(map((res) => res.data.user));
  }

  resendVerification(email: string): Observable<string> {
    return this.http
      .post<ApiResponse<null>>(`${this.base}/resend-verification`, { email })
      .pipe(map((res) => res.message ?? 'Correo reenviado.'));
  }
}
