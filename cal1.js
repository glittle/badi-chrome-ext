const Cal1 = (originalDi, originalHost) => {
  let host = originalHost;
  let di = originalDi;

  let _yearShown = null;
  const gDaySerial = "{currentYear}{currentMonth01}{currentDay00}";

  if (typeof di === "undefined") {
    host = window.top;
    di = host._di;
  } else {
    host = window;
  }

  function preparePage() {
    attachHandlers();
  }

  function attachHandlers() {
    //$('#btnClose').on('click', function () {
    //  host.hideCal1();
    //});
    //$('#btnReload').on('click', function () {
    //  window.location.reload();
    //});
    //$('#btnPrint').on('click', function () {
    //  window.print();
    //});
    $("#pageCal1 .months").on("click", ".bd", clickBd);
  }

  function clickBd(ev) {
    const dayDiv = $(ev.target).closest("div.bd");
    const monthDiv = dayDiv.closest("div.bm");
    const day = getNum(dayDiv, "bd");
    const month = getNum(monthDiv, "bm");

    const gDate = _holyDaysEngine.getGDate(di.bYear, month, day, di.bNow.eve);

    setFocusTime(gDate);
    refreshDateInfo();
    showInfo(_di);
  }

  function getNum(el, prefix) {
    const classes = el.attr("class").split(" ");
    const len = prefix.length;
    for (let i = 0; i < classes.length; i++) {
      const className = classes[i];
      if (className.length > len && className.substring(0, len) === prefix) {
        return +className.substring(len);
      }
    }
    return 0;
  }

  function showCalendar(newDi) {
    di = newDi;
    if (newDi.bYear !== _yearShown) {
      _holyDaysEngine.prepareDateInfos(newDi.bYear);
      buildCalendar();
    }
    highlightTargetDay();
  }

  function highlightTargetDay() {
    const cal = $("#pageCal1 .months");
    cal.find(".bd.selected, .gd.selected, .bm.selected").removeClass("selected");
    const sel = `.bm{bMonth}, .bm{bMonth} .bd{bDay}, .g${gDaySerial}`.filledWith(di);
    cal.find(sel).addClass("selected");
  }

  function buildCalendar() {
    _yearShown = di.bYear;

    const html = [];
    let gMonthAlt = 0;
    let lastMGroup = -1;
    let doneAyyamiHa = false;

    for (let bm = 1; bm <= 19; bm++) {
      if (bm === 1 && doneAyyamiHa) {
        bm = 19;
      }
      if (bm === 19 && !doneAyyamiHa) {
        bm = 0;
        doneAyyamiHa = true;
      }

      const monthGroup = [];
      const mGroup = getElementNum(bm);

      // outer
      monthGroup.push('<div class="month">'.filledWith(bm));

      const bMonthHtml = [];
      const gMonthHtml = [];

      if (mGroup && mGroup !== lastMGroup) {
        lastMGroup = mGroup;
        monthGroup.push('<div class="element mGroup{1}">{0}</div>'.filledWith(host.elements[mGroup - 1], mGroup));
      }

      bMonthHtml.push('<div class="bm bm{0}">'.filledWith(bm));
      bMonthHtml.push("<div class=bmName><span><i>{^1}</i>{0}</span></div>".filledWith(host.bMonthNamePri[bm], bm === 0 ? "" : bm));

      gMonthHtml.push("<div class=gm>");

      let gd = _holyDaysEngine.getGDate(di.bYear, bm, 1, false);
      let gMonthName = host.gMonthShort[gd.getMonth()];
      gMonthHtml.push('<div class="gmInitial gma0">{0}</div>'.filledWith(gMonthName));

      for (let bd = 1; bd <= 19; bd++) {
        //try {
        gd = _holyDaysEngine.getGDate(di.bYear, bm, bd, false);
        //}
        if (!gd) {
          //          if (bm === 0 && e == 'invalid Badi date') {
          break;
          //          }
          //          else {
          //            throw e;
          //          }
        }
        const holyDay = getHolyDay(bm, bd);
        let holyDayMarker = "";
        let bdTip = "";
        if (holyDay) {
          holyDayMarker = "<img class=hd{0} src='star{0}.svg'>".filledWith(holyDay.Type);
          bdTip = ` title="${getMessage(holyDay.NameEn)}"`;
        }

        const gDayOfMonth = gd.getDate();

        const dow = gd.getDay();

        bMonthHtml.push('<div class="bd bd{0} dow{1} mGroup{2}"{^4}><b>{0}</b>{^3}</div>'.filledWith(bd, dow, mGroup, holyDayMarker, bdTip));

        const gDayClass = gDaySerial.filledWith({
          currentYear: gd.getFullYear(),
          currentMonth01: digitPad2(gd.getMonth() + 1),
          currentDay00: digitPad2(gDayOfMonth),
        });

        if (gDayOfMonth === 1 && bd !== 1) {
          gMonthName = host.gMonthShort[gd.getMonth()];
          gMonthAlt = 1 - gMonthAlt;
          gMonthHtml.push(`<div class="gd gd1 dow${dow} gma${gMonthAlt}${bd === 19 ? " gLast" : ""} g${gDayClass}"><i>${gMonthName} 1</i></div>`);
        } else {
          gMonthHtml.push(
            `<div class="gd dow${dow}${gDayOfMonth === 1 && bd !== 1 ? " gd1" : ""}${gDayOfMonth % 2 ? " gAlt" : ""} gma${gMonthAlt}${
              bd === 19 ? " gLast" : ""
            } g${gDayClass}"><b>${gDayOfMonth}</b>${host.gWeekdayShort[dow]}</div>`
          );
        }
      }

      bMonthHtml.push("</div>");
      gMonthHtml.push("</div>");

      monthGroup.push(bMonthHtml.join(""));
      monthGroup.push(gMonthHtml.join(""));

      monthGroup.push("</div>");

      html.push(monthGroup.join(""));
    }

    $("#pageCal1 .months").html(html.join(""));
  }

  function getHolyDay(m, d) {
    const events = _cachedDateInfos[di.bYear];

    //if (!events) {
    //  prepareDateInfos(di.bYear);
    //}

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event.BMonthDay.m === m) {
        if (event.BMonthDay.d === d && event.Type.substring(0, 1) === "H") {
          return event;
        }
      }
      if (event.MonthNum > m) {
        return null;
      }
    }
  }

  preparePage();

  return {
    showCalendar: showCalendar,
    resetPageForLanguageChange: () => {
      _yearShown = -1;
    },
    di: di,
  };
};

//if (top != window) {
//  $(function () {
//    var cal1 = Cal1();
//    cal1.showCalendar();
//  });
//}
