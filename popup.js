/* Code by Glen Little */
/* global getMessage */
/* global knownDateInfos */
/* global di */
/* global _initialDiStamp */
/* global _currentPageId */
/* global chrome */
/* global common.languageCode */
/* global $ */

console.log("Popup.js starting");
const _inPopupPage = true;

browser.runtime
  .sendMessage({ action: "Wake Up" })
  .then((response) => {
    console.log("Woke up service worker:", response.message);
    // console.log(_rawMessages, _cachedMessages);
    // future optimization - load the loaded language info here
  })
  .catch((msg) => console.log("Error waking up service worker:", msg));

let _showingInfo = false;
let _changingBDate = false;
let _currentPageNum = 0;
let _cal1 = null;
let _cal2 = null;
let _cal3 = null;
let _calWheel = null;
let _calGreg = null;
let _pageReminders = null;
let _pageExporter = null;
let _pagePlanner = null;
let _pageCustom = null;
let _enableSampleKeys = true;
let _enableDayKeysLR = true;
let _enableDayKeysUD = true;
let _upDownKeyDelta = null;
let _pageHitTimeout = null;
let _initialStartupDone = false;
let _loadingNum = 0;
// let _lastLoadingTime = null;
// let _lastLoadingComment = null;
let _inTab = false;
const _pageIdList = [];

const _remindersEnabled = browserHostType === browserType.Chrome;

browser.tabs.getCurrent().then((tab) => {
  console.log("Current tab:", tab);
  if (tab) {
    _inTab = true;
    $("body").addClass("inTab");
  }
});

function attachHandlersInPopup() {
  $("#samples").on("click", "button", copySample);
  $(".btnChangeDay").on("click", changeDay);
  $(".btnChangeYear").on("click", changeYear);

  $(".btnJumpTo").on("click", moveDays);
  $(".btnJumpToday").on("click", () => {
    changeDay(null, 0);
  });
  $(".jumpTo").val(common.jumpTo);

  $(".bDatePickerInputs input, .bYearPicker").on("change paste keydown keypress", changeToBDate);
  $(".bKullishayPicker, .bVahidPicker, .bYearInVahidPicker").on("change paste keydown keypress", changeInVahid);

  $("#btnEveOrDay").on("click", toggleEveOrDay);
  $("#datePicker").on("change", jumpToDate);
  $("#eventStart").on("change", (ev) => {
    const value = $(ev.target).val();
    putInStorageSyncAsync(syncStorageKey.eventStart, value);
    common.eventStart = value;
    _lastSpecialDaysYear = 0;
    BuildSpecialDaysTable(_di);
    $(".eventTime").effect("highlight", 1000);
  });
  $(".includeThis").on("change, click", SetFiltersForSpecialDaysTable);

  $(".btnRetry").on("click", () => {
    $(".setupPlace .place").text(""); //blank the copy on the setup page
    $(".btnRetry").addClass("active").blur();
    common.locationNameKnown = false;
    startGettingLocation();
  });
  $("#datePicker").on("keydown", (ev) => {
    ev.stopPropagation();
  });
  $(".selectPages").on("click", "button", changePage);
  $(document).on("keydown", keyPressed);
  //$('#btnOpen').click(function () {
  //  browser.tabs.create({ active: true, url: this.href });
  //});

  $("#cbShowPointer").on("change", (ev) => {
    putInStorageSyncAsync(syncStorageKey.showPointer, $(ev.target).prop("checked"));
    _calWheel.showCalendar(_di);
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    // the service worker is also listening for this, so it can update the badge
    // we just refresh the date info and update our display
    console.log("Alarm triggered in popup:", alarm.name, new Date(alarm.scheduledTime));
    browser.alarms.clear(alarm.name).then((wasCleared) => {
      console.log("Cleared in popup:", wasCleared);
    });
    refreshDateInfoAndShowAsync();
  });

  $("#btnOpen").click(openInTab);
  $("#btnPrint").click(() => {
    window.print();
  });

  $(".setupPlace")
    .on("paste keydown keypress", "input", () => {
      updateLocationAsync(false);
    })
    .on("change", "input", () => {
      updateLocationAsync(true);
    });

  $("input:radio[name=language]").click((ev) => {
    common.useArNames = ev.target.value === "Ar";
    ApplyLanguage();
  });

  $("#setupLang").on("change", langSelectChanged);
}

function ApplyLanguage() {
  UpdateLanguageBtn();
  putInStorageSyncAsync(syncStorageKey.useArNames, common.useArNames);
  tracker.sendEvent("useArabic", common.useArNames);

  _knownDateInfos = {};
  resetForLanguageChange();
  refreshDateInfoAndShowAsync();

  // find and update some html
  $("*[data-msg-di]").each((i, el) => {
    localizeHtml($(el).parent());
  });
}

let sampleNum = 0;
let showInfoDelay = null;

function showInfo(di) {
  // debugger;

  _showingInfo = true;
  clearTimeout(showInfoDelay);

  getUpcoming(di);
  updateSpecial(di);

  // show current page first, then the others
  updatePageContent(_currentPageId, di);

  updateSharedContent(di);

  showInfoDelay = setTimeout(() => {
    _pageIdList.forEach(async (id) => {
      if (id !== _currentPageId) {
        updatePageContent(id, di);
      }
    });
  }, 500);

  $("#day, #gDay").toggleClass("notToday", _di.stamp !== _initialDiStamp.stamp);

  _showingInfo = false;
}

function resetForLanguageChange() {
  setupLanguageChoice();
  _lastSpecialDaysYear = 0;
  _pageIdList.forEach((id) => {
    resetPageForLanguageChange(id);
  });
}

function updateSpecial(di) {
  $("#special1").hide();
  $("#special2").hide();
  if (di.special1) {
    $("#special1").html(di.special1).show();
    $("#day").addClass("withSpecial");
    if (di.special2) {
      $("#special2").html(` - ${di.special2}`).show();
    }
  } else {
    $("#special1").html("");
    $("#special2").html("");
    $("#day").removeClass("withSpecial");
  }
}

function updateSharedContent(di) {
  // debugger;
  $("#day").html(common.formatTopDay.filledWith(di));
  $("#sunset").html(di.nearestSunset);
  $("#gDay").html(getMessage("gTopDayDisplay", di));

  if (!_changingBDate) {
    $(".bYearPicker").val(di.bYear);
    $("#bMonthPicker").val(di.bMonth);
    $("#bDayPicker").val(di.bDay);
    $(".bKullishayPicker").val(di.bKullishay);
    $(".bVahidPicker").val(di.bVahid);
    $(".bYearInVahidPicker").val(di.bYearInVahid);
  }

  const manifest = browser.runtime.getManifest();
  $("#version").text(getMessage("version", manifest.version));

  //if (_initialStartupDone) {
  //  BuildSpecialDaysTable(di);
  //}

  showLocation();
}

