import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';
import { UserService } from './core/services/user.service';

/**
 * Restaura la sesión antes de arrancar el router: se canjea la cookie httpOnly
 * de refresh por un access token nuevo y se carga el perfil. Así los guards
 * pueden decidir leyendo una signal, sin condiciones de carrera al recargar.
 * Un fallo aquí es lo normal para un visitante anónimo, así que no rompe nada.
 */
function restaurarSesion() {
  const auth = inject(AuthService);
  const usuarios = inject(UserService);

  return auth.refreshAccessToken().pipe(
    switchMap(() => usuarios.me()),
    switchMap((usuario) => {
      auth.setUser(usuario);
      return of(usuario);
    }),
    catchError(() => {
      auth.clearSession();
      return of(null);
    }),
  );
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    provideAppInitializer(restaurarSesion),
  ],
};
