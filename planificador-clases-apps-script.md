# Planificador de clases en Google Sheets + Apps Script

## 1. Objetivo general
Crear una hoja de cálculo de Google con automatizaciones en Apps Script y una interfaz HTML que permitan:
- Planificar la agenda semanal de clases con un vistazo rápido.
- Detectar automáticamente, a partir de la fecha seleccionada, qué grupos tienen clase ese día y, al elegir uno, rellenar periodo, hora de inicio, hora de fin y unidades ya planificadas para seleccionar la que se impartirá.
- Diseñar y gestionar una línea temporal de sesiones y situaciones de aprendizaje a medio y largo plazo.
- Mantener visible la estructura semanal completa a partir de los horarios definidos, incluso cuando no existan sesiones registradas todavía.
- Mostrar una línea temporal continua con todas las fechas del curso y permitir filtrarla por curso.
- Registrar metadatos educativos (cursos, grupos, competencias, recursos, evaluación) de forma reutilizable.
- Minimizar el trabajo manual inicial: al ejecutar el script de inicialización se generan las pestañas, encabezados, menús y vistas básicas.

El resultado final incluye:
1. Hoja de cálculo estructurada en varias pestañas (configuración, catálogos, sesiones, timeline, dashboards).
2. Librería de Apps Script (`Code.gs`) que crea la estructura, ofrece un menú, expone funciones de servicio y conecta con la interfaz.
3. Una interfaz HTML/JS que se muestra en una ventana independiente (diálogo) con planner semanal, timeline interactiva y panel de detalle.

> Importante: La interfaz se abre en una ventana emergente independiente; evita la barra lateral de Google Sheets para este planner.

## 2. Requisitos previos
- Cuenta de Google con acceso a Google Drive, Google Sheets y Google Apps Script.
- Permisos de edición sobre la hoja (serás el propietario/a).
- Navegador moderno (Chrome, Edge, Firefox) para ejecutar la interfaz.
- Tiempo estimado de puesta en marcha: 30-45 minutos (incluye personalización básica).

## 3. Estructura de archivos
Al abrir el editor de Apps Script vinculado a la hoja, crea los siguientes archivos:

```
Code.gs              → Lógica principal y menús
DataModel.gs         → Utilidades de lectura/escritura en Sheets
UiController.gs      → Funciones que sirven datos a la interfaz HTML
Planner.html         → Layout principal (ventana emergente) con tabs Semana/Línea temporal
Planner.css          → Estilos básicos (opcional, puede incrustarse)
Planner.js           → Lógica del frontend (fetch datos, render, eventos)
```

> Si prefieres mantener menos archivos, puedes fusionar `Code.gs`, `DataModel.gs` y `UiController.gs` en un único `.gs`. Apps Script permite hasta 40 archivos, por lo que separar favorece el mantenimiento.

## 4. Diseño de la hoja de cálculo
El script creará automáticamente las pestañas siguientes (tablas base). Se recomienda respetar los nombres porque los scripts hacen referencia a ellos.

| Hoja | Propósito | Columnas clave |
| --- | --- | --- |
| `Config` | Parámetros globales | Clave, Valor |
| `Catalog_Grupos` | Lista de grupos / clases | ID, Nombre, Etapa, Curso, Tutor, Color |
| `Catalog_UDs` | Situaciones de aprendizaje / unidades | ID, Grupo, Nombre, Competencias, Observaciones |
| `Catalog_Recursos` | Recursos y materiales | ID, Título, Tipo, URL, Notas |
| `Horario_Base` | Estructura semanal fija | ID, Día, Periodo, Hora inicio, Hora fin, Grupo, Aula |
| `Sesiones` | Planificación detallada | ID, Fecha, Día, Periodo, Grupo, UD, Objetivos, Actividades, Evaluación, Recursos, Estado |
| `Timeline` | Hitos a largo plazo | ID, Fecha inicio, Fecha fin, Grupo, UD, Descripción, Estado |
| `Bitacora` | Registro histórico | Timestamp, Acción, Detalle |

