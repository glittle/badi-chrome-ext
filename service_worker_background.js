/* Code by Glen Little */

/*
 * Notes...
 * Firefox does not support canvas or geolocation in the background. Must open the tab to work.
 *
 */

const _isBackgroundPage = true;
let _backgroundReminderEngine = {};
const popupUrl = chrome.extension.getURL("popup.html");

const BackgroundModule = () => {
  const alarmHandler = (alarm) => {
    if (alarm.name.startsWith("refresh")) {
      console.log(`ALARM: ${alarm.name}`);
      refreshDateInfoAndShow();
      _backgroundReminderEngine.setAlarmsForRestOfToday();
    } else if (alarm.name.startsWith("alarm_")) {
      _backgroundReminderEngine.triggerAlarmNow(alarm.name);
    }
  };

  function installed(info) {
    if (info.reason === "update") {
      setTimeout(() => {
        const newVersion = chrome.runtime.getManifest().version;
        const oldVersion = localStorage.updateVersion;
        if (newVersion !== oldVersion) {
          console.log(`${oldVersion} --> ${newVersion}`);
          localStorage.updateVersion = newVersion;
          chrome.tabs.create({
            url:
              getMessage(`${browserHostType}_History`) +
              "?{0}:{1}".filledWith(
                chrome.runtime.getManifest().version,
                _languageCode
              ),
          });

          setStorage("firstPopup", true);

          try {
            tracker.sendEvent("updated", getVersionInfo());
          } catch (e) {
            console.log(e);
          }
        } else {
          console.log(newVersion);
        }
      }, 1000);
    } else {
      console.log(info);
    }
  }

  //  function messageHandler(request, sender, sendResponse) {
  //    //log(request, sender, sendResponse);
  //    console.log('message received: ' + request.code);
  //  }

  function showErrors() {
    const msg = chrome.runtime.lastError;
    if (msg) {
      console.log(msg);
    }
  }

  function makeTab() {
    chrome.tabs.create({ url: popupUrl }, (newTab) => {
      setStorage("tabId", newTab.id);
    });
  }

  function prepare() {
    startGettingLocation();

    if (_notificationsEnabled) {
      _backgroundReminderEngine = new BackgroundReminderEngine();
    }

    if (browserHostType === browser.Chrome) {
      chrome.alarms.clearAll();
      chrome.alarms.onAlarm.addListener(alarmHandler);
      chrome.runtime.onInstalled.addListener(installed);
    }

    if (browserHostType === browser.Firefox) {
      chrome.action.onClicked.addListener(() => {
        const oldTabId = +getStorage("tabId", 0);
        if (oldTabId) {
          chrome.tabs.update(
            oldTabId,
            {
              active: true,
            },
            (updatedTab) => {
              if (!updatedTab) {
                makeTab();
              }
              if (chrome.runtime.lastError) {
                console.log(chrome.runtime.lastError.message);
              }
            }
          );
        } else {
          makeTab();
        }
      });
    }

    chrome.contextMenus.create(
      {
        id: "openInTab",
        title: getMessage("browserMenuOpen"),
        contexts: ["browser_action"],
      },
      showErrors
    );
    //chrome.contextMenus.create({
    //  'id': 'paste',
    //  'title': 'Insert Badíʿ Date',
    //  'contexts': ['editable']
    //}, showErrors);

    chrome.contextMenus.onClicked.addListener((info, tab) => {
      switch (info.menuItemId) {
        //case 'paste':
        //  console.log(info, tab);
        //  chrome.tabs.executeScript(tab.id, {code: 'document.targetElement.value = "help"'}, showErrors);
        //  break;

        case "openInTab": {
          const afterUpdate = (updatedTab) => {
            if (!updatedTab) {
              makeTab();
            }
            if (chrome.runtime.lastError) {
              console.log(chrome.runtime.lastError.message);
            }
          };

          switch (browserHostType) {
            case browser.Chrome:
              chrome.tabs.query({ url: popupUrl }, (foundTabs) => {
                switch (foundTabs.length) {
                  case 1:
                    // resuse
                    chrome.tabs.update(
                      foundTabs[0].id,
                      {
                        active: true,
                      },
                      afterUpdate
                    );
                    break;

                  case 0:
                    makeTab();
                    break;

                  default: {
                    // bug in March 2016 - all tabs returned!

                    const oldTabId = +getStorage("tabId", 0);
                    if (oldTabId) {
                      chrome.tabs.update(
                        oldTabId,
                        {
                          active: true,
                        },
                        afterUpdate
                      );
                    } else {
                      makeTab();
                    }
                    break;
                  }
                }

                if (tracker) {
                  // not working?...
                  tracker.sendEvent("openInTabContextMenu");
                }
              });

              break;

            default:
              makeTab();

              if (tracker) {
                // not working?...
                tracker.sendEvent("openInTabContextMenu");
              }
              break;
          }

          break;
        }
      }
    });

    console.log("prepared background");

    if (browserHostType === browser.Firefox) {
      makeTab();
    }
  }

  return {
    prepare: prepare,
    makeTab: makeTab,
  };
};

