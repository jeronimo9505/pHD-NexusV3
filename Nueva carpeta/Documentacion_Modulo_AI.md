# Documentación Detallada: Módulo Nexus AI

Este documento describe la arquitectura, diseño, funcionalidades y limitaciones del módulo **Nexus AI** integrado en la plataforma pHD-NexusV3.

## 1. Introducción y Propósito
El módulo **Nexus AI** está diseñado como un asistente virtual inteligente especializado en la gestión de laboratorios de investigación (PhD). Su propósito principal es permitir a los investigadores interactuar con sus datos (muestras, tareas, reportes, protocolos) de manera natural mediante lenguaje sencillo, actuando como una capa de inteligencia sobre la base de datos del grupo.

## 2. Tecnologías Utilizadas
El módulo se fundamenta en un stack tecnológico moderno y eficiente:
- **Core**: Next.js (Server Actions) para la lógica del lado del servidor.
- **Modelo de IA**: Google Gemini (principalmente `gemini-1.5-flash` y `gemini-1.5-pro`).
- **SDK**: `@google/generative-ai` para la integración directa con los modelos de Google.
- **Persistencia**: Supabase (PostgreSQL) para el almacenamiento de sesiones y mensajes.
- **Interfaz**: React con Tailwind CSS y Lucide React para una experiencia de usuario (UX) fluida y estética "premium".

## 3. Arquitectura y Diseño

### 3.1 Ciclo Agentico (Agentic Loop)
A diferencia de un chat convencional, Nexus AI utiliza un **bucle agentico**. Cuando el usuario hace una pregunta, el modelo no solo responde texto, sino que puede decidir ejecutar "herramientas" (tools).
1. **Detección de Intención**: El modelo analiza si necesita datos externos (ej: "¿Qué muestras agregamos ayer?").
2. **Llamada a Funciones**: Gemini genera una solicitud de llamada a función (Function Calling).
3. **Ejecución Local**: El servidor ejecuta la consulta SQL en Supabase correspondiente a esa función.
4. **Retroalimentación**: Los resultados de la base de datos se envían de vuelta a Gemini.
5. **Respuesta Final**: El modelo procesa los datos reales y genera una respuesta coherente para el investigador.

### 3.2 Capa de Persistencia
El sistema gestiona dos tablas principales en Supabase:
- `ai_chat_sessions`: Almacena el título de la conversación, el usuario y el grupo de investigación.
- `ai_chat_messages`: Almacena el historial completo (rol del usuario y del asistente) para mantener el contexto.

### 3.3 Seguridad y Permisos
El acceso está estrictamente limitado por roles:
- Solo el **dueño del grupo (Group Owner)** tiene permisos para interactuar con Nexus AI.
- Las consultas a la base de datos están filtradas por `group_id` para garantizar que la IA nunca acceda a datos de otros laboratorios.

## 4. Características Principales (Features)

- **Contexto Histórico**: Mantiene los últimos 20 mensajes de la conversación para entender referencias como "Dime más sobre la primera muestra".
- **Herramientas de Datos (Tools)**:
    - **Gestión de Muestras**: Búsqueda por código, fecha o tipo de caracterización (Raman, SEM, etc.).
    - **Estadísticas**: Generación de resúmenes sobre el estado del inventario del laboratorio.
    - **Gestión de Tareas**: Consulta de tareas pendientes, vencidas o asignadas.
    - **Base de Conocimiento**: Acceso a protocolos y recursos guardados por el grupo.
    - **Reportes**: Resumen de reportes semanales y documentos vinculados a Google Drive.
- **Multilingüe**: Responde automáticamente en el idioma en que el usuario le habla (Español o Inglés).
- **Integración con Google Drive**: Proporciona enlaces directos a archivos en la nube cuando se encuentran en los resultados de las herramientas.

## 5. Correlación con Otros Módulos

Nexus AI actúa como un "tejido conector" entre los diferentes módulos del sistema:
- **Módulo de Muestras**: Correlaciona metadatos científicos con el inventario físico.
- **Módulo Raman**: Extrae condiciones experimentales (láser, potencia, tiempo de integración) de las mediciones registradas.
- **Módulo Kanban**: Permite supervisar el progreso de los proyectos sin navegar por los tableros.
- **Configuración de Grupo**: Permite personalizar la API Key y el modelo (Gemini 1.5 Flash/Pro) de forma independiente por cada laboratorio.

## 6. Limitaciones

Aunque es una herramienta potente, Nexus AI presenta las siguientes limitaciones:
1. **Restricción de Rol**: Solo accesible para administradores/dueños del grupo.
2. **Límite de Iteraciones**: El bucle agentico está limitado a 5 llamadas consecutivas a herramientas para evitar bucles infinitos o costes excesivos.
3. **Ventana de Contexto**: Solo se envían los últimos 20 mensajes al modelo para optimizar el rendimiento y los tokens.
4. **Dependencia Externa**: Requiere conectividad con los servicios de Google Cloud/Gemini.
5. **No Procesamiento Directo de Archivos**: La IA lee los **metadatos** almacenados en la base de datos, pero no "abre" directamente los archivos HDF5 crudos (esta tarea la delega al motor de Python para procesamiento numérico).
6. **Alucinaciones**: Al ser un modelo de lenguaje, existe un riesgo residual de errores, por lo que el sistema incluye advertencias de verificación manual para datos críticos.

## 7. Diseño de la Interfaz (UI)
El panel de chat ha sido diseñado bajo una estética **Dark Mode Premium**:
- **Gradients y Glassmorphism**: Uso de fondos oscuros con desenfoque y bordes sutiles.
- **Micro-animaciones**: Indicadores de carga ("typing indicator") y transiciones suaves al enviar mensajes.
- **Quick Prompts**: Botones de acceso rápido para las preguntas más frecuentes del laboratorio, facilitando la adopción por parte de usuarios no técnicos.
- **Markdown Completo**: Soporte para tablas, bloques de código, listas y negritas en las respuestas de la IA.
