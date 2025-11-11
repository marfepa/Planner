function getPlannerBootstrap() {
  var grupos = getSheetData(DATA.sheets.groups);
  var uds = getSheetData(DATA.sheets.uds);
  var recursos = getSheetData(DATA.sheets.resources);
  var range = getCourseDateRange();
  var courseRange = {
    start: range.start ? formatISODate(range.start) : '',
    end: range.end ? formatISODate(range.end) : ''
  };
  var courses = grupos
    .map(function(grupo) { return grupo.Curso; })
    .filter(function(curso) { return curso && curso.toString().trim() !== ''; });
  var uniqueCourses = courses.filter(function(curso, index) {
    return courses.indexOf(curso) === index;
  }).sort();
  var courseColors = buildCourseColors(grupos);
  return {
    grupos: grupos,
    uds: uds,
    recursos: recursos,
    courseRange: courseRange,
    courses: uniqueCourses,
    courseColors: courseColors
  };
}

function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return value.toString().trim();
}

function canonicalizeGroupId(value, groupMapById, groupNameIndex) {
  var key = normalizeString(value);
  if (!key) {
    return '';
  }
  if (groupMapById && groupMapById[key]) {
    return key;
  }
  var nameKey = key.toLowerCase();
  if (groupNameIndex && groupNameIndex[nameKey]) {
    return groupNameIndex[nameKey];
  }
  return key;
}

function normalizeSessionRow(raw, groupMapById, groupNameIndex) {
  var dateKey = normalizeDateKey(raw['Fecha']);
  if (!dateKey) {
    return null;
  }
  var rawGroup = normalizeString(raw['Grupo']);
  var groupId = canonicalizeGroupId(rawGroup, groupMapById, groupNameIndex);
  if (!groupId) {
    return null;
  }
  var groupInfo = groupMapById && groupMapById[groupId];
  return {
    ID: normalizeString(raw.ID),
    Fecha: dateKey,
    Grupo: groupId,
    GrupoOriginal: rawGroup,
    GrupoNombre: groupInfo && groupInfo.Nombre ? normalizeString(groupInfo.Nombre) : rawGroup,
    UD: normalizeString(raw['UD']),
    Periodo: normalizeString(raw['Periodo']),
    'Hora inicio': formatTimeValue(raw['Hora inicio']),
    'Hora fin': formatTimeValue(raw['Hora fin']),
    Objetivos: normalizeString(raw['Objetivos']),
    Actividades: normalizeString(raw['Actividades']),
    Evaluación: normalizeString(raw['Evaluación']),
    Recursos: normalizeString(raw['Recursos']),
    Estado: normalizeString(raw['Estado']) || 'Planificada',
    Notas: normalizeString(raw['Notas'])
  };
}

function normalizeHexColorValue(color) {
  if (!color) {
    return '';
  }
  var hex = color.toString().trim();
  if (hex.charAt(0) === '#') {
    hex = hex.slice(1);
  }
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex.split('').map(function(ch) { return ch + ch; }).join('');
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return '#' + hex.toUpperCase();
  }
  return '';
}

