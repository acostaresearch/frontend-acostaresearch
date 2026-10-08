# Web de Acosta | IA & Research

## Si cambias la web, cambia el recorrido guiado y la documentación

Cualquier cambio de interfaz (una página, una sección del perfil o del panel, un bloque, un
nombre del menú, una cifra que se cita) va acompañado, **en el mismo cambio**, de:

1. **El tour:** revisar sus pasos en `src/app/shared/contenido/tour-de-la-web.ts` y
   `tour-del-panel.ts`, y los `data-tour` del marcado. Añadir pasos a lo nuevo, corregir o borrar
   los de lo que se movió o se quitó, y actualizar los textos que citan algo que cambió.
2. **Las pruebas:** `npx ng test` (`tour-anclas.spec.ts` y `tour-desde-aqui.spec.ts` deben pasar).
3. **La documentación:** `../documentacion/03-web.md` (sección «El recorrido guiado») y lo que
   toque del resto de `../documentacion/`.

Un paso cuya ancla desapareció no da error: el recorrido espera y se lo salta, y el usuario lo ve
como que «se para». Por eso se revisa siempre, aunque el cambio parezca no tocar el tour.

Detalle de cómo funciona: `../documentacion/03-web.md` → «El recorrido guiado».