function changePage(ev, delta) {
  if (ev) {
    const btn = $(ev.target);
    const id = btn.data("page");
    showPage(id);
  } else {
    const pageButtons = $(".selectPages button").filter(":visible");
    const lastPageNum = pageButtons.length - 1;
    let num = _currentPageNum;

    switch (delta) {
      case -1:
        if (num > 0) {
          num -= 1;
        } else {
          num = lastPageNum;
        }
        break;
      case 1:
        if (num < lastPageNum) {
          num += 1;
        } else {
          num = 0;
        }
        break;
    }

    showPage(pageButtons.eq(num).data("page"));
  }
}

function showPage(id) {
  id = id || _currentPageId || "pageDay";
  const pages = $(".page");
  const btns = $(".selectPages button").filter(":visible");
  const thisPage = pages.filter(`#${id}`);

  pages.css({
    visibility: "hidden",
  }); // reduce flicker?

  const other = ".vahidInputs"; // don't fit on any page... likely need to remove it
  const pageDay = "#gDay, #showUpcoming, .explains, .normal, #show, .iconArea, #special";
  const pageEvents = "#yearSelector, .iconArea, #specialDaysTitle";
  const pageCal1 = "#yearSelector, .JumpDays, #show, #gDay, #special";
  const pageCalWheel = "#yearSelector, #show, #gDay, #special, .iconArea";
  const pageCalGreg = "#yearSelector, .JumpDays, #show, #gDay, #special, .iconArea, .monthNav";
  const pageCal2 = "#yearSelector, .JumpDays, #show, #gDay, #special, .iconArea, .monthNav";
  const pageCal3 = "#yearSelector, .JumpDays, #show, #gDay, #special, .iconArea, .monthNav";
  const pageLists = "#gDay, #show, .iconArea, #special";
  const pageFast = "#yearSelector, .iconArea";
  const pageReminders = ".iconArea, #otherPageTitle";
  const pageExporter = "#yearSelector, .iconArea, #otherPageTitle";
  const pagePlanner = ".iconArea, #otherPageTitle";
  const pageCustom = "#yearSelector, .JumpDays, #show, #gDay, .iconArea, #special";
  const pageSetup = "#otherPageTitle, .iconArea";

  $(
    [
      other,
      pageDay,
      pageEvents,
      pageCal1,
      pageCalWheel,
      pageCalGreg,
      pageCal2,
      pageCal3,
      pageLists,
      pageFast,
      pageReminders,
      pageExporter,
      pagePlanner,
      pageSetup,
    ].join(",")
  ).hide();

  _currentPageId = id;
  btns.each((i, el) => {
    if ($(el).data("page") === id) {
      _currentPageNum = i;
      return false;
    }
  });

  if (thisPage.data("diStamp") !== _di.stamp) {
    updatePageContent(_currentPageId, _di);
    thisPage.data("diStamp", _di.stamp);
  }

  $("body").attr("data-pageid", id);
  switch (id) {
    case "pageDay":
      $(pageDay).show();
      _enableSampleKeys = true;
      _enableDayKeysLR = true;
      _enableDayKeysUD = false;
      break;

    case "pageEvents":
      $(pageEvents).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = false;
      _enableDayKeysUD = false;
      break;

    case "pageCal1":
      $(pageCal1).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = true;
      _enableDayKeysUD = true;
      _upDownKeyDelta = () => 19;
      break;

    case "pageCalWheel":
      $(pageCalWheel).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = true;
      _enableDayKeysUD = false;
      break;

    case "pageCalGreg":
      $(pageCalGreg).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = true;
      _enableDayKeysUD = true;
      _upDownKeyDelta = () => 7;
      break;

    case "pageCal2":
      $(pageCal2).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = true;
      _enableDayKeysUD = true;
      _upDownKeyDelta = (direction) => {
        const bDay = _di.bDay;
        const bMonth = _di.bMonth;
        if (bMonth === 0) {
          if (direction === -1) {
            return 6;
          }
          //log_holyDays.daysInAyyamiHa(_di.bYear));
          return _holyDaysEngine.daysInAyyamiHa(_di.bYear) - (bDay > 3 ? 1 + _holyDaysEngine.daysInAyyamiHa(_di.bYear) - bDay : 0);
        }
        switch (direction) {
          case -1: // up
            if (bDay <= 3) {
              if (bMonth === 19) {
                return _holyDaysEngine.daysInAyyamiHa(_di.bYear);
              }
              return 6;
            }
            if (bDay <= 6) {
              return 3;
            }
            if (bDay <= 11) {
              return 4;
            }
            if (bDay <= 12) {
              return 5;
            }
            return 6;

          case 1: // down
            if (bDay <= 3) {
              return 3;
            }
            if (bDay <= 7) {
              return 4;
            }
            if (bDay <= 16) {
              return 6;
            }
            return 19 + (bMonth === 18 ? _holyDaysEngine.daysInAyyamiHa(_di.bYear) : 3) - bDay;
        }
        return 0;
      };
      break;

    case "pageCal3":
      $(pageCal3).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = true;
      _enableDayKeysUD = true;
      _upDownKeyDelta = (direction) => {
        // let bDay = _di.bDay;
        // let bMonth = _di.bMonth;
        // if (bMonth === 0) {
        //     if (direction === -1) {
        //         return 7;
        //     }
        //     //log_holyDays.daysInAyyamiHa(_di.bYear));
        //     return_holyDays.daysInAyyamiHa(_di.bYear) - (bDay > 3 ? (1 +_holyDaysEngine.daysInAyyamiHa(_di.bYear) - bDay) : 0);
        // }
        switch (direction) {
          case -1: // up
            return 7;

          case 1: // down
            return 7;
        }
        return 0;
      };
      break;

    case "pageLists":
      $(pageLists).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = true;
      _enableDayKeysUD = false;
      break;

    case "pageFast":
      $(pageFast).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = false;
      _enableDayKeysUD = false;
      break;

    case "pageReminders":
      $(pageReminders).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = false;
      _enableDayKeysUD = false;
      break;

    case "pageExporter":
      $(pageExporter).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = true;
      _enableDayKeysUD = false;
      break;

    case "pagePlanner":
      $(pagePlanner).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = false;
      _enableDayKeysUD = false;
      break;

    case "pageCustom":
      $(pageCustom).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = true;
      _enableDayKeysUD = true;
      break;

    case "pageSetup":
      $(pageSetup).show();
      _enableSampleKeys = false;
      _enableDayKeysLR = false;
      _enableDayKeysUD = false;
      break;
  }

  btns.removeClass("showing");
  btns.filter('*[data-page="{0}"]'.filledWith(id)).addClass("showing");

  thisPage.show();
  pages.not(thisPage).hide();
  pages.css({
    visibility: "visible",
  });

  updatePageContentWhenVisible(_currentPageId, _di);

  putInStorageLocalAsync(localStorageKey.focusPage, id);
  putInStorageLocalAsync(localStorageKey.focusTimeAsOf, new Date().getTime());

  clearTimeout(_pageHitTimeout);

  // delay a bit, to ensure we are not just moving past this page
  if (tracker) {
    _pageHitTimeout = setTimeout(() => {
      tracker.sendAppView(id);
    }, 500);
  }
}