function buildCourseColors(grupos) {
  var palette = ['#5B8FF9', '#13C2C2', '#F6BD16', '#F97316', '#6366F1', '#22C55E', '#EC4899', '#0EA5E9', '#A855F7', '#EF4444'];
  var paletteIndex = 0;
  var map = {};
  var usedColors = {};
  (grupos || []).forEach(function(grupo) {
    if (!grupo) {
      return;
    }
    var course = normalizeString(grupo.Curso);
    if (!course) {
      return;
    }
    var color = normalizeHexColorValue(grupo.Color);
    if (color && !map[course]) {
      map[course] = color;
      usedColors[color] = true;
    }
  });
  (grupos || []).forEach(function(grupo) {
    if (!grupo) {
      return;
    }
    var course = normalizeString(grupo.Curso);
    if (!course || map[course]) {
      return;
    }
    var color = '';
    while (paletteIndex < palette.length && usedColors[palette[paletteIndex]]) {
      paletteIndex++;
    }
    if (paletteIndex < palette.length) {
      color = palette[paletteIndex];
      usedColors[color] = true;
      paletteIndex++;
    } else {
      var hash = 0;
      for (var i = 0; i < course.length; i++) {
        hash = (hash * 31 + course.charCodeAt(i)) & 0xffffffff;
      }
      var r = (hash & 0xff0000) >> 16;
      var g = (hash & 0x00ff00) >> 8;
      var b = hash & 0x0000ff;
      color = '#' + [r, g, b].map(function(value) {
        return Math.max(64, Math.min(192, value)).toString(16).padStart(2, '0');
      }).join('').toUpperCase();
    }
    map[course] = color;
  });
  return map;
}

function buildSessionLookup(sessionRows, groupMapById, groupNameIndex) {
  var byDate = {};
  var list = [];
  sessionRows.forEach(function(row) {
    var session = normalizeSessionRow(row, groupMapById, groupNameIndex);
    if (!session) {
      return;
    }
    list.push(session);
    if (!byDate[session.Fecha]) {
      byDate[session.Fecha] = {};
    }
    if (!byDate[session.Fecha][session.Grupo]) {
      byDate[session.Fecha][session.Grupo] = [];
    }
    byDate[session.Fecha][session.Grupo].push(session);
    if (session.GrupoOriginal && session.GrupoOriginal !== session.Grupo) {
      if (!byDate[session.Fecha][session.GrupoOriginal]) {
        byDate[session.Fecha][session.GrupoOriginal] = [];
      }
      byDate[session.Fecha][session.GrupoOriginal].push(session);
    }
    if (session.GrupoNombre && session.GrupoNombre !== session.Grupo && session.GrupoNombre !== session.GrupoOriginal) {
      if (!byDate[session.Fecha][session.GrupoNombre]) {
        byDate[session.Fecha][session.GrupoNombre] = [];
      }
      byDate[session.Fecha][session.GrupoNombre].push(session);
    }
  });
  Object.keys(byDate).forEach(function(dateKey) {
    var groups = byDate[dateKey];
    Object.keys(groups).forEach(function(groupId) {
      groups[groupId].sort(function(a, b) {
        var aStart = a['Hora inicio'] || '';
        var bStart = b['Hora inicio'] || '';
        if (aStart === bStart) {
          var aPeriod = a.Periodo || '';
          var bPeriod = b.Periodo || '';
          return aPeriod > bPeriod ? 1 : -1;
        }
        return aStart > bStart ? 1 : -1;
      });
    });
  });
  return {
    list: list,
    byDate: byDate
  };
}

function pickSessionForSlot(candidates, slot) {
  if (!candidates || !candidates.length) {
    return null;
  }
  var slotPeriod = normalizeString(slot['Periodo']);
  var slotStart = formatTimeValue(slot['Hora inicio']);
  function toMinutes(timeStr) {
    var normalized = formatTimeValue(timeStr);
    if (!normalized) {
      return null;
    }
    var parts = normalized.split(':');
    if (parts.length < 2) {
      return null;
    }
    return Number(parts[0]) * 60 + Number(parts[1]);
  }
  var match = null;
  if (slotPeriod) {
    match = candidates.find(function(item) {
      return item.Periodo && normalizeString(item.Periodo) === slotPeriod;
    });
  }
  if (!match && slotStart) {
    match = candidates.find(function(item) {
      return item['Hora inicio'] && formatTimeValue(item['Hora inicio']) === slotStart;
    });
    if (!match) {
      match = candidates.find(function(item) {
        if (!item['Hora inicio']) {
          return false;
        }
        var candidateStart = formatTimeValue(item['Hora inicio']);
        if (!candidateStart) {
          return false;
        }
        var slotMinutes = toMinutes(slotStart);
        var candidateMinutes = toMinutes(candidateStart);
        return slotMinutes !== null && candidateMinutes !== null && Math.abs(slotMinutes - candidateMinutes) <= 5;
      });
    }
  }
  if (!match && !slotPeriod && !slotStart) {
    return candidates[0];
  }
  return match || null;
}

