/**
 *
 * Reminders are a superset of alarms, with full information about the event, alarm time, etc.
 *
 * Alarms are the techincal way to trigger a reminder event.
 *
 * On each day, alarms are cleared at midnight, then set up for the rest of the day. At startup also, alarms are set up for the rest of the day.
 *
 * Because alarms are cleared each day, reminders are stored in local storage and must be created in the service worker each day.
 *
 * All reminders are stored in local storage, not in sync storage. If the user uses multiple devices, they will have to set up reminders on each device.
 *
 * This code runs only in the service worker.
 *
 */

function RemindersEngine() {
  console.log("RemindersEngine created");
  const _ports = [];
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

  function initialize() {
    console.log("RemindersEngine initializing");

    prepareBaseImageAsync();

    connectToPort();

    loadRemindersAsync();

    setAlarmsForRestOfToday(true);
  }

  function setAlarmsForRestOfToday(initialLoad) {
    // clear, then set again
    clearReminderAlarms(() => {
      setAlarmsInternal(initialLoad);
    });
  }

  function xxxx() {
    // on startup, clear all alarms and set the refresh alarm
    chrome.alarms.clearAll();
    chrome.alarms.onAlarm.addListener((alarm) => {
      // debugger;
      if (alarm.name.startsWith("refresh")) {
        console.log("ALARM:", alarm);
        refreshDateInfoAndShow();
        _remindersEngine.setAlarmsForRestOfToday();
      } else if (alarm.name.startsWith("alarm_")) {
        _remindersEngine.triggerAlarmNow(alarm.name);
      }
    });

    async function setAlarmAsync(name, delayInMinutes) {
      console.log("startAlarm:", name, delayInMinutes);
      await chrome.alarms.create(name, { delayInMinutes: delayInMinutes });
    }

    chrome.alarms.onAlarm.addListener((alarm) => {
      console.log("Alarm fired:", alarm);
    });
  }

  function setAlarmsInternal(initialLoad) {
    if (!_notificationsEnabled) return;

    _now = new Date();
    _nowDi = getDateInfo(_now);
    _nowNoon = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), 12, 0, 0, 0);
    _nowAlmostMidnight = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), 23, 59, 0, 0);
    _nowSunTimes = sunCalculator.getTimes(_nowNoon, common.locationLat, common.locationLong);

    console.log(`checking ${_remindersDefined.length} reminders at ${new Date()}`);

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

    if (_now.toDateString() !== triggerDate.toDateString() || triggerDate < _now) {
      // desired time for reminder has already past for today
      return;
    }

    alarmInfo.triggerTime = triggerDate.getTime();

    buildUpAlarmInfo(alarmInfo, null, null);

    createAlarm(alarmInfo, isTest);
  }

  function tryAddEventAlarm(reminder, isTest) {
    let triggerDate = determineTriggerTimeToday(reminder);

    if (_now.toDateString() !== triggerDate.toDateString() || triggerDate < _now) {
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
        messageType = alarmInfo.calcType === "Absolute" || alarmInfo.num === 0 ? "Time" : "DeltaTime";
        break;

      case "midnight":
      case "noon":
        messageType = "Delta";
        break;

      case "holyday":
        messageType = alarmInfo.num === 0 ? "StartTime" : "StartDeltaTime";
        triggerDisplayName = getMessage("reminderHolyDay", getMessage(holyDayInfo.NameEn));
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
    const showDate = new Date(alarmInfo.testForTime ? alarmInfo.testForTime : triggerDate.getTime());
    alarmInfo.triggerTimeDisplay = getFullTime(showDate.getTime(), showDate, true);

    const futurePast = alarmInfo.eventTime > showDate.getTime() ? "Future" : "Past";
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
    return getMessage(onlyDateIfOther ? "reminderDayDetailsTest" : "reminderDayDetails", otherDay);
  };

  const getMatchingEventDateFor = (testDayDi, typeWanted) => {
    if (!_specialDays[testDayDi.bYear]) {
      _specialDays[testDayDi.bYear] = _holyDays.prepareDateInfos(testDayDi.bYear);
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
    // holyDayInfo = $ .grep(specialDays, (el, i) => el.Type.substring(0, 1) === typeWanted && el.BDateCode === testDayDi.bDateCode);
    holyDayInfo = specialDays.filter((el, i) => el.Type.substring(0, 1) === typeWanted && el.BDateCode === testDayDi.bDateCode);

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
    date.setHours(+reminder.triggerTimeRaw.substr(0, 2), +reminder.triggerTimeRaw.substr(3, 2), 0, 0);
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

  function saveAllReminders(newSetOfReminders) {
    _remindersDefined = newSetOfReminders || [];
    storeRemindersAysnc();
  }

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

    removeFromStorageLocalAsync(`${_reminderPrefix}${alarmName}`);

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
      //    lang: common.languageCode,
      //    dir: common.languageDir,
      //    tag: 'html' + alarmName
      //  });
      //  break;
    }

    try {
      tracker.sendEvent("showReminder", alarmInfo.trigger, `${alarmInfo.delta * alarmInfo.num} ${alarmInfo.units} ${api}`);
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
          //'lang': common.languageCode,
          voiceName: alarmInfo.speakVoice,
          enqueue: true,
        };
        console.log(options);
        chrome.tts.speak("{title}.\n\n {messageBody}".filledWith(alarmInfo), options, () => {
          if (chrome.runtime.lastError) {
            console.log(`Error: ${chrome.runtime.lastError}`);
          }
        });

        break;
      }
      case "ifttt": {
        const url = "https://maker.ifttt.com/trigger/{iftttEvent}/with/key/{iftttKey}".filledWith(alarmInfo);
        const content = {
          value1: alarmInfo.title,
          value2: alarmInfo.messageBody,
          value3: alarmInfo.tagLine,
        };
        try {
          fetch(url, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(content), // Use only for POST or PUT requests
          })
            .then((response) => response.json())
            .then((data) => {
              chrome.notifications.create(null, {
                type: "basic",
                iconUrl: "badi19a-128.png",
                title: alarmInfo.actionDisplay,
                message: data,
              });
            })
            .catch((error) => {
              console.log(JSON.stringify(request));
              console.log(JSON.stringify(error));
              console.log(request.statusText);
              debugger; // stop on error
            });

          // $ .ajax({
          //   url: url,
          //   data: content,
          //   success: (data) => {
          //     chrome.notifications.create(null, {
          //       type: "basic",
          //       iconUrl: "badi19a-128.png",
          //       title: alarmInfo.actionDisplay,
          //       message: data,
          //     });
          //   },
          //   error: (request, error) => {
          //     console.log(JSON.stringify(request));
          //     console.log(JSON.stringify(error));

          //     alert(request.statusText);
          //   },
          // });
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
          fetch(alarmInfo.zapierWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(zap),
          })
            .then((response) => response.json())
            .then((data) => {
              chrome.notifications.create(null, {
                type: "basic",
                iconUrl: "badi19a-128.png",
                title: alarmInfo.actionDisplay,
                message: data.status,
              });
              console.log(data);
            })
            .catch((error) => {
              const msg = `Request: ${JSON.stringify(request)}`;
              console.log(msg);
              debugger; // stop on error
            });

          // $ .ajax({
          //   url: alarmInfo.zapierWebhook,
          //   data: zap,
          //   success: (data) => {
          //     chrome.notifications.create(null, {
          //       type: "basic",
          //       iconUrl: "badi19a-128.png",
          //       title: alarmInfo.actionDisplay,
          //       message: data.status,
          //     });
          //     console.log(data);
          //   },
          //   error: (request, error) => {
          //     const msg = `Request: ${JSON.stringify(request)}`;
          //     console.log(msg);
          //     alert(msg);
          //   },
          // });
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

  async function prepareBaseImageAsync() {
    const imageUrl = "imagesForReminders/bday.jpg";
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    _baseBDayImage = await createImageBitmap(blob);
  }

  function makeBadiNum(num) {
    const canvas = new OffscreenCanvas(80, 80);
    const context = canvas.getContext("2d");

    context.drawImage(_baseBDayImage, 0, 0);

    context.font = "30px Tahoma";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(num, 40, 70);

    return canvas.toDataURL("image/png");
  }

  function clearReminderAlarms(fnAfter) {
    chrome.alarms.getAll(async (alarms) => {
      for (let i = 0; i < alarms.length; i++) {
        const alarm = alarms[i];
        console.log("found alarm", alarm);
        const name = alarm.name;
        if (name.startsWith(_reminderPrefix)) {
          console.log("removed alarm", alarm);
          Promise.all([chrome.alarms.clear(name), removeFromStorageLocalAsync(name)]);
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
        console.log("{0} {1}".filledWith(alarm.name, new Date(alarm.scheduledTime).toLocaleString()));
        console.log(getStorage(alarm.name));
      }
    });
  }

  function storeRemindersAysnc() {
    putInStorageLocalAsync(localStorageKey.reminders, _remindersDefined);
  }

  function connectToPort() {
    console.log("listening for new ports");
    chrome.runtime.onConnect.addListener((port) => {
      console.log("port", port.name, port.sender.id);

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
        console.log("port received: ", msg);

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

  async function loadRemindersAsync() {
    const items = await getFromStorageLocalAsync(localStorageKey.reminders);
    if (items?.reminders) {
      console.log(`reminders loaded from local: ${items.reminders.length}`);
      _remindersDefined = items.reminders || [];
    }

    // setAlarmsForRestOfToday(true);

    // if (browserHostType === browser.Chrome) {
    //   chrome.storage.sync.get(
    //     {
    //       reminders: [],
    //     },
    //     (items) => {
    //       if (chrome.runtime.lastError) {
    //         console.log(chrome.runtime.lastError);
    //       }

    //       if (items.reminders) {
    //         console.log(`reminders loaded from sync: ${items.reminders.length}`);
    //         _remindersDefined = items.reminders || [];
    //       }

    //       if (_remindersDefined.length !== 0) {
    //         setAlarmsForRestOfToday(true);
    //       } else {
    //         loadLocal();
    //       }
    //     }
    //   );
    // } else {
    //   loadLocal();
    // }
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
    storeRemindersAysnc();
  }

  function broadcast(msg) {
    // send to all ports
    for (let i = 0; i < _ports.length; i++) {
      _ports[i].postMessage(msg);
    }
  }

  return {
    // called from background
    initialize: initialize,
    setAlarmsForRestOfToday: setAlarmsForRestOfToday,
    triggerAlarmNow: triggerAlarmNow,

    // for testing...
    dumpAlarms: dumpAlarms,
    clearReminderAlarms: clearReminderAlarms,
    saveAllReminders: saveAllReminders,
    _specialDays: _specialDays, // testing
    makeBadiNum: makeBadiNum,
    eraseReminders: () => saveAllReminders(),
    getReminders: () => _remindersDefined,
  };
}