function updatePageContentWhenVisible(id, di) {
  switch (id) {
    case "pageCal1":
      $("#otherPageTitle").html(getMessage("yearWithEra", di));
      break;

    case "pageDay":
      adjustHeight();
      break;

    case "pageEvents":
      BuildSpecialDaysTable(_di);
      break;

    case "pageCalGreg":
      if (_calGreg) {
        _calGreg.scrollToMonth(di.currentMonth);
      }
      break;

    case "pageCal2":
      if (_cal2) {
        _cal2.scrollToMonth(di.bMonth, true);
      }
      break;

    case "pageCal3":
      if (_cal3) {
        _cal3.scrollToMonth(di.bMonth, true);
      }
      break;

    case "pageReminders":
      $("#otherPageTitle").html(getMessage("pick_pageReminders"));
      if (_pageReminders) {
        _pageReminders.showReminders();
      }
      break;

    case "pageExporter":
      $("#otherPageTitle").html(getMessage("exporterTitle"));
      break;

    case "pagePlanner":
      $("#otherPageTitle").html(getMessage("plannerTitle"));
      break;

    case "pageSetup":
      $("#otherPageTitle").html(getMessage("pick_pageSetup"));
      break;

    //        case 'pageCustom':
    //            break;
  }
}

function resetPageForLanguageChange(id) {
  switch (id) {
    case "pageCal1":
      if (_cal1) {
        _cal1.resetPageForLanguageChange();
      }
      break;
    case "pageCalWheel":
      if (_calWheel) {
        _calWheel.resetPageForLanguageChange();
      }
      break;
    case "pageCalGreg":
      if (_calGreg) {
        _calGreg.resetPageForLanguageChange();
      }
      break;
    case "pageCal2":
      if (_cal2) {
        _cal2.resetPageForLanguageChange();
      }
      break;
    case "pageCal3":
      if (_cal3) {
        _cal3.resetPageForLanguageChange();
      }
      break;
    case "pagePlanner":
      if (_pagePlanner) {
        _pagePlanner.resetPageForLanguageChangeAsync(); // not using await
      }
      break;
  }
}

function updatePageContent(id, di) {
  switch (id) {
    case "pageDay": {
      const makeObj = (key, name) => ({
        name: name || getMessage(key, di),
        value: getMessage(`${key}Format`, di),
      });
      const dayDetails = [
        makeObj("DayOfWeek"),
        makeObj("DayOfMonth"),
        {
          name: getMessage("Month"),
          value: getMessage(di.bMonth ? "MonthFormatNormal" : "MonthFormatAyyam", di),
        },
        makeObj("YearOfVahid"),
        makeObj("Vahid", di.VahidLabelPri),
        makeObj("Kullishay", di.KullishayLabelPri),
        makeObj("YearOfEra"),
      ];
      const explain1 = getMessage("shoghiExample", di);
      const explain2 = getMessage("example2", di);

      $("#upcoming").html(di.upcomingHtml);

      $("#explain").html(explain1);
      $("#explain2").html(explain2);
      $("#ayyamIs0").html(getMessage("ayyamIs0").filledWith(bMonthNamePri[0]));
      $("#dayDetails").html(`<dl>${"<dt>{^name}</dt><dd>{^value}</dd>".filledWithEach(dayDetails)}</dl>`);

      $("#gDate").html(getMessage("gregorianDateDisplay", di));
      $("#gDateDesc").html("({^currentRelationToSunset})".filledWith(di));
      $("button.today").toggleClass("notToday", di.stamp !== _initialDiStamp.stamp);
      $("#datePicker").val(di.currentDateString);

      addSamples(di);

      break;
    }

    case "pageEvents":
      BuildSpecialDaysTable(_di);
      break;

    case "pageCal1":
      if (_cal1) {
        _cal1.showCalendar(di);
      }
      break;

    case "pageCalWheel":
      if (_calWheel) {
        _calWheel.showCalendar(di);
      }
      break;

    case "pageCalGreg":
      if (_calGreg) {
        _calGreg.showCalendar(di);
      }
      break;

    case "pageCal2":
      if (_cal2) {
        _cal2.showCalendar(di);
      }
      break;

    case "pageCal3":
      if (_cal3) {
        _cal3.showCalendar(di);
      }
      break;

    case "pageLists":
      $("#pageLists table tr.selected").removeClass("selected");
      $("#pageLists table tr.selectedDay").removeClass("selectedDay");

      $(".yearListNum{bYearInVahid}, .monthListNum{bMonth}".filledWith(di)).addClass("selected");
      if (di.bMonth !== 0) {
        $(".dayListNum{bDay}, .weekdayListNum{bWeekday}".filledWith(di)).addClass("selectedDay");
      } else {
        // ayyam-i-ha
        $(".weekdayListNum{bWeekday}".filledWith(di)).addClass("selectedDay");
      }

      break;

    case "pageFast":
      BuildSpecialDaysTable(_di);
      break;

    case "pageReminders":
      //if (_pageReminders) {
      //  _pageReminders.showReminders();
      //}
      break;

    case "pageExporter":
      if (_pageExporter) {
        _pageExporter.updateYear(true);
      }
      break;

    case "pagePlanner":
      if (_pagePlanner) {
        //_pagePlanner.updateYear(true);
      }
      break;

    case "pageCustom":
      if (_pageCustom) {
        _pageCustom.updateDate();
      }
      break;
  }
}