function getWeeklyPlanner(isoWeek, isoYear) {
  isoWeek = Number(isoWeek);
  isoYear = Number(isoYear) || new Date().getFullYear();
  var monday = getDateOfISOWeek(isoWeek, isoYear);
  var courseRange = getCourseDateRange();
  var schedule = getSheetData(DATA.sheets.schedule);
  var sessions = getSheetData(DATA.sheets.sessions);
  var grupos = getSheetData(DATA.sheets.groups);
  var uds = getSheetData(DATA.sheets.uds);

  var groupMap = {};
  var groupNameIndex = {};
  grupos.forEach(function(item) {
    if (!item || !item.ID) {
      return;
    }
    var id = normalizeString(item.ID);
    groupMap[id] = item;
    var nameKey = normalizeString(item.Nombre).toLowerCase();
    if (nameKey) {
      groupNameIndex[nameKey] = id;
    }
  });
  var sessionLookup = buildSessionLookup(sessions, groupMap, groupNameIndex);

  var unitMap = {};
  uds.forEach(function(item) {
    if (!item || !item.ID) {
      return;
    }
    unitMap[item.ID.toString().trim()] = item;
  });
  var courseColorMap = buildCourseColors(grupos);

  var rows = [];
  schedule.forEach(function(slot) {
    var dayName = slot['Día'];
    var dayOffset = getDayOffset(dayName);
    if (dayOffset === null) {
      return;
    }
    var slotDate = new Date(monday);
    slotDate.setDate(slotDate.getDate() + dayOffset);
    if (!isDateWithinRange(slotDate, courseRange.start, courseRange.end)) {
      return;
    }
    var dateStr = formatISODate(slotDate);
    var slotGroupRaw = normalizeString(slot['Grupo']);
    if (!slotGroupRaw) {
      return;
    }
    var slotGroupId = canonicalizeGroupId(slotGroupRaw, groupMap, groupNameIndex) || slotGroupRaw;
    var group = groupMap[slotGroupId] || groupMap[slotGroupRaw] || {};
    var periodValue = slot['Periodo'] || '';
    var startTimeValue = formatTimeValue(slot['Hora inicio']);
    var endTimeValue = formatTimeValue(slot['Hora fin']);
    var slotKey = slot.ID || (dateStr + '|' + slotGroupId + '|' + periodValue + '|' + (startTimeValue || ''));
    var sessionCandidates = (sessionLookup.byDate[dateStr] && sessionLookup.byDate[dateStr][slotGroupId]) || [];
    if (!sessionCandidates.length && slotGroupRaw !== slotGroupId) {
      sessionCandidates = (sessionLookup.byDate[dateStr] && sessionLookup.byDate[dateStr][slotGroupRaw]) || [];
    }
    var session = pickSessionForSlot(sessionCandidates, slot);
    var unitId = session ? session.UD : '';
    var unit = unitId ? (unitMap[unitId] || {}) : {};
    var courseName = session
      ? ((groupMap[session.Grupo] && groupMap[session.Grupo].Curso) || group.Curso || '')
      : (group.Curso || '');
    var normalizedCourse = normalizeString(courseName);
    var baseColor = session
      ? normalizeHexColorValue((groupMap[session.Grupo] && groupMap[session.Grupo].Color) || group.Color)
      : normalizeHexColorValue(group.Color);
    var courseFallbackColor = courseColorMap[normalizedCourse] || '';
    var row = {
      slotId: slotKey,
      date: dateStr,
      day: dayName,
      week: isoWeek,
      year: isoYear,
      groupId: session ? (canonicalizeGroupId(session.Grupo, groupMap, groupNameIndex) || session.Grupo) : slotGroupId,
      groupName: session ? (session.GrupoNombre || (groupMap[session.Grupo] && groupMap[session.Grupo].Nombre) || slotGroupRaw || slotGroupId) : (group.Nombre || slotGroupRaw || slotGroupId),
      course: courseName,
      period: session && session.Periodo ? session.Periodo : periodValue,
      startTime: session && session['Hora inicio'] ? session['Hora inicio'] : startTimeValue,
      endTime: session && session['Hora fin'] ? session['Hora fin'] : endTimeValue,
      room: slot['Aula'] || '',
      session: session || null,
      unitId: unitId,
      unitName: unit.Nombre || (session ? session.UD : ''),
      status: session ? (session.Estado || 'Planificada') : 'Sin sesión',
      color: baseColor || courseFallbackColor
    };
    rows.push(row);
  });

  rows.sort(function(a, b) {
    if (a.date === b.date) {
      if (a.startTime === b.startTime) {
        return a.groupName > b.groupName ? 1 : -1;
      }
      return a.startTime > b.startTime ? 1 : -1;
    }
    return a.date > b.date ? 1 : -1;
  });
  return rows;
}