const _backgroundModule = new BackgroundModule();

$(() => {
  _backgroundModule.prepare();
});
const browser = {
  Chrome: "Chrome",
  Firefox: "Firefox",
  Edge: "Edge",
};
const browserHostType = browser.Chrome;

const _cachedDateInfos = {};

// this is loaded only in the background
// visible page must use Ports to communicate with it

// delta -->  + is future (event is after trigger),  - is past (event is before trigger)   (delta * offset --> new time in future or past)
let _notificationsEnabled = true; // set to false to disable

if (_notificationsEnabled && browserHostType === browser.Chrome) {
  // check to see...
  chrome.notifications.getPermissionLevel((level) => {
    // ensure flag is off if user has disabled them
    if (level !== "granted") {
      _notificationsEnabled = false;
    }
  });
}

const BackgroundReminderEngine = () => {
  const _ports = [];
  const _reminderPrefix = "alarm_";
  const _specialDays = {};
  const _reminderInfoShown = null;
  let _remindersDefined = [];
  let _now = new Date();
  let _nowDi = null;
  let _nowNoon = null;
  let _nowSunTimes = null;
  let _nowAlmostMidnight = null;
  let _baseBDayImage;

  const BEFORE = -1;
  const AFTER = 1;

  function setAlarmsForRestOfToday(initialLoad) {
    // clear, then set again
    clearReminderAlarms(() => {
      setAlarmsInternal(initialLoad);
    });
  }

  function setAlarmsInternal(initialLoad) {
    if (!_notificationsEnabled) return;

    _now = new Date();
    _nowDi = getDateInfo(_now);
    _nowNoon = new Date(
      _now.getFullYear(),
      _now.getMonth(),
      _now.getDate(),
      12,
      0,
      0,
      0
    );
    _nowAlmostMidnight = new Date(
      _now.getFullYear(),
      _now.getMonth(),
      _now.getDate(),
      23,
      59,
      0,
      0
    );
    _nowSunTimes = sunCalculator.getTimes(
      _nowNoon,
      _locationLat,
      _locationLong
    );

    console.log(
      `checking ${_remindersDefined.length} reminders at ${new Date()}`
    );

    for (let i = 0; i < _remindersDefined.length; i++) {
      const reminder = _remindersDefined[i];
      if (reminder.trigger === "load" && !initialLoad) {
        // skip load triggers
        //log('load ' + initialLoad)
        continue;
      }

      try {
        tryAddAlarmFor[reminder.trigger](reminder);
      } catch (e) {
        console.log(e.message);
      }
    }

    broadcast({ code: "alarmsUpdated" });
  }

  const tryAddAlarmFor = {
    load: (reminder, isTest) => {
      const eventDate = new Date();
      tryAddTimeAlarm(eventDate, reminder, isTest);
    },
    sunset: (reminder, isTest) => {
      const eventDate = _nowSunTimes.sunset;
      tryAddTimeAlarm(eventDate, reminder, isTest);
    },
    sunrise: (reminder, isTest) => {
      const eventDate = _nowSunTimes.sunrise;
      tryAddTimeAlarm(eventDate, reminder, isTest);
    },
    noon: (reminder, isTest) => {
      const eventDate = _nowNoon;
      tryAddTimeAlarm(eventDate, reminder, isTest);
    },
    midnight: (reminder, isTest) => {
      const eventDate = new Date();
      eventDate.setHours(24, 0, 0, 0); // midnight coming tonight
      tryAddTimeAlarm(eventDate, reminder, isTest);
    },
    feast: (reminder, isTest) => {
      tryAddEventAlarm(reminder, isTest);
    },
    holyday: (reminder, isTest) => {
      tryAddEventAlarm(reminder, isTest);
    },
    bday: (reminder, isTest) => {
      tryAddBDayAlarm(reminder, isTest);
    },
  };

  function tryAddTimeAlarm(eventDate, reminder, isTest) {
    const alarmInfo = shallowCloneOf(reminder);
    alarmInfo.eventTime = eventDate.getTime();

    let triggerDate;
    switch (alarmInfo.calcType) {
      case "Absolute":
        triggerDate = determineTriggerTimeToday(alarmInfo);
        break;

      default:
        triggerDate = new Date(alarmInfo.eventTime);
        adjustTime(triggerDate, alarmInfo);
        break;
    }

    if (isTest) {
      // remember when it should have been shown
      alarmInfo.testForTime = triggerDate.getTime();
      triggerDate = _now;
    }

    if (
      _now.toDateString() !== triggerDate.toDateString() ||
      triggerDate < _now
    ) {
      // desired time for reminder has already past for today
      return;
    }

    alarmInfo.triggerTime = triggerDate.getTime();

    buildUpAlarmInfo(alarmInfo, null, null);

    createAlarm(alarmInfo, isTest);
  }

  function tryAddEventAlarm(reminder, isTest) {
    let triggerDate = determineTriggerTimeToday(reminder);

    if (
      _now.toDateString() !== triggerDate.toDateString() ||
      triggerDate < _now
    ) {
      // desired time for reminder has already past for today
      return;
    }

    const typeWanted = reminder.trigger === "feast" ? "M" : "H";

    //if(typeWanted=='H') console.log("reminder", reminder);

    // check for an event this number of days away, at this time
    let testDate = new Date(_nowAlmostMidnight);
    testDate.setDate(testDate.getDate() - reminder.delta * reminder.num);

    let testDayDi = getDateInfo(testDate);
    let holyDayInfo = getMatchingEventDateFor(testDayDi, typeWanted);

    if (!isTest && !holyDayInfo) {
      return;
    }

    const alarmInfo = shallowCloneOf(reminder);

    if (isTest) {
      // get the first event
      let days = [];
      for (const x in _specialDays) {
        const arr = _specialDays[x];
        days = days.concat(arr);
      }

      for (let i = 0; i < days.length; i++) {
        const testEvent = days[i];
        if (testEvent.GDate < _now) {
          continue;
        }
        if (testEvent.Type === (reminder.trigger === "feast" ? "M" : "HS")) {
          holyDayInfo = testEvent;
          testDayDi = getDateInfo(holyDayInfo.GDate);

          // remember when it should have been shown
          testDate = new Date(holyDayInfo.GDate.getTime());
          testDate.setDate(testDate.getDate() + reminder.delta * reminder.num);
          testDate.setHours(triggerDate.getHours(), triggerDate.getMinutes());

          alarmInfo.testForTime = testDate.getTime();
          triggerDate = _now;
          break;
        }
      }
    }

    // got one!
    alarmInfo.eventTime = testDayDi.frag1SunTimes.sunset.getTime();
    alarmInfo.triggerTime = triggerDate.getTime();

    // add extra for debugging
    alarmInfo.DI = testDayDi;
    alarmInfo.HDI = holyDayInfo;

    //log(alarmInfo);

    buildUpAlarmInfo(alarmInfo, testDayDi, holyDayInfo);

    createAlarm(alarmInfo, isTest);
  }

  function tryAddBDayAlarm(reminder, isTest) {
    let triggerDate = determineTriggerTimeToday(reminder);
    if (triggerDate < _now && !isTest) {
      // desired time for reminder has already past for today
      return;
    }

    let testDate = new Date(triggerDate);
    let testDI = getDateInfo(testDate);

    if (testDI.bDay !== reminder.num) {
      // check after sunset
      testDate = new Date(_nowAlmostMidnight);
      testDI = getDateInfo(testDate);
      if (testDI.bDay !== reminder.num && !isTest) {
        // not currently the right day
        return;
      }
    }

    const alarmInfo = shallowCloneOf(reminder);

    if (isTest) {
      // remember when it should have been shown
      alarmInfo.testForTime = triggerDate.getTime();
      triggerDate = _now;
    }

    alarmInfo.triggerTime = triggerDate.getTime();

    alarmInfo.eventTime = testDI.frag1SunTimes.sunset.getTime();
    //alarmInfo.delta = alarmInfo.eventTime > alarmInfo.triggerTime ? BEFORE : AFTER;

    // add extra for debugging
    alarmInfo.DI = testDI;

    buildUpAlarmInfo(alarmInfo, testDI, null);

    createAlarm(alarmInfo, isTest);
  }

  function buildUpAlarmInfo(alarmInfo, testDayDi, holyDayInfo) {
    let triggerDisplayName = getMessage(`reminderTrigger_${alarmInfo.trigger}`);
    alarmInfo.title = getMessage("reminderTitle", triggerDisplayName);

    let units = alarmInfo.units;
    const dayName = "";
    const dateName = "";

    //log(alarmInfo);

    let messageType = "";
    switch (alarmInfo.trigger) {
      case "sunrise":
      case "sunset":
        messageType =
          alarmInfo.calcType === "Absolute" || alarmInfo.num === 0
            ? "Time"
            : "DeltaTime";
        break;

      case "midnight":
      case "noon":
        messageType = "Delta";
        break;

      case "holyday":
        messageType = alarmInfo.num === 0 ? "StartTime" : "StartDeltaTime";
        triggerDisplayName = getMessage(
          "reminderHolyDay",
          getMessage(holyDayInfo.NameEn)
        );
        break;

      case "feast": {
        messageType = alarmInfo.num === 0 ? "StartTime" : "StartDeltaTime";
        const monthNum = holyDayInfo.MonthNum;
        triggerDisplayName = getMessage("reminderFeast", {
          pri: bMonthNamePri[monthNum],
          sec: bMonthNameSec[monthNum],
        });
        break;
      }

      case "bday":
        messageType = "Day";
        units = "days";
        triggerDisplayName = getMessage("reminderBDay", alarmInfo);
        break;

      case "load":
        messageType = "DeltaTime";
        break;
    }

    const triggerDate = new Date(alarmInfo.triggerTime);
    const showDate = new Date(
      alarmInfo.testForTime ? alarmInfo.testForTime : triggerDate.getTime()
    );
    alarmInfo.triggerTimeDisplay = getFullTime(
      showDate.getTime(),
      showDate,
      true
    );

    const futurePast =
      alarmInfo.eventTime > showDate.getTime() ? "Future" : "Past";
    const messageKey = "{0}_{1}".filledWith(futurePast, messageType);

    const unitInfo = getMessage("reminderNum_{0}_1_more".filledWith(units));

    const unitNames = unitInfo ? unitInfo.split(";") : ["?", "?"];
    const unitDisplay = alarmInfo.num === 1 ? unitNames[0] : unitNames[1];

    const bodyInfo = {
      numUnits: getMessage("numUnits", {
        num: alarmInfo.num,
        units: unitDisplay,
      }),
      time: getFullTime(alarmInfo.eventTime, triggerDate),
    };
    const info = {
      triggerDisplayName: triggerDisplayName,
      desc: getMessage(messageKey, bodyInfo),
    };

    alarmInfo.messageBody = getMessage("messageBody", info);
  }

  const createAlarm = (alarmInfo, isTest) => {
    chrome.alarms.create(storeAlarmReminder(alarmInfo, isTest), {
      when: alarmInfo.triggerTime,
    });
  };

  const getFullTime = (eventDateTime, triggerDate, onlyDateIfOther) => {
    // determine time to show
    const eventDate = new Date(eventDateTime);
    const eventTime = showTime(eventDate);
    const today = _now.toDateString() === triggerDate.toDateString();
    if (today) {
      return eventTime;
    }
    const otherDay = { time: eventDate };
    addEventTime(otherDay);
    return getMessage(
      onlyDateIfOther ? "reminderDayDetailsTest" : "reminderDayDetails",
      otherDay
    );
  };

  const getMatchingEventDateFor = (testDayDi, typeWanted) => {
    if (!_specialDays[testDayDi.bYear]) {
      _specialDays[testDayDi.bYear] = holyDays.prepareDateInfos(
        testDayDi.bYear
      );
    }

    const specialDays = _specialDays[testDayDi.bYear];
    if (!specialDays.known) {
      // cache what we use
      specialDays.known = {};
    }

    //if (typeWanted == 'H') console.log(typeWanted, testDayDi);

    let holyDayInfo = specialDays.known[typeWanted + testDayDi.bDateCode];
    if (holyDayInfo) {
      return holyDayInfo;
    }

    // GDate is the 00:00 in the middle of the date, so start is the day before
    holyDayInfo = $.grep(
      specialDays,
      (el, i) =>
        el.Type.substring(0, 1) === typeWanted &&
        el.BDateCode === testDayDi.bDateCode
    );

    if (holyDayInfo.length) {
      //log('LENGTH', holyDayInfo.length, holyDayInfo[0])
      specialDays.known[typeWanted + testDayDi.bDateCode] = holyDayInfo[0];
      return holyDayInfo[0];
    }
    return null;
  };

  const adjustTime = (d, alarmInfo) => {
    let ms = 0;
    alarmInfo.delta = alarmInfo.delta || BEFORE;
    switch (alarmInfo.units) {
      case "seconds":
        ms = alarmInfo.num * 1000;
        break;

      case "minutes":
        ms = alarmInfo.num * 1000 * 60;
        break;

      case "hours":
        ms = alarmInfo.num * 1000 * 60 * 60;
        break;

      case "days":
        ms = alarmInfo.num * 1000 * 60 * 60 * 24;
        break;
    }

    d.setTime(d.getTime() + ms * alarmInfo.delta);
  };

  function determineTriggerTimeToday(reminder) {
    const date = new Date();
    date.setHours(
      +reminder.triggerTimeRaw.substr(0, 2),
      +reminder.triggerTimeRaw.substr(3, 2),
      0,
      0
    );
    return date;
  }

  function storeAlarmReminder(reminder, isTest) {
    // store, and give back key to get it later
    for (let nextKey = 0; ; nextKey++) {
      const publicKey = nextKey + (isTest ? "TEST" : "");
      const fullKey = _reminderPrefix + publicKey;
      if (getStorage(fullKey, "") === "") {
        // empty slot
        setStorage(fullKey, reminder);
        return fullKey;
      }
    }
  }

  const saveAllReminders = (newSetOfReminders) => {
    _remindersDefined = newSetOfReminders || [];
    storeReminders();
  };

  function triggerAlarmNow(alarmName) {
    if (!alarmName.startsWith(_reminderPrefix)) {
      console.log(`unexpected reminder alarm: ${alarmName}`);
      return;
    }

    const alarmInfo = getStorage(alarmName);
    if (!alarmInfo) {
      console.log(`no info for ${alarmName}`);
      return;
    }

    const isTest = alarmName.substr(-4) === "TEST";

    if (!isTest && alarmInfo.triggerTime + 1000 < new Date().getTime()) {
      console.log("reminder requested, but past trigger.", alarmInfo);
      return;
    }

    showAlarmNow(alarmInfo, alarmName);

    localStorage.removeItem(alarmName);

    if (!isTest) {
      setAlarmsForRestOfToday();
    }
  }

  function showTestAlarm(reminder) {
    tryAddAlarmFor[reminder.trigger](reminder, true);
  }

  function showAlarmNow(alarmInfo, alarmName) {
    const iconUrl = getIcon(alarmInfo);
    let tagLine;

    if (alarmInfo.testForTime) {
      tagLine = getMessage("reminderTestTagline").filledWith({
        when: alarmInfo.triggerTimeDisplay,
      });
    } else {
      tagLine = getMessage("reminderTagline").filledWith({
        when: showTime(new Date()),
      });
    }

    alarmInfo.tagLine = tagLine;
    alarmInfo.alarmName = alarmName;

    console.log("DISPLAYED {alarmName}: {messageBody} ".filledWith(alarmInfo));
    //log(alarmInfo);

    //    const api = alarmInfo.api || 'html';
    const api = "chrome"; // for now, ONLY use Chrome

    switch (api) {
      case "chrome":
        // closes automatically after a few seconds
        chrome.notifications.create(
          null,
          {
            type: "basic",
            iconUrl: iconUrl,

            title: alarmInfo.title,
            message: alarmInfo.messageBody,
            priority: 2,
            contextMessage: tagLine,
          },
          (id) => {
            //log('chrome notification ' + id);
          }
        );
        break;

      //case 'html':
      //  const n = new Notification('HTML ' + alarmInfo.title, {
      //    icon: iconUrl,

      //    body: alarmInfo.messageBody + '\n\n' + tagLine,
      //    lang: _languageCode,
      //    dir: _languageDir,
      //    tag: 'html' + alarmName
      //  });
      //  break;
    }

    try {
      prepareAnalytics();

      tracker.sendEvent(
        "showReminder",
        alarmInfo.trigger,
        `${alarmInfo.delta * alarmInfo.num} ${alarmInfo.units} ${api}`
      );
    } catch (e) {
      console.log(e);
    }

    if (alarmInfo.action) {
      doAdditionalActions(alarmInfo);
    }
  }

  function doAdditionalActions(alarmInfo) {
    switch (alarmInfo.action) {
      case "speak": {
        const options = {
          //'lang': _languageCode,
          voiceName: alarmInfo.speakVoice,
          enqueue: true,
        };
        console.log(options);
        chrome.tts.speak(
          "{title}.\n\n {messageBody}".filledWith(alarmInfo),
          options,
          () => {
            if (chrome.runtime.lastError) {
              console.log(`Error: ${chrome.runtime.lastError}`);
            }
          }
        );

        break;
      }
      case "ifttt": {
        const url =
          "https://maker.ifttt.com/trigger/{iftttEvent}/with/key/{iftttKey}".filledWith(
            alarmInfo
          );
        const content = {
          value1: alarmInfo.title,
          value2: alarmInfo.messageBody,
          value3: alarmInfo.tagLine,
        };
        try {
          $.ajax({
            url: url,
            data: content,
            success: (data) => {
              chrome.notifications.create(null, {
                type: "basic",
                iconUrl: "badi19a-128.png",
                title: alarmInfo.actionDisplay,
                message: data,
              });
            },
            error: (request, error) => {
              console.log(JSON.stringify(request));
              console.log(JSON.stringify(error));

              alert(request.statusText);
            },
          });
        } catch (e) {
          console.log(e);
        }

        break;
      }

      case "zapier": {
        const zap = {
          title: alarmInfo.title,
          body: alarmInfo.messageBody,
          tag: alarmInfo.tagLine,
          time: new Date(),
        };
        try {
          $.ajax({
            url: alarmInfo.zapierWebhook,
            data: zap,
            success: (data) => {
              chrome.notifications.create(null, {
                type: "basic",
                iconUrl: "badi19a-128.png",
                title: alarmInfo.actionDisplay,
                message: data.status,
              });
              console.log(data);
            },
            error: (request, error) => {
              const msg = `Request: ${JSON.stringify(request)}`;
              console.log(msg);
              alert(msg);
            },
          });
        } catch (e) {
          console.log(e);
        }

        break;
      }
    }
  }

  function getIcon(reminder) {
    let icon;
    switch (reminder.trigger) {
      case "bday":
        icon = makeBadiNum(reminder.num);
        break;
      default:
        icon = "imagesForReminders/{0}.jpg".filledWith(reminder.trigger);
        break;
    }
    //log('icon for {0} = {1}'.filledWith(reminder.trigger, icon));
    return icon;
  }

  function prepareImage() {
    _baseBDayImage = new Image();
    _baseBDayImage.src =
      "data:image/jpeg;base64,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";
    //_baseBDayImage.onload = function () { console.log('loaded'); };
  }

  function makeBadiNum(num) {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 80;
    const context = canvas.getContext("2d");

    context.drawImage(_baseBDayImage, 0, 0);

    context.font = "30px Tahoma";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(num, 40, 70);

    return canvas.toDataURL("image/png");
  }

  function clearReminderAlarms(fnAfter) {
    chrome.alarms.getAll((alarms) => {
      for (let i = 0; i < alarms.length; i++) {
        const alarm = alarms[i];
        const name = alarm.name;
        if (name.startsWith(_reminderPrefix)) {
          //log('removed {0} {1}'.filledWith(alarm.name, new Date(alarm.scheduledTime)));
          chrome.alarms.clear(name);
          localStorage.removeItem(name);
        }
      }
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          if (key.startsWith(_reminderPrefix)) {
            localStorage.removeItem(key);
          }
        }
      }
      if (fnAfter) {
        fnAfter();
      }
    });
  }

  function dumpAlarms() {
    chrome.alarms.getAll((alarms) => {
      for (let i = 0; i < alarms.length; i++) {
        const alarm = alarms[i];
        console.log(
          "{0} {1}".filledWith(
            alarm.name,
            new Date(alarm.scheduledTime).toLocaleString()
          )
        );
        console.log(getStorage(alarm.name));
      }
    });
  }

  function storeReminders() {
    chrome.storage.local.set(
      {
        reminders: _remindersDefined,
      },
      () => {
        console.log("stored reminders with local");
        if (chrome.runtime.lastError) {
          console.log(chrome.runtime.lastError);
        }
      }
    );
    if (browserHostType === browser.Chrome) {
      chrome.storage.sync.set(
        {
          reminders: _remindersDefined,
        },
        () => {
          console.log("stored reminders with sync");
          if (chrome.runtime.lastError) {
            console.log(chrome.runtime.lastError);
          }
        }
      );
    }
  }

  function loadReminders() {
    const loadLocal = () => {
      chrome.storage.local.get(
        {
          reminders: [],
        },
        (items) => {
          if (chrome.runtime.lastError) {
            console.log(chrome.runtime.lastError);
          }

          if (items.reminders) {
            console.log(
              `reminders loaded from local: ${items.reminders.length}`
            );
            _remindersDefined = items.reminders || [];
          }

          setAlarmsForRestOfToday(true);
        }
      );
    };

    if (browserHostType === browser.Chrome) {
      chrome.storage.sync.get(
        {
          reminders: [],
        },
        (items) => {
          if (chrome.runtime.lastError) {
            console.log(chrome.runtime.lastError);
          }

          if (items.reminders) {
            console.log(
              `reminders loaded from sync: ${items.reminders.length}`
            );
            _remindersDefined = items.reminders || [];
          }

          if (_remindersDefined.length !== 0) {
            setAlarmsForRestOfToday(true);
          } else {
            loadLocal();
          }
        }
      );
    } else {
      loadLocal();
    }
  }

  function makeSamples() {
    _remindersDefined = [
      {
        calcType: "Relative",
        delta: -1,
        num: 5,
        trigger: "sunrise",
        units: "minutes",
      },
      {
        calcType: "Absolute",
        delta: -1,
        trigger: "sunset",
        triggerTimeRaw: "15:00",
      },
      {
        action: "speak",
        calcType: "Relative",
        delta: -1,
        num: 15,
        trigger: "sunset",
        units: "minutes",
      },
      {
        delta: -1,
        model: "day",
        num: 3,
        trigger: "feast",
        triggerTimeRaw: "10:00",
        units: "days",
      },
    ];
    storeReminders();
  }

  function connectToPort() {
    console.log("listening for new ports");
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== "reminderModule") {
        return; // not for us
      }

      _ports.push(port);
      console.log(`ports: ${_ports.length}`);

      // each popup will have its own port for us to respond to
      console.log("listening to port", port.name, "from", port.sender.id);

      port.onDisconnect.addListener((port) => {
        for (let i = 0; i < _ports.length; i++) {
          const knownPort = _ports[i];
          if (knownPort === port) {
            console.log("removed port");
            _ports.splice(i, 1);
          }
        }
      });

      port.onMessage.addListener((msg) => {
        console.log("received: ", msg);

        switch (msg.code) {
          case "getReminders":
            // send back the list
            msg.reminders = _remindersDefined;
            port.postMessage(msg);
            break;

          case "saveAllReminders":
            saveAllReminders(msg.reminders);
            // send back (to all ports)
            broadcast(msg);

            setAlarmsForRestOfToday();
            break;

          case "showTestAlarm":
            showTestAlarm(msg.reminder);
            break;

          case "makeSamples":
            makeSamples();

            msg.reminders = _remindersDefined;
            port.postMessage(msg);
            break;
        }
      });
    });
  }

  function broadcast(msg) {
    // send to all ports
    for (let i = 0; i < _ports.length; i++) {
      _ports[i].postMessage(msg);
    }
  }

  // startup
  prepareImage();

  connectToPort();

  loadReminders();

  //broadcast({ code: 'remindersEnabled' });

  return {
    // called from background
    setAlarmsForRestOfToday: setAlarmsForRestOfToday,
    triggerAlarmNow: triggerAlarmNow,

    // for testing
    dumpAlarms: dumpAlarms,
    clearReminderAlarms: clearReminderAlarms,
    saveAllReminders: saveAllReminders,
    _specialDays: _specialDays, // testing
    makeBadiNum: makeBadiNum,
    eraseReminders: () => {
      saveAllReminders();
    },
    getReminders: () => _remindersDefined,
  };
};
