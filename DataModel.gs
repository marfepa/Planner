var DATA = {
  timezone: Session.getScriptTimeZone() || 'Europe/Madrid',
  sheets: {
    config: 'Config',
    groups: 'Catalog_Grupos',
    uds: 'Catalog_UDs',
    resources: 'Catalog_Recursos',
    schedule: 'Horario_Base',
    sessions: 'Sesiones',
    timeline: 'Timeline',
    log: 'Bitacora',
    calendar: 'Calendario'
  },
  headers: {
    config: ['Clave', 'Valor'],
    groups: ['ID', 'Nombre', 'Etapa', 'Curso', 'Tutor', 'Color'],
    uds: ['ID', 'Grupo', 'Nombre', 'Competencias', 'Observaciones'],
    resources: ['ID', 'Título', 'Tipo', 'URL', 'Notas'],
    schedule: ['ID', 'Día', 'Periodo', 'Hora inicio', 'Hora fin', 'Grupo', 'Aula'],
    sessions: ['ID', 'Fecha', 'Día', 'Semana ISO', 'Periodo', 'Hora inicio', 'Hora fin', 'Grupo', 'UD', 'Objetivos', 'Actividades', 'Evaluación', 'Recursos', 'Estado', 'Notas'],
    timeline: ['ID', 'Fecha inicio', 'Fecha fin', 'Grupo', 'UD', 'Descripción', 'Estado', 'Etiqueta'],
    log: ['Timestamp', 'Acción', 'Detalle'],
    calendar: ['Fecha', 'Día', 'Semana ISO']
  },
  dayNames: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
};

function ensureBaseStructure() {
  var ss = SpreadsheetApp.getActive();
  var order = [
    DATA.sheets.config,
    DATA.sheets.groups,
    DATA.sheets.uds,
    DATA.sheets.resources,
    DATA.sheets.schedule,
    DATA.sheets.sessions,
    DATA.sheets.timeline,
    DATA.sheets.log,
    DATA.sheets.calendar
  ];
  order.forEach(function(name, index) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name, index);
      sheet.appendRow(DATA.headers[getHeaderKeyByName(name)]);
      sheet.setFrozenRows(1);
    } else {
      var expected = DATA.headers[getHeaderKeyByName(name)];
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn() || expected.length).getValues()[0];
      if (headers.join() !== expected.join()) {
        sheet.clear();
        sheet.appendRow(expected);
        sheet.setFrozenRows(1);
      }
    }
  });
}

function getHeaderKeyByName(name) {
  var match = Object.keys(DATA.sheets).find(function(key) {
    return DATA.sheets[key] === name;
  });
  if (!match) {
    throw new Error('No se encuentra cabecera para la hoja ' + name);
  }
  return match;
}

function getSheetData(sheetName) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('No se encuentra la hoja ' + sheetName);
  }
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn === 0) {
    return [];
  }
  var range = sheet.getRange(1, 1, lastRow, lastColumn);
  var values = range.getValues();
  var headers = values.shift();
  return values
    .filter(function(row) {
      return row.join('').trim() !== '';
    })
    .map(function(row) {
      var obj = {};
      headers.forEach(function(header, idx) {
        obj[header] = row[idx];
      });
      return obj;
    });
}

function upsertRow(sheetName, keyColumn, data) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('No se encuentra la hoja ' + sheetName);
  }
  var expectedHeaders = DATA.headers[getHeaderKeyByName(sheetName)] || [];
  var lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    if (!expectedHeaders.length) {
      throw new Error('La hoja ' + sheetName + ' no tiene columnas definidas.');
    }
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    lastColumn = expectedHeaders.length;
  }
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  if (!headers.filter(function(value) { return value && value.toString().trim() !== ''; }).length && expectedHeaders.length) {
    headers = expectedHeaders.slice();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    lastColumn = headers.length;
  }
  var keyIndex = headers.indexOf(keyColumn);
  if (keyIndex === -1) {
    throw new Error('No se encuentra la columna clave ' + keyColumn + ' en ' + sheetName);
  }
  var lastRow = sheet.getLastRow();
  var dataRange = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
  var rowIndex = -1;
  dataRange.forEach(function(row, idx) {
    if (row[keyIndex] === data[keyColumn]) {
      rowIndex = idx;
    }
  });
  var rowValues = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(data, header) ? data[header] : '';
  });
  if (rowIndex === -1) {
    sheet.appendRow(rowValues.length ? rowValues : ['']);
  } else {
    sheet.getRange(rowIndex + 2, 1, 1, rowValues.length).setValues([rowValues]);
  }
}