function getTimelineEntries(filterValue) {
  var calendar = getSheetData(DATA.sheets.calendar);
  var schedule = getSheetData(DATA.sheets.schedule);
  var sessions = getSheetData(DATA.sheets.sessions);
  var grupos = getSheetData(DATA.sheets.groups);
  var uds = getSheetData(DATA.sheets.uds);

  var groupMap = {};
  var groupNameIndex = {};
  grupos.forEach(function(item) {
    if (!item || !item.ID) {
      return;
    }
    var id = normalizeString(item.ID);
    groupMap[id] = item;
    var nameKey = normalizeString(item.Nombre).toLowerCase();
    if (nameKey) {
      groupNameIndex[nameKey] = id;
    }
  });
  var sessionLookup = buildSessionLookup(sessions, groupMap, groupNameIndex);

  var unitMap = {};
  uds.forEach(function(item) {
    if (!item || !item.ID) {
      return;
    }
    unitMap[item.ID.toString().trim()] = item;
  });
  var courseColorMap = buildCourseColors(grupos);

  var scheduleByDay = {};
  schedule.forEach(function(slot) {
    var day = normalizeDayName(slot['Día']);
    if (!day) {
      return;
    }
    if (!scheduleByDay[day]) {
      scheduleByDay[day] = [];
    }
    scheduleByDay[day].push(slot);
  });

  var filterCourse = '';
  var filterGroup = '';
  if (filterValue) {
    var rawFilter = filterValue.toString();
    if (rawFilter.indexOf('GROUP::') === 0) {
      filterGroup = normalizeString(rawFilter.slice(7));
    } else if (rawFilter.indexOf('COURSE::') === 0) {
      filterCourse = normalizeString(rawFilter.slice(8));
    } else {
      filterCourse = normalizeString(rawFilter);
    }
  }

  var response = [];
  calendar.forEach(function(dayRow) {
    var dateStr = normalizeDateKey(dayRow['Fecha']);
    var dayName = normalizeDayName(dayRow['Día']);
    var dayLabel = dayRow['Día'];
    var isoWeek = dayRow['Semana ISO'];
    var slots = scheduleByDay[dayName] || [];
    if (!slots.length) {
      if (!filterCourse && !filterGroup) {
        response.push({
          date: dateStr,
          isoWeek: isoWeek,
          day: dayLabel,
          course: '',
          groupId: '',
          groupName: '',
          period: '',
          startTime: '',
          endTime: '',
          unitName: '',
          status: 'Sin clases',
          description: '',
          objectives: '',
          activities: '',
          evaluation: '',
          resources: '',
          notes: '',
          color: ''
        });
      }
      return;
    }
    slots.forEach(function(slot) {
      var slotGroupRaw = normalizeString(slot['Grupo']);
      if (!slotGroupRaw) {
        return;
      }
      var slotGroupId = canonicalizeGroupId(slotGroupRaw, groupMap, groupNameIndex) || slotGroupRaw;
      var group = groupMap[slotGroupId] || groupMap[slotGroupRaw] || {};
      if (filterCourse && normalizeString(group.Curso) !== filterCourse) {
        return;
      }
      if (filterGroup && slotGroupId !== filterGroup && slotGroupRaw !== filterGroup) {
        return;
      }
      var sessionCandidates = (sessionLookup.byDate[dateStr] && sessionLookup.byDate[dateStr][slotGroupId]) || [];
      if (!sessionCandidates.length && slotGroupRaw !== slotGroupId) {
        sessionCandidates = (sessionLookup.byDate[dateStr] && sessionLookup.byDate[dateStr][slotGroupRaw]) || [];
      }
      var session = pickSessionForSlot(sessionCandidates, slot);
      var unitId = session ? session.UD : '';
      var unit = unitId ? (unitMap[unitId] || {}) : {};
      var unitName = unit.Nombre || (session ? session.UD : '');
      var startTimeValue = session && session['Hora inicio'] ? session['Hora inicio'] : formatTimeValue(slot['Hora inicio']);
      var endTimeValue = session && session['Hora fin'] ? session['Hora fin'] : formatTimeValue(slot['Hora fin']);
      var periodValue = session && session.Periodo ? session.Periodo : (slot['Periodo'] || '');
      var courseName = group.Curso || '';
      var colorValue = normalizeHexColorValue(group.Color) || courseColorMap[normalizeString(courseName)] || '';
      response.push({
        date: dateStr,
        isoWeek: isoWeek,
        day: dayLabel,
        course: courseName,
        groupId: slotGroupId,
        groupName: group.Nombre || (session ? session.GrupoNombre : slotGroupRaw) || slotGroupId,
        period: periodValue,
        startTime: startTimeValue,
        endTime: endTimeValue,
        unitName: unitName,
        status: session ? (session.Estado || 'Planificada') : 'Sin sesión',
        description: session ? (session.Objetivos || '') : '',
        objectives: session ? session.Objetivos : '',
        activities: session ? session.Actividades : '',
        evaluation: session ? session.Evaluación : '',
        resources: session ? session.Recursos : '',
        notes: session ? session.Notas : '',
        color: colorValue
      });
    });
  });

  response.sort(function(a, b) {
    if (a.date === b.date) {
      if (a.startTime === b.startTime) {
        return a.groupName > b.groupName ? 1 : -1;
      }
      return a.startTime > b.startTime ? 1 : -1;
    }
    return a.date > b.date ? 1 : -1;
  });
  return response;
}