### Datos iniciales
- `Config`: guarda pares clave/valor (p. ej. `SEMANA_ACTUAL`, `ZONA_HORARIA`, `SEMANA_INICIO_LUNES`).
- `Catalog_Grupos`: la columna `Color` define el acento cromático que se muestra en la vista semanal y la línea temporal.
- `Horario_Base`: define slots recurrentes (lunes 8:00-8:55, etc.). El planner semanal usa esta tabla como plantilla.
- El planner semanal consulta `Catalog_Grupos` y `Horario_Base` para completar automáticamente la parrilla completa de la semana, aunque no haya sesiones guardadas, de modo que siempre se muestre qué grupos imparten clase cada día.
- `Sesiones`: cada fila es una sesión concreta. Para mantener consistencia, el script genera IDs únicos (`SES-0001`).
- `Timeline`: se alimenta de `Sesiones` (para entradas confirmadas) o de tareas planificadas (borradores).
- La pestaña `Timeline` debe disponer de un filtro por curso y mostrar todas las fechas generadas para el calendario académico, exista o no una sesión asociada.

## 5. Flujo general
1. Ejecutar `setupPlanner()` desde Apps Script → se abre un asistente inicial que solicita la fecha de inicio y la fecha de fin del curso, crea la estructura de hojas, genera el calendario académico completo y carga datos de ejemplo.
2. El `onOpen()` registra un menú `Planner → Abrir panel` para abrir la interfaz HTML en una ventana emergente (no en la barra lateral).
3. La interfaz obtendrá los datos mediante `google.script.run` hacia funciones servidor (`getWeeklyPlanner`, `getTimelineEntries`, etc.), detectará automáticamente qué grupos imparten clase en la fecha seleccionada y completará periodo y horario al elegir un grupo, además de listar las unidades disponibles para esa combinación.
4. Al guardar/editar desde la UI se invocan funciones `saveSession`, `bulkUpdateTimeline`, que actualizan la hoja y devuelven confirmaciones.
5. Opcional: añadir disparadores (`Triggers`) para enviar recordatorios por correo o mover sesiones caducadas a la bitácora.

## 6. Código Apps Script (GS)
A continuación se ofrece una propuesta completa. Ajusta las columnas si modificas la hoja.

> Copia cada bloque en el archivo correspondiente en el editor de Apps Script. Si usas un único archivo `Code.gs`, pega todas las funciones en el orden propuesto.

