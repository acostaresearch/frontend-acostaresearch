import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';


export const routes: Routes = [
  // La portada es pública: un visitante tiene que poder ver qué se vende antes
  // de que se le pida una cuenta.
  {
    path: '',
    pathMatch: 'full',
    title: 'Acosta | IA & Research · Tesis y redacción académica',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  // El sitio público son páginas, no secciones de una portada infinita: cada
  // una responde a una pregunta y se puede enlazar y compartir por separado.
  {
    path: 'en-accion',
    title: 'Míralo en acción · Acosta Research',
    loadComponent: () => import('./features/demos/demos').then((m) => m.Demos),
  },
  {
    path: 'metodo',
    title: 'Las 9 Skills · Acosta Research',
    loadComponent: () => import('./features/metodo/metodo').then((m) => m.Metodo),
  },
  {
    path: 'articulo',
    title: 'Ruta del Artículo Científico · Acosta Research',
    loadComponent: () => import('./features/articulo/articulo').then((m) => m.Articulo),
  },
  // «Cómo funciona» ya no es una página aparte: el arranque y las dos
  // objeciones viven ahora debajo de las demostraciones. La ruta se conserva
  // para no romper los enlaces ya repartidos.
  { path: 'como-funciona', pathMatch: 'full', redirectTo: 'en-accion' },
  // Pública a propósito: la alcanza quien compró y no ha vuelto a entrar a la
  // web, que es justo quien necesita el primer video. Ver la nota del componente.
  {
    path: 'tutoriales',
    title: 'Cómo usar tu conector · Acosta Research',
    loadComponent: () => import('./features/tutoriales/tutoriales').then((m) => m.Tutoriales),
  },
  {
    path: 'quien-soy',
    title: 'Quién te acompaña · Acosta Research',
    loadComponent: () => import('./features/quien-soy/quien-soy').then((m) => m.QuienSoy),
  },
  {
    path: 'preguntas',
    title: 'Preguntas frecuentes · Acosta Research',
    loadComponent: () => import('./features/preguntas/preguntas').then((m) => m.Preguntas),
  },
  {
    path: 'privacidad',
    title: 'Política de Privacidad · Acosta Research',
    loadComponent: () => import('./features/privacidad/privacidad').then((m) => m.Privacidad),
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  // El panel vive dentro de la portada. La ruta antigua se conserva para no
  // romper enlaces ya repartidos: lleva a la misma sección en el inicio.
  {
    path: 'panel',
    pathMatch: 'full',
    redirectTo: () => inject(Router).parseUrl('/#mi-panel'),
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    title: 'Mi perfil · Acosta Research',
    loadComponent: () => import('./features/perfil/perfil').then((m) => m.Perfil),
  },
  /**
   * Analizar los datos sin instalar nada: R corre en la pestaña del tesista.
   *
   * Detrás de `authGuard` porque es material del producto, no un escaparate.
   * Y ya no depende de ninguna variable: no hay servidor que configurar, así
   * que o funciona en el navegador de quien entra o no funciona en ninguno.
   */
  {
    path: 'analisis',
    canActivate: [authGuard],
    title: 'Analiza tus datos · Acosta Research',
    loadComponent: () => import('./features/analisis/analisis').then((m) => m.Analisis),
  },
  /*
   * `/humanizador` se retiró el 9 de septiembre de 2026.
   *
   * Era el reescritor por packs de palabras, que ejecutaba en nuestro servidor.
   * NO es el humanizador que se vende: ese es la Skill `humanizador-academico`,
   * que va dentro del conector y funciona. Los dos compartían nombre y eso hizo
   * creer durante meses que el producto vivo estaba roto.
   *
   * Lo que había aquí no llegó a funcionar nunca —cero reescrituras—, así que
   * quitarlo no le quita nada a nadie. La ruta cae en el comodín del final y
   * lleva a la portada; quien tuviera el enlace guardado no ve un error.
   *
   * El componente y el módulo del backend se quedan donde están, apagados: de
   * ellos cuelgan los pagos y las bolsas ya emitidas, y borrarlos sería tocar
   * el histórico de ventas para ahorrarse unos archivos.
   */
  {
    path: 'planes',
    title: 'Precios · Acosta Research',
    loadComponent: () => import('./features/checkout/checkout').then((m) => m.Checkout),
  },
  // El enlace de prueba que el administrador reparte a un grupo. Sin sesión a
  // propósito: quien lo recibe no se registra, solo recoge su conector.
  {
    path: 'prueba/:slug',
    title: 'Prueba el conector · Acosta Research',
    loadComponent: () => import('./features/prueba/prueba').then((m) => m.Prueba),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('ADMIN')],
    title: 'Administración · Acosta Research',
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
  },
  { path: '**', redirectTo: '' },
];