function getAvailableGroupsForDate(dateStr) {
  var date = parseISODate(dateStr);
  if (!date) {
    return [];
  }
  var targetDay = normalizeDayName(getSpanishDayName(date));
  var schedule = getSheetData(DATA.sheets.schedule);
  var grupos = getSheetData(DATA.sheets.groups);
  var groupMap = {};
  var groupNameIndex = {};
  grupos.forEach(function(item) {
    var id = (item.ID || '').toString().trim();
    if (id) {
      groupMap[id] = item;
      var nameKey = normalizeString(item.Nombre).toLowerCase();
      if (nameKey) {
        groupNameIndex[nameKey] = id;
      }
    }
  });

  var result = [];
  schedule.forEach(function(slot) {
    var slotDay = normalizeDayName(slot['Día']);
    if (!slotDay || slotDay !== targetDay) {
      return;
    }
    var groupRaw = normalizeString(slot['Grupo']);
    if (!groupRaw) {
      return;
    }
    var groupId = canonicalizeGroupId(groupRaw, groupMap, groupNameIndex) || groupRaw;
    var group = groupMap[groupId] || groupMap[groupRaw] || {};
    result.push({
      id: groupId,
      name: (group.Nombre || groupRaw || groupId).toString().trim(),
      period: (slot['Periodo'] || '').toString().trim(),
      startTime: formatTimeValue(slot['Hora inicio']),
      endTime: formatTimeValue(slot['Hora fin']),
      room: (slot['Aula'] || '').toString().trim(),
      course: (group.Curso || '').toString().trim(),
      weekday: targetDay,
      color: normalizeString(group.Color)
    });
  });

  result.sort(function(a, b) {
    var startA = a.startTime || '';
    var startB = b.startTime || '';
    if (startA === startB) {
      return a.name > b.name ? 1 : -1;
    }
    return startA > startB ? 1 : -1;
  });

  return result;
}

