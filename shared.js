/* Code by Glen Little - 2014 - 2024 */
/* global HolyDays */
/* global dayjs */

// these use VAR to be globally available
var splitSeparator = /[,،]+/;

var _currentPageId = null;
var _rawMessages = null;
var _rawMessageTranslationPct = 0;
var _numMessagesEn = 0;
var _cachedMessages = {};
var _cachedMessageUseCount = 0;

var _languageCode = "";
var _languageDir = "ltr";
var _nextFilledWithEach_UsesExactMatchOnly = false;
var _locationLat = null;
var _locationLong = null;
var _locationKnown = false;
var _focusTime = null;
var holyDays = null;
var knownDateInfos = {};
var _di = {};
var _initialDiStamp;
var _firstLoad = true;

var bMonthNameAr;
var bMonthMeaning;

var bWeekdayNameAr;
var bWeekdayMeaning;

var bYearInVahidNameAr;
var bYearInVahidMeaningnull;

var bMonthNamePri;
var bMonthNameSec;
var bWeekdayNamePri;
var bWeekdayNameSec;
var bYearInVahidNamePri;
var bYearInVahidNameSec;

var gWeekdayLong;
var gWeekdayShort;
var gMonthLong;
var gMonthShort;

var ordinall;
var ordinalNames;
var elements;

var use24HourClock;
var _iconPrepared = false;

// in alphabetical order
var localStorageKey = {
  // alarm_{name}: "alarm_{name}",
  //enableGCal: "enableGCal",
  firstPopup: "firstPopup",
  focusPage: "focusPage",
  focusTimeAsOf: "focusTimeAsOf",
  focusTime: "focusTime",
  focusTimeIsEve: "focusTimeIsEve",
  gCalLabel: "gCalLabel",
  gCalTitle: "gCalTitle",
  iconTextColor: "iconTextColor",
  lat: "lat",
  locationKnown: "locationKnown",
  locationName: "locationName",
  locationNameKnown: "locationNameKnown",
  long: "long",
  uid: "uid",
  updateVersion: "updateVersion",
};

var syncStorageKey = {
  customFormats: "customFormats",
  eventStart: "eventStart",
  // exporter_{names}: "exporter_{names}",
  exporter_alertMinutes: "exporter_alertMinutes",
  exporter_exporterDateRange: "exporter_exporterDateRange",
  exporter_exporterName: "exporter_exporterName",
  formatToolTip1: "formatToolTip1",
  formatToolTip2: "formatToolTip2",
  formatTopDay: "formatTopDay",
  iftttKey: "iftttKey",
  includeFeasts: "includeFeasts",
  includeHolyDays: "includeHolyDays",
  jumpTo: "jumpTo",
  language: "language",
  optOutGa: "optOutGa",
  planWhat: "planWhat",
  // planner_{ids}: "planner_{ids}",
  showPointer: "showPointer",
  useArNames: "useArNames",
  zapierWebhook: "zapierWebhook",
};

var browser = {
  Chrome: "Chrome",
  Firefox: "Firefox",
  Edge: "Edge",
};
var browserHostType = browser.Chrome;

var _notificationsEnabled = browserHostType === browser.Chrome; // set to false to disable

var settings = {}; // temp

async function fillSettings() {
  settings = {
    useArNames: true,
    rememberFocusTimeMinutes: 5, // show on settings page?
    optedOutOfGoogleAnalytics: await getFromStorageSync(
      syncStorageKey.optOutGa,
      -1
    ),
    //  integrateIntoGoogleCalendar: await getFromStorageLocal(localStorageKey.enableGCal, true),
    iconTextColor: await getFromStorageLocal(
      localStorageKey.iconTextColor,
      "#000000"
    ),
  };
}

async function loadJsonfile(filePath) {
  try {
    const url = chrome.runtime.getURL(filePath);
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`File not found: ${filePath}`);
      return null;
    }
    const jsonData = await response.json();
    return jsonData;
  } catch (error) {
    console.error(`Error fetching file ${filePath}:`, error);
    return null;
  }
}

async function loadRawMessages(langCode, cb) {
  // load base English, then overwrite with base for language, then with full lang code
  console.log("loading", langCode);

  const rawLangCodes = { en: true };
  if (langCode.length > 2) {
    rawLangCodes[langCode.slice(0, 2)] = true;
  }
  rawLangCodes[langCode] = true;
  const langsToLoad = Object.keys(rawLangCodes);

  _numMessagesEn = 0;
  let numMessagesOther = -1;
  _rawMessages = {};

  for (let langNum = 0; langNum < langsToLoad.length; langNum++) {
    const langToLoad = langsToLoad[langNum];
    const url = `/_locales/${langToLoad}/messages.json`;
    console.log("shared", langNum, langToLoad, url);

    const messages = await loadJsonfile(url);

    if (!messages) {
      console.log("no source found for", langToLoad);
      continue;
    }

    const keys = Object.keys(messages);

    console.log("loading", keys.length, "keys from", langToLoad);

    if (langToLoad === "en") {
      _numMessagesEn = keys.length;
    } else {
      // this will be incorrect if the _locales folder does have folders for xx and xx-yy. None do currently.
      numMessagesOther = keys.length;
    }

    // add all to _rawMessages
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      _rawMessages[k.toLowerCase()] = messages[k].message;
    }
  }

  _cachedMessages = {};
  _cachedMessageUseCount = 0;

  _rawMessageTranslationPct = Math.round(
    numMessagesOther === -1 || _numMessagesEn === 0
      ? 100
      : (100 * numMessagesOther) / _numMessagesEn
  );
  console.log(
    "loaded",
    _numMessagesEn,
    numMessagesOther,
    langsToLoad,
    Object.keys(_rawMessages).length,
    "keys - ",
    _rawMessageTranslationPct,
    "% translated"
  );

  if (cb) {
    cb();
  }
}

