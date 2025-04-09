/* Code by Glen Little - 2014 - 2024 */

// these use VAR to be globally available
var splitSeparator = /[,،]+/;
var prepared = false;

var _currentPageId = null;
var _rawMessages = {};
var _rawMessageTranslationPct = 0;
var _numMessagesEn = 0;
var _cachedMessages = {};
var _cachedMessageUseCount = 0;

var _pendingInstallFunctionsQueue = [];

var _nextFilledWithEach_UsesExactMatchOnly = false;
var _focusTime = null;
var _alarmNamePrefix = "alarm_";
var _refreshPrefix = "refreshAlarm ";

var _holyDaysEngine = null;
var _knownDateInfos = {};
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
var tracker; // google

var use24HourClock;
var _iconPrepared = false;
var _remindersEngine = {};

var _inTab = false;

// Make sure this function is globally accessible
function openInTab() {
  console.log("Opening popup in a new tab from shared.js");
  browser.tabs.create({ url: "popup.html" });
}

// Function to update icon color based on browser color scheme
// Function to show the icon with the current date and color
function showIcon() {
  try {
    if (!_di || !_di.bDay) {
      console.log("Date info not available yet for icon");
      return;
    }

    // Use the color from common settings
    const textColor = common.iconTextColor || "#000000";

    // Create a dynamic icon with the current Badí' day
    const canvas = new OffscreenCanvas(48, 48);
    const ctx = canvas.getContext("2d");

    // Clear canvas
    ctx.clearRect(0, 0, 48, 48);

    // Background
    ctx.fillStyle = "transparent";
    ctx.fillRect(0, 0, 48, 48);

    // Text settings
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Draw day number
    ctx.font = "bold 24px Arial";
    ctx.fillText(_di.bDay.toString(), 24, 24);

    // Convert to ImageData and set as icon
    const imageData = ctx.getImageData(0, 0, 48, 48);

    // Set the icon
    browser.action.setIcon({ imageData: imageData });

    // Set the title (tooltip)
    const title = common.formatToolTip1.filledWith(_di) + "\n" + common.formatToolTip2.filledWith(_di);
    browser.action.setTitle({ title: title });

    _iconPrepared = true;
    console.log("Icon updated with color:", textColor);
  } catch (error) {
    console.error("Error updating icon:", error);
  }
}