function changeInVahid(ev) {
  if (_showingInfo) {
    return;
  }

  ev.cancelBubble = true;
  ev.stopPropagation();
  if (ev.type === "keydown") {
    return; // wait for keypress
  }

  let bKullishay = $(".bKullishayPicker").val();
  if (bKullishay === "") return;
  bKullishay = +bKullishay;

  let bVahid = $(".bVahidPicker").val();
  if (bVahid === "") return;
  bVahid = +bVahid;

  let bYearInVahid = $(".bYearInVahidPicker").val();
  if (bYearInVahid === "") return;
  bYearInVahid = +bYearInVahid;

  const maxKullishay = 3;

  // fix to our supported range
  if (bYearInVahid < 1) {
    bVahid--;
    if (bVahid < 1) {
      bKullishay--;
      if (bKullishay < 1) {
        bKullishay = 1;
      } else {
        bVahid = 19;
        bYearInVahid = 19;
      }
    } else {
      bYearInVahid = 19;
    }
  }
  if (bYearInVahid > 19) {
    bVahid++;
    if (bVahid > 19) {
      bKullishay++;
      if (bKullishay > maxKullishay) {
        bKullishay = maxKullishay;
      } else {
        bVahid = 1;
        bYearInVahid = 1;
      }
    } else {
      bYearInVahid = 1;
    }
  }

  if (bVahid < 1) {
    bKullishay--;
    if (bKullishay < 1) {
      bKullishay = 1;
    } else {
      bVahid = 19;
    }
  }
  if (bVahid > 19) {
    bKullishay++;
    if (bKullishay > maxKullishay) {
      bKullishay = maxKullishay;
    } else {
      bVahid = 1;
    }
  }

  if (bKullishay < 1) {
    bKullishay = 1;
  }
  if (bKullishay > maxKullishay) {
    bKullishay = maxKullishay;
  }

  tracker.sendEvent("changeInVahid", `${bKullishay}-${bVahid}-${bYearInVahid}`);

  const year = Math.min(1000, 19 * 19 * (bKullishay - 1) + 19 * (bVahid - 1) + bYearInVahid);
  changeYear(null, null, year);
}

function changeToBDate(ev) {
  if (_showingInfo) {
    return;
  }
  ev.cancelBubble = true;
  ev.stopPropagation();
  if (ev.type === "keydown") {
    return; // wait for keypress
  }

  const input = $(ev.target);
  let bYear = input.hasClass("bYearPicker") ? input.val() : $(".bYearPicker").val(); // we have 2... use this one
  if (bYear === "") return;
  bYear = +bYear;
  // fix to our supported range
  if (bYear < 1) bYear = 1;
  if (bYear > 1000) bYear = 1000;

  const bMonth = $("#bMonthPicker").val(); // month and day will be fixed by getGDate
  if (bMonth === "") return;

  const bDay = $("#bDayPicker").val();
  if (bDay === "") return;

  tracker.sendEvent("changeToBDate", `${bYear}.${bMonth}.${bDay}`);

  try {
    const gDate = _holyDaysEngine.getGDate(+bYear, +bMonth, +bDay, true);

    setFocusTime(gDate);

    refreshDateInfo();

    //    _changingBDate = true;
    showInfo(_di);
    _changingBDate = false;
  } catch (error) {
    console.log(error);
  }
}

function addSamples(di) {
  // prepare samples
  clearSamples();

  let msg;
  const notInMessagesJson = "_$$$_";
  if (_pageCustom) {
    _pageCustom.clearFromFirstPage();
  }

  const sampleGroupNum = 1;
  for (let sampleNum = 1; sampleNum < 30; sampleNum++) {
    const key = "sampleGroup{0}_{1}".filledWith(sampleGroupNum, sampleNum);
    msg = getMessage(key, di, notInMessagesJson);
    if (msg === notInMessagesJson) {
      continue;
    }
    addSample(msg, getMessage(key), sampleGroupNum);
  }
  if (_pageCustom) {
    _pageCustom.updateFirstPage();
  }

  //$('#sampleFootnote').toggle(showFootnote);
  //<div id=sampleFootnote data-msg="_id_"></div>
}

function keyPressed(ev) {
  if (ev.altKey) {
    return;
  }

  if (ev.target.tagName === "INPUT" && ev.target.type === "text") {
    //don't intercept in text
    return;
  }
  const key = String.fromCharCode(ev.which) || "";
  // console.log(key, ev.which, ev.ctrlKey, ev.shiftKey, ev.altKey, ev.metaKey, ev.target.tagName, ev.target.type);
  switch (ev.which) {
    // case 65:
    //   // Alt+A -- change lang to/from Arabic - mostly for during development and demos, not translatable
    //   if (ev.altKey) {
    //     common.useArNames = !common.useArNames;
    //     ApplyLanguage();
    //     ev.preventDefault();
    //     return;
    //   }
    //   break;

    case 18:
      return; // 08 (ALT) causes a crashes

    case 37: //left
      if (ev.shiftKey) {
        changeYear(null, -1);
        ev.preventDefault();
      } else {
        if (ev.ctrlKey) {
          changeDay(null, -7);
          ev.preventDefault();
        } else {
          if (_enableDayKeysLR) {
            changeDay(null, -1);
            ev.preventDefault();
          }
        }
      }
      return;
    case 39: //right
      if (ev.shiftKey) {
        changeYear(null, 1);
        ev.preventDefault();
      } else {
        if (ev.ctrlKey) {
          changeDay(null, 7);
          ev.preventDefault();
        } else {
          if (_enableDayKeysLR) {
            changeDay(null, 1);
            ev.preventDefault();
          }
        }
      }
      return;

    case 38: //up
      if (_enableDayKeysUD) {
        if (_upDownKeyDelta) {
          changeDay(null, 0 - _upDownKeyDelta(-1));
          ev.preventDefault();
        }
      }
      return;
    case 40: //down
      if (_enableDayKeysUD) {
        if (_upDownKeyDelta) {
          changeDay(null, _upDownKeyDelta(1));
          ev.preventDefault();
        }
      }
      return;

    case 33: //pgup
      changePage(null, -1);
      ev.preventDefault();
      return;
    case 34: //pgdn
      changePage(null, 1);
      ev.preventDefault();
      return;

    case 36: //home
      changeDay(null, 0);
      ev.preventDefault();
      return;

    case 191: // slash
      toggleEveOrDay(!_di.bNow.eve);
      ev.preventDefault();
      return;
  }

  //log(ev.which);
  if (_enableSampleKeys && !ev.ctrlKey) {
    try {
      const sample = $(`#key${key}`);
      if (sample.length) {
        sample.trigger("click"); // effective if a used letter is typed
        ev.preventDefault();
      }
    } catch (ex) {
      // ignore jquery error
    }
  }

  if (_currentPageId === "pageEvents") {
    // don't require ALT...
    try {
      $(`input[accessKey=${key}]`, "#pageEvents").click();
      $(`select[accessKey=${key}]`, "#pageEvents").click();
    } catch (e) {
      // key may have odd symbol in it
    }
  }

  if (key === getMessage("keyToOpenInTab") && ev.shiftKey) {
    openInTab();
  }

  if (ev.target.tagName !== "INPUT" && ev.target.tagName !== "TEXTAREA") {
    let pageNum = +key;
    const keyCode = key.charCodeAt(0);
    // biome-ignore lint/suspicious/noDoubleEquals: <explanation>
    let validPagePicker = key == pageNum && keyCode > 32; // don't use ===
    if (!validPagePicker) {
      if (key >= "a" && key <= "i") {
        pageNum = keyCode - 96;
        validPagePicker = true;
      }

      let extraKeys;
      switch (browserHostType) {
        case browserType.Chrome:
          extraKeys = {
            dash: 189,
            equal: 187,
          };
          break;
        case browserType.Firefox:
          extraKeys = {
            dash: 173,
            equal: 61,
          };
          break;
      }
      if (ev.which === extraKeys.dash) {
        // -  (next after 8,9,0...)
        pageNum = 11;
        validPagePicker = true;
      }
      if (ev.which === extraKeys.equal) {
        // =  (next after 8,9,0...)
        pageNum = 12;
        validPagePicker = true;
      }
      //log(ev.which);
    }

    if (validPagePicker) {
      if (pageNum === 0) {
        pageNum = 10;
      }
      const pageButtons = $(".selectPages button").filter(":visible");
      if (pageNum > 0 && pageNum <= pageButtons.length) {
        const id = pageButtons.eq(pageNum - 1).data("page");
        showPage(id);
      }
    }
  }

  return;
}

