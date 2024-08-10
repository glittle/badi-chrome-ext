const PageExporter = () => {
  let _lines = [];
  let _forCsv = false;
  let _doingCsvLine = false;
  let _csvLine = [];
  let _numEntries = 0;
  const _uidPrefix = "UID:Chrome Badi Calendar Extension//";
  let _nowCalDate = "";
  const _specialDays = {};
  let _includeLocation = true;
  let _includeAlert = false;

  const prepareInputs = () => {
    const template = '{title}<label><input type="checkbox" value="{val}" data-num="{n}" /><span>{name}</span></label>';
    const items = [
      { val: "Date_AllDay", n: 365 },
      { val: "Date_BeginningSunset", n: 365 },
      { val: "Date_Sun", n: 365 },
      { val: "Hd_AllDay", n: 11 },
      { val: "Hd_Sun", n: 11 },
      { val: "Hd_Start", n: 11 },
      { val: "Feast_AllDay", n: 19 },
      { val: "Feast_Sun", n: 19 },
      { val: "Feast_BeginningSunset", n: 19 },
      { val: "Feast_Usual", n: 19 },
      { val: "Fast_Sunrise", n: 19 },
      { val: "Fast_Sunset", n: 19 },
      { val: "Fast_SunriseToSunset", n: 19 },
    ];
    let lastWhat = "";
    items.forEach((item) => {
      const valParts = item.val.split("_");
      const type = valParts[1];
      item.name = getMessage(`exportOption_${type}`);
      const what = valParts[0];
      if (what !== lastWhat) {
        item.title = "<div class=exportItemTitle>{0}</div>".filledWith(getMessage(`exportOption_${what}`));
        lastWhat = what;
      } else {
        item.title = "";
      }
    });

    $(".exportOptionList").html(template.filledWithEach(items));

    localizeHtml(".exportOptionList", (originalValue) => {
      let value = originalValue;
      value = value.replace(/\(/g, "<span class=comment>(");
      value = value.replace(/\)/g, ")</span>");
      return value;
    });

    const alerts = [
      { v: "B0" },
      { v: "B1" },
      { v: "B5" },
      { v: "B10" },
      { v: "B15" },
      { v: "B30" },
      { v: "B60" },
      // can't go after...
    ];
    alerts.forEach((a) => {
      a.t = getMessage(`exportAlert_${a.v}`);
    });
    $("#exporterIncludeAlertMin").html('<option value="{v}">{t}</option>'.filledWithEach(alerts));

    setByYear();
  };
  const setByYear = (highlight) => {
    const select = $("#exporterDateRange");
    select.find("option").each((i, el) => {
      const option = $(el);
      const key = option.attr("id");
      const parts = key.split("_");
      const type = parts[1];
      const offset = +parts[2];

      const year = offset + (type === "Greg" ? _di.currentYear : _di.bYear);
      option.val(type + year);
      option.text(getMessage(`Export${type}Year${offset}`, year));
    });
    if (highlight) {
      select.effect("highlight", 1000);
    }
  };
  const calFormat = (date, addHours, addMinutes) => {
    if (addHours + addMinutes) {
      date.setHours(date.getHours() + addHours, date.getMinutes() + addMinutes, 0, 0);
    }
    return `${
      date
        .toJSON()
        .replace(/[\-\:]/g, "")
        .split(".")[0]
    }Z`;
  };
  const makeEntries = async (asCsv) => {
    _lines = [];
    _forCsv = !!asCsv;
    _nowCalDate = calFormat(new Date());
    _includeLocation = $("#exporterIncludeLocation").is(":checked");
    _includeAlert = $("#exporterIncludeAlert").is(":checked");

    addLine("BEGIN:VCALENDAR");
    addLine("VERSION:2.0");
    addLine("CALSCALE:GREGORIAN");
    addLine("METHOD:PUBLISH");
    addLine(`X-WR-CALNAME:${$("#exporterName").val()}`);
    addLine(`X-WR-TIMEZONE:${dayjs.tz.guess()}`);
    addLine(
      `X-WR-CALDESC:${getMessage("exportCalendarDescription", {
        location: common.locationName,
      })}`
    );

    addEntries();

    addLine("END:VCALENDAR");
    addLine("");
  };
  const addEntries = () => {
    const ddl = $("#exporterDateRange");
    if (!ddl.val()) {
      ddl[0].selectedIndex = 0;
    }
    const range = ddl.val();
    const rangeType = range.substr(0, 4);
    const year = +range.substr(4);
    let date = null;
    let nextYearStarts = null;
    const maxEntries = 0;
    //if (amount == 'some') {
    //  maxEntries = 5;
    //}

    // what range of dates?
    switch (rangeType) {
      case "Badi":
        date = new Date(_holyDaysEngine.getGDate(year, 1, 1).getTime());
        date.setHours(12, 0, 0, 0);
        nextYearStarts = new Date(_holyDaysEngine.getGDate(year + 1, 1, 1).getTime());
        nextYearStarts.setHours(12, 0, 0, 0);
        break;
      case "Greg":
        date = new Date(year, 0, 1);
        date.setHours(12, 0, 0, 0);
        nextYearStarts = new Date(year + 1, 0, 1);
        nextYearStarts.setHours(12, 0, 0, 0);
        break;
      default:
        console.log("unexpected: {0} {1}".filledWith(rangeType, year));
        return;
    }

    const wantedEventTypes = $(".exportOptionList input:checked")
      .map((i, el) => el.value)
      .get();
    console.log(wantedEventTypes);

    // process each day... see if there is a wanted type for that day
    while (date < nextYearStarts) {
      //log(calFormat(date));
      const di = getDateInfo(date);

      for (let i = 0; i < wantedEventTypes.length; i++) {
        const eventType = wantedEventTypes[i];
        const parts = eventType.split("_");
        const type = parts[0];
        const variation = parts[1];
        switch (type) {
          case "Date": // badi days
            addEntryDate(type, di, variation);
            break;
          case "Hd":
            addHolyDay(type, di, variation);
            break;
          case "Feast":
            addFeast(type, di, variation);
            break;
          case "Fast":
            addFastEntries(type, di, variation);
            break;

          default:
            console.log(`unknown: ${eventType}`);
        }
      }

      // entry
      //if (maxEntries && _numEntries > maxEntries) {
      //  break;
      //}

      date.setDate(date.getDate() + 1);
    }
  };
  /* BADI DAY
  *
BEGIN:VEVENT
DTSTART;VALUE=DATE:20140321
DTSTAMP:20160118T064745Z
UID:nvevsld1q4sbso76qsfbj9a7f4@google.com
LAST-MODIFIED:20141224T090214Z
CREATED:20141224T090214Z
DESCRIPTION:1 Bahá 171 ⇨7:51 pm\n\nTimes customized for Northeast Calgary\,
Calgary\, AB\, Canada\nGenerated by "Badi Calendar Tools" on 13 Masá'il 17
1
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:1 Bahá 171 ⇨7:51 pm
TRANSP:TRANSPARENT
END:VEVENT

   * 
   * 
   * 
   */

  const addEntryDate = (type, di, variation) => {
    addLine("BEGIN:VEVENT");

    const dayInfo = "{bDay} {bMonthNamePri} {bYear}".filledWith(di);

    switch (variation) {
      case "AllDay":
        addLine(`DTSTART;VALUE=DATE:${di.currentDateString.replace(/\-/g, "")}`);
        addLine(`SUMMARY:${dayInfo}${" ⇨{endingSunsetDesc}".filledWith(di)}`);
        noTimes = true;
        break;
      case "Sun":
        addLine(`DTSTART:${calFormat(di.frag1SunTimes.sunset)}`);
        addLine(`DTEND:${calFormat(di.frag2SunTimes.sunset, 0, -5)}`);
        addLine(`SUMMARY:${dayInfo}`);
        break;
      case "BeginningSunset":
        addLine(`DTSTART:${calFormat(di.frag1SunTimes.sunset)}`);
        addLine(`DTEND:${calFormat(di.frag1SunTimes.sunset)}`);
        addLine(`SUMMARY:${getMessage("exportDayFromSunset", dayInfo)}`);
        break;
      default:
        console.log(`unexpected date variation: ${variation}`);
        break;
    }

    addDescription(getMessage("exporterItemDescDay"), variation === "AllDay");

    addLine(_uidPrefix + "{0}//{1}-{2}".filledWith(di.stampDay, type, variation));
    addEndOfEntry();
  };

  const addHolyDay = async (type, di, variation) => {
    if (!_specialDays[di.bYear]) {
      _specialDays[di.bYear] = _holyDaysEngine.prepareDateInfos(di.bYear);
    }
    // let holyDayInfo = $ .grep(_specialDays[di.bYear], (el, i) => el.Type.substring(0, 1) === "H" && el.BDateCode === di.bDateCode);
    let holyDayInfo = _specialDays[di.bYear].filter((el) => el.Type.substring(0, 1) === "H" && el.BDateCode === di.bDateCode);

    if (!holyDayInfo.length) {
      return;
    }
    holyDayInfo = holyDayInfo[0]; // focus on first event only

    const dayName = getMessage(holyDayInfo.NameEn);

    //log(dayName, holyDayInfo, di);

    let targetTime = holyDayInfo.Time || $("#eventStart").val();
    let startTime;

    if (targetTime === "SS2") {
      startTime = new Date(di.frag1SunTimes.sunset.getTime());
      startTime.setHours(startTime.getHours() + 2);
      // about 2 hours after sunset
      let minutes = startTime.getMinutes();
      minutes = minutes > 30 ? 30 : 0; // start 1/2 hour before
      startTime.setMinutes(minutes);
    } else {
      let adjustDTtoST = 0;
      if (targetTime.slice(-1) === "S") {
        targetTime = targetTime.slice(0, 4);
        adjustDTtoST = inStandardTime(di.frag1) ? 0 : 1;
      }
      startTime = new Date(di.frag1.getTime());
      const timeHour = +targetTime.slice(0, 2);
      const timeMin = targetTime.slice(-2);
      startTime.setHours(timeHour + adjustDTtoST);
      startTime.setMinutes(timeMin);

      if (di.frag1SunTimes.sunset.getTime() < startTime.getTime()) {
        //isEve = " *";
      } else {
        startTime.setHours(startTime.getHours() + 24);
      }
    }

    addLine("BEGIN:VEVENT");

    addLine("SUMMARY:{0}".filledWith(dayName));

    switch (variation) {
      case "AllDay":
        addLine(`DTSTART;VALUE=DATE:${di.currentDateString.replace(/\-/g, "")}`);
        break;
      case "Sun":
        addLine(`DTSTART:${calFormat(di.frag1SunTimes.sunset)}`);
        addLine(`DTEND:${calFormat(di.frag2SunTimes.sunset, 0, -5)}`);
        break;
      case "Start":
        // put as single point in time... meetings may start earlier, if this time is honoured during the meeting
        addLine(`DTSTART:${calFormat(startTime)}`);
        addLine(`DTEND:${calFormat(startTime)}`);
        break;
      default:
        console.log(`unexpected date variation: ${variation}`);
        break;
    }

    let key;
    const extraInfo = {
      location: common.locationName,
    };

    if (holyDayInfo.Time) {
      extraInfo.SpecialTime = getMessage(`specialTime_${holyDayInfo.Time}`);
      key = "exporterItemDescSpecialTime";
    } else {
      key = "exporterItemDescGeneralTime";
    }

    addDescription(getMessage(key, extraInfo), variation === "AllDay");

    addLine(_uidPrefix + "{0}//{1}-{2}".filledWith(di.stampDay, type, variation));
    addEndOfEntry();
  };

  const addFeast = (type, di, variation) => {
    if (!_specialDays[di.bYear]) {
      _specialDays[di.bYear] = _holyDaysEngine.prepareDateInfos(di.bYear);
    }
    // let feastInfo = $ .grep(_specialDays[di.bYear], (el, i) => el.Type.substring(0, 1) === "M" && el.BDateCode === di.bDateCode);
    let feastInfo = _specialDays[di.bYear].filter((el) => el.Type.substring(0, 1) === "M" && el.BDateCode === di.bDateCode);

    if (!feastInfo.length) {
      return;
    }
    feastInfo = feastInfo[0]; // focus on first event only

    const dayName = getMessage("FeastOf").filledWith(di.bMonthMeaning);

    //log(dayName, feastInfo, di);

    const targetTime = $("#eventStart").val();

    const startTime = new Date(di.frag1.getTime());
    const timeHour = +targetTime.slice(0, 2);
    const timeMin = targetTime.slice(-2);
    startTime.setHours(timeHour);
    startTime.setMinutes(timeMin);

    if (di.frag1SunTimes.sunset.getTime() < startTime.getTime()) {
      //isEve = " *";
    } else {
      startTime.setHours(startTime.getHours() + 24);
    }

    addLine("BEGIN:VEVENT");

    addLine("SUMMARY:{0}".filledWith(dayName));

    switch (variation) {
      case "AllDay":
        addLine(`DTSTART;VALUE=DATE:${di.currentDateString.replace(/\-/g, "")}`);
        break;
      case "Sun":
        addLine(`DTSTART:${calFormat(di.frag1SunTimes.sunset)}`);
        addLine(`DTEND:${calFormat(di.frag2SunTimes.sunset, 0, -5)}`);
        break;
      case "Usual":
        // put as single point in time...
        addLine(`DTSTART:${calFormat(startTime)}`);
        addLine(`DTEND:${calFormat(startTime)}`);
        break;
      case "BeginningSunset":
        // put as single point in time...
        addLine(`DTSTART:${calFormat(di.frag1SunTimes.sunset)}`);
        addLine(`DTEND:${calFormat(di.frag1SunTimes.sunset)}`);
        break;
      default:
        console.log(`unexpected date variation: ${variation}`);
        break;
    }

    addDescription(getMessage("exporterItemDescGeneralTime"), variation === "AllDay");

    addLine(_uidPrefix + "{0}//{1}-{2}".filledWith(di.stampDay, type, variation));
    addEndOfEntry();
  };

  const addFastEntries = (type, di, variation) => {
    if (di.bMonth !== 19) {
      return;
    }

    addDescription(getMessage("exporterItemDescFast"));

    //        di.sunriseDesc = getTimeDisplay(di.frag2SunTimes.sunrise);
    switch (variation) {
      case "SunriseToSunset": {
        addLine("BEGIN:VEVENT");
        addLine(`DTSTART:${calFormat(di.frag2SunTimes.sunrise)}`);
        addLine(`DTEND:${calFormat(di.frag2SunTimes.sunset)}`);

        const summary = getMessage("exporterFastUntil", di);
        addLine(`SUMMARY:${summary}`);
        addAlert(summary);

        addLine(_uidPrefix + "{0}//{1}-{2}".filledWith(di.stampDay, type, variation));
        addEndOfEntry();

        break;
      }
      case "Sunrise":
        addLine("BEGIN:VEVENT");
        addLine(`DTSTART:${calFormat(di.frag2SunTimes.sunrise)}`);
        addLine(`DTEND:${calFormat(di.frag2SunTimes.sunrise)}`);

        summary = getMessage("exporterFastStart");
        addLine(`SUMMARY:${summary}`);
        addAlert(summary);

        addLine(_uidPrefix + "{0}//{1}-{2}".filledWith(di.stampDay, type, variation));
        addEndOfEntry();
        break;

      case "Sunset":
        addLine("BEGIN:VEVENT");
        addLine(`DTSTART:${calFormat(di.frag2SunTimes.sunset)}`);
        addLine(`DTEND:${calFormat(di.frag2SunTimes.sunset)}`);

        summary = getMessage("exporterFastEnd");
        addLine(`SUMMARY:${summary}`);
        addAlert(summary);

        addLine(_uidPrefix + "{0}//{1}-{2}".filledWith(di.stampDay, type, variation));
        addEndOfEntry();
        break;
      default:
        console.log(`unexpected date variation: ${variation}`);
        break;
    }
  };

  const addAlert = (msg) => {
    if (!_includeAlert) {
      return;
    }
    const alertOffset = $("#exporterIncludeAlertMin").val();
    const sign = alertOffset[0] === "B" ? "-" : "";
    const num = alertOffset.substr(1);
    addLine("BEGIN:VALARM");
    addLine("TRIGGER:{0}PT{1}M".filledWith(sign, num));
    addLine("ACTION:DISPLAY");
    addLine(`DESCRIPTION:${msg}`);
    addLine("END:VALARM");

    //BEGIN:VALARM
    //ACTION:DISPLAY
    //DESCRIPTION:This is an event description
    //TRIGGER:-P0DT0H10M0S
    //END:VALARM
  };

  const addDescription = async (originalMsg, allDay) => {
    let msg = originalMsg; // Use a local variable instead of reassigning the parameter
    if (!allDay) {
      const extraInfo = {
        location: common.locationName,
      };
      const timesLocation = getMessage("exporterItemDescShared", extraInfo);
      msg = `${msg} ${timesLocation}`; // Now modifying the local variable
    }

    addLine(`DESCRIPTION:${msg}`); // Use the modified local variable
    //addLine('X-ALT-DESC:' + msg); // This line is commented out, but the approach remains the same
  };

  const addEndOfEntry = async () => {
    if (_doingCsvLine) {
      _lines.push(_csvLine.join(","));
      _csvLine = [];
      _doingCsvLine = false;
      _numEntries++;
      return;
    }

    addLine("TRANSP:TRANSPARENT");
    addLine("CLASS:PUBLIC");
    addLine(`DTSTAMP:${_nowCalDate}`);
    addLine(`LAST-MODIFIED:${_nowCalDate}`);
    if (_includeLocation) {
      addLine(`LOCATION:${common.locationName}`);
    }
    addLine("END:VEVENT");

    _numEntries++;
  };
  const addLine = (line) => {
    if (line === "BEGIN:VEVENT") {
      _doingCsvLine = _forCsv;
      if (_doingCsvLine) {
        return;
      }
    }
    if (_forCsv && !_doingCsvLine) {
      return;
    }
    if (_doingCsvLine) {
      _csvLine.push(line.split(":")[1]);
      return;
    }

    const maxLength = 65; // actually 75, but need to handle extended characters, etc
    if (line.length < maxLength) {
      _lines.push(line);
      return;
    }
    _lines.push(line.substr(0, maxLength));
    addLine(` ${line.substr(maxLength)}`);
  };
  const sendTo = (target) => {
    switch (target) {
      case "test": {
        const html = [];
        for (let i = 0; i < _lines.length; i++) {
          const line = _lines[i];
          //if (line == 'BEGIN:VEVENT') {
          //  html.push('\n');
          //}
          html.push(`${_lines[i]}\n`);
        }
        $("#exporterTest").show().val(html.join(""));
        $("#btnHideSample").show();
        break;
      }
      case "google":
        break;
      case "file": {
        //TODO: name file with content and time stamp
        const wantedEventTypes = $(".exportOptionList input:checked")
          .map((i, el) => el.value.replace(/\_/g, ""))
          .get();
        const filename = "Badi__{0}_{1}.ics".filledWith(wantedEventTypes.join("_"), dayjs().format("DDHHmmss"));
        const element = document.createElement("a");
        element.setAttribute("href", `data:text/plain;charset=utf-8,${encodeURIComponent(_lines.join("\r\n"))}`);
        element.setAttribute("download", filename);

        element.style.display = "none";
        document.body.appendChild(element);

        element.click();

        document.body.removeChild(element);
        break;
      }
    }
  };
  const updateTotalToExport = () => {
    let total = 0;
    $("#pageExporter input[type=checkbox]:checked").each((i, el) => {
      total += $(el).data("num") || 0;
    });
    $("#exportNum").text(total);
  };
  const saveValue = (ev) => {
    const input = ev.target;
    putInStorageSyncAsync(`exporter_${input.id}`, input.value);
  };
  const clearQuickPick = () => {
    $("#pageExporter input[type=checkbox]:checked, #exporterIncludeAlert").each((i, el) => {
      $(el).prop("checked", false).trigger("change");
    });
  };
  const setQuickPicks = (list, alert) => {
    clearQuickPick();
    list.forEach((l) => {
      $("#pageExporter input[value={0}]".filledWith(l)).prop("checked", true).trigger("change");
    });
    if (alert) {
      $("#exporterIncludeAlertMin").val(alert).trigger("change");
      $("#exporterIncludeAlert").prop("checked", true).trigger("change");
    }
  };
  const attachHandlers = () => {
    $("#pageExporter").on("change", "input[type=checkbox]", (ev) => {
      const cb = $(ev.target);
      putInStorageSyncAsync(`exporter_${cb.val()}`, cb.is(":checked"));
      updateTotalToExport();
    });
    $("#exporterName, #exporterDateRange").on("change", saveValue);

    $("#btnExportFile").click(() => {
      makeEntries();
      sendTo("file");
    });

    $("#btnExportGoogle").click(() => {
      makeEntries();
      sendTo("google");
    });

    $("#btnQuickPickClear").click(clearQuickPick);
    $("#btnQuickPick1").click(() => {
      setQuickPicks(["Date_AllDay", "Hd_AllDay", "Feast_BeginningSunset"]);
    });
    $("#btnQuickPick2").click(() => {
      setQuickPicks(["Fast_Sunrise"], "B10");
    });
    $("#btnQuickPick3").click(() => {
      setQuickPicks(["Fast_Sunset"], "B0");
    });
    $("#btnExportTest").click(() => {
      makeEntries();
      sendTo("test");
    });
    $("#cbExportTestCsv").click(() => {
      makeEntries(true);
      sendTo("test");
    });
    $("#btnHideSample").click((ev) => {
      $("#exporterTest").hide();
      $(ev.target).hide();
    });
    $("#exporterIncludeAlert, #exporterIncludeAlertMin").on("change", refreshAlert);
  };
  const recallSettings = () => {
    $("#pageExporter input[type=checkbox]").each(async (i, el) => {
      const cb = $(el);
      cb.prop("checked", await getFromStorageSyncAsync(`exporter_${cb.val()}`, false));
    });
    $("#exporterName").val(common.exporter_exporterName);
    const ddlRange = $("#exporterDateRange");
    ddlRange.val(common.exporter_exporterDateRange);
    if (!ddlRange.val()) {
      ddlRange[0].selectedIndex = 0;
    }
    $("#exporterIncludeAlertMin").val(common.exporter_alertMinutes);
  };
  const refreshAlert = () => {
    const ddl = $("#exporterIncludeAlertMin");
    ddl.toggle($("#exporterIncludeAlert").is(":checked"));
    putInStorageSyncAsync(syncStorageKey.exporter_alertMinutes, ddl.val());
  };

  function startup() {
    prepareInputs();
    recallSettings();
    updateTotalToExport();
    refreshAlert();
    attachHandlers();
  }

  startup();

  return {
    updateYear: setByYear,
    special: _specialDays,
  };
};