function setConfigValue(key, value) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.config);
  if (!sheet) {
    throw new Error('No se encuentra la hoja de configuración');
  }
  var lastRow = sheet.getLastRow();
  var range = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
  var updated = false;
  range.forEach(function(row, idx) {
    if (row[0] === key) {
      sheet.getRange(idx + 2, 2).setValue(value);
      updated = true;
    }
  });
  if (!updated) {
    sheet.appendRow([key, value]);
  }
}

function getConfigValue(key) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.config);
  if (!sheet) {
    throw new Error('No se encuentra la hoja de configuración');
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }
  var values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === key) {
      return values[i][1];
    }
  }
  return null;
}

function getCourseDateRange() {
  var startValue = getConfigValue('CURSO_INICIO');
  var endValue = getConfigValue('CURSO_FIN');
  return {
    start: parseISODate(startValue),
    end: parseISODate(endValue)
  };
}

function parseISODate(value) {
  if (!value) {
    return null;
  }
  var parts = value.toString().split('-');
  if (parts.length !== 3) {
    return null;
  }
  var year = Number(parts[0]);
  var month = Number(parts[1]) - 1;
  var day = Number(parts[2]);
  var date = new Date(year, month, day);
  if (isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatISODate(date) {
  return Utilities.formatDate(date, DATA.timezone, 'yyyy-MM-dd');
}

function getISOWeekNumber(date) {
  var temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
}

function getSpanishDayName(date) {
  return DATA.dayNames[date.getDay()];
}

function normalizeDayName(value) {
  if (!value) {
    return '';
  }
  var clean = value.toString().trim().toLowerCase();
  clean = clean
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ñ/g, 'n');
  var map = {
    'domingo': 'Domingo',
    'lunes': 'Lunes',
    'martes': 'Martes',
    'miercoles': 'Miércoles',
    'jueves': 'Jueves',
    'viernes': 'Viernes',
    'sabado': 'Sábado'
  };
  return map[clean] || value.toString().trim();
}

function getDayOffset(dayName) {
  for (var i = 0; i < DATA.dayNames.length; i++) {
    if (normalizeDayName(DATA.dayNames[i]) === normalizeDayName(dayName)) {
      return (i + 6) % 7; // shift so Monday → 0, Sunday → 6
    }
  }
  return null;
}

function formatTimeValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (value instanceof Date) {
    return Utilities.formatDate(value, DATA.timezone, 'HH:mm');
  }
  if (typeof value === 'number') {
    var millis = Math.round(value * 24 * 60 * 60 * 1000);
    return Utilities.formatDate(new Date(millis), 'UTC', 'HH:mm');
  }
  var str = value.toString().trim();
  if (!str) {
    return '';
  }
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    var parts = str.split(':');
    return parts[0].padStart(2, '0') + ':' + parts[1];
  }
  if (/^\d{4}$/.test(str)) {
    return str.slice(0, 2) + ':' + str.slice(2);
  }
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, DATA.timezone, 'HH:mm');
  }
  return str;
}

function normalizeDateKey(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (value instanceof Date) {
    return formatISODate(value);
  }
  if (typeof value === 'number') {
    return formatISODate(new Date(value));
  }
  var str = value.toString().trim();
  if (!str) {
    return '';
  }
  if (/^\d{2}[\/-]\d{2}[\/-]\d{4}$/.test(str)) {
    var parts = str.includes('/') ? str.split('/') : str.split('-');
    var day = Number(parts[0]);
    var month = Number(parts[1]) - 1;
    var year = Number(parts[2]);
    var parsedAlt = new Date(year, month, day);
    if (!isNaN(parsedAlt.getTime())) {
      return formatISODate(parsedAlt);
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return formatISODate(parsed);
  }
  return str;
}

function isDateWithinRange(date, start, end) {
  if (start && date < start) {
    return false;
  }
  if (end && date > end) {
    return false;
  }
  return true;
}

function ensureCourseCalendar(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) {
    return;
  }
  var sheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.calendar);
  if (!sheet) {
    throw new Error('No se encuentra la hoja Calendario');
  }
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
  }
  var rows = [];
  var cursor = new Date(startDate);
  while (cursor <= endDate) {
    rows.push([
      formatISODate(cursor),
      getSpanishDayName(cursor),
      getISOWeekNumber(cursor)
    ]);
    cursor.setDate(cursor.getDate() + 1);
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
}