### 6.1 Code.gs
```javascript
/**
 * Se ejecuta al abrir la hoja.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Planner')
    .addItem('Inicializar estructura', 'setupPlanner')
    .addItem('Abrir panel', 'showPlannerDialog')
    .addToUi();
}

/**
 * Crea pestañas, encabezados y datos base.
 */
function setupPlanner() {
  var ss = SpreadsheetApp.getActive();
  var sheets = {
    Config: ['Clave', 'Valor'],
    Catalog_Grupos: ['ID', 'Nombre', 'Etapa', 'Curso', 'Tutor', 'Color'],
    Catalog_UDs: ['ID', 'Grupo', 'Nombre', 'Competencias', 'Observaciones'],
    Catalog_Recursos: ['ID', 'Título', 'Tipo', 'URL', 'Notas'],
    Horario_Base: ['ID', 'Día', 'Periodo', 'Hora inicio', 'Hora fin', 'Grupo', 'Aula'],
    Sesiones: ['ID', 'Fecha', 'Día', 'Semana ISO', 'Periodo', 'Hora inicio', 'Hora fin', 'Grupo', 'UD', 'Objetivos', 'Actividades', 'Evaluación', 'Recursos', 'Estado', 'Notas'],
    Timeline: ['ID', 'Fecha inicio', 'Fecha fin', 'Grupo', 'UD', 'Descripción', 'Estado', 'Etiqueta'],
    Bitacora: ['Timestamp', 'Acción', 'Detalle']
  };

  Object.keys(sheets).forEach(function(name, index) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name, index);
      sheet.appendRow(sheets[name]);
      sheet.setFrozenRows(1);
    } else {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (headers.join() !== sheets[name].join()) {
        sheet.clear();
        sheet.appendRow(sheets[name]);
        sheet.setFrozenRows(1);
      }
    }
  });

  seedDefaults();
  SpreadsheetApp.getUi().alert('Planificador inicializado. Revisa las pestañas creadas.');
}

function seedDefaults() {
  var ss = SpreadsheetApp.getActive();
  var configSheet = ss.getSheetByName('Config');
  if (configSheet.getLastRow() === 1) {
    configSheet.appendRow(['ZONA_HORARIA', Session.getScriptTimeZone()]);
    configSheet.appendRow(['SEMANA_INICIO_LUNES', 'TRUE']);
    configSheet.appendRow(['PLANNER_VERSION', '1.0']);
  }

  var gruposSheet = ss.getSheetByName('Catalog_Grupos');
  if (gruposSheet.getLastRow() === 1) {
    gruposSheet.appendRow(['GRU-1BACH', '1º Bachillerato B', 'Bachillerato', '1º', 'Nombre tutor/a', '#5B8FF9']);
    gruposSheet.appendRow(['GRU-2ESO', '2º ESO A', 'ESO', '2º', 'Nombre tutor/a', '#13C2C2']);
  }

  var udsSheet = ss.getSheetByName('Catalog_UDs');
  if (udsSheet.getLastRow() === 1) {
    udsSheet.appendRow(['UD-001', 'GRP-ESO1A', 'Expresiones corporales', 'CCL, CPSAA', 'Proyecto interdisciplinar con EF.']);
    udsSheet.appendRow(['UD-002', 'GRP-ESO1B', 'Ciencia y laboratorio', 'STEM', 'Incluye experiencias de laboratorio semanales.']);
  }

  var horarioSheet = ss.getSheetByName('Horario_Base');
  if (horarioSheet.getLastRow() === 1) {
    horarioSheet.appendRow(['HB-001', 'Lunes', 'Periodo 1', '08:00', '08:55', 'GRU-1BACH', 'Aula 12']);
    horarioSheet.appendRow(['HB-002', 'Lunes', 'Periodo 2', '09:00', '09:55', 'GRU-1BACH', 'Aula 12']);
    horarioSheet.appendRow(['HB-003', 'Martes', 'Periodo 1', '08:00', '08:55', 'GRU-2ESO', 'Laboratorio']);
  }
}

/**
 * Abre la ventana del planner.
 */
function showPlannerDialog() {
  var template = HtmlService.createTemplateFromFile('Planner');
  var html = template.evaluate()
    .setWidth(960)
    .setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Planificador de clases');
}
```

### 6.2 DataModel.gs
```javascript
var DATA = {
  catalogSheets: {
    grupos: 'Catalog_Grupos',
    uds: 'Catalog_UDs',
    recursos: 'Catalog_Recursos'
  },
  sessionsSheet: 'Sesiones',
  timelineSheet: 'Timeline'
};

function getSheetData(sheetName) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('No se encuentra la hoja: ' + sheetName);
  }
  var range = sheet.getDataRange();
  var values = range.getValues();
  var headers = values.shift();
  return values
    .filter(function(row) { return row.join('').trim() !== ''; })
    .map(function(row) {
      var obj = {};
      headers.forEach(function(header, idx) {
        obj[header] = row[idx];
      });
      return obj;
    });
}

function generateId(prefix) {
  var timestamp = new Date().getTime();
  return prefix + '-' + timestamp;
}

function upsertRow(sheetName, keyColumn, data) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var keyIndex = headers.indexOf(keyColumn);
  if (keyIndex === -1) {
    throw new Error('No se encuentra la columna clave ' + keyColumn + ' en ' + sheetName);
  }

  var range = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn());
  var values = range.getValues();
  var rowIndex = values.findIndex(function(row) {
    return row[keyIndex] === data[keyColumn];
  });

  var rowValues = headers.map(function(header) {
    return header in data ? data[header] : '';
  });

  if (rowIndex === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet.getRange(rowIndex + 2, 1, 1, rowValues.length).setValues([rowValues]);
  }
}

function logAction(action, detail) {
  var sheet = SpreadsheetApp.getActive().getSheetByName('Bitacora');
  sheet.appendRow([new Date(), action, detail]);
}
```