function addSample(info, format, group) {
  sampleNum++;

  const letter = String.fromCharCode(64 + sampleNum);
  const sample = {
    value: "",
    currentTime: false,
    letter: letter,
    tooltip: getMessage("pressKeyOrClick", letter),
  };

  if (typeof info === "string") {
    sample.value = info;
  } else {
    Object.assign(sample, info);
  }
  sample.currentNote = sample.currentTime ? " *" : "";

  if (_pageCustom) {
    _pageCustom.addFromFirstPage(letter, format);
  }

  // also in pageCustom
  $("#samples")
    .find(`#sampleList${group}`)
    .append(
      (
        '<div><button title="{tooltip}"' +
        ' type=button data-letter={letter} id="key{letter}">{letter}{currentNote}</button>' +
        " <span>{^value}</span></div>"
      ).filledWith(sample)
    );
}

function clearSamples() {
  sampleNum = 0;
  const samplesDiv = $("#samples");
  samplesDiv.find("#sampleList1").text("");
  //samplesDiv.find('#sampleList2').text('');
}

function copySample(ev) {
  const btn = $(ev.target);
  const letter = btn.text();
  tracker.sendEvent("sample", letter);

  const div = btn.closest("div");
  const text = div.find("span").text();
  $("#sampleCopy").val(text).focus().select();
  document.execCommand("copy");

  div.addClass("copied");
  btn.text(getMessage("copied"));
  setTimeout(() => {
    div.removeClass("copied");
    btn.text(btn.data("letter"));
    if (!_inTab) {
      window.close();
    }
  }, 1000);
}

function toggleEveOrDay(toEve) {
  setFocusTime(getFocusTime());
  const toEve2 = typeof toEve === "boolean" ? toEve : !_di.bNow.eve;
  if (toEve2) {
    _focusTime.setHours(23, 55, 0, 0);
  } else {
    _focusTime.setHours(12, 0, 0, 0);
  }

  putInStorageLocalAsync(localStorageKey.focusTimeIsEve, toEve2);
  if (tracker) {
    tracker.sendEvent("toggleEveDay", toEve2 ? "Eve" : "Day");
  }

  refreshDateInfo();
  showInfo(_di);
}

function moveDays(ev) {
  const input = $("input.jumpTo");
  let days = +input.val();
  if (!days) {
    days = 0;
    input.val(days);
  } else {
    const min = +input.attr("min");
    if (days < min) {
      days = min;
      input.val(days);
    } else {
      const max = +input.attr("max");
      if (days > max) {
        days = max;
        input.val(days);
      }
    }
  }
  putInStorageSyncAsync(syncStorageKey.jumpTo, days);
  tracker.sendEvent("jumpDays", days);

  if (!days) {
    return;
  }
  const target = new Date(_di.currentTime);
  target.setTime(target.getTime() + days * 864e5);
  setFocusTime(target);
  refreshDateInfo();
  showInfo(_di);
}

function jumpToDate(ev) {
  const date = dayjs($(ev.target).val()).toDate();
  if (!Number.isNaN(date)) {
    setFocusTime(date);

    refreshDateInfo();
    showInfo(_di);
  }
}

function changeYear(ev, delta, targetYear) {
  const delta2 = ev ? +$(ev.target).data("delta") : +delta;

  const year = targetYear ? targetYear : _di.bYear + delta2;
  const gDate = _holyDaysEngine.getGDate(year, _di.bMonth, _di.bDay, true);
  setFocusTime(gDate);

  tracker.sendEvent("changeYear", delta2);

  refreshDateInfo();
  showInfo(_di);
}

function changeDay(ev, delta) {
  const delta2 = ev ? +$(ev.target).data("delta") : +delta;

  if (delta2 === 0) {
    // reset to real time
    putInStorageLocalAsync(localStorageKey.focusTimeIsEve, null);
    setFocusTime(new Date());
  } else {
    const time = getFocusTime();
    if (_di.bNow.eve) {
      time.setHours(23, 55, 0, 0);
    } else {
      time.setHours(12, 0, 0, 0);
    }
    time.setDate(time.getDate() + delta2);
    setFocusTime(time);
  }

  if (tracker) {
    tracker.sendEvent("changeDay", delta2);
  }

  refreshDateInfo();

  if (_di.stamp === _initialDiStamp.stamp) {
    putInStorageLocalAsync(localStorageKey.focusTimeIsEve, null);
  }

  if (_di.bNow.eve) {
    _focusTime.setHours(23, 55, 0, 0);
  } else {
    _focusTime.setHours(12, 0, 0, 0);
  }

  showInfo(_di);

  if (delta2 === 0) {
    showWhenResetToNow();
  }
}

function showWhenResetToNow() {
  _initialDiStamp = getDateInfo(new Date(), true);
  if (_cal2) {
    _cal2.showTodayTime();
  }
  if (_cal3) {
    _cal3.showTodayTime();
  }
}

function fillSetup() {
  const optedOut = common.optedOutOfGoogleAnalytics === true;
  const cb = $("#setupOptOut");
  cb.prop("checked", optedOut);
  cb.on("change", () => {
    const optingOut = cb.prop("checked");
    if (optingOut) {
      tracker.sendEvent("optOut", optingOut);
    }
    putInStorageSyncAsync(syncStorageKey.optOutGa, optingOut);
    common.optedOutOfGoogleAnalytics = optingOut;

    if (!optingOut) {
      tracker.sendEvent("optOut", optingOut);
    }
  });

  const langInput = $("#setupLang");
  startFillingLanguageInput(langInput);
  // console.log('finished call to start filling')

  const colorInput = $("#setupColor");
  colorInput.val(common.iconTextColor);
  colorInput.on("change", () => {
    const newColor = colorInput.val();
    putInStorageLocalAsync(localStorageKey.iconTextColor, newColor);
    common.iconTextColor = newColor;
    showIcon();
  });

  $("#inputLat").val(common.locationLat);
  $("#inputLng").val(common.locationLong);
}

