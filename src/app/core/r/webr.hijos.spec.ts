import { hijosDe } from './webr.service';

/**
 * Listar una carpeta de WebR.
 *
 * POR QUÉ ESTA PRUEBA EXISTE
 * --------------------------
 * Porque esto estuvo mal desde el primer día y no se vio: `contents` se leía
 * con `Object.keys()`, que sobre una LISTA devuelve los índices —«0», «1»— en
 * vez de los nombres de los archivos. Después, `readFile('/tmp/graficos/0')`
 * fallaba con un error de sistema de archivos que estaba capturado y en
 * silencio, así que la pestaña de gráficos salía vacía con el PNG ya escrito
 * al lado, y la de archivos igual.
 *
 * Nada lo delató antes porque la declaración de tipos de WebR la escribimos
 * nosotros y decía justo lo que el código hacía. Una declaración a mano puede
 * mentir; el paquete de verdad, no. De ahí que esto pruebe la FORMA que WebR
 * devuelve, comprobada contra el paquete instalado.
 */
describe('hijosDe', () => {
  it('saca los nombres de la lista de nodos, que es lo que WebR devuelve', () => {
    const carpeta = {
      name: 'graficos',
      isFolder: true,
      contents: [
        { name: 'g001.png', isFolder: false, contents: [] },
        { name: 'g002.png', isFolder: false, contents: [] },
      ],
    };

    expect(hijosDe(carpeta)).toEqual(['g001.png', 'g002.png']);
  });

  it('aguanta también la forma de objeto por nombre, por si cambia la versión', () => {
    const carpeta = {
      name: 'casa',
      isFolder: true,
      contents: {
        'datos.csv': { name: 'datos.csv' },
        'figura1.png': { name: 'figura1.png' },
      },
    };

    expect(hijosDe(carpeta).sort()).toEqual(['datos.csv', 'figura1.png']);
  });

  it('una carpeta vacía, un archivo suelto o nada dan lista vacía', () => {
    expect(hijosDe({ name: 'vacia', isFolder: true, contents: [] })).toEqual([]);
    expect(hijosDe({ name: 'g001.png', isFolder: false })).toEqual([]);
    expect(hijosDe(undefined)).toEqual([]);
  });

  it('nunca devuelve índices: si sale «0», la pestaña de gráficos vuelve a estar vacía', () => {
    const carpeta = {
      name: 'graficos',
      isFolder: true,
      contents: [{ name: 'g001.png' }],
    };

    expect(hijosDe(carpeta)).not.toContain('0');
  });
});