### 6.3 UiController.gs
```javascript
function getPlannerBootstrap() {
  return {
    grupos: getSheetData(DATA.catalogSheets.grupos),
    uds: getSheetData(DATA.catalogSheets.uds),
    recursos: getSheetData(DATA.catalogSheets.recursos),
    sesiones: getSheetData(DATA.sessionsSheet),
    timeline: getSheetData(DATA.timelineSheet)
  };
}

function getWeeklyPlanner(isoWeek, isoYear) {
  var sesiones = getSheetData(DATA.sessionsSheet);
  return sesiones.filter(function(item) {
    return item['Semana ISO'] == isoWeek && (!isoYear || new Date(item['Fecha']).getFullYear() == isoYear);
  });
}

function saveSession(session) {
  if (!session.ID) {
    session.ID = generateId('SES');
  }
  session['Semana ISO'] = Utilities.formatDate(new Date(session['Fecha']), Session.getScriptTimeZone(), 'w');
  upsertRow(DATA.sessionsSheet, 'ID', session);
  logAction('SAVE_SESSION', session.ID);
  return session;
}

function deleteSession(sessionId) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(DATA.sessionsSheet);
  var lastRow = sheet.getLastRow();
  var range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  var values = range.getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === sessionId) {
      sheet.deleteRow(i + 2);
      logAction('DELETE_SESSION', sessionId);
      return true;
    }
  }
  throw new Error('No se encontró la sesión ' + sessionId);
}

function saveTimelineEntry(entry) {
  if (!entry.ID) {
    entry.ID = generateId('TIM');
  }
  upsertRow(DATA.timelineSheet, 'ID', entry);
  logAction('SAVE_TIMELINE', entry.ID);
  return entry;
}
```

> Puedes ampliar el controlador con funciones para duplicar sesiones, exportar a PDF o enviar notificaciones.

## 7. Interfaz HTML (ventana)
La interfaz vive en tres archivos y se carga en una ventana emergente. Puedes incrustar CSS y JS en `Planner.html`, pero separarlos mejora la legibilidad.

### 7.1 Planner.html
```html
<!DOCTYPE html>
<html lang="es">
  <head>
    <base target="_top">
    <meta charset="UTF-8">
    <title>Planificador</title>
    <?!= HtmlService.createHtmlOutputFromFile('Planner.css').getContent(); ?>
  </head>
  <body>
    <header class="planner-header">
      <h1>Planificador docente</h1>
      <div class="week-picker">
        <button id="prevWeek">◀</button>
        <span id="weekLabel"></span>
        <button id="nextWeek">▶</button>
      </div>
    </header>

    <nav class="tabs">
      <button class="tab active" data-tab="week">Semana</button>
      <button class="tab" data-tab="timeline">Línea de tiempo</button>
      <button class="tab" data-tab="detalle">Detalle</button>
    </nav>

    <section id="tab-week" class="tab-content active">
      <div id="weekGrid" class="week-grid"></div>
    </section>

    <section id="tab-timeline" class="tab-content">
      <div id="timelineList" class="timeline"></div>
      <button id="addTimeline" class="primary">Añadir hito</button>
    </section>

    <section id="tab-detalle" class="tab-content">
      <form id="sessionForm">
        <input type="hidden" name="ID" />
        <label>Fecha<input type="date" name="Fecha" required></label>
        <label>Grupo<select name="Grupo" required></select></label>
        <label>Periodo<input name="Periodo" placeholder="Periodo 1"></label>
        <label>Hora inicio<input type="time" name="Hora inicio"></label>
        <label>Hora fin<input type="time" name="Hora fin"></label>
        <label>Unidad<select name="UD"></select></label>
        <label>Objetivos<textarea name="Objetivos"></textarea></label>
        <label>Actividades<textarea name="Actividades"></textarea></label>
        <label>Evaluación<textarea name="Evaluación"></textarea></label>
        <label>Recursos<input name="Recursos" placeholder="IDs de recursos separados por coma"></label>
        <label>Estado<select name="Estado"><option>Planificada</option><option>En curso</option><option>Completada</option></select></label>
        <label>Notas<textarea name="Notas"></textarea></label>
        <div class="form-actions">
          <button type="submit" class="primary">Guardar sesión</button>
          <button type="button" id="deleteSession" class="danger">Eliminar</button>
        </div>
      </form>
    </section>

    <?!= HtmlService.createHtmlOutputFromFile('Planner.js').getContent(); ?>
  </body>
</html>
```