/**
 * Scan all the language files and fill the language select
 * @param {*} select
 */
function startFillingLanguageInput(select) {
  const langs = [];

  browser.runtime.getPackageDirectoryEntry().then((directoryEntry) => {
    directoryEntry.getDirectory("_locales", {}, (subDirectoryEntry) => {
      const directoryReader = subDirectoryEntry.createReader();
      directoryReader.readEntries(async (entries) => {
        for (let i = 0; i < entries.length; ++i) {
          const langToLoad = entries[i].name;

          const url = `/_locales/${langToLoad}/messages.json`;

          const messages = await loadJsonfileAsync(url);

          const langLocalMsg = messages.rbDefLang_Local;
          const name = langLocalMsg ? langLocalMsg.message : langToLoad;

          const enNameMsg = messages.translationEnglishName;
          const english = enNameMsg ? enNameMsg.message : "";

          const info = {
            code: langToLoad,
            name: name || "",
            english: english === name || english === langToLoad ? "" : english,
            pct: Math.round((Object.keys(messages).length / _numMessagesEn) * 100),
          };
          info.sort = info.english || info.name || info.code;
          langs.push(info);
        }

        const options = [];
        langs.sort((a, b) => (a.sort > b.sort ? 1 : -1));
        for (i = 0; i < langs.length; i++) {
          const info = langs[i];
          options.push(
            "<option value={0}>{3}{1} ... {0} ... {2}%</option>".filledWith(info.code, info.name, info.pct, info.english ? `${info.english} / ` : "")
          );
        }
        select.html(options.join(""));
        // console.log('lang list filled')

        select.val(common.languageCode);

        if (select[0].selectedIndex === -1) {
          // code was not in the list
          select.val("en");
        }

        const pctSpan = $("#setupLangPct");
        if (select.val() === "en") {
          pctSpan.hide();
        } else {
          const msg =
            _rawMessageTranslationPct === 100 ? getMessage("setupLangPct100") : getMessage("setupLangPct").filledWith(_rawMessageTranslationPct);
          pctSpan.html(msg).show();
        }

        langSelectChanged();
      });
    });
  });
}

function langSelectChanged() {
  const select = $("#setupLang");
  const lang = select.val();

  putInStorageSyncAsync(syncStorageKey.language, lang);

  if (lang === common.languageCode) {
    return;
  }

  browser.runtime.sendMessage({ action: "languageChanged" });

  // reload to apply new language?
  // location.reload(false);
  // biome-ignore lint/correctness/noSelfAssign: <explanation>
  location.href = location.href;
}

let updateLocationTimer = null;

async function updateLocationAsync(immediately) {
  if (!immediately) {
    clearTimeout(updateLocationTimer);
    updateLocationTimer = setTimeout(async () => {
      await updateLocationAsync(true);
    }, 1000);
    return;
  }

  const inputLat = $("#inputLat");
  let lat = +inputLat.val();

  const inputLng = $("#inputLng");
  let lng = +inputLng.val();

  if (lat === 0 || Math.abs(lat) > 85) {
    inputLat.addClass("error");
    lat = 0;
  }
  if (lng === 0 || Math.abs(lng) > 180) {
    inputLng.addClass("error");
    lng = 0;
  }
  if (lat === 0 || lng === 0) {
    return;
  }
  inputLat.removeClass("error");
  inputLng.removeClass("error");

  let updateNeeded = !common.locationNameKnown; // if we don't have the name, we need to get it
  if (common.locationLat !== lat) {
    common.locationLat = lat;
    putInStorageLocalAsync(localStorageKey.locationLat, lat);
    updateNeeded = true;
  }
  if (common.locationLong !== lng) {
    common.locationLong = lng;
    putInStorageLocalAsync(localStorageKey.locationLong, lng);
    updateNeeded = true;
  }

  if (updateNeeded) {
    _knownDateInfos = {};
    putInStorageLocalAsync(localStorageKey.locationKnown, true);
    common.locationKnown = true;
    putInStorageLocalAsync(localStorageKey.locationNameKnown, false);
    putInStorageLocalAsync(localStorageKey.locationName, getMessage("browserActionTitle")); // temp until we get it

    await startGetLocationNameAsync();

    // refreshDateInfoAndShowAsync();
  }
}

function fillStatic() {
  let nameList = [];
  let i;
  for (i = 1; i < bMonthNameAr.length; i++) {
    nameList.push({
      num: i,
      arabic: bMonthNameAr[i],
      meaning: bMonthMeaning[i],
    });
  }
  $("#monthListBody").html(
    '<tr class="dayListNum{num} monthListNum{num}"><td>{num}</td><td>{arabic}</td><td>{meaning}</td></tr>'.filledWithEach(nameList)
  );

  nameList = [];
  for (i = 1; i < bWeekdayNameAr.length; i++) {
    const gDay = i < 2 ? 5 + i : i - 2;
    const eveDay = gDay === 0 ? 6 : gDay - 1;
    nameList.push({
      num: i,
      arabic: bWeekdayNameAr[i],
      meaning: bWeekdayMeaning[i],
      equiv: `${gWeekdayShort[eveDay]}/${gWeekdayLong[gDay]}`,
    });
  }
  $("#weekdayListBody").html(
    "<tr class=weekdayListNum{num}><td>{num}</td><td>{arabic}</td><td>{meaning}</td><td>{equiv}</td></tr>".filledWithEach(nameList)
  );

  nameList = [];
  for (i = 1; i < bYearInVahidNameAr.length; i++) {
    nameList.push({
      num: i,
      arabic: bYearInVahidNameAr[i],
      meaning: bYearInVahidMeaning[i],
    });
  }
  $("#yearListBody").html("<tr class=yearListNum{num}><td>{num}</td><td>{arabic}</td><td>{meaning}</td></tr>".filledWithEach(nameList));
}

function fillEventStart() {
  // fill ddl
  const startTime = new Date(2000, 5, 5, 0, 0, 0, 0); // random day
  const startTimes = [];
  for (let h = 1800; h <= 2000; h += 100) {
    for (let m = 0; m <= 30; m += 30) {
      startTime.setHours(h / 100, m);
      startTimes.push({
        v: h + m,
        t: getTimeDisplay(startTime),
      });
      if (h === 2000) {
        break; // to end at 8pm
      }
    }
  }
  $("#eventStart").html("<option value={v}>{t}</option>".filledWithEach(startTimes)).val(common.eventStart);
}

