/**
 * VOSviewer Online dentro de la web, sin iframe.
 *
 * El visor es un componente de React y la web es Angular. En vez de meter
 * React en el build de Angular, esto lo empaqueta aparte en UN script que se
 * carga solo cuando el tesista abre un mapa, y que deja en `window` una sola
 * función: montar el visor en un elemento con unos datos.
 *
 * No va en iframe porque la web manda `X-Frame-Options: DENY` y
 * `frame-ancestors 'none'` —a propósito, contra el clickjacking—, y abrir una
 * excepción para esto sería abrirla para todo lo que cuelgue de esa ruta.
 */
import { createRoot } from 'react-dom/client';
import { VOSviewerOnline } from 'vosviewer-online';

window.AcostaVosviewer = {
  version: '1.2.4',
  montar(elemento, datos, parametros) {
    const raiz = createRoot(elemento);
    raiz.render(<VOSviewerOnline data={datos} parameters={parametros} />);
    return { desmontar: () => raiz.unmount() };
  },
};