function getGroupContext(dateStr, groupId) {
  var date = parseISODate(dateStr);
  if (!date) {
    throw new Error('Fecha no válida');
  }
  var targetDay = normalizeDayName(getSpanishDayName(date));
  var normalizedGroupId = normalizeString(groupId);
  if (!normalizedGroupId) {
    throw new Error('Grupo no válido');
  }

  var schedule = getSheetData(DATA.sheets.schedule);
  var grupos = getSheetData(DATA.sheets.groups);
  var sessions = getSheetData(DATA.sheets.sessions);
  var uds = getSheetData(DATA.sheets.uds);

  var groupMap = {};
  var groupNameIndex = {};
  grupos.forEach(function(item) {
    var id = (item.ID || '').toString().trim();
    if (id) {
      groupMap[id] = item;
      var nameKey = normalizeString(item.Nombre).toLowerCase();
      if (nameKey) {
        groupNameIndex[nameKey] = id;
      }
    }
  });
  normalizedGroupId = canonicalizeGroupId(normalizedGroupId, groupMap, groupNameIndex);

  var sessionLookup = buildSessionLookup(sessions, groupMap, groupNameIndex);

  var unitMap = {};
  uds.forEach(function(item) {
    if (item.ID) {
      unitMap[item.ID] = item;
    }
  });

  var slot = null;
  schedule.some(function(item) {
    var itemGroupRaw = normalizeString(item['Grupo']);
    var itemGroup = canonicalizeGroupId(itemGroupRaw, groupMap, groupNameIndex) || itemGroupRaw;
    if (itemGroup !== normalizedGroupId && itemGroupRaw !== normalizedGroupId) {
      return false;
    }
    var itemDay = normalizeDayName(item['Día']);
    if (itemDay === targetDay) {
      slot = item;
      return true;
    }
    return false;
  });

  if (!slot) {
    schedule.some(function(item) {
      var itemGroupRaw = normalizeString(item['Grupo']);
      var itemGroup = canonicalizeGroupId(itemGroupRaw, groupMap, groupNameIndex) || itemGroupRaw;
      if (itemGroup === normalizedGroupId || itemGroupRaw === normalizedGroupId) {
        slot = item;
        return true;
      }
      return false;
    });
  }

  var plannedUnitsMap = {};
  sessionLookup.list.forEach(function(session) {
    if (session.Grupo === normalizedGroupId && session.UD) {
      plannedUnitsMap[session.UD] = true;
    }
  });
  var plannedUnits = Object.keys(plannedUnitsMap).map(function(unitId) {
    var unit = unitMap[unitId] || {};
    return {
      ID: unitId,
      Nombre: unit.Nombre || unitId
    };
  });

  var groupInfo = groupMap[normalizedGroupId] || {};

  return {
    periodo: slot ? (slot['Periodo'] || '').toString().trim() : '',
    horaInicio: slot ? formatTimeValue(slot['Hora inicio']) : '',
    horaFin: slot ? formatTimeValue(slot['Hora fin']) : '',
    aula: slot ? (slot['Aula'] || '').toString().trim() : '',
    curso: (groupInfo.Curso || '').toString().trim(),
    plannedUnits: plannedUnits
  };
}