function SetFiltersForSpecialDaysTable(ev) {
  let includeFeasts = $("#includeFeasts").prop("checked");
  let includeHolyDays = $("#includeHolyDays").prop("checked");

  if (!includeFeasts && !includeHolyDays) {
    if (ev) {
      // both turned off?  turn on one
      const clicked = $(ev.target).closest("input").attr("id");
      $(clicked === "includeFeasts" ? "#includeHolyDays" : "#includeFeasts").prop("checked", true);
    } else {
      //default to holy days
      $("#includeHolyDays").prop("checked", true);
    }
    includeFeasts = $("#includeFeasts").prop("checked");
    includeHolyDays = $("#includeHolyDays").prop("checked");
  }

  putInStorageSyncAsync(syncStorageKey.includeFeasts, includeFeasts);
  putInStorageSyncAsync(syncStorageKey.includeHolyDays, includeHolyDays);
  $("#specialListsTable").toggleClass("Feasts", includeFeasts).toggleClass("HolyDays", includeHolyDays);
}

let _lastSpecialDaysYear = 0;

function BuildSpecialDaysTable(di) {
  const year = di.bNow.y;
  if (_lastSpecialDaysYear === year) {
    return;
  }

  _lastSpecialDaysYear = year;
  const dayInfos = _holyDaysEngine.prepareDateInfos(year);

  SetFiltersForSpecialDaysTable();

  dayInfos.forEach((dayInfo, i) => {
    if (dayInfo.Type === "Today") {
      // an old version... remove Today from list
      dayInfos.splice(i, 1);
      i--;
    }
  });

  const defaultEventStart = $("#eventStart").val() || common.eventStart;

  dayInfos.forEach((dayInfo) => {
    const targetDi = getDateInfo(dayInfo.GDate);
    let tempDate = null;
    dayInfo.di = targetDi;
    dayInfo.D = `${targetDi.bMonthNamePri} ${targetDi.bDay}`;
    dayInfo.G = getMessage("evePartOfDay", targetDi);
    dayInfo.Sunset = targetDi.startingSunsetDesc;
    dayInfo.StartTime = null;
    dayInfo.EventTime = null;
    dayInfo.ST = null;
    dayInfo.STClass = null;
    dayInfo.NoWork = null;
    dayInfo.TypeShort = null;
    dayInfo.DefaultTimeClass = null;
    dayInfo.RowClass = null;
    let targetTime = dayInfo.Time || defaultEventStart;

    if (dayInfo.Type === "M") {
      dayInfo.A = getMessage("FeastOf").filledWith(targetDi.bMonthNameSec);
    }
    if (dayInfo.Type.slice(0, 1) === "H") {
      dayInfo.A = getMessage(dayInfo.NameEn);
    }
    if (dayInfo.Type === "HS") {
      dayInfo.NoWork = getMessage("mainPartOfDay", targetDi);
    }
    if (dayInfo.Special && dayInfo.Special.slice(0, 5) === "AYYAM") {
      dayInfo.A = getMessage(dayInfo.NameEn);
    }

    if (dayInfo.Type === "Fast") {
      const sunrise = targetDi.frag2SunTimes.sunrise;
      dayInfo.FastSunrise = sunrise ? getTimeDisplay(sunrise) : "?";
      dayInfo.FastSunset = sunrise ? getTimeDisplay(targetDi.frag2SunTimes.sunset) : "?";
      dayInfo.FastDay = getMessage("mainPartOfDay", targetDi);
      if (targetDi.frag2Weekday === 6) {
        dayInfo.RowClass = "FastSat";
      }
    }

    if (targetTime === "SS2") {
      tempDate = new Date(dayInfo.di.frag1SunTimes.sunset.getTime());
      tempDate.setHours(tempDate.getHours() + 2);
      // about 2 hours after sunset
      let minutes = tempDate.getMinutes();
      minutes = minutes > 30 ? 30 : 0; // start 1/2 hour before
      tempDate.setMinutes(minutes);
      dayInfo.Event = {
        time: tempDate,
      };

      dayInfo.StartTime = getTimeDisplay(dayInfo.Event.time);
      addEventTime(dayInfo.Event);
      dayInfo.EventTime = getMessage("eventTime", dayInfo.Event);
    } else if (targetTime) {
      let adjustDTtoST = 0;
      if (targetTime.slice(-1) === "S") {
        targetTime = targetTime.slice(0, 4);
        adjustDTtoST = inStandardTime(targetDi.frag1) ? 0 : 1;
      }
      tempDate = new Date(dayInfo.di.frag1.getTime());
      const timeHour = +targetTime.slice(0, 2);
      const timeMin = targetTime.slice(-2);
      tempDate.setHours(timeHour + adjustDTtoST);
      tempDate.setMinutes(timeMin);

      if (targetDi.frag1SunTimes.sunset.getTime() < tempDate.getTime()) {
        //dayInfo.isEve = " *";
      } else {
        tempDate.setHours(tempDate.getHours() + 24);
      }

      dayInfo.Event = {
        time: tempDate,
      };
      dayInfo.StartTime = getTimeDisplay(dayInfo.Event.time);
      addEventTime(dayInfo.Event);
      dayInfo.EventTime = getMessage("eventTime", dayInfo.Event);
    }

    if (dayInfo.Time) {
      if (dayInfo.Type !== "Today") {
        dayInfo.ST = getMessage(`specialTime_${dayInfo.Time}`);
        dayInfo.STClass = " SpecialTime";
      }
    } else {
      dayInfo.DefaultTimeClass = " Default";
    }

    dayInfo.date = getMessage("upcomingDateFormat", targetDi);

    if (dayInfo.Type.substring(0, 1) === "H") {
      dayInfo.TypeShort = " H";
    }
  });

  const rowTemplate = [];
  rowTemplate.push('<tr class="{Type}{TypeShort}{DefaultTimeClass}{STClass}">');
  rowTemplate.push("<td>{D}</td>");
  rowTemplate.push("<td class=name>{A}</td>"); //{STColSpan}
  rowTemplate.push("<td class=forHD>{NoWork}</td>");
  rowTemplate.push('<td class=eventTime>{EventTime}<div class="forHD time">{ST}</div></td>'); // {isEve}
  rowTemplate.push("<td>{G}</td>");
  rowTemplate.push("</tr>");
  $("#specialListBody").html(rowTemplate.join("").filledWithEach(dayInfos.filter((el) => el.Type !== "Fast")));

  $("#specialDaysTitle").html(getMessage("specialDaysTitle", di));

  const fastRowTemplate = [];
  fastRowTemplate.push('<tr class="{RowClass}">');
  fastRowTemplate.push("<td>{D}</td>");
  fastRowTemplate.push("<td class=centered>{FastSunrise}</td>");
  fastRowTemplate.push("<td class=centered>{FastSunset}</td>");
  fastRowTemplate.push("<td>{FastDay}</td>");
  fastRowTemplate.push("</tr>");

  $("#fastListBody").html(fastRowTemplate.join("").filledWithEach(dayInfos.filter((el) => el.Type === "Fast")));

  $("#fastDaysTitle").html(getMessage("fastDaysTitle", di));
}

