import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { Role } from '../models/user.model';
import { AuthService } from '../services/auth.service';

/**
 * RBAC en el cliente: oculta rutas según el rol. Es solo experiencia de uso —
 * quien decide de verdad es el `authorize()` del backend.
 * Uso: `canActivate: [authGuard, roleGuard('ADMIN')]`
 */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/auth/login']);
    }

    return auth.hasRole(...roles) ? true : router.createUrlTree(['/']);
  };
}