async function prepareShared() {
  settings.useArNames = await getFromStorageSync(
    syncStorageKey.useArNames,
    true
  );

  _languageCode = await getFromStorageSync(syncStorageKey.language, "en"); //getMessage('translation');
  if (!_languageCode) {
    _languageCode = chrome.i18n.getUILanguage();
    putInStorageSync(syncStorageKey.language, _languageCode);
  }

  await loadRawMessages(_languageCode); // default to the current language
  // console.log('raw messages loaded', _rawMessages);

  // must be set immediately for tab managers to see this name
  $("#windowTitle").text(getMessage("title"));

  _languageDir = getMessage("textDirection", null, "ltr");

  _locationLat = await getFromStorageLocal(localStorageKey.lat);
  _locationLong = await getFromStorageLocal(localStorageKey.long);
  holyDays = HolyDays();

  // see messages.json for translations and local names
  bMonthNameAr = getMessage("bMonthNameAr").split(splitSeparator);
  bMonthMeaning = getMessage("bMonthMeaning").split(splitSeparator);

  bWeekdayNameAr = getMessage("bWeekdayNameAr").split(splitSeparator); // from Saturday
  bWeekdayMeaning = getMessage("bWeekdayMeaning").split(splitSeparator);

  bYearInVahidNameAr = getMessage("bYearInVahidNameAr").split(splitSeparator);
  bYearInVahidMeaning = getMessage("bYearInVahidMeaning").split(splitSeparator);

  setupLanguageChoice();

  gWeekdayLong = getMessage("gWeekdayLong").split(splitSeparator);
  gWeekdayShort = getMessage("gWeekdayShort").split(splitSeparator);
  gMonthLong = getMessage("gMonthLong").split(splitSeparator);
  gMonthShort = getMessage("gMonthShort").split(splitSeparator);

  ordinal = getMessage("ordinal").split(splitSeparator);
  ordinalNames = getMessage("ordinalNames").split(splitSeparator);
  elements = getMessage("elements").split(splitSeparator);

  use24HourClock = getMessage("use24HourClock") === "true";
}

function setupLanguageChoice() {
  // debugger;
  bMonthNamePri = settings.useArNames ? bMonthNameAr : bMonthMeaning;
  bMonthNameSec = !settings.useArNames ? bMonthNameAr : bMonthMeaning;
  bWeekdayNamePri = settings.useArNames ? bWeekdayNameAr : bWeekdayMeaning;
  bWeekdayNameSec = !settings.useArNames ? bWeekdayNameAr : bWeekdayMeaning;
  bYearInVahidNamePri = settings.useArNames
    ? bYearInVahidNameAr
    : bYearInVahidMeaning;
  bYearInVahidNameSec = !settings.useArNames
    ? bYearInVahidNameAr
    : bYearInVahidMeaning;
}

function refreshDateInfo() {
  _di = getDateInfo(getFocusTime());
}