function showShortcutKeys() {
  if (browser.commands && browserHostType === browserType.Chrome) {
    browser.commands.getAll().then((commands) => {
      for (let i = 0; i < commands.length; i++) {
        const a = commands[i];
        if (a.shortcut) {
          $("#shortcutKeys").text(a.shortcut);
        }
      }
    });
  }
}

function showLocation() {
  $(".place").html(common.locationName);
  $("#locationErrorHolder").toggle(!common.locationKnown);
}

function hideCal1() {
  $("#iFrameCal1").hide();
}

function showCal1() {
  const iframe = $("#iFrameCal1");
  if (iframe.is(":visible")) {
    iframe.hide();
  } else {
    if (!iframe.attr("src")) {
      iframe.attr("src", "cal1.html").fadeIn();
    } else {
      iframe.show();
    }
  }
}

function adjustHeight() {
  // try to ensure that the tabs are not longer than page1 content
  //let content = $('.mainMiddle');
  //let contentHeight = content.height();
  //let tabsHeight = $('.selectPages').prop('scrollHeight');
  //if (tabsHeight > contentHeight) {
  //  content.css("min-height", (5 + tabsHeight) + 'px');
  //}
}

function prepareDefaultsInPopup() {
  let includeFeasts = common.includeFeasts;
  let includeHolyDays = common.includeHolyDays;
  if (typeof includeFeasts === "undefined" && typeof includeHolyDays === "undefined") {
    includeFeasts = false;
    includeHolyDays = true;
  }

  $("#includeFeasts").prop("checked", includeFeasts || false);
  $("#includeHolyDays").prop("checked", includeHolyDays || false);

  let showPointer = common.showPointer;
  if (typeof showPointer === "undefined") {
    showPointer = true;
  }
  $("#cbShowPointer").prop("checked", showPointer);
}

function UpdateLanguageBtn() {
  $(`#rbDefLang_${common.useArNames ? "Ar" : "Local"}`).prop("checked", true);
}

function openInTab() {
  if (_inTab) {
    return;
  }
  const url = browser.runtime.getURL("popup.html");

  // if (browserHostType === browserType.Chrome) {
  browser.tabs
    .query({
      url: url,
    })
    .then((foundTabs) => {
      if (foundTabs[0]) {
        browser.tabs.update(foundTabs[0].id, {
          active: true,
        });
      } else {
        browser.tabs.create({
          url: url,
        });
      }
      window.close();
      tracker.sendEvent("openInTab");
    });
  // } else {
  //   browser.tabs.create({
  //     url: url,
  //   });
  //   window.close();
  //   tracker.sendEvent("openInTab");
  // }
}

function updateTabNames() {
  $(".selectPages button")
    .filter(":visible")
    .each((i, el) => {
      const tab = $(el);
      tab.html(`${i + 1} ${tab.html()}`);
      _pageIdList.push(tab.data("page"));
    });
}

function showBtnOpen() {
  browser.tabs.getCurrent().then((tab) => {
    if (tab) {
      _inTab = true;
      $("body").addClass("inTab");
      $("#btnPrint").show();
    } else {
      $("#btnOpen").show();
    }
  });
}

function finishFirstPopup() {
  $(".buttons").removeClass("fakeHover");
  $(".buttons").off("mouseover", finishFirstPopup);
  putInStorageLocalAsync(localStorageKey.firstPopup, false);
}

async function prepare2() {
  _initialStartupDone = true;

  updateLoadProgress("prepare2 start");

  updateLoadProgress("send event");
  tracker.sendEvent("opened");
  tracker.sendAppView(_currentPageId);

  if (common.firstPopup) {
    // first time popup is opened after upgrading to newest version
    $(".buttons").addClass("fakeHover").on("mouseover", finishFirstPopup);
    setTimeout(finishFirstPopup, 4000);
  }

  updateLoadProgress("fill eventStart");
  fillEventStart();

  updateLoadProgress("fill static");
  fillStatic();

  updateLoadProgress("fill setup");
  fillSetup();

  updateLoadProgress("localize");
  localizeHtml("#pageLists");

  updateLoadProgress("cal1");
  _cal1 = Cal1(_di);
  _cal1.showCalendar(_di);

  updateLoadProgress("calWheel");
  _calWheel = CalWheel();
  _calWheel.showCalendar(_di);

  updateLoadProgress("calGreg");
  _calGreg = CalGreg();
  _calGreg.showCalendar(_di);

  updateLoadProgress("cal2");
  _cal2 = Cal2();
  _cal2.showCalendar(_di);

  updateLoadProgress("cal3");
  _cal3 = Cal3();
  _cal3.showCalendar(_di);

  if (_remindersEnabled) {
    updateLoadProgress("reminder definitions");
    _pageReminders = PageReminders();
  }
  $("#btnPageReminders").toggle(_remindersEnabled);

  updateLoadProgress("export & planner");
  _pageExporter = PageExporter();
  _pagePlanner = await PagePlannerAsync();

  updateLoadProgress("finish");
  $("#version").attr("href", getMessage(`${browserHostType}_History`));
  $("#linkWebStore").attr("href", getMessage(`${browserHostType}_WebStore`));
  $("#linkWebStoreSupport").attr("href", getMessage(`${browserHostType}_WebStoreSupport`));

  if (_currentPageId !== "pageDay") {
    adjustHeight();
    $("#initialCover").hide();
  }

  if (_di.stamp !== _initialDiStamp.stamp) {
    highlightGDay();
  }
}

function updateLoadProgress(comment) {
  _loadingNum++;
  //  let time = new Date().getTime();
  //  if (_lastLoadingTime) {
  //    let elapsed = `${_lastLoadingComment} (${time - _lastLoadingTime})`;
  //
  //    console.log(_loadingNum, elapsed);
  //  }
  //  _lastLoadingTime = new Date().getTime();
  //  _lastLoadingComment = comment;
  $("#loadingCount").text(new Array(_loadingNum + 1).join("."));
}

$(async () => {
  await prepareForBackgroundAndPopupAsync();
  await prepareSharedForPopup();
});