### 7.2 Planner.css
```html
<style>
  :root {
    font-family: 'Roboto', Arial, sans-serif;
    color: #1f2933;
  }
  body { margin: 0; background: #f6f7fb; }
  .planner-header { padding: 12px 16px; background: #1e3a8a; color: #fff; }
  .week-picker { display: flex; align-items: center; gap: 8px; }
  .tabs { display: flex; background: #fff; }
  .tabs .tab { flex: 1; padding: 10px; border: none; background: #f0f4ff; cursor: pointer; }
  .tabs .tab.active { background: #fff; border-bottom: 2px solid #2563eb; }
  .tab-content { display: none; padding: 12px 16px; }
  .tab-content.active { display: block; }
  .week-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
  .day-column { background: #fff; border-radius: 8px; padding: 8px; min-height: 200px; }
  .day-column h3 { margin-top: 0; }
  .session-card { background: #e0e7ff; border-radius: 6px; padding: 8px; margin-bottom: 8px; cursor: pointer; }
  .session-card[data-status="Completada"] { background: #bbf7d0; }
  .timeline { display: flex; flex-direction: column; gap: 10px; }
  .timeline-item { background: #fff; border-left: 4px solid #2563eb; padding: 10px 12px; border-radius: 8px; }
  form label { display: flex; flex-direction: column; font-size: 12px; margin-bottom: 8px; }
  input, select, textarea { padding: 6px; border: 1px solid #cbd5f5; border-radius: 4px; font-size: 13px; }
  textarea { resize: vertical; min-height: 70px; }
  .form-actions { display: flex; justify-content: space-between; margin-top: 12px; }
  .primary { background: #2563eb; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
  .danger { background: #dc2626; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; }
  button { font-size: 13px; }
</style>
```