function getDateInfo(currentTime1, onlyStamp) {
  let currentTime = currentTime1;
  // hard code limits
  const minDate = new Date(1844, 2, 21, 0, 0, 0, 0);
  if (currentTime < minDate) {
    currentTime = minDate;
  } else {
    const maxDate = new Date(2844, 2, 20, 0, 0, 0, 0);
    if (currentTime > maxDate) {
      currentTime = maxDate;
    }
  }

  const known = knownDateInfos[currentTime];
  if (known) {
    return known;
  }

  // debugger;

  const bNow = holyDays.getBDate(currentTime);
  if (onlyStamp) {
    return {
      stamp: JSON.stringify(bNow),
      stampDay: "{y}.{m}.{d}".filledWith(bNow),
    };
  }

  // split the Baha'i day to be "Eve" - sunset to midnight;
  // and "Morn" - from midnight through to sunset
  const frag1Noon = new Date(currentTime.getTime());
  frag1Noon.setHours(12, 0, 0, 0);
  if (!bNow.eve) {
    // if not already frag1, make it so
    frag1Noon.setDate(frag1Noon.getDate() - 1);
  }
  const frag2Noon = new Date(frag1Noon.getTime());
  frag2Noon.setDate(frag2Noon.getDate() + 1);

  const frag1SunTimes = sunCalculator.getTimes(
    frag1Noon,
    _locationLat,
    _locationLong
  );
  const frag2SunTimes = sunCalculator.getTimes(
    frag2Noon,
    _locationLat,
    _locationLong
  );

  const di = {
    // date info
    frag1: frag1Noon,
    frag1Year: frag1Noon.getFullYear(),
    frag1Month: frag1Noon.getMonth(),
    frag1Day: frag1Noon.getDate(),
    frag1Weekday: frag1Noon.getDay(),

    frag2: frag2Noon,
    frag2Year: frag2Noon.getFullYear(),
    frag2Month: frag2Noon.getMonth(), // 0 based
    frag2Day: frag2Noon.getDate(),
    frag2Weekday: frag2Noon.getDay(),

    currentYear: currentTime.getFullYear(),
    currentMonth: currentTime.getMonth(), // 0 based
    currentMonth1: 1 + currentTime.getMonth(),
    currentDay: currentTime.getDate(),
    currentDay00: digitPad2(currentTime.getDate()),
    currentWeekday: currentTime.getDay(),
    currentTime: currentTime,

    startingSunsetDesc12: showTime(frag1SunTimes.sunset),
    startingSunsetDesc24: showTime(frag1SunTimes.sunset, 24),
    endingSunsetDesc12: showTime(frag2SunTimes.sunset),
    endingSunsetDesc24: showTime(frag2SunTimes.sunset, 24),
    frag1SunTimes: frag1SunTimes,
    frag2SunTimes: frag2SunTimes,

    sunriseDesc12: showTime(frag2SunTimes.sunrise),
    sunriseDesc24: showTime(frag2SunTimes.sunrise, 24),

    bNow: bNow,
    bDay: bNow.d,
    bWeekday: 1 + ((frag2Noon.getDay() + 1) % 7),
    bMonth: bNow.m,
    bYear: bNow.y,
    bVahid: Math.floor(1 + (bNow.y - 1) / 19),
    bDateCode: `${bNow.m}.${bNow.d}`,

    bDayNameAr: bMonthNameAr[bNow.d],
    bDayMeaning: bMonthMeaning[bNow.d],
    bMonthNameAr: bMonthNameAr[bNow.m],
    bMonthMeaning: bMonthMeaning[bNow.m],

    bEraLong: getMessage("eraLong"),
    bEraAbbrev: getMessage("eraAbbrev"),
    bEraShort: getMessage("eraShort"),

    stamp: JSON.stringify(bNow), // used to compare to other dates and for developer reference
  };

  // debugger;
  di.bDayNamePri = settings.useArNames ? di.bDayNameAr : di.bDayMeaning;
  di.bDayNameSec = !settings.useArNames ? di.bDayNameAr : di.bDayMeaning;
  di.bMonthNamePri = settings.useArNames ? di.bMonthNameAr : di.bMonthMeaning;
  di.bMonthNameSec = !settings.useArNames ? di.bMonthNameAr : di.bMonthMeaning;

  di.VahidLabelPri = settings.useArNames
    ? getMessage("vahid")
    : getMessage("vahidLocal");
  di.VahidLabelSec = !settings.useArNames
    ? getMessage("vahid")
    : getMessage("vahidLocal");

  di.KullishayLabelPri = settings.useArNames
    ? getMessage("kullishay")
    : getMessage("kullishayLocal");
  di.KullishayLabelSec = !settings.useArNames
    ? getMessage("kullishay")
    : getMessage("kullishayLocal");

  di.bKullishay = Math.floor(1 + (di.bVahid - 1) / 19);
  di.bVahid = di.bVahid - (di.bKullishay - 1) * 19;
  di.bYearInVahid =
    di.bYear - (di.bVahid - 1) * 19 - (di.bKullishay - 1) * 19 * 19;

  di.bYearInVahidNameAr = bYearInVahidNameAr[di.bYearInVahid];
  di.bYearInVahidMeaning = bYearInVahidMeaning[di.bYearInVahid];
  di.bYearInVahidNamePri = settings.useArNames
    ? di.bYearInVahidNameAr
    : di.bYearInVahidMeaning;
  di.bYearInVahidNameSec = !settings.useArNames
    ? di.bYearInVahidNameAr
    : di.bYearInVahidMeaning;

  di.bWeekdayNameAr = bWeekdayNameAr[di.bWeekday];
  di.bWeekdayMeaning = bWeekdayMeaning[di.bWeekday];
  di.bWeekdayNamePri = settings.useArNames
    ? di.bWeekdayNameAr
    : di.bWeekdayMeaning;
  di.bWeekdayNameSec = !settings.useArNames
    ? di.bWeekdayNameAr
    : di.bWeekdayMeaning;

  di.elementNum = getElementNum(bNow.m);
  di.element = elements[di.elementNum - 1];

  di.bDayOrdinal = di.bDay + getOrdinal(di.bDay);
  di.bVahidOrdinal = di.bVahid + getOrdinal(di.bVahid);
  di.bKullishayOrdinal = di.bKullishay + getOrdinal(di.bKullishay);
  di.bDayOrdinalName = getOrdinalName(di.bDay);
  di.bVahidOrdinalName = getOrdinalName(di.bVahid);
  di.bKullishayOrdinalName = getOrdinalName(di.bKullishay);

  di.bDay00 = digitPad2(di.bDay);
  di.frag1Day00 = digitPad2(di.frag1Day);
  di.currentMonth01 = digitPad2(di.currentMonth1);
  di.frag2Day00 = digitPad2(di.frag2Day);
  di.frag1Month00 = digitPad2(1 + di.frag1Month); // change from 0 based
  di.frag2Month00 = digitPad2(1 + di.frag2Month); // change from 0 based
  di.bMonth00 = digitPad2(di.bMonth);
  di.bYearInVahid00 = digitPad2(di.bYearInVahid);
  di.bVahid00 = digitPad2(di.bVahid);

  di.startingSunsetDesc = use24HourClock
    ? di.startingSunsetDesc24
    : di.startingSunsetDesc12;
  di.endingSunsetDesc = use24HourClock
    ? di.endingSunsetDesc24
    : di.endingSunsetDesc12;
  di.sunriseDesc = use24HourClock ? di.sunriseDesc24 : di.sunriseDesc12;

  di.frag1MonthLong = gMonthLong[di.frag1Month];
  di.frag1MonthShort = gMonthShort[di.frag1Month];
  di.frag1WeekdayLong = gWeekdayLong[di.frag1Weekday];
  di.frag1WeekdayShort = gWeekdayShort[di.frag1Weekday];

  di.frag2MonthLong = gMonthLong[di.frag2Month];
  di.frag2MonthShort = gMonthShort[di.frag2Month];
  di.frag2WeekdayLong = gWeekdayLong[di.frag2Weekday];
  di.frag2WeekdayShort = gWeekdayShort[di.frag2Weekday];

  di.currentMonthLong = gMonthLong[di.currentMonth];
  di.currentMonthShort = gMonthShort[di.currentMonth];
  di.currentWeekdayLong = gWeekdayLong[di.currentWeekday];
  di.currentWeekdayShort = gWeekdayShort[di.currentWeekday];
  di.currentDateString = dayjs(di.currentTime).format("YYYY-MM-DD");

  di.currentRelationToSunset = getMessage(
    bNow.eve ? "afterSunset" : "beforeSunset"
  );
  const thisMoment = new Date().getTime();
  di.dayStarted = getMessage(
    thisMoment > di.frag1SunTimes.sunset.getTime()
      ? "dayStartedPast"
      : "dayStartedFuture"
  );
  di.dayEnded = getMessage(
    thisMoment > di.frag2SunTimes.sunset.getTime()
      ? "dayEndedPast"
      : "dayEndedFuture"
  );
  di.dayStartedLower = di.dayStarted.toLocaleLowerCase();
  di.dayEndedLower = di.dayEnded.toLocaleLowerCase();

  // di.bMonthDayYear = getMessage('gMonthDayYear', di);

  if (di.frag1Year !== di.frag2Year) {
    // Dec 31/Jan 1
    // Dec 31, 2015/Jan 1, 2015
    di.gCombined = getMessage("gCombined_3", di);
    di.gCombinedY = getMessage("gCombinedY_3", di);
  } else if (di.frag1Month !== di.frag2Month) {
    // Mar 31/Apr 1
    // Mar 31/Apr 1, 2015
    di.gCombined = getMessage("gCombined_2", di);
    di.gCombinedY = getMessage("gCombinedY_2", di);
  } else {
    // Jul 12/13
    // Jul 12/13, 2015
    di.gCombined = getMessage("gCombined_1", di);
    di.gCombinedY = getMessage("gCombinedY_1", di);
  }
  di.nearestSunset = getMessage(
    bNow.eve ? "nearestSunsetEve" : "nearestSunsetDay",
    di
  );

  di.stampDay = "{y}.{m}.{d}".filledWith(di.bNow); // ignore eve/day

  //if (!skipUpcoming) {
  //  getUpcoming(di);
  //}

  knownDateInfos[currentTime] = di;

  return di;
}

