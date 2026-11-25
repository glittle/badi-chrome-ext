const PagePlannerAsync = async () => {
  const _page = $("#pagePlanner");
  let _startGDate = null;
  let _endGDate = null;
  let _planRepeatUnits = null;
  let _planRepeatNum = null;
  let _plannerShowWhat = null;
  let _inPlanWhatChangeHandler = false;

  function generate() {
    if (_inPlanWhatChangeHandler) {
      return;
    }
    _planRepeatNum = +$("#planRepeatNum").val();
    _planRepeatUnits = $("#planRepeatUnits").val();
    _plannerShowWhat = $("#plannerShowWhat").val();

    const planFromWhen = $("#planFromWhen").val();
    const now = new Date();
    switch (planFromWhen) {
      case "by0":
        _startGDate = new Date(_holyDaysEngine.getGDate(getBadiYear(now), 1, 1).getTime());
        break;
      case "by1":
        _startGDate = new Date(_holyDaysEngine.getGDate(getBadiYear(now) + 1, 1, 1).getTime());
        break;
      // case 'today':
      default:
        _startGDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
    }

    const planUntilNum = +$("#planUntilNum").val();
    const planUntilUnits = $("#planUntilUnits").val();
    _endGDate = new Date(_startGDate.getTime());
    switch (planUntilUnits) {
      case "y":
        _endGDate.setFullYear(_startGDate.getFullYear() + planUntilNum);
        break;
      default:
        _endGDate.setFullYear(_startGDate.getFullYear(), 3);
        break;
    }

    const planWhat = $("#planWhat").val();
    switch (planWhat) {
      case "event1":
      case "event2":
        planEvent1(planWhat);
        break;
    }

    saveInputs();
  }

  function saveInputs() {
    putInStorageSyncAsync(syncStorageKey.planWhat, $("#planWhat").val());
    $(".plannerInputs select").each((i, el) => {
      putInStorageLocalAsync(`planner_${el.id}`, $(el).val());
    });
  }

  async function recallInputsAsync() {
    $("#planWhat")
      .val(await getFromStorageSyncAsync(syncStorageKey.planWhat))
      .trigger("adjust");

    $(".plannerInputs select").each(async (i, el) => {
      const value = await getFromStorageLocalAsync(`planner_${el.id}`);
      if (typeof value !== "undefined") {
        const ddl = $(el);
        ddl.val(value);
      }
      if (el.selectedIndex === -1) {
        el.selectedIndex = 0;
      }
    });
  }

  function addColSet(cells, frag, targetDi) {
    const displayDate = `{${frag}Year}-{${frag}Month00}-{${frag}Day00}`.filledWith(targetDi);
    const excelDate = ""; //('{' + frag + 'Month00}/{' + frag + 'Day00}/{' + frag + 'Year}').filledWith(targetDi);

    cells.push('<td class=plannerDate data-csv="{1}">{0}</td>'.filledWith(displayDate, excelDate));
    cells.push(`<td>{${frag}WeekdayShort}</td>`.filledWith(targetDi));
  }

  function planEvent1(selectMode) {
    const plannerWhatEvent = $("#plannerWhatEvents").val() || "";

    const startBDate = _holyDaysEngine.getBDate(_startGDate);
    const endBDate = _holyDaysEngine.getBDate(_endGDate);
    const results = [];
    let targetYear = startBDate.y;
    let yearShown = 0;
    while (targetYear <= endBDate.y) {
      const dayInfos = _holyDaysEngine.prepareDateInfos(targetYear);
      dayInfos.forEach((dayInfo) => {
        let name = "";
        if (plannerWhatEvent === dayInfo.NameEn || plannerWhatEvent.includes(dayInfo.NameEn)) {
          // HD
          name = getMessage(dayInfo.NameEn);
        } else if (plannerWhatEvent === `M_${dayInfo.MonthNum}` || plannerWhatEvent.includes(`M_${dayInfo.MonthNum}`)) {
          // month
          name = getMessage("FeastOf").filledWith(bMonthNamePri[dayInfo.MonthNum]);
        } else {
          return;
        }
        const targetDi = getDateInfo(dayInfo.GDate);

        if (targetDi.frag2 < _startGDate) {
          return;
        }
        if (targetDi.frag2 > _endGDate) {
          return;
        }

        const thisYear = targetDi.bYear;
        const cells = [
          "<td>{0}</td>".filledWith(name),
          '<td class="{1}">{0}</td>'.filledWith(thisYear, selectMode === "event2" && thisYear !== yearShown ? "plannerNewYear" : ""),
        ];
        yearShown = thisYear;

        switch (_plannerShowWhat) {
          case "both":
            addColSet(cells, "frag1", targetDi);
            addColSet(cells, "frag2", targetDi);
            break;
          default:
            addColSet(cells, _plannerShowWhat, targetDi);
            break;
        }

        cells.push("<td>{startingSunsetDesc}</td>".filledWith(targetDi));

        results.push(`<tr>${cells.join("")}</tr>`);
      });

      targetYear++;
    }

    const th1 = ["<th colspan=2></th>"];
    const th2 = ["<th>{0}</th>".filledWith("Event"), "<th>{0}</th>".filledWith("Year")];

    switch (_plannerShowWhat) {
      case "both": {
        const frag1 = $('#plannerShowWhat option[value="{0}"]'.filledWith("frag1")).text();
        const frag2 = $('#plannerShowWhat option[value="{0}"]'.filledWith("frag2")).text();

        th1.push("<th class=plannerThTitle colspan=2>{0}</th>".filledWith(frag1));
        th2.push('<th title="{1}">{0}</th>'.filledWith("Date", frag1));
        th2.push('<th title="{1}">{0}</th>'.filledWith("Weekday", frag1));

        th1.push("<th class=plannerThTitle colspan=2>{0}</th>".filledWith(frag2));
        th2.push('<th title="{1}">{0}</th>'.filledWith("Date", frag2));
        th2.push('<th title="{1}">{0}</th>'.filledWith("Weekday", frag2));
        break;
      }
      default: {
        const fragSingle = $('#plannerShowWhat option[value="{0}"]'.filledWith(_plannerShowWhat)).text();
        th1.push("<th class=plannerThTitle colspan=2>{0}</th>".filledWith(fragSingle));
        th2.push('<th title="{1}">{0}</th>'.filledWith("Date", fragSingle));
        th2.push('<th title="{1}">{0}</th>'.filledWith("Weekday", fragSingle));
        break;
      }
    }
    const locationHeader = getMessage("plannerStartSunsetForLocation").filledWith(common.locationName);
    th1.push("<th rowspan=2>{0}</th>".filledWith(locationHeader));
    th2.push('<th style="display:none" title="{0}"></th>'.filledWith(locationHeader));

    $("#plannerResultsHead").html([`<tr>${th1.join("")}</tr>`, `<tr class=plannerHeaders>${th2.join("")}</tr>`].join(""));
    $("#plannerResultsBody").html(results.join(""));
  }

  function fillInputs() {
    const dayInfos = _holyDaysEngine.prepareDateInfos(_di.bYear); // can be any year... use current
    const hdOptions = [];
    const fOptions = [];
    dayInfos.forEach((dayInfo) => {
      switch (dayInfo.Type[0]) {
        case "H":
          hdOptions.push({ t: getMessage(dayInfo.NameEn), v: dayInfo.NameEn });
          break;
        case "M":
          fOptions.push({
            t: getMessage("FeastOf").filledWith(bMonthNamePri[dayInfo.MonthNum]),
            v: `M_${dayInfo.MonthNum}`,
          });
          break;
      }
    });
    $("#planWhatHdGroup").html("<option value={v}>{t}</option>".filledWithEach(hdOptions));
    $("#planWhatFeastGroup").html("<option value={v}>{t}</option>".filledWithEach(fOptions));

    $("#planUntilNum").html('<option value="{0}">{0}</option>'.filledWithEach($.map($(Array(19)), (val, i) => 1 + i)));
  }

  async function startupAsync() {
    fillInputs();
    // some defaults
    $("#planUntilNum").val(5);

    attachHandlers();
    await recallInputsAsync();

    $("#planWhat").trigger("adjust");
    generate();
  }

  async function resetPageForLanguageChangeAsync() {
    fillInputs();
    await recallInputsAsync();
    $("#planWhat").trigger("adjust");
    generate();
  }

  function exportCsv() {
    const lines = [];
    let line = [];

    const addLine = () => {
      lines.push(line.join());
      line = [];
    };

    $("#plannerResultsHead .plannerHeaders th").each((i, el) => {
      const th = $(el);
      const title = th.attr("title") || null;
      const text = th.text();
      line.push(quotedForCsv([title, text].join(" ")));
    });
    addLine();

    $("#plannerResultsBody tr").each((i, tr) => {
      $(tr)
        .find("td")
        .each((j, td) => {
          const td$ = $(td);
          const text = td$.data("csv") || td$.text();
          line.push(quotedForCsv(text));
        });
      addLine();
    });

    // done... now download csv file
    // https://tools.ietf.org/html/rfc4180
    downloadAsFile(lines, `${getMessage("pick_pagePlanner")}.csv`, "text/csv");
  }

  function downloadAsFile(lines, filename, mimeType) {
    //works great in Chrome. Should be okay in FF. If not, try https://github.com/glittle/download
    const element = document.createElement("a");

    const rawText = encodeURIComponent(lines.join("\r\n"));
    //var rawText = lines.join('\r\n');

    //;charset=utf-8
    element.setAttribute("href", `${"data:{0};charset=utf-8,".filledWith(mimeType)}\ufeff${rawText}`);
    element.setAttribute("download", filename);

    element.style.display = "none";
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
  }

  function quotedForCsv(s) {
    const s2 = $.trim(s);
    if (s2.search('"') !== -1 || s2.search(",") !== -1) {
      return `"${s2.replace(/"/g, '""')}"`;
    }
    return s2;
  }

  function attachHandlers() {
    $("#btnPlanGenerate").click(generate);
    $("#btnPlannerExportCsv").click(exportCsv);
    $("#planWhat").on("change adjust", (ev) => {
      _inPlanWhatChangeHandler = ev.type === "adjust";
      const ddl = $("#plannerWhatEvents");
      switch ($(ev.target).val()) {
        case "event1":
          ddl[0].size = 1;
          ddl.prop("multiple", false);
          $(".plannerWhatHelpers").hide();
          break;
        case "event2":
          ddl[0].size = 15;
          ddl.prop("multiple", true);
          $(".plannerWhatHelpers").show();
          break;
      }

      generate();
      _inPlanWhatChangeHandler = false;
    });

    $(".plannerWhatHelpers button").click((ev) => {
      const btnId = ev.target.id;
      $("#plannerWhatEvents option").each((i, opt) => {
        switch (btnId) {
          case "btnPlannerHelperHD1":
            opt.selected = i < 9;
            break;
          case "btnPlannerHelperHD2":
            opt.selected = i < 11;
            break;
          case "btnPlannerHelperRid":
            opt.selected = opt.value.search("HolyDay_Ridvan") !== -1;
            break;
          case "btnPlannerHelperTHB":
            opt.selected = opt.value.search("HolyDay_Birth") !== -1;
            break;
          case "btnPlannerHelperFeasts":
            opt.selected = i > 10;
            break;
          case "btnPlannerHelperNone":
            opt.selected = false;
            break;
        }
      });
      setTimeout(() => {
        generate();
      }, 0);
    });
    $(".plannerInputs select").change(() => {
      generate();
    });
  }

  startupAsync();

  return {
    resetPageForLanguageChangeAsync: resetPageForLanguageChangeAsync,
  };
};