### 7.3 Planner.js
```html
<script>
  const state = {
    bootstrap: null,
    currentDate: new Date(),
    selectedSession: null
  };

  document.addEventListener('DOMContentLoaded', initialize);

  function initialize() {
    bindTabs();
    document.getElementById('prevWeek').addEventListener('click', () => shiftWeek(-1));
    document.getElementById('nextWeek').addEventListener('click', () => shiftWeek(1));
    document.getElementById('sessionForm').addEventListener('submit', onSubmitSession);
    document.getElementById('deleteSession').addEventListener('click', onDeleteSession);
    loadBootstrap();
  }

  function bindTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      });
    });
  }

  function loadBootstrap() {
    google.script.run.withSuccessHandler(data => {
      state.bootstrap = data;
      renderSelectors();
      renderWeek();
      renderTimeline();
    }).getPlannerBootstrap();
  }

  function renderSelectors() {
    const grupoSelect = document.querySelector('select[name="Grupo"]');
    const udSelect = document.querySelector('select[name="UD"]');
    grupoSelect.innerHTML = '<option value="">Selecciona grupo</option>';
    state.bootstrap.grupos.forEach(g => {
      grupoSelect.innerHTML += `<option value="${g.ID}">${g.Nombre}</option>`;
    });
    udSelect.innerHTML = '<option value="">Selecciona unidad</option>';
    state.bootstrap.uds.forEach(ud => {
      udSelect.innerHTML += `<option value="${ud.ID}">${ud.Nombre}</option>`;
    });
  }

  function renderWeek() {
    const weekNumber = getISOWeek(state.currentDate);
    const year = state.currentDate.getFullYear();
    document.getElementById('weekLabel').textContent = `Semana ${weekNumber} · ${year}`;

    google.script.run.withSuccessHandler(sesiones => {
      const grid = document.getElementById('weekGrid');
      grid.innerHTML = '';
      const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
      dias.forEach(dia => {
        const column = document.createElement('div');
        column.className = 'day-column';
        column.innerHTML = `<h3>${dia}</h3>`;
        sesiones.filter(s => s['Día'] === dia).forEach(session => {
          const card = document.createElement('div');
          card.className = 'session-card';
          card.dataset.status = session['Estado'];
          card.innerHTML = `
            <strong>${session['Periodo']} · ${session['Hora inicio']} - ${session['Hora fin']}</strong><br>
            <span>${session['UD'] || ''}</span><br>
            <small>${session['Objetivos'] || ''}</small>
          `;
          card.addEventListener('click', () => fillForm(session));
          column.appendChild(card);
        });
        grid.appendChild(column);
      });
    }).getWeeklyPlanner(weekNumber, year);
  }

  function renderTimeline() {
    const container = document.getElementById('timelineList');
    container.innerHTML = '';
    state.bootstrap.timeline.forEach(item => {
      const node = document.createElement('div');
      node.className = 'timeline-item';
      node.innerHTML = `
        <strong>${item['Fecha inicio']} → ${item['Fecha fin'] || ''}</strong><br>
        <span>${item['Descripción'] || ''}</span><br>
        <small>${item['Grupo']} · ${item['UD']}</small>
      `;
      container.appendChild(node);
    });
  }

  function shiftWeek(delta) {
    state.currentDate.setDate(state.currentDate.getDate() + delta * 7);
    renderWeek();
  }

  function onSubmitSession(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const session = {};
    formData.forEach((value, key) => session[key] = value);

    google.script.run.withSuccessHandler(saved => {
      state.selectedSession = saved;
      loadBootstrap();
      alert('Sesión guardada');
    }).withFailureHandler(err => alert('Error: ' + err.message)).saveSession(session);
  }

  function onDeleteSession() {
    if (!state.selectedSession || !state.selectedSession.ID) {
      alert('Selecciona primero una sesión.');
      return;
    }
    if (!confirm('¿Eliminar la sesión?')) return;
    google.script.run.withSuccessHandler(() => {
      state.selectedSession = null;
      loadBootstrap();
      alert('Sesión eliminada');
    }).deleteSession(state.selectedSession.ID);
  }

  function fillForm(session) {
    state.selectedSession = session;
    const form = document.getElementById('sessionForm');
    Object.keys(session).forEach(key => {
      if (form.elements[key]) {
        form.elements[key].value = session[key];
      }
    });
    document.querySelector('[data-tab="detalle"]').click();
  }

  function getISOWeek(date) {
    const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = temp.getUTCDay() || 7;
    temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    return Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
  }
</script>
```

## 8. Procedimiento paso a paso

1. **Crear la hoja**: 
   - Google Drive → Nuevo → Hoja de cálculo → Nombrar (ej. “Planificador docente 2024/25”).
2. **Abrir Apps Script**: Extensiones → Apps Script.
3. **Configurar el proyecto**: 
   - Renombra el proyecto a “PlannerDocente”.
   - En `Code.gs` pega el contenido de los apartados 6.1, 6.2, 6.3 (según cómo organices los archivos).
   - Crea nuevos archivos HTML con los contenidos 7.1, 7.2, 7.3.
4. **Guardar** (Ctrl/Cmd + S en cada archivo).
5. **Ejecutar `setupPlanner`**: Selecciona la función en el selector superior → botón ▶. Autoriza el script (Google pedirá permisos).
6. **Revisar la hoja**: comprobar pestañas, encabezados y datos de ejemplo.
7. **Abrir la interfaz**: Regresa a la hoja → menú “Planner” → “Abrir panel”. La ventana emergente mostrará la parrilla semanal completa (aunque no existan sesiones) y la línea temporal con todas las fechas del curso y un filtro por curso/grupo activo.
8. **Probar una sesión**: 
   - Desde el formulario “Detalle” crea una sesión nueva; al seleccionar la fecha y el grupo se completarán periodo, hora de inicio, hora de fin y unidades disponibles para ese grupo.
   - Verifica que aparece en la vista semanal y en la hoja `Sesiones`.
