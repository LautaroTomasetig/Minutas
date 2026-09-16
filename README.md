# Minutas

Aplicación web para grabar reuniones desde el micrófono y transformarlas en minutas empresariales editables y exportables a PDF.



## Como funciona?

- La aplicación graba el audio de la reunión desde el micrófono. Al finalizar y seleccionar **Procesar reunión**, envía la grabación a Google Gemini para convertir lo hablado en texto. Ese texto se llama **transcripción** y conserva el idioma original de la conversación.

- Después, la IA analiza la transcripción y organiza la información en una **minuta en español**. Identifica los temas tratados, las decisiones tomadas y las tareas pendientes, junto con sus responsables y fechas límite cuando se mencionan. Los datos de la reunión, como el título, la fecha y los participantes, se incorporan desde el formulario que completó el usuario.

- Antes de mostrar el resultado, la aplicación comprueba que tenga la estructura esperada. Luego, el usuario puede consultar la transcripción, revisar y corregir la minuta, y descargarla en PDF. Esta revisión permite ajustar posibles errores o interpretaciones de la IA.

