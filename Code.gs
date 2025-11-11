function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Planner')
    .addItem('Inicializar planificador', 'setupPlanner')
    .addItem('Abrir panel', 'showPlannerDialog')
    .addItem('Abrir en pestaña nueva', 'openPlannerInNewTab')
    .addToUi();
}

function setupPlanner() {
  try {
    ensureBaseStructure();
    seedDefaults();
    var range = ensureCourseDates();
    if (range && range.start && range.end) {
      ensureCourseCalendar(range.start, range.end);
    }
    SpreadsheetApp.getUi().alert('Planificador listo. Revisa las pestañas generadas y abre la ventana del planner desde Planner → Abrir panel.');
  } catch (error) {
    SpreadsheetApp.getUi().alert('Error al inicializar: ' + error.message);
    throw error;
  }
}

function ensureCourseDates() {
  var ui = SpreadsheetApp.getUi();
  var current = getCourseDateRange();
  var needsConfig = !current.start || !current.end;
  if (!needsConfig) {
    var response = ui.alert('Calendario existente', 'Ya hay un calendario configurado. ¿Deseas actualizarlo?', ui.ButtonSet.YES_NO);
    if (response === ui.Button.NO) {
      return current;
    }
  }
  var startDate = promptForDate('Fecha de inicio de curso (formato AAAA-MM-DD)', current.start);
  if (!startDate) {
    throw new Error('Se canceló la configuración de la fecha de inicio.');
  }
  var endDate = promptForDate('Fecha de fin de curso (formato AAAA-MM-DD)', current.end);
  if (!endDate) {
    throw new Error('Se canceló la configuración de la fecha de fin.');
  }
  if (endDate < startDate) {
    throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio.');
  }
  setConfigValue('CURSO_INICIO', formatISODate(startDate));
  setConfigValue('CURSO_FIN', formatISODate(endDate));
  logAction('CONFIG_CALENDARIO', formatISODate(startDate) + ' → ' + formatISODate(endDate));
  return { start: startDate, end: endDate };
}

function promptForDate(message, defaultDate) {
  var ui = SpreadsheetApp.getUi();
  var promptMessage = defaultDate
    ? message + '\nValor actual: ' + formatISODate(defaultDate)
    : message;
  while (true) {
    var prompt = ui.prompt('Configuración del curso', promptMessage, ui.ButtonSet.OK_CANCEL);
    if (prompt.getSelectedButton() === ui.Button.CANCEL) {
      return null;
    }
    var value = prompt.getResponseText().trim();
    if (!value && defaultDate) {
      return defaultDate;
    }
    if (!value) {
      ui.alert('Introduce una fecha con formato AAAA-MM-DD.');
      continue;
    }
    var parsed = parseISODate(value);
    if (!parsed) {
      ui.alert('Formato no válido. Usa AAAA-MM-DD.');
      continue;
    }
    return parsed;
  }
}

function showPlannerDialog() {
  var html = HtmlService.createTemplateFromFile('Planner')
    .evaluate()
    .setWidth(1200)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'Planner docente');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function openPlannerInNewTab() {
  var launcher = HtmlService.createHtmlOutputFromFile('PlannerNewTab')
    .setWidth(420)
    .setHeight(220);
  SpreadsheetApp.getUi().showModalDialog(launcher, 'Abrir planner en pestaña');
}

function getPlannerHtmlContent() {
  return HtmlService.createTemplateFromFile('Planner')
    .evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .getContent();
}

function getWebAppUrl() {
  var url = ScriptApp.getService().getUrl();
  if (!url) {
    throw new Error('No se detecta un despliegue como Web App. Publica el script (Deploy → Test deployments) y vuelve a intentarlo.');
  }
  return url;
}

function doGet() {
  return HtmlService.createTemplateFromFile('Planner')
    .evaluate()
    .setTitle('Planner docente')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