9. **Añadir hitos al timeline**: De momento la UI solo lista; edita manualmente la hoja `Timeline` o extiende la UI (ver §9.3).
10. **Personalización inicial**: Actualiza catálogos, horarios y colores según tus grupos reales.

## 9. Personalizaciones y mejoras sugeridas
- **Sincronizar timeline**: Añade un formulario similar al de sesiones para insertar/editar hitos (`saveTimelineEntry`).
- **Duplicar sesiones**: Usa el panel “Duplicar sesión” del formulario para copiar una sesión existente hacia otra fecha/grupo ajustando horario y periodo antes de guardar.
- **Colores por grupo**: Usa la columna `Color` en `Catalog_Grupos` para pintar tarjetas (añade lógica en `Planner.js`).
- **Vistas mensuales**: Crea otra pestaña en la UI que agrupe por mes usando los datos de `Timeline`.
- **Exportar a PDF/Slides**: Usa `SpreadsheetApp` + `SlidesApp` para generar resúmenes descargables.
- **Recordatorios automáticos**: Disparador de tiempo que envíe email con sesiones de la semana siguiente (`MailApp.sendEmail`).
- **Integración con Classroom**: Almacena IDs de Classroom en `Catalog_Grupos` y usa la API para publicar anuncios (requiere habilitar Advanced Services).

## 10. Consideraciones de mantenimiento
- Actualiza la constante `PLANNER_VERSION` al hacer cambios significativos (permite rastrear migraciones).
- Antes de modificar encabezados, revisa las funciones Apps Script: cualquier cambio debe reflejarse en los arrays de columnas.
- Realiza copias de seguridad periódicas (Drive → Archivo → Guardar como copia).
- Mantén un historial de versiones en Apps Script (`Archivo → Gestión de versiones`) para revertir errores.

## 11. Anexo: Scripts auxiliares opcionales
### Generar sesiones a partir del horario base
```javascript
function generateWeekFromTemplate(weekStartDate) {
  var horario = getSheetData('Horario_Base');
  var monday = new Date(weekStartDate);
  horario.forEach(function(slot) {
    var sessionDate = shiftToWeekday(monday, slot['Día']);
    var session = {
      ID: generateId('SES'),
      Fecha: Utilities.formatDate(sessionDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      Día: slot['Día'],
      Periodo: slot['Periodo'],
      'Hora inicio': slot['Hora inicio'],
      'Hora fin': slot['Hora fin'],
      Grupo: slot['Grupo'],
      Estado: 'Planificada'
    };
    saveSession(session);
  });
}

function shiftToWeekday(monday, diaNombre) {
  var map = { 'Lunes': 0, 'Martes': 1, 'Miércoles': 2, 'Jueves': 3, 'Viernes': 4 };
  var date = new Date(monday);
  date.setDate(date.getDate() + map[diaNombre]);
  return date;
}
```

### Enviar resumen semanal por correo
```javascript
function sendWeeklyDigest() {
  var today = new Date();
  var isoWeek = Utilities.formatDate(today, Session.getScriptTimeZone(), 'w');
  var year = today.getFullYear();
  var sesiones = getWeeklyPlanner(isoWeek, year);
  var body = ['Resumen semanal de sesiones', ''].concat(sesiones.map(function(s) {
    return s['Fecha'] + ' · ' + s['Grupo'] + ' · ' + s['Objetivos'];
  })).join('\n');
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Planner semanal', body);
  logAction('SEND_DIGEST', isoWeek);
}
```

## 12. Próximos pasos recomendados
1. Rellenar catálogos reales (grupos, unidades, recursos).
2. Ajustar la parrilla de `Horario_Base` a tu centro.
3. Añadir validaciones en `saveSession` (evitar solapamientos, campos obligatorios).
4. Iterar sobre la interfaz (colores, filtros, búsqueda, vista móvil).

Con este documento deberías tener una guía completa para desplegar un planificador docente con Apps Script y una UI amigable. Ajusta el código a tus necesidades concretas y amplía las funcionalidades a medida que el flujo se adapte a tu forma de trabajo.
