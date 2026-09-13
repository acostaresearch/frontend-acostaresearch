import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { mantenimientoInterceptor } from './core/interceptors/mantenimiento.interceptor';
import { AuthService } from './core/services/auth.service';
import { MantenimientoService, esCaidaDelServicio } from './core/services/mantenimiento.service';
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
  const mantenimiento = inject(MantenimientoService);

  return auth.refreshAccessToken().pipe(
    switchMap(() => usuarios.me()),
    switchMap((usuario) => {
      auth.setUser(usuario);
      return of(usuario);
    }),
    catchError((error: unknown) => {
      // Con la base caída no se sabe si había sesión: la página se monta
      // igualmente, tapada por el mantenimiento, y al volver se recarga para
      // restaurarla de verdad.
      if (esCaidaDelServicio(error)) mantenimiento.recargarCuandoVuelva();
      auth.clearSession();
      return of(null);
    }),
  );
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // El de mantenimiento, primero: así ve el error que queda después del
    // intento de refresh del de sesión.
    provideHttpClient(withFetch(), withInterceptors([mantenimientoInterceptor, authInterceptor])),
    // El panel es una sección de la portada: sin `anchorScrolling` los enlaces
    // «Mi panel» llegarían al inicio de la página en vez de a la sección.
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
    provideAppInitializer(restaurarSesion),
  ],
};