function getElementNum(num) {
  // the Bab's designations, found in 'https://books.google.ca/books?id=XTfoaK15t64C&pg=PA394&lpg=PA394&dq=get+of+the+heart+nader+bab&source=bl&ots=vyF-pWLAr8&sig=ruiuoE48sGWWgaB_AFKcSfkHvqw&hl=en&sa=X&ei=hbp0VfGwIon6oQSTk4Mg&ved=0CDAQ6AEwAw#v=snippet&q=%22air%20of%20eternity%22&f=false'

  //  1, 2, 3
  //  4, 5, 6, 7
  //  8, 9,10,11,12,13
  // 14,15,16,17,18,19
  let element = 1;
  if (num >= 4 && num <= 7) {
    element = 2;
  } else if (num >= 8 && num <= 13) {
    element = 3;
  } else if (num >= 14 && num <= 19) {
    element = 4;
  } else if (num === 0) {
    element = 0;
  }
  return element;
}

async function getToolTipMessageTemplate(lineNum) {
  // can be overwritten in the custom page
  switch (lineNum) {
    case 1:
      return await getFromStorageSync(
        localStorageKey.formatToolTip1,
        getMessage("formatIconToolTip")
      );
    case 2:
      return await getFromStorageSync(
        localStorageKey.formatToolTip2,
        "{nearestSunset}"
      );
  }
  return "";
}

async function showIcon() {
  const dateInfo = getDateInfo(new Date());
  const tipLines = [];
  tipLines.push((await getToolTipMessageTemplate(1)).filledWith(dateInfo));
  tipLines.push((await getToolTipMessageTemplate(2)).filledWith(dateInfo));
  tipLines.push("");

  if (dateInfo.special1) {
    tipLines.push(dateInfo.special1);
    if (dateInfo.special2) {
      tipLines.push(dateInfo.special2);
    }
    tipLines.push("");
  }

  if (dateInfo.bMonth === 19) {
    tipLines.push(
      `${getMessage("sunriseFastHeading")} - ${showTime(
        dateInfo.frag2SunTimes.sunrise
      )}`
    );
    tipLines.push("");
  }

  tipLines.push(getMessage("formatIconClick"));

  chrome.action.setTitle({ title: tipLines.join("\n") });

  try {
    chrome.action.setIcon({
      imageData: await draw(dateInfo.bMonthNamePri, dateInfo.bDay, "center"),
    });
    _iconPrepared = true;
  } catch (e) {
    // fails in Firefox unless in the popup
    console.log("icon failed");
    console.log(e);
    _iconPrepared = false;
  }
}

async function draw(line1, line2, line2Alignment) {
  const canvas = document.createElement("canvas");
  const size = 19;
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  const fontName = "Tahoma";

  context.fillStyle = await getFromStorageLocal(
    localStorageKey.iconTextColor,
    "black"
  );

  const line1div = $("<div>{^0}</div>".filledWith(line1)).text();
  const line2div = $("<div>{^0}</div>".filledWith(line2)).text();

  context.font = `${size / 2 - 1}px ${fontName}`;
  context.fillText(line1div, 0, 7);

  context.font = `${size / 2 + 1}px ${fontName}`;
  context.textAlign = line2Alignment;
  let x = 0;
  switch (line2Alignment) {
    case "center":
      x = size / 2;
      break;
    //    case 'end':
    //      x = size;
    //      break;
  }
  context.fillText(line2div, x, size);

  return context.getImageData(0, 0, size, size);
}

function startGettingLocation() {
  const positionOptions = {
    enableHighAccuracy: false,
    maximumAge: Number.POSITIVE_INFINITY,
    timeout: 6000,
  };
  navigator.geolocation.watchPosition(setLocation, noLocation, positionOptions); // this triggers immediately
}

function getUpcoming(di) {
  if (di.upcomingHtml) {
    return; // already done
  }
  const dayInfos = holyDays.getUpcoming(di, 3);
  const today = dayjs(di.frag2);
  today.hour(0);
  di.special1 = null;
  di.special2 = null;

  dayInfos.forEach((dayInfo, i) => {
    const targetDi = getDateInfo(dayInfo.GDate);
    if (dayInfo.Type === "M") {
      dayInfo.A = getMessage("FeastOf").filledWith(targetDi.bMonthNameSec);
    } else if (dayInfo.Type.slice(0, 1) === "H") {
      dayInfo.A = getMessage(dayInfo.NameEn);
    }
    if (dayInfo.Special && dayInfo.Special.slice(0, 5) === "AYYAM") {
      dayInfo.A = getMessage(dayInfo.NameEn);
    }
    dayInfo.date = getMessage("upcomingDateFormat", targetDi);

    const sameDay = di.stampDay === targetDi.stampDay;
    const targetMoment = dayjs(dayInfo.GDate);
    dayInfo.away = determineDaysAway(di, today, targetMoment, sameDay);

    if (sameDay) {
      if (!di.special1) {
        di.special1 = dayInfo.A;
      } else {
        di.special2 = dayInfo.A;
      }
    }
  });

  di.upcomingHtml =
    "<tr class={Type}><td>{away}</td><td>{^A}</td><td>{^date}</td></tr>".filledWithEach(
      dayInfos
    );
}
function determineDaysAway(di, moment1, moment2, sameDay) {
  const days = moment2.diff(moment1, "days");
  if (days === 1 && !di.bNow.eve) {
    return getMessage("Tonight");
  }
  if (days === -1) {
    return getMessage("Ended");
  }
  if (days === 0) {
    return getMessage("Now");
  }
  return getMessage(days === 1 ? "1day" : "otherDays").filledWith(days);
}