function updateIconColorBasedOnColorScheme(event) {
  if (common.iconTextColorMode === "auto") {
    let isDarkMode = false;

    // Check if window exists (not in service worker context)
    if (typeof window !== "undefined" && window.matchMedia) {
      isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else {
      // In service worker context, default to light mode
      // or try to get from storage if available
      console.log("Window not available, defaulting to light mode");
    }

    common.iconTextColor = isDarkMode ? "#FFFFFF" : "#000000"; // White for dark mode, black for light mode

    if (event) {
      console.log("Color scheme changed to:", isDarkMode ? "dark" : "light");
      // Refresh the icon with the new color
      showIcon();
    }
  }
}

// in alphabetical order
var localStorageKey = {
  firstPopup: "firstPopup",
  focusPage: "focusPage",
  focusTimeAsOf: "focusTimeAsOf",
  focusTime: "focusTime",
  focusTimeIsEve: "focusTimeIsEve",
  gCalLabel: "gCalLabel",
  gCalTitle: "gCalTitle",
  googleUid: "googleUid",
  iconTextColor: "iconTextColor",
  iconTextColorMode: "iconTextColorMode", // "auto", "manual"
  locationLat: "locationLat",
  locationKnown: "locationKnown",
  locationName: "locationName",
  locationNameKnown: "locationNameKnown",
  locationLong: "locationLong",
  reminderDefinitions: "reminderDefinitions",
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

var browserType = {
  Chrome: "Chrome",
  Firefox: "Firefox",
  Edge: "Edge",
};

var browserHostType = browserType.Chrome; // hard coded in the Chrome version of the extension

var common = {};

/**
 * Set up everything that is needed by the service worker and the popup
 */
async function prepareForBackgroundAndPopupAsync() {
  // console.log("%cprepare in shared - started", "color: lightblue");

  dayjs.extend(dayjs_plugin_utc);
  dayjs.extend(dayjs_plugin_timezone);

  common.languageCode = await getFromStorageSyncAsync(syncStorageKey.language, "");

  if (!common.languageCode) {
    common.languageCode = chrome.i18n.getUILanguage();
    putInStorageSyncAsync(syncStorageKey.language, common.languageCode);
  }

  await loadRawMessages(common.languageCode);

  common.useArNames = await getFromStorageSyncAsync(syncStorageKey.useArNames, true);

  // Get user's preferred icon color or use auto mode
  common.iconTextColorMode = await getFromStorageLocalAsync(localStorageKey.iconTextColorMode, "auto");
  common.iconTextColor = await getFromStorageLocalAsync(localStorageKey.iconTextColor, "#000000");

  // If in auto mode, set the color based on the browser's color scheme
  if (common.iconTextColorMode === "auto") {
    updateIconColorBasedOnColorScheme();

    // Add listener for color scheme changes - only in window context (not in service worker)
    if (typeof window !== "undefined" && window.matchMedia) {
      try {
        const colorSchemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

        // Modern browsers
        if (colorSchemeMediaQuery.addEventListener) {
          colorSchemeMediaQuery.addEventListener("change", updateIconColorBasedOnColorScheme);
        }
        // Older browsers
        else if (colorSchemeMediaQuery.addListener) {
          colorSchemeMediaQuery.addListener(updateIconColorBasedOnColorScheme);
        }
      } catch (error) {
        console.log("Could not set up color scheme listener:", error);
      }
    }
  }

  common.languageDir = getMessage("textDirection", null, "ltr");

  common.locationLat = await getFromStorageLocalAsync(localStorageKey.locationLat);
  common.locationLong = await getFromStorageLocalAsync(localStorageKey.locationLong);
  common.locationKnown = await getFromStorageLocalAsync(localStorageKey.locationKnown);
  common.locationName = await getFromStorageLocalAsync(localStorageKey.locationName);
  common.locationNameKnown = await getFromStorageLocalAsync(localStorageKey.locationNameKnown);

  common.customFormats = await getFromStorageSyncAsync(syncStorageKey.customFormats, []);
  common.googleUid = await getFromStorageLocalAsync(localStorageKey.googleUid, null);

  common.eventStart = await getFromStorageSyncAsync(syncStorageKey.eventStart, "1930");
  common.jumpTo = await getFromStorageSyncAsync(syncStorageKey.jumpTo, "90");
  common.ifttt = await getFromStorageSyncAsync(syncStorageKey.iftttKey, "");
  common.zapierWebhook = await getFromStorageSyncAsync(syncStorageKey.zapierWebhook, "");
  common.firstPopup = await getFromStorageLocalAsync(localStorageKey.firstPopup, false);
  common.includeFeasts = await getFromStorageSyncAsync(syncStorageKey.includeFeasts, true);
  common.includeHolyDays = await getFromStorageSyncAsync(syncStorageKey.includeHolyDays, true);
  common.showPointer = await getFromStorageSyncAsync(syncStorageKey.showPointer, true);
  common.focusTimeAsOf = await getFromStorageLocalAsync(localStorageKey.focusTimeAsOf, "0");
  common.focusPage = await getFromStorageLocalAsync(localStorageKey.focusPage);
  common.focusTime = await getFromStorageLocalAsync(localStorageKey.focusTime, "B0");

  common.formatTopDay = await getFromStorageSyncAsync(syncStorageKey.formatTopDay, getMessage("bTopDayDisplay"));
  common.formatToolTip1 = await getFromStorageSyncAsync(syncStorageKey.formatToolTip1, getMessage("formatIconToolTip"));
  common.formatToolTip2 = await getFromStorageSyncAsync(syncStorageKey.formatToolTip2, "{nearestSunset}");

  bMonthNameAr = getMessage("bMonthNameAr").split(splitSeparator);
  bMonthMeaning = getMessage("bMonthMeaning").split(splitSeparator);

  bWeekdayNameAr = getMessage("bWeekdayNameAr").split(splitSeparator); // from Saturday
  bWeekdayMeaning = getMessage("bWeekdayMeaning").split(splitSeparator);

  bYearInVahidNameAr = getMessage("bYearInVahidNameAr").split(splitSeparator);
  bYearInVahidMeaning = getMessage("bYearInVahidMeaning").split(splitSeparator);

  gWeekdayLong = getMessage("gWeekdayLong").split(splitSeparator);
  gWeekdayShort = getMessage("gWeekdayShort").split(splitSeparator);
  gMonthLong = getMessage("gMonthLong").split(splitSeparator);
  gMonthShort = getMessage("gMonthShort").split(splitSeparator);

  ordinal = getMessage("ordinal").split(splitSeparator);
  ordinalNames = getMessage("ordinalNames").split(splitSeparator);
  elements = getMessage("elements").split(splitSeparator);

  use24HourClock = getMessage("use24HourClock") === "true";

  setupLanguageChoice();

  _holyDaysEngine = new HolyDays();
  refreshDateInfo();
  // console.log(`Nearest sunset:`, _di.nearestSunset);

  prepareAnalyticsTracker();

  prepared = true;
  // console.log("Finished preparing for background and popup");
  await FlushPendingInstallFunctionsAsync();

  // console.log("%cprepare in shared - done", "color: lightblue");
}

async function prepareSharedForPopup() {
  common.exporter_exporterName = await getFromStorageSyncAsync(syncStorageKey.exporter_exporterName, getMessage("title"));
  common.exporter_exporterDateRange = await getFromStorageSyncAsync(syncStorageKey.exporter_exporterDateRange);
  common.exporter_alertMinutes = await getFromStorageSyncAsync(syncStorageKey.exporter_alertMinutes, "B0");

  common.optedOutOfGoogleAnalytics = await getFromStorageSyncAsync(syncStorageKey.optOutGa, -1);
  common.rememberFocusTimeMinutes = 5; // show on settings page?
  //  integrateIntoGoogleCalendar: await getFromStorageLocalAsync(localStorageKey.enableGCal, true),

  // must be set immediately for tab managers to see this name
  $("#windowTitle").text(getMessage("title"));

  // see messages.json for translations and local names

  $("#loadingMsg").html(getMessage("browserActionTitle"));

  startGettingLocation();

  const langCode = common.languageCode.slice(0, 2);
  $("body")
    .addClass(common.languageCode)
    .addClass(common.languageDir)
    .addClass(langCode)
    .addClass(browserHostType)
    .attr("lang", common.languageCode)
    .attr("dir", common.languageDir);

  _initialDiStamp = getDateInfo(new Date(), true);

  await recallFocusAndSettingsAsync();

  updateLoadProgress("refresh date info");

  UpdateLanguageBtn();

  updateLoadProgress("defaults");
  prepareDefaultsInPopup();

  if (_iconPrepared) {
    refreshDateInfo();
  } else {
    await refreshDateInfoAndShowAsync();
  }

  const isEve = await getFromStorageLocalAsync(localStorageKey.focusTimeIsEve, "x");
  if (isEve !== "x" && isEve !== _di.bNow.eve) {
    toggleEveOrDay(isEve);
  }

  updateLoadProgress("localize");
  localizeHtml();

  updateLoadProgress("page custom");
  _pageCustom = PageCustom();

  updateLoadProgress("showInfo");
  showInfo();

  updateLoadProgress("showPage");
  await showPage();

  updateLoadProgress("shortcut keys");
  showShortcutKeys();

  updateLoadProgress("handlers");
  attachHandlersInPopup();

  updateLoadProgress("btn open");
  showBtnOpen();

  updateLoadProgress("tab names");
  updateTabNames();

  updateLoadProgress("prepare2 soon");

  setTimeout(prepare2, 0);

  // if viewing first page, show now
  if (_currentPageId === "pageDay") {
    adjustHeight();
    $("#initialCover").hide();
  }
}

async function loadJsonfileAsync(filePath, num) {
  try {
    const url = browser.runtime.getURL(filePath);
    const response = await fetch(url);
    if (!response.ok && num === 1) {
      console.log(`File not found: ${filePath}`);
      return null;
    }
    const jsonData = await response.json();
    return jsonData;
  } catch (error) {
    // console.error(`Error fetching file ${filePath}:`, error);
    return null;
  }
}

async function loadLocaleMessageFileAsync(langToLoad, fileCount = 5) {
  // Create array of URLs dynamically based on fileCount
  const urls = Array.from({ length: fileCount }, (_, i) => {
    return {
      path: `/_locales/${langToLoad}/messages${i + 1}.json`,
      num: i
    };
  });

  const loadPromises = urls.map((url) => loadJsonfileAsync(url.path, url.num).then((data) => ({ value: data })));

  const results = await Promise.allSettled(loadPromises);

  // Combine all successful results into a single object
  const combinedMessages = results
    .filter((result) => result.value)
    .map((result) => result.value)
    .reduce((acc, curr) => ({ ...acc, ...curr }), {});

  return combinedMessages;
}

async function loadRawMessages(langCode, cb) {
  // load base English, then overwrite with base for language, then with full lang code
  // console.log("loading", langCode);

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

    const messages = await loadLocaleMessageFileAsync(langToLoad);

    if (!messages) {
      console.log("no source found for", langToLoad);
      continue;
    }

    const keys = Object.keys(messages);

    // console.log("loading", keys.length, "keys from", langToLoad);

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

  _rawMessageTranslationPct = Math.round(numMessagesOther === -1 || _numMessagesEn === 0 ? 100 : (100 * numMessagesOther) / _numMessagesEn);
  console.log(
    "loaded",
    _numMessagesEn,
    numMessagesOther === -1 ? "n/a" : numMessagesOther,
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

function setupLanguageChoice() {
  // debugger;
  bMonthNamePri = common.useArNames ? bMonthNameAr : bMonthMeaning;
  bMonthNameSec = !common.useArNames ? bMonthNameAr : bMonthMeaning;
  bWeekdayNamePri = common.useArNames ? bWeekdayNameAr : bWeekdayMeaning;
  bWeekdayNameSec = !common.useArNames ? bWeekdayNameAr : bWeekdayMeaning;
  bYearInVahidNamePri = common.useArNames ? bYearInVahidNameAr : bYearInVahidMeaning;
  bYearInVahidNameSec = !common.useArNames ? bYearInVahidNameAr : bYearInVahidMeaning;
}

function refreshDateInfo() {
  // console.log("Refresh date info for", common.locationLat, common.locationLong);
  _di = getDateInfo(getFocusTime());
}

function getDateInfo(targetTime, onlyStamp) {
  let targetTimeLocal = targetTime;
  // hard code limits
  const minDate = new Date(1844, 2, 21, 0, 0, 0, 0);
  if (targetTimeLocal < minDate) {
    targetTimeLocal = minDate;
  } else {
    const maxDate = new Date(2844, 2, 20, 0, 0, 0, 0);
    if (targetTimeLocal > maxDate) {
      targetTimeLocal = maxDate;
    }
  }

  const known = _knownDateInfos[targetTimeLocal];
  if (known) {
    // console.log("%cKnown date info for", "color:lightgreen", targetTimeLocal);
    return known;
  }

  // debugger;

  const bNow = _holyDaysEngine.getBDate(targetTimeLocal);
  if (onlyStamp) {
    return {
      stamp: JSON.stringify(bNow),
      stampDay: "{y}.{m}.{d}".filledWith(bNow),
    };
  }

  // split the Baha'i day to be "Eve" - sunset to midnight;
  // and "Morn" - from midnight through to sunset
  const frag1Noon = new Date(targetTimeLocal.getTime());
  frag1Noon.setHours(12, 0, 0, 0);
  if (!bNow.eve) {
    // if not already frag1, make it so
    frag1Noon.setDate(frag1Noon.getDate() - 1);
  }
  const frag2Noon = new Date(frag1Noon.getTime());
  frag2Noon.setDate(frag2Noon.getDate() + 1);

  const frag1SunTimes = sunCalculator.getTimes(frag1Noon, common.locationLat, common.locationLong);
  const frag2SunTimes = sunCalculator.getTimes(frag2Noon, common.locationLat, common.locationLong);

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

    currentYear: targetTimeLocal.getFullYear(),
    currentMonth: targetTimeLocal.getMonth(), // 0 based
    currentMonth1: 1 + targetTimeLocal.getMonth(),
    currentDay: targetTimeLocal.getDate(),
    currentDay00: digitPad2(targetTimeLocal.getDate()),
    currentWeekday: targetTimeLocal.getDay(),
    currentTime: targetTimeLocal,

    startingSunsetDesc12: getTimeDisplay(frag1SunTimes.sunset),
    startingSunsetDesc24: getTimeDisplay(frag1SunTimes.sunset, 24),
    endingSunsetDesc12: getTimeDisplay(frag2SunTimes.sunset),
    endingSunsetDesc24: getTimeDisplay(frag2SunTimes.sunset, 24),
    frag1SunTimes: frag1SunTimes,
    frag2SunTimes: frag2SunTimes,

    sunriseDesc12: getTimeDisplay(frag2SunTimes.sunrise),
    sunriseDesc24: getTimeDisplay(frag2SunTimes.sunrise, 24),

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
  di.bDayNamePri = common.useArNames ? di.bDayNameAr : di.bDayMeaning;
  di.bDayNameSec = !common.useArNames ? di.bDayNameAr : di.bDayMeaning;
  di.bMonthNamePri = common.useArNames ? di.bMonthNameAr : di.bMonthMeaning;
  di.bMonthNameSec = !common.useArNames ? di.bMonthNameAr : di.bMonthMeaning;

  di.VahidLabelPri = common.useArNames ? getMessage("vahid") : getMessage("vahidLocal");
  di.VahidLabelSec = !common.useArNames ? getMessage("vahid") : getMessage("vahidLocal");

  di.KullishayLabelPri = common.useArNames ? getMessage("kullishay") : getMessage("kullishayLocal");
  di.KullishayLabelSec = !common.useArNames ? getMessage("kullishay") : getMessage("kullishayLocal");

  di.bKullishay = Math.floor(1 + (di.bVahid - 1) / 19);
  di.bVahid = di.bVahid - (di.bKullishay - 1) * 19;
  di.bYearInVahid = di.bYear - (di.bVahid - 1) * 19 - (di.bKullishay - 1) * 19 * 19;

  di.bYearInVahidNameAr = bYearInVahidNameAr[di.bYearInVahid];
  di.bYearInVahidMeaning = bYearInVahidMeaning[di.bYearInVahid];
  di.bYearInVahidNamePri = common.useArNames ? di.bYearInVahidNameAr : di.bYearInVahidMeaning;
  di.bYearInVahidNameSec = !common.useArNames ? di.bYearInVahidNameAr : di.bYearInVahidMeaning;

  di.bWeekdayNameAr = bWeekdayNameAr[di.bWeekday];
  di.bWeekdayMeaning = bWeekdayMeaning[di.bWeekday];
  di.bWeekdayNamePri = common.useArNames ? di.bWeekdayNameAr : di.bWeekdayMeaning;
  di.bWeekdayNameSec = !common.useArNames ? di.bWeekdayNameAr : di.bWeekdayMeaning;

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

  di.startingSunsetDesc = use24HourClock ? di.startingSunsetDesc24 : di.startingSunsetDesc12;
  di.endingSunsetDesc = use24HourClock ? di.endingSunsetDesc24 : di.endingSunsetDesc12;
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

  di.currentRelationToSunset = getMessage(bNow.eve ? "afterSunset" : "beforeSunset");
  const thisMoment = new Date().getTime();
  di.dayStarted = getMessage(thisMoment > di.frag1SunTimes.sunset.getTime() ? "dayStartedPast" : "dayStartedFuture");
  di.dayEnded = getMessage(thisMoment > di.frag2SunTimes.sunset.getTime() ? "dayEndedPast" : "dayEndedFuture");
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
  di.nearestSunset = getMessage(bNow.eve ? "nearestSunsetEve" : "nearestSunsetDay", di);

  di.stampDay = "{y}.{m}.{d}".filledWith(di.bNow); // ignore eve/day

  //if (!skipUpcoming) {
  //  getUpcoming(di);
  //}

  _knownDateInfos[targetTimeLocal] = di;

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

function getToolTipMessageTemplate(lineNum) {
  // can be overwritten in the custom page
  switch (lineNum) {
    case 1:
      return common.formatToolTip1; // await getFromStorageSyncAsync(localStorageKey.formatToolTip1, getMessage("formatIconToolTip"));
    case 2:
      return common.formatToolTip2; // await getFromStorageSyncAsync(localStorageKey.formatToolTip2, "{nearestSunset}");
  }
  return "";
}

function showIcon() {
  const dateInfo = getDateInfo(new Date());
  const tipLines = [];
  tipLines.push(common.formatToolTip1.filledWith(dateInfo));
  tipLines.push(common.formatToolTip2.filledWith(dateInfo));
  tipLines.push("");

  if (dateInfo.special1) {
    tipLines.push(dateInfo.special1);
    if (dateInfo.special2) {
      tipLines.push(dateInfo.special2);
    }
    tipLines.push("");
  }

  if (dateInfo.bMonth === 19) {
    tipLines.push(`${getMessage("sunriseFastHeading")} - ${getTimeDisplay(dateInfo.frag2SunTimes.sunrise)}`);
    tipLines.push("");
  }

  tipLines.push(getMessage("formatIconClick"));

  browser.action.setTitle({ title: tipLines.join("\n") });

  try {
    browser.action.setIcon({
      imageData: drawIconImage(dateInfo.bMonthNamePri, dateInfo.bDay, "center"),
    });
    _iconPrepared = true;
  } catch (e) {
    // fails in Firefox unless in the popup
    console.log("icon failed");
    console.log(e);
    _iconPrepared = false;
  }
}

function drawIconImage(line1, line2, line2Alignment) {
  const size = 19;
  const canvas = new OffscreenCanvas(size, size);

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  const fontName = "Tahoma";

  context.fillStyle = common.iconTextColor;

  // const line1div = "<div>{^0}</div>".filledWith(line1);
  // const line2div = "<div>{^0}</div>".filledWith(line2);

  context.font = `${size / 2 - 1}px ${fontName}`;
  context.fillText(line1, 0, 7);

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
  context.fillText(line2, x, size);

  return context.getImageData(0, 0, size, size);
}

function getUpcoming(di) {
  if (di.upcomingHtml) {
    return; // already done
  }
  const dayInfos = _holyDaysEngine.getUpcoming(di, 3);
  const today = dayjs(di.frag2);
  today.hour(0);
  di.special1 = null;
  di.special2 = null;

  dayInfos.forEach((dayInfo) => {
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

  di.upcomingHtml = "<tr class={Type}><td>{away}</td><td>{^A}</td><td>{^date}</td></tr>".filledWithEach(dayInfos);
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

function getTimeDisplay(d, use24) {
  const hoursType = use24HourClock || use24 === 24 ? 24 : 0;
  const show24Hour = hoursType === 24;
  const hours24 = d.getHours();
  const pm = hours24 >= 12;
  const hours = show24Hour ? hours24 : hours24 > 12 ? hours24 - 12 : hours24 === 0 ? 12 : hours24;
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

async function startGetLocationNameAsync() {
  // debugger;

  try {
    const unknownLocation = getMessage("noLocationName");
    const lat = common.locationLat;
    const long = common.locationLong;
    if (!lat || !long) {
      common.locationName = unknownLocation;
      // console.log("No location, so not getting location name");
      return;
    }
    // console.log("Getting location name for", lat, long);

    // Send a message to the background script to get the city name
    browser.runtime
      .sendMessage({
        action: "getCityName",
        lat: lat,
        long: long,
        unknownLocation: unknownLocation,
      })
      .then((response) => {
        const location = response.city || unknownLocation;
        // console.log("Location:", location);

        putInStorageLocalAsync(localStorageKey.locationName, location);
        common.locationName = location;

        const known = location !== unknownLocation;
        putInStorageLocalAsync(localStorageKey.locationNameKnown, known);
        common.locationNameKnown = known;

        stopLoaderButton();

        if (typeof _inPopupPage !== "undefined") {
          showLocation();
        }
      });
  } catch (error) {
    console.log(error);
  }
}

function stopLoaderButton() {
  $(".btnRetry").removeClass("active");
}

function startGettingLocation() {
  const positionOptions = {
    enableHighAccuracy: false,
    maximumAge: Number.POSITIVE_INFINITY,
    timeout: 6000,
  };
  navigator.geolocation.getCurrentPosition(setLocationAsync, noLocationAsync, positionOptions); // this triggers immediately
}

async function setLocationAsync(position) {
  if (+common.locationLat === position.coords.latitude && +common.locationLong === position.coords.longitude && common.locationNameKnown) {
    // no changes
    // console.log("Location:", common.locationName, common.locationNameKnown);
    return;
  }

  putInStorageLocalAsync(localStorageKey.locationLat, common.locationLat);
  common.locationLat = position.coords.latitude;

  putInStorageLocalAsync(localStorageKey.locationLong, common.locationLong);
  common.locationLong = position.coords.longitude;

  _knownDateInfos = {};

  common.locationKnown = true;
  putInStorageLocalAsync(localStorageKey.locationKnown, true);

  common.locationNameKnown = false;
  putInStorageLocalAsync(localStorageKey.locationNameKnown, false);

  putInStorageLocalAsync(localStorageKey.locationName, getMessage("browserActionTitle")); // temp until we get it

  if (typeof _inPopupPage !== "undefined") {
    $("#inputLat").val(common.locationLat);
    $("#inputLng").val(common.locationLong);
    await updateLocationAsync(true);
  } else {
    await refreshDateInfoAndShowAsync();
  }
}

async function noLocationAsync(err) {
  if (common.locationNameKnown) {
    return;
  }

  common.locationLat = 0;
  common.locationLong = 0;

  putInStorageLocalAsync(localStorageKey.locationLat, common.locationLong);
  putInStorageLocalAsync(localStorageKey.locationLong, common.locationLong);

  _knownDateInfos = {};

  console.warn(err);

  putInStorageLocalAsync(localStorageKey.locationKnown, false);
  common.locationKnown = false;

  const noLocAvail = getMessage("noLocationAvailable");
  putInStorageLocalAsync(localStorageKey.locationName, noLocAvail);
  common.locationName = noLocAvail;

  stopLoaderButton();

  await refreshDateInfoAndShowAsync();
}

async function recallFocusAndSettingsAsync() {
  const storedAsOf = +common.focusTimeAsOf;
  if (!storedAsOf) {
    common.focusTimeIsEve = null;
    putInStorageLocalAsync(localStorageKey.focusTimeIsEve, null);
    return;
  }
  const focusTimeAsOf = new Date(storedAsOf);
  let timeSet = false;

  const now = new Date();
  if (now - focusTimeAsOf < common.rememberFocusTimeMinutes * 60000) {
    const focusPage = common.focusPage;
    if (focusPage && typeof _currentPageId !== "undefined") {
      _currentPageId = focusPage;
    }

    const stored = +common.focusTime;
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
    putInStorageLocalAsync(localStorageKey.focusPage, null);
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

async function refreshDateInfoAndShowAsync(resetToNow) {
  // also called from alarm, to update to the next day
  if (resetToNow) {
    setFocusTime(new Date());
  } else {
    // will reset to now after a few minutes
    await recallFocusAndSettingsAsync();
  }
  // console.log("refreshDateInfoAndShow at", new Date());
  refreshDateInfo();
  _firstLoad = false;

  showIcon();
  if (typeof showInfo !== "undefined") {
    // are we inside the open popup?
    showInfo();
    showWhenResetToNow();
  }

  setAlarmForNextRefresh(_di.currentTime, _di.frag2SunTimes.sunset, _di.bNow.eve);

  // Set a backup periodic alarm to ensure the icon is refreshed even if the sunset/midnight alarms fail
  browser.alarms.create("periodic_refresh", { periodInMinutes: 60 });
}

const refreshAlarms = {};

function setAlarmForNextRefresh(currentTime, sunset, inEvening) {
  let whenTime;
  let alarmName;

  // Validate inputs first
  if (!currentTime || !(currentTime instanceof Date)) {
    console.warn("Invalid currentTime provided to setAlarmForNextRefresh:", currentTime);
    currentTime = new Date(); // Use current time as fallback
  }

  if (inEvening) {
    // in eve, after sunset, so update after midnight
    const midnight = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate() + 1).getTime();
    whenTime = midnight + 1000; // to be safe, set at least 1 second after midnight
    alarmName = _refreshPrefix + "midnight";
  } else {
    // in the day, so update right at the sunset
    // Check if sunset is valid
    if (!sunset || !(sunset instanceof Date) || isNaN(sunset.getTime())) {
      console.warn("Invalid sunset time:", sunset);
      // Calculate a fallback sunset time (approximately 6 PM)
      const fallbackSunset = new Date(currentTime);
      fallbackSunset.setHours(18, 0, 0, 0);

      // If fallback is in the past, use tomorrow
      if (fallbackSunset < currentTime) {
        fallbackSunset.setDate(fallbackSunset.getDate() + 1);
      }

      sunset = fallbackSunset;
      console.log("Using fallback sunset time:", sunset);
    }

    whenTime = sunset.getTime();
    alarmName = _refreshPrefix + "sunset";
  }

  // Check if the alarm time is in the past
  const now = new Date().getTime();
  if (whenTime < now) {
    console.warn(
      "Attempted to set {0} alarm in the past. Current time: {1}, Alarm time: {2}".filledWith(
        alarmName,
        new Date(now).toISOString(),
        new Date(whenTime).toISOString()
      )
    );

    // Set alarm for 1 minute in the future as a fallback
    whenTime = now + 60000;
    console.log("Using fallback time 1 minute from now:", new Date(whenTime));
  }

  // Final validation for invalid times
  if (isNaN(whenTime) || whenTime === 0 || whenTime === Infinity) {
    console.error("Invalid time calculated for {0} alarm. Using fallback.".filledWith(alarmName));
    whenTime = now + 3600000; // 1 hour from now as a last resort
    console.log("Using last resort fallback time 1 hour from now:", new Date(whenTime));
  }

  refreshAlarms[whenTime] = true;

  try {
    browser.alarms.create(alarmName, { when: whenTime });
    console.log("Successfully set {0} alarm for {1}".filledWith(alarmName, new Date(whenTime).toISOString()));

    // Debug: show the alarm that was just set
    browser.alarms
      .get(alarmName)
      .then((alarm) => {
        if (alarm) {
          console.log("Verified alarm:", alarm.name, "scheduled for", new Date(alarm.scheduledTime).toISOString());
        } else {
          console.warn("Failed to verify alarm:", alarmName);
        }
      })
      .catch((error) => {
        console.error("Error verifying alarm:", error);
      });
  } catch (error) {
    console.error("Error creating alarm:", error);

    // Try one more time with a different approach
    try {
      const delayInMinutes = Math.max(1, (whenTime - Date.now()) / 60000);
      browser.alarms.create(alarmName, { delayInMinutes: delayInMinutes });
      console.log("Created fallback alarm with delay of", delayInMinutes, "minutes");
    } catch (secondError) {
      console.error("Failed to create fallback alarm:", secondError);
    }
  }

  // List all active alarms for debugging
  browser.alarms
    .getAll()
    .then((alarms) => {
      console.log("Active Alarms:", alarms.length);
      for (let i = 0; i < alarms.length; i++) {
        const alarm = alarms[i];
        console.log("Alarm:", alarm.name, new Date(alarm.scheduledTime).toISOString());
      }
    })
    .catch((error) => {
      console.error("Error listing alarms:", error);
    });
}

String.prototype.filledWith = function (...args) {
  /// <summary>Similar to C# String.Format...  in two modes:
  /// 1) Replaces {0},{1},{2}... in the string with values from the list of arguments.
  /// 2) If the first and only parameter is an object, replaces {xyz}... (only names allowed) in the string with the properties of that object.
  /// Notes: the { } symbols cannot be escaped and should only be used for replacement target tokens;  only a single pass is done.
  /// </summary>

  const values = typeof args[0] === "object" && args.length === 1 ? args[0] : args;

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
      } else if (testForElementAttribute.test(token)) {
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
    if (debugCount > 0) console.log("filledWith loop count", debugCount || 0, "for", result);
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

  obj.eventTime = getTimeDisplay(eventTime);
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
  putInStorageLocalAsync(localStorageKey.focusTime, t.getTime());
  common.focusTime = t.getTime();
  putInStorageLocalAsync(localStorageKey.focusTimeAsOf, new Date().getTime());
  common.focusTimeAsOf = new Date().getTime();
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
        const accessKey = $("<div/>").html(text).find("u").text().substring(0, 1);
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
    browser.runtime.getManifest().version,
    common.languageCode,
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

// GoogleAanalytics using Measurement Protocol

let googleSessionId;

const prepareAnalyticsTracker = () => {
  // console.log("prepareAnalyticsTracker");
  if (tracker) {
    return;
  }

  let uid = common.googleUid;
  if (!uid) {
    uid = createGuid();
    putInStorageLocalAsync(localStorageKey.googleUid, uid);
    common.googleUid = uid;
  }

  // make a new session id when file is loaded
  let googleSessionId = new Date().getTime();

  // const baseParams = {
  //   ds: "app",
  //   tid: "UA-1312528-10",
  //   v: 1,
  //   cid: uid,
  //   an: "BadiWeb",
  //   ul: navigator.language,
  //   aid: browserHostType,
  //   av: browser.runtime.getManifest().version,
  // };
  const baseParams = {
    user_id: uid,
    user_properties: {
      language: {
        // will also set language on each usage
        value: common.languageCode,
      },
    },
    client_id: "Chrome Badi Extension",
    events: [],
  };

  const send = (event, useValidation) => {
    if (common.optedOutOfGoogleAnalytics === true) {
      // console.log("opted out of analytics");
      return;
    }

    const data = { ...baseParams };

    event.params = {
      ...event.params,
      session_id: googleSessionId,
      engagement_time_msec: 100, // TODO make this more meaningful
    };

    data.events.push(event);
    data.user_properties.language.value = common.languageCode;

    const body = JSON.stringify(data);

    // the app secret and measurement id cannot be kept secret - they must be embedded in the extension code
    const url = `https://www.google-analytics.com${
      useValidation ? "/debug" : ""
    }/mp/collect?api_secret=xe5xM3KQQB-lvWDz6cSx4A&measurement_id=G-PGLBZZPLJR`;
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body,
    })
      .then((response) => {
        switch (response.status) {
          case 200:
            return response?.json();
          case 204: // calls to the regular URL return 204
            return {};
          default:
            console.error("Error 1 sending analytics", response);
            return {};
        }
      })
      .then((json) => {
        if (json.validationMessages?.length) {
          json.validationMessages?.forEach((msg) => console.warn("Error:", msg.validationCode, msg.description));
          console.log("sent", url, body);
        } else if (useValidation) {
          // console.log("no google validation errors");
        }
      })
      .catch((error) => {
        console.error("Error 2 sending analytics", error);
      });
  };

  const sendEvent = (eventName, params, useValidation) => {
    send({ name: eventName, params: typeof params === "object" ? params : { value: params } }, useValidation === true);
  };
  const sendPageId = (id) => {
    send({ name: "pageView", params: { page_id: id } });
  };

  // assign to global object
  tracker = {
    sendEvent: sendEvent,
    sendPageId: sendPageId,
  };

  // tracker.sendEvent("installed", getVersionInfo(), true);
  tracker.sendEvent("installed", getVersionInfo());
};

function createGuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// browser.runtime.onMessage.addListener(async (payload, sender, callback1) => {
//   const callback = callback1 || (() => {}); // make it optional

//   switch (payload.cmd) {
//     case "getInfo": {
//       // layout, targetDay
//       // can adjust per layout
//       const di = getDateInfo(new Date(payload.targetDay));
//       callback({
//         label: (await getFromStorageLocalAsync(localStorageKey.gCalLabel, payload.labelFormat || "{bMonthNamePri} {bDay}")).filledWith(di),
//         title: (
//           await getFromStorageLocalAsync(localStorageKey.gCalTitle, payload.titleFormat || "⇨ {endingSunsetDesc}\n{bYear}.{bMonth}.{bDay}\n{element}")
//         ).filledWith(di),
//         classes: `${di.bDay === 1 ? " firstBDay" : ""} element${di.elementNum}`,
//       });
//       break;
//     }

//     // case "getStorage":
//     //   callback({
//     //     value: await getFromStorageLocalAsync(payload.key, payload.defaultValue),
//     //   });
//     //   break;

//     default:
//       callback();
//       break;
//   }
// });

// use Local for ephemeral data, and Sync for settings
async function putInStorageLocalAsync(key, obj) {
  await putInStorageRawAsync("local", key, obj);
}

async function getFromStorageLocalAsync(key, defaultvalue) {
  return getFromStorageRawAsync("local", key, defaultvalue);
}

async function removeFromStorageLocalAsync(key) {
  await removeFromStorageRawAsync("local", key);
}

async function removeFromStorageByPrefixLocalAsync(prefix) {
  await removeFromStorageByPrefixRawAsync("local", prefix);
}

// sync versions
async function putInStorageSyncAsync(key, obj) {
  await putInStorageRawAsync("sync", key, obj);
}

async function getFromStorageSyncAsync(key, defaultvalue) {
  return getFromStorageRawAsync("sync", key, defaultvalue);
}

async function removeFromStorageSyncAsync(key) {
  await removeFromStorageRawAsync("sync", key);
}

async function removeFromStorageByPrefixSyncAsync(prefix) {
  await removeFromStorageByPrefixRawAsync("sync", prefix);
}

/** Generic versions */
const ObjectConstant = "$****$";

async function putInStorageRawAsync(storageType, key, value) {
  if (value === null || value === undefined) {
    removeFromStorageRawAsync(storageType, key);
    return;
  }

  let value2 = value;
  if (typeof value === "object" || typeof value === "boolean") {
    const strObj = JSON.stringify(value);
    value2 = ObjectConstant + strObj;
  }

  switch (storageType) {
    case "sync":
      await browser.storage.sync
        .set({ [key]: `${value2}` })
        .catch((msg) => console.log(`Error putting into ${storageType} storage "${key}": ${msg}`));
      break;
    default:
      await browser.storage.local
        .set({ [key]: `${value2}` })
        .catch((msg) => console.log(`Error putting into ${storageType} storage "${key}": ${msg}`));
  }
}
async function getFromStorageRawAsync(storageType, key, defaultValue) {
  if (!key) {
    console.error("getFromStorageRawAsync: key is null", "DefaultValue:", defaultValue);
    // debugger;
    return defaultValue;
  }

  const storageArea = storageType === "sync" ? browser.storage.sync : browser.storage.local;
  const storedDict = await storageArea.get(key).catch((msg) => console.log(`Error getting from ${storageType} storage "${key}": ${msg}`));

  const value = storedDict[key] ?? defaultValue;

  if (typeof value !== "undefined" && value != null) {
    if (typeof value === "string" && value.substring(0, ObjectConstant.length) === ObjectConstant) {
      return JSON.parse(value.substring(ObjectConstant.length));
    }
    return value;
  }

  return defaultValue;
}

async function removeFromStorageRawAsync(storageType, key) {
  switch (storageType) {
    case "sync":
      await browser.storage.sync.remove(key);
      break;
    default:
      await browser.storage.local.remove(key);
  }
}

async function removeFromStorageByPrefixRawAsync(storageType, prefix) {
  const storageArea = storageType === "sync" ? browser.storage.sync : browser.storage.local;
  const allDict = await storageArea.get().catch((msg) => console.log(`Error getting all from ${storageType} storage: ${msg}`));
  Object.keys(allDict).forEach(async (key) => {
    if (key.startsWith(prefix)) {
      await removeFromStorageRawAsync(storageType, key);
    }
  });
}

async function AddFunctionToPendingInstallFunctionsAsync(func) {
  if (prepared) {
    // console.log("pending function - running immediately");
    await func();
  } else {
    // console.log("pending function - add to pending list");
    _pendingInstallFunctionsQueue.push(func);
  }
}
async function FlushPendingInstallFunctionsAsync() {
  const numToProcess = _pendingInstallFunctionsQueue.length;
  if (!numToProcess) {
    // console.log("No pending functions to process");
    return;
  }
  // console.log(`Pending functions: ${numToProcess}`);
  while (_pendingInstallFunctionsQueue.length > 0) {
    const fn = _pendingInstallFunctionsQueue.shift();
    await fn();
  }
  // console.log(`Pending functions done`);
}