function saveSession(session) {
  if (!session) {
    throw new Error('No se recibieron datos de sesión');
  }
  if (!session.Fecha) {
    throw new Error('La fecha es obligatoria');
  }
  if (!session.Grupo) {
    throw new Error('El grupo es obligatorio');
  }
  var date = parseISODate(session.Fecha);
  if (!date) {
    throw new Error('Fecha inválida: usa formato AAAA-MM-DD');
  }
  session['Fecha'] = formatISODate(date);
  session['Día'] = getSpanishDayName(date);
  session['Semana ISO'] = getISOWeekNumber(date);
  session['Periodo'] = session['Periodo'] || '';
  session['Hora inicio'] = session['Hora inicio'] || '';
  session['Hora fin'] = session['Hora fin'] || '';
  session['Objetivos'] = session['Objetivos'] || '';
  session['Actividades'] = session['Actividades'] || '';
  session['Evaluación'] = session['Evaluación'] || '';
  session['Recursos'] = session['Recursos'] || '';
  session['Estado'] = session['Estado'] || 'Planificada';
  session['Notas'] = session['Notas'] || '';
  if (!session.ID) {
    session.ID = generateId('SES');
  }
  upsertRow(DATA.sheets.sessions, 'ID', session);
  logAction('SAVE_SESSION', session.ID);
  return session;
}

function deleteSession(sessionId) {
  if (!sessionId) {
    throw new Error('Falta el identificador de la sesión');
  }
  var sheet = SpreadsheetApp.getActive().getSheetByName(DATA.sheets.sessions);
  if (!sheet) {
    throw new Error('No se encuentra la hoja de sesiones');
  }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('No hay sesiones registradas');
  }
  var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === sessionId) {
      sheet.deleteRow(i + 2);
      logAction('DELETE_SESSION', sessionId);
      return true;
    }
  }
  throw new Error('No se encontró la sesión ' + sessionId);
}

function duplicateSession(sessionOrData, overrides) {
  if (!sessionOrData) {
    throw new Error('Falta la sesión origen');
  }
  overrides = overrides || {};
  var base = null;
  if (typeof sessionOrData === 'string') {
    var sessions = getSheetData(DATA.sheets.sessions);
    base = sessions.find(function(item) {
      return normalizeString(item.ID) === normalizeString(sessionOrData);
    });
    if (!base) {
      throw new Error('No se encontró la sesión ' + sessionOrData);
    }
  } else if (typeof sessionOrData === 'object') {
    base = {};
    DATA.headers.sessions.forEach(function(header) {
      if (Object.prototype.hasOwnProperty.call(sessionOrData, header)) {
        base[header] = sessionOrData[header];
      }
    });
    if (!base.Fecha || !base.Grupo) {
      throw new Error('La sesión origen necesita fecha y grupo para duplicar');
    }
  } else {
    throw new Error('Formato de sesión origen no válido');
  }
  var copy = {};
  DATA.headers.sessions.forEach(function(header) {
    if (Object.prototype.hasOwnProperty.call(overrides, header)) {
      copy[header] = overrides[header];
    } else if (base && Object.prototype.hasOwnProperty.call(base, header)) {
      copy[header] = base[header];
    } else {
      copy[header] = '';
    }
  });
  copy.ID = generateId('SES');
  return saveSession(copy);
}

function getDateOfISOWeek(week, year) {
  var simple = new Date(year, 0, 1 + (week - 1) * 7);
  var dow = simple.getDay();
  var ISOweekStart = simple;
  if (dow <= 4) {
    ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  } else {
    ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  }
  return ISOweekStart;
}