function showTime(d, use24) {
  const hoursType = use24HourClock || use24 === 24 ? 24 : 0;
  const show24Hour = hoursType === 24;
  const hours24 = d.getHours();
  const pm = hours24 >= 12;
  const hours = show24Hour
    ? hours24
    : hours24 > 12
    ? hours24 - 12
    : hours24 === 0
    ? 12
    : hours24;
  const minutes = d.getMinutes();
  let time = `${hours}:${`0${minutes}`.slice(-2)}`;
  if (!show24Hour) {
    if (hours24 === 12 && minutes === 0) {
      time = getMessage("noon");
    } else if (hours24 === 0 && minutes === 0) {
      time = getMessage("midnight");
    } else {
      time = getMessage("timeFormat12").filledWith({
        time: time,
        ampm: pm ? getMessage("pm") : getMessage("am"),
      });
    }
  }
  return time;
}

const findName = (typeName, results, getLastMatch) => {
  let match = null;
  for (let r = 0; r < results.length; r++) {
    const result = results[r];
    if (result.types.indexOf(typeName) !== -1) {
      match = result.formatted_address;
      if (!getLastMatch) return match;
    }
  }
  return match;
};

const xhr = null;

async function startGetLocationName() {
  // debugger;

  try {
    const unknownLocation = getMessage("noLocationName");

    // Send a message to the background script to get the city name
    chrome.runtime.sendMessage(
      {
        action: "getCityName",
        lat: await getFromStorageLocal(localStorageKey.lat),
        long: await getFromStorageLocal(localStorageKey.long),
        unknownLocation: unknownLocation,
      },
      (response) => {
        const location = response.city || unknownLocation;
        console.log("Location:", location);

        putInStorageLocal(localStorageKey.locationName, location);
        putInStorageLocal(
          localStorageKey.locationNameKnown,
          location !== unknownLocation
        );

        stopLoaderButton();

        if (typeof _inPopupPage !== "undefined") {
          showLocation();
        }
      }
    );
  } catch (error) {
    console.log(error);
  }
}

function stopLoaderButton() {
  $(".btnRetry").removeClass("active");
}

function setLocation(position) {
  _locationLat = position.coords.latitude;
  putInStorageLocal(localStorageKey.lat, _locationLat);

  _locationLong = position.coords.longitude;
  putInStorageLocal(localStorageKey.long, _locationLong);

  knownDateInfos = {};

  putInStorageLocal(localStorageKey.locationKnown, true);
  _locationKnown = true;

  putInStorageLocal(localStorageKey.locationNameKnown, false);
  putInStorageLocal(
    localStorageKey.locationName,
    getMessage("browserActionTitle")
  ); // temp until we get it

  if (typeof _inPopupPage !== "undefined") {
    $("#inputLat").val(_locationLat);
    $("#inputLng").val(_locationLong);
  }

  // startGetLocationName();

  refreshDateInfoAndShow();
}

async function noLocation(err) {
  if (await getFromStorageLocal(localStorageKey.locationNameKnown, false)) {
    return;
  }

  _locationLat = 0;
  _locationLong = 0;

  putInStorageLocal(localStorageKey.lat, _locationLong);
  putInStorageLocal(localStorageKey.long, _locationLong);

  knownDateInfos = {};

  console.error(err);

  putInStorageLocal(localStorageKey.locationKnown, false);
  _locationKnown = false;

  putInStorageLocal(
    localStorageKey.locationName,
    getMessage("noLocationAvailable")
  );

  stopLoaderButton();

  refreshDateInfoAndShow();
}

async function recallFocusAndSettings() {
  const storedAsOf = +(await getFromStorageLocal(
    localStorageKey.focusTimeAsOf
  ));
  if (!storedAsOf) {
    putInStorageLocal(localStorageKey.focusTimeIsEve, null);
    return;
  }
  const focusTimeAsOf = new Date(storedAsOf);
  let timeSet = false;

  const now = new Date();
  if (now - focusTimeAsOf < settings.rememberFocusTimeMinutes * 60000) {
    const focusPage = await getFromStorageLocal(localStorageKey.focusPage);
    if (focusPage && typeof _currentPageId !== "undefined") {
      _currentPageId = focusPage;
    }

    const stored = +(await StorageLocal(localStorageKey.focusTime));
    if (stored) {
      const time = new Date(stored);

      if (!Number.isNaN(time)) {
        const changing = now.toDateString() !== time.toDateString();
        //        console.log('reuse focus time: ' + time);

        setFocusTime(time);

        timeSet = true;

        if (changing) {
          highlightGDay();
        }
      }
    }
  } else {
    putInStorageLocal(localStorageKey.focusPage, null);
  }
  if (!timeSet) {
    setFocusTime(new Date());
  }
}

function highlightGDay() {
  //  console.log('highlight');
  //  if (typeof $().effect !== 'undefined') {
  //    setTimeout(function () {
  //      $('#day, #gDay').effect("highlight", 6000);
  //    },
  //        150);
  //  }
}

function refreshDateInfoAndShow(resetToNow) {
  // also called from alarm, to update to the next day
  if (resetToNow) {
    setFocusTime(new Date());
  } else {
    // will reset to now after a few minutes
    recallFocusAndSettings();
  }
  console.log("refreshDateInfoAndShow at", new Date());
  refreshDateInfo();
  _firstLoad = false;

  showIcon();
  if (typeof showInfo !== "undefined") {
    // are we inside the open popup?
    showInfo(_di);
    showWhenResetToNow();
  }

  if (browserHostType === browser.Chrome) {
    setAlarmForNextUpdate(
      _di.currentTime,
      _di.frag2SunTimes.sunset,
      _di.bNow.eve
    );
  }
}

const refreshAlarms = {};

