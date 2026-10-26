import { Routes } from '@angular/router';

import { guestGuard } from '../../core/guards/guest.guard';

export const authRoutes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Iniciar sesión · Acosta Research',
    loadComponent: () => import('./login/login').then((m) => m.Login),
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    title: 'Crear cuenta · Acosta Research',
    loadComponent: () => import('./register/register').then((m) => m.Register),
  },
  {
    // Debe coincidir con APP_URL + esta ruta en el correo que envía el backend.
    path: 'verificar-email',
    title: 'Confirmar correo · Acosta Research',
    loadComponent: () => import('./verify-email/verify-email').then((m) => m.VerifyEmail),
  },
  {
    path: 'recuperar',
    canActivate: [guestGuard],
    title: 'Recuperar contraseña · Acosta Research',
    loadComponent: () => import('./recuperar/recuperar').then((m) => m.Recuperar),
  },
  {
    // El botón «Activar mi acceso» del correo del código (26-oct). Sin
    // guestGuard: quien ya tiene la sesión abierta activa en su cuenta. Debe
    // coincidir con `activationCode` en `emailTemplates.js` del backend.
    path: 'activar',
    title: 'Activa tu acceso · Acosta Research',
    loadComponent: () => import('./activar/activar').then((m) => m.Activar),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
];
