import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { FiltroDePais } from '../services/filtro-de-pais.service';

/**
 * Los listados del panel que el servidor sabe filtrar por país. Solo lecturas,
 * y solo estas: en cualquier otra petición el parámetro no pinta nada.
 */
const LISTADOS = [
  '/licenses',
  '/licenses/codes',
  '/licenses/alerts',
  '/payments/recent',
  '/payments/manual/pending',
  '/payments/manual/history',
  '/billing/discounts',
  '/pruebas',
  '/embudo',
  '/resenas/panel',
  '/reclamos',
];

/** ¿Es uno de esos listados? Se mira la ruta sin la consulta. */
export function esListadoPorPais(metodo: string, url: string): boolean {
  if (metodo !== 'GET' || !url.startsWith(environment.apiUrl)) return false;
  const ruta = url.slice(environment.apiUrl.length).split('?')[0];
  return LISTADOS.includes(ruta);
}

/**
 * Añade `?pais=` a los listados del panel cuando el dueño eligió un país en el
 * selector de la barra de arriba. Sin elegir nada no toca ninguna petición.
 */
export const paisInterceptor: HttpInterceptorFn = (req, next) => {
  const pais = inject(FiltroDePais).valor();
  if (!pais || !esListadoPorPais(req.method, req.url)) return next(req);
  return next(req.clone({ setParams: { pais } }));
};