function setAlarmForNextUpdate(currentTime, sunset, inEvening) {
  let whenTime;
  let alarmName;
  if (inEvening) {
    // in eve, after sunset, so update after midnight
    const midnight = new Date(
      currentTime.getFullYear(),
      currentTime.getMonth(),
      currentTime.getDate() + 1
    ).getTime();
    whenTime = midnight + 1000; // to be safe, set at least 1 second after midnight
    alarmName = "refresh_midnight";
  } else {
    // in the day, so update right at the sunset
    whenTime = sunset.getTime();
    alarmName = "refresh_sunset";
  }

  // odd bug... sometimes gets called many times over - is alarm being set in the past?
  //if (refreshAlarms[whenTime]) {
  //  // already set before
  //  return;
  //}

  if (whenTime < new Date().getTime()) {
    console.log(
      "ignored attempt to set {0} alarm in the past".filledWith(alarmName)
    );
    return;
  }

  refreshAlarms[whenTime] = true;

  chrome.alarms.create(alarmName, { when: whenTime });

  // debug - show alarm that was set
  chrome.alarms.getAll((alarms) => {
    for (let i = 0; i < alarms.length; i++) {
      const alarm = alarms[i];
      if (alarm.name.startsWith("refresh_")) {
        console.log(alarm.name, new Date(alarm.scheduledTime));
      } else {
        console.log(alarm.name);
      }
    }
  });
}

