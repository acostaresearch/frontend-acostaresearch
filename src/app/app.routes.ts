import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // La portada es pública: un visitante tiene que poder ver qué se vende antes
  // de que se le pida una cuenta.
  {
    path: '',
    pathMatch: 'full',
    title: 'Acosta | IA & Research · Tesis y redacción académica',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  {
    path: 'panel',
    canActivate: [authGuard],
    title: 'Panel · Acosta Research',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'humanizador',
    canActivate: [authGuard],
    title: 'Humanizador · Acosta Research',
    loadComponent: () => import('./features/rewriter/rewriter').then((m) => m.Rewriter),
  },
  {
    path: 'planes',
    title: 'Precios · Acosta Research',
    loadComponent: () => import('./features/checkout/checkout').then((m) => m.Checkout),
  },
  { path: '**', redirectTo: '' },
];
