# Editor UX / identidad fija — entrega

Fecha: 2026-09-04.

## Cambios

- Una paleta fija marfil, blanco, gris e índigo desaturado compartida por Sidebar, botones, formularios, diálogos, Editor, Reader y previews.
- Eliminados estado React de tema, selector de Settings, lectura de preferencias del sistema, clase .dark, configuración darkMode y temas Light/Dark/Sepia del Reader. Se conservaron las preferencias de tamaño, ancho, idioma y navegación.
- Las claves theme/defaultReadingMode ya no forman parte del contrato, defaults, seed o actualizaciones aceptadas. Los valores históricos almacenados son ignorados; no se realizó una migración destructiva de la base personal.
- Quick Capture utiliza el componente existente, ahora en portal con posicionamiento fijo. Un espejo temporal e invisible del textarea mide la selección sin modificar el manuscrito. El menú se limita al viewport y, cuando hay espacio, al ancho del Editor; prefiere arriba y usa abajo como alternativa.
- Character/Place reutilizan /api/quick-capture y sus creadores canónicos. Note reutiliza NoteCaptureContext y NoteFormDialog. Writing Focus mantiene su editor montado mientras abre Note.
- Mouse conserva selección al pulsar acciones. Tab/Shift+Tab permiten entrar al menú; Enter activa botones nativos. Escape, clic externo, selección vacía, cambio de Scene y acción exitosa cierran el menú. Escape no sale de Writing Focus cuando el menú consume el evento.
- Restauración con preventScroll y conservación explícita del scroll interno; bloqueo de dobles envíos y protección contra restauración tardía de foco de un menú desmontado.
- Selección nativa opaca mediante ::selection; se reemplazó el antiguo hsla con sintaxis inválida para los tokens separados por espacios. Character Highlights mantiene la vista existente con fondo sutil y subrayado, visualmente distinto de selección. Ninguno inserta estilos o markup en Scene.content.

## Archivos principales

- app/globals.css y tailwind.config.ts: tokens, selección, superficies y sombras.
- app/page.tsx: eliminación de temas, integración Editor/Focus y reutilización del diálogo Note.
- components/studio/selection-capture-menu.tsx: menú flotante, acciones, teclado y conservación de contexto.
- components/studio/character-highlight-preview.tsx: tratamiento visual de highlights.
- components/studio/note-form-dialog.tsx: retorno de foco sin scroll.
- components/studio/settings-screen.tsx, lib/studio-data.ts, lib/studio-settings.ts, lib/reader-preferences.ts, lib/studio-i18n.ts, prisma/seed.js: eliminación del contrato y controles de temas.
- components/ui/button.tsx, components/ui/dialog.tsx, components/studio/shared.tsx, components/studio/relationship-graph.tsx, components/studio/characters-screen.tsx: consumo de tokens.
- tests/quick-capture.test.mjs, tests/fixed-identity.test.mjs y tests de diálogos/preferences: cobertura actualizada.

## Tokens

Los componentes consumen variables RGB y aliases semánticos; equivalencias hex:

| Token | Valor |
| --- | --- |
| background | #F7F6F2 |
| surface | #FFFFFF |
| surface-secondary | #F1F2F4 |
| border | #D9DCE1 |
| border-subtle | #E7E8EB |
| text-primary | #25282D |
| text-secondary / icon-default | #626872 |
| text-muted | #858B94 |
| primary / icon-active | #354A67 |
| primary-hover | #2C3E57 |
| primary-active | #243348 |
| primary-subtle | #E8EDF3 |
| primary-subtle-hover | #DDE5EE |
| focus-ring | #6F87A5 |
| selection-background | #C9D8EA |
| selection-text | #182433 |
| danger | #B44747 |
| success | #477A5B |
| warning | #A47732 |

## Validación y límites

- Suite completa: 226 tests, 226 pasan.
- ESLint y TypeScript: pasan.
- Build de producción Next.js: pasa, 29 páginas generadas.
- Pruebas de acciones Character/Place/Note: payloads canónicos, texto intacto, scroll conservado y doble envío bloqueado. Las APIs de Notes también se prueban con SQLite temporal.
- Inspección visual en navegador local: Editor, selección y menú, Character Highlights, Writing Focus, Settings, Reader y Chapter Preview. Capturas con viewport de 1440, 900 y 390 px. No se completó una captura dedicada de 1024–1440 px ni validación en hardware touch real.
- No se realizaron creaciones de prueba en la base personal desde la UI; las mutaciones se verificaron mediante tests.
- La UI local mostró un error HTTP 500 al cargar Scene annotations. No se atribuyó su causa a este cambio ni se modificó ese servicio. Character Highlights y selección sí se observaron funcionando.
- Se preservó el extenso trabajo previo sin commit presente al iniciar. No se cambió el esquema del manuscrito ni se avanzó a otro ticket.

## Capturas

- evidence/md-editor-ux-desktop-editor.png
- evidence/md-editor-ux-selection-menu.png
- evidence/md-editor-ux-character-highlights.png
- evidence/md-editor-ux-focus-mode.png
- evidence/md-editor-ux-settings.png
- evidence/md-editor-ux-reader.png
- evidence/md-editor-ux-chapter-preview.png
- evidence/md-editor-ux-tablet.png
- evidence/md-editor-ux-mobile.png