String.prototype.filledWith = function (...args) {
  /// <summary>Similar to C# String.Format...  in two modes:
  /// 1) Replaces {0},{1},{2}... in the string with values from the list of arguments.
  /// 2) If the first and only parameter is an object, replaces {xyz}... (only names allowed) in the string with the properties of that object.
  /// Notes: the { } symbols cannot be escaped and should only be used for replacement target tokens;  only a single pass is done.
  /// </summary>

  const values =
    typeof args[0] === "object" && args.length === 1 ? args[0] : args;

  //  const testForFunc = /^#/; // simple test for "#"
  const testForElementAttribute = /^\*/; // simple test for "#"
  const testDoNotEscapeHtml = /^\^/; // simple test for "^"
  const testDoNotEscpaeHtmlButToken = /^-/; // simple test for "-"
  const testDoNotEscpaeHtmlButSinglQuote = /^\>/; // simple test for ">"

  const extractTokens = /{([^{]+?)}/g;
  let debugCount = 0;

  const replaceTokens = (input, debugCount) =>
    input.replace(extractTokens, (...inner) => {
      const token = inner[1];
      let value;
      //try {
      if (token[0] === " ") {
        // if first character is a space, do not process
        value = `{${token}}`;
      } else if (values === null) {
        value = "";
      }
      //else if (testForFunc.test(token)) {
      //  try {
      //    console.log('eval... ' + token);
      //    value = eval(token.substring(1));
      //  }
      //  catch (e) {
      //    // if the token cannot be executed, then pass it through intact
      //    value = '{' + token + '}';
      //  }
      //}
      else if (testForElementAttribute.test(token)) {
        value = quoteattr(values[token.substring(1)]);
      } else if (testDoNotEscpaeHtmlButToken.test(token)) {
        value = values[token.substring(1)].replace(/{/g, "&#123;");
      } else if (testDoNotEscpaeHtmlButSinglQuote.test(token)) {
        value = values[token.substring(1)].replace(/'/g, "%27");
      } else if (testDoNotEscapeHtml.test(token)) {
        value = values[token.substring(1)];
      } else {
        if (Object.hasOwn(values, token)) {
          const toEscape = values[token];
          //value = typeof toEscape == 'undefined' || toEscape === null ? '' : ('' + toEscape).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/{/g, '&#123;');
          //Never escape HTML in this Chrome Extension
          value = toEscape === 0 ? 0 : toEscape || "";
        } else {
          if (_nextFilledWithEach_UsesExactMatchOnly) {
            value = `{${token}}`;
          } else {
            // console.log('missing property for filledWith: ' + token);
            value = "";
          }
        }
      }

      //REMOVE try... catch to optimize in this project... not dealing with unknown and untested input

      //          } catch (err) {
      //            console.log('filledWithError:\n' +
      //                err +
      //                '\ntoken:' +
      //                token +
      //                '\nvalue:' +
      //                value +
      //                '\ntemplate:' +
      //                input +
      //                '\nall values:\n');
      //            console.log(values);
      //            throw 'Error in Filled With';
      //          }
      return typeof value === "undefined" || value == null ? "" : `${value}`;
    });

  let result = replaceTokens(this.toString());

  let lastResult = "";
  while (lastResult !== result) {
    lastResult = result;
    if (debugCount > 0)
      console.log("filledWith loop count", debugCount || 0, "for", result);
    result = replaceTokens(result, +debugCount + 1);
  }

  return result;
};

function quoteattr(s, preserveCr1) {
  let preserveCr = preserveCr1 || false;
  preserveCr = preserveCr ? "&#13;" : "\n";
  return (
    `${s}` /* Forces the conversion to string. */
      .replace(/&/g, "&amp;") /* This MUST be the 1st replacement. */
      .replace(/'/g, "&apos;") /* The 4 other predefined entities, required. */
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      /*
        You may add other replacements here for HTML only 
        (but it's not necessary).
        Or for XML, only if the named entities are defined in its DTD.
        */
      .replace(/\r\n/g, preserveCr) /* Must be before the next replacement. */
      .replace(/[\r\n]/g, preserveCr)
  );
}

String.prototype.filledWithEach = function (arr) {
  /// <summary>Silimar to 'filledWith', but repeats the fill for each item in the array. Returns a single string with the results.
  /// </summary>
  if (arr === undefined || arr === null) {
    return "";
  }
  const result = [];
  for (let i = 0, max = arr.length; i < max; i++) {
    result[result.length] = this.filledWith(arr[i]);
  }
  _nextFilledWithEach_UsesExactMatchOnly = false;
  return result.join("");
};

function getRawMessage(key) {
  // default
  // return chrome.i18n.getMessage(key);

  // custom loader
  return _rawMessages[key.toLowerCase()];
}

function getMessage(key, obj, defaultValue) {
  let rawMsg = _cachedMessages[key];
  if (!rawMsg) {
    rawMsg = getRawMessage(key);
    _cachedMessages[key] = rawMsg;
  } else {
    // _cachedMessageUseCount++; --> good for testing
    //    console.log(_cachedMessageUseCount + ' ' + key);
  }

  let msg = rawMsg || defaultValue || `{${key}}`;
  if (obj === null || typeof obj === "undefined" || msg.search(/{/) === -1) {
    return msg;
  }

  let before = msg;
  let repeats = 0;
  while (repeats < 5) {
    // failsafe
    msg = msg.filledWith(obj);
    if (msg === before) {
      return msg;
    }
    if (msg.search(/{/) === -1) {
      return msg;
    }
    before = msg;
    repeats++;
  }
  return msg;
}

function digitPad2(num) {
  return `00${num}`.slice(-2);
}

function getOrdinal(num) {
  return ordinal[num] || ordinal[0] || num;
}

function getOrdinalName(num) {
  return ordinalNames[num] || num;
}

function addEventTime(obj) {
  const eventTime = obj.time;

  obj.eventYear = eventTime.getFullYear();
  obj.eventMonth = eventTime.getMonth(); // 0 based
  obj.eventDay = eventTime.getDate();
  obj.eventWeekday = eventTime.getDay();

  obj.eventMonthLong = gMonthLong[obj.eventMonth];
  obj.eventMonthShort = gMonthShort[obj.eventMonth];
  obj.eventWeekdayLong = gWeekdayLong[obj.eventWeekday];
  obj.eventWeekdayShort = gWeekdayShort[obj.eventWeekday];

  obj.eventTime = showTime(eventTime);
}

function getFocusTime() {
  if (!_focusTime) {
    _focusTime = new Date();
  }

  if (Number.isNaN(_focusTime)) {
    console.log("unexpected 1: ", _focusTime);
    _focusTime = new Date();
  }

  return _focusTime;
}

function setFocusTime(t) {
  _focusTime = t;
  if (Number.isNaN(_focusTime)) {
    console.log("unexpected 2: ", _focusTime);
  }
  putInStorageLocal(localStorageKey.focusTime, t.getTime());
  putInStorageLocal(localStorageKey.focusTimeAsOf, new Date().getTime());
}

function localizeHtml(host, fnOnEach) {
  // parse data-msg...  target:value,target,target,target:value
  // if no value given in one pair, use the element's ID
  // if the target element has child elements, they will be deleted. However, if a child has data-child='x' and resource text has {x}, {y}, etc. the children will be inserted in those spaces.
  // fnOnEach is passed the value and must return an updated value
  const accessKeyList = [];
  $(host || document)
    .find("[data-msg]")
    .each((domNum, dom) => {
      const el = $(dom);
      const children = el.children();
      const info = el.data("msg");
      const useDateInfo = el.data("msg-di");
      let accessKeyFor = null;
      let text = "";
      const parts = info.split(splitSeparator);
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const detail = part.split(":");
        let target = "";
        let value = "";
        if (detail.length === 1) {
          const key = detail[0];
          const key2 = key === "_id_" ? el.attr("id") : key;
          target = "html";
          value = getMessage(key2, useDateInfo ? _di : null);
        }
        if (detail.length === 2) {
          if (detail[0] === "extractAccessKeyFor") {
            accessKeyFor = detail[1];
            continue;
          }
          target = detail[0];
          value = getMessage(detail[1]);
        }
        if (fnOnEach) {
          value = fnOnEach(value);
        }
        if (target === "html") {
          $.each(children, (i, c) => {
            const name = $(c).data("child");
            value = value.replace(`{${name}}`, c.outerHTML);
          });
          el.html(value);
          localizeHtml(el);
          text = value;
        } else if (target === "text") {
          el.text(value);
          text = value;
        } else {
          el.attr(target, value);
        }
      }
      if (accessKeyFor) {
        const accessKey = $("<div/>")
          .html(text)
          .find("u")
          .text()
          .substring(0, 1);
        if (accessKey) {
          accessKeyList.push({
            id: accessKeyFor,
            key: accessKey,
          });
        }
      }
    });
  // apply after all done
  for (let a = 0; a < accessKeyList.length; a++) {
    const item = accessKeyList[a];
    $(`#${item.id}`).attr("accesskey", item.key);
  }
}

function getVersionInfo() {
  const info = "{0}:{1} ({2})".filledWith(
    chrome.runtime.getManifest().version,
    _languageCode,
    navigator.languages ? navigator.languages.slice(0, 2).join(",") : ""
  );
  return info;
}

function timeNow(msg) {
  // for debugging
  const now = new Date();
  const time = now.getMilliseconds() / 1000 + now.getSeconds();
  console.log(time, msg);
}

function shallowCloneOf(obj) {
  const clone = {};
  for (const key in obj) {
    if (Object.hasOwn(obj, key)) {
      clone[key] = obj[key];
    }
  }
  return clone;
}

// function console.log() {
//   // add a timestamp to console log entries
//   //  const a = ['%c'];
//   //  a.push('display: block; text-align: right;');
//   //  a.push(new dayjs().format('DD H:mm:ss'));
//   //  a.push('\n');
//   const a = ['\n'];
//   for (const x in log.arguments) {
//     if (log.arguments.hasOwnProperty(x)) {
//       a.push(log.arguments[x]);
//     }
//   }
//   console.log.apply(console, a);
// }

// google analytics using Measurement Protocol
const trackerFunc = async () => {
  let uid = await getFromStorageLocal(localStorageKey.uid);
  if (!uid) {
    uid = createGuid();
    putInStorageLocal(localStorageKey.uid, uid);
  }
  const baseParams = {
    ds: "app",
    tid: "UA-1312528-10",
    v: 1,
    cid: uid,
    an: "BadiWeb",
    ul: navigator.language,
    aid: browserHostType,
    av: chrome.runtime.getManifest().version,
  };

  const send = (info) => {
    if (settings.optedOutOfGoogleAnalytics === true) {
      console.log("opted out of analytics");
      return;
    }
    const data = $.extend(info, baseParams);

    const useDebug = false; // turn on during initial testing
    if (useDebug) {
      $.post("https://www.google-analytics.com/debug/collect", data);
    } else {
      $.post("https://www.google-analytics.com/collect", data);
    }
  };

  const sendEvent = (category, action) => {
    send({ t: "event", ec: category, ea: action });
  };
  const sendAppView = (id) => {
    send({ t: "screenview", cd: id });
  };
  return {
    sendEvent: sendEvent,
    sendAppView: sendAppView,
  };
};

async function prepareAnalytics() {
  tracker = await trackerFunc();

  //  if (typeof tracker !== 'undefined') {
  //    const service = analytics.getService('BadiCal');
  //    service.getConfig().addCallback(function (config) {
  //      tracker.sendEvent('opened', getVersionInfo());
  //    });
  //    tracker = service.getTracker('UA-1312528-10');
  //    tracker.set('appVersion', chrome.runtime.getManifest().version);
  //    tracker.set('language', navigator.language);
  //  }
}

function createGuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

chrome.runtime.onMessage.addListener(async (payload, sender, callback1) => {
  const callback = callback1 || (() => {}); // make it optional

  switch (payload.cmd) {
    case "getInfo": {
      // layout, targetDay
      // can adjust per layout
      const di = getDateInfo(new Date(payload.targetDay));
      callback({
        label: (await getFromStorageLocal(
          localStorageKey.gCalLabel,
          payload.labelFormat || "{bMonthNamePri} {bDay}"
        )).filledWith(di),
        title: (await getFromStorageLocal(
          localStorageKey.gCalTitle,
          payload.titleFormat ||
            "⇨ {endingSunsetDesc}\n{bYear}.{bMonth}.{bDay}\n{element}"
        )).filledWith(di),
        classes: `${di.bDay === 1 ? " firstBDay" : ""} element${di.elementNum}`,
      });
      break;
    }

    // case "getStorage":
    //   callback({
    //     value: await getFromStorageLocal(payload.key, payload.defaultValue),
    //   });
    //   break;

    default:
      callback();
      break;
  }
});

chrome.runtime.onMessageExternal.addListener(
  /*
    cmd options:  getInfo, connect
  
     * payload:
     *  { 
     *    cmd: 'getInfo'
     *    targetDay: date/datestring for new Date(targetDay)
     *    labelFormat: '{bDay}' (optional)
     *  }
     * returns:
     *  {
     *   label: {bMonthNamePri} {bDay}
     *   title:
     *   classes: '[firstBDay] element4'
     *  }
     * 
     */
  async (payload, sender, callback1) => {
    const callback = callback1 || (() => {}); // make it optional
    switch (payload.cmd) {
      case "getInfo": {
        // layout, targetDay
        // can adjust per layout
        const di = getDateInfo(new Date(payload.targetDay));
        const holyDay = $.grep(
          holyDays.prepareDateInfos(di.bYear),
          (el, i) =>
            el.Type.substring(0, 1) === "H" && el.BDateCode === di.bDateCode
        );
        const holyDayName =
          holyDay.length > 0 ? getMessage(holyDay[0].NameEn) : null;

        callback({
          label: (
            payload.labelFormat ||
            (await getFromStorageLocal(
              localStorageKey.gCalLabel,
              "{bMonthNamePri} {bDay}"
            ))
          ).filledWith(di),
          title: (
            payload.titleFormat ||
            (await getFromStorageLocal(
              localStorageKey.gCalTitle,
              "⇨ {endingSunsetDesc}\n{bYear}.{bMonth}.{bDay}\n{element}"
            ))
          ).filledWith(di),
          classes: `${di.bDay === 1 ? " firstBDay" : ""} element${
            di.elementNum
          }`,
          di: di,
          hd: holyDayName,
        });
        break;
      }

      // case "getStorage":
      //   callback({
      //     value: await getFromStorageLocal(payload.key, payload.defaultValue),
      //   });
      //   break;

      case "connect":
        callback({
          value: "Wondrous Calendar!",
          id: chrome.runtime.id,
        });
        break;

      default:
        callback();
        break;
    }
  }
);

// use Local for ephemeral data, and Sync for settings
async function putInStorageLocal(key, obj) {
  await putInStorageRaw("local", key, obj);
}

async function getFromStorageLocal(key, defaultvalue) {
  return getFromStorageRaw("local", key, defaultvalue);
}

async function removeFromStorageLocal(key) {
  await removeFromStorageRaw("local", key);
}

// sync versions
async function putInStorageSync(key, obj) {
  await putInStorageRaw("sync", key, obj);
}

async function getFromStorageSync(key, defaultvalue) {
  return getFromStorageRaw("sync", key, defaultvalue);
}

async function removeFromStorageSync(key) {
  await removeFromStorageRaw("sync", key);
}

/** Generic versions */
const ObjectConstant = "$****$";

async function putInStorageRaw(storageType, key, value) {
  if (value === null || value === undefined) {
    removeFromStorageRaw(storageType, key);
    return;
  }

  let value2 = value;
  if (typeof value === "object" || typeof value === "boolean") {
    const strObj = JSON.stringify(value);
    value2 = ObjectConstant + strObj;
  }

  switch (storageType) {
    case "sync":
      await chrome.storage.sync.set({ [key]: `${value2}` });
      break;
    default:
      await chrome.storage.local.set({ [key]: `${value2}` });
  }
}
async function getFromStorageRaw(storageType, key, defaultvalue) {
  const keyWithDefault = { [key]: defaultvalue };
  const storedObj =
    storageType === "sync"
      ? await chrome.storage.sync.get(keyWithDefault)
      : await chrome.storage.local.get(keyWithDefault);

  const value = storedObj[key];

  if (typeof value !== "undefined" && value != null) {
    if (
      typeof value === "string" &&
      value.substring(0, ObjectConstant.length) === ObjectConstant
    ) {
      return $.parseJSON(value.substring(ObjectConstant.length));
    }
    return value;
  }

  return defaultvalue;
}

async function removeFromStorageRaw(storageType, key) {
  switch (storageType) {
    case "sync":
      await chrome.storage.sync.remove(key);
      break;
    default:
      await chrome.storage.local.remove(key);
  }
}