function generateId(prefix) {
  return prefix + '-' + new Date().getTime();
}

function logAction(action, detail) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.log);
  if (!sheet) {
    return;
  }
  sheet.appendRow([new Date(), action, detail || '']);
}

function seedDefaults() {
  var configSheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.config);
  if (configSheet && configSheet.getLastRow() < 2) {
    configSheet.appendRow(['PLANNER_VERSION', '2.0.0']);
  }
  var groupsSheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.groups);
  if (groupsSheet && groupsSheet.getLastRow() < 2) {
    groupsSheet.getRange(groupsSheet.getLastRow() + 1, 1, 2, DATA.headers.groups.length).setValues([
      ['GRP-ESO1A', '1º ESO A', 'Secundaria', '1º ESO', 'Tutor A', '#2563eb'],
      ['GRP-ESO1B', '1º ESO B', 'Secundaria', '1º ESO', 'Tutor B', '#f97316']
    ]);
  }
  var udsSheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.uds);
  if (udsSheet && udsSheet.getLastRow() < 2) {
    udsSheet.getRange(udsSheet.getLastRow() + 1, 1, 2, DATA.headers.uds.length).setValues([
      ['UD-ACRO', 'GRP-ESO1A', 'Acrosport', 'Trabajo cooperativo', 'Unidad inicial para cohesión'],
      ['UD-RESIS', 'GRP-ESO1B', 'Resistencia en circuito', 'Competencia motriz', 'Adaptar cargas por niveles']
    ]);
  }
  var resourcesSheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.resources);
  if (resourcesSheet && resourcesSheet.getLastRow() < 2) {
    resourcesSheet.getRange(resourcesSheet.getLastRow() + 1, 1, 2, DATA.headers.resources.length).setValues([
      ['RES-001', 'Fichas Acrosport', 'PDF', 'https://drive.google.com/acro', ''],
      ['RES-002', 'Playlist calentamiento', 'YouTube', 'https://youtu.be/demo', '']
    ]);
  }
  var scheduleSheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.schedule);
  if (scheduleSheet && scheduleSheet.getLastRow() < 2) {
    scheduleSheet.getRange(scheduleSheet.getLastRow() + 1, 1, 6, DATA.headers.schedule.length).setValues([
      ['SCH-001', 'Lunes', 'P1', '08:00', '08:55', 'GRP-ESO1A', 'Gimnasio'],
      ['SCH-002', 'Lunes', 'P2', '09:00', '09:55', 'GRP-ESO1B', 'Gimnasio'],
      ['SCH-003', 'Miércoles', 'P3', '11:30', '12:25', 'GRP-ESO1A', 'Pista exterior'],
      ['SCH-004', 'Jueves', 'P4', '12:30', '13:25', 'GRP-ESO1B', 'Pista exterior'],
      ['SCH-005', 'Viernes', 'P1', '08:00', '08:55', 'GRP-ESO1A', 'Gimnasio'],
      ['SCH-006', 'Viernes', 'P2', '09:00', '09:55', 'GRP-ESO1B', 'Gimnasio']
    ]);
  }
  var sessionsSheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.sessions);
  if (sessionsSheet && sessionsSheet.getLastRow() < 2) {
    sessionsSheet.getRange(sessionsSheet.getLastRow() + 1, 1, 1, DATA.headers.sessions.length).setValues([
      ['SES-0001', '2024-09-16', 'Lunes', 38, 'P1', '08:00', '08:55', 'GRP-ESO1A', 'UD-ACRO', 'Presentar dinámica Acrosport', 'Rutina de figuras básicas', 'Observación inicial', 'RES-001', 'Planificada', '']
    ]);
  }
}
