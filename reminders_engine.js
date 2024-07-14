/**
 *
 * Reminders are a superset of alarms, with full information about the event, alarm time, etc. They exist regardless of times.
 *
 * Alarms are the techincal way to schedule a Reminder event.
 *
 * On each day, alarms are cleared at midnight and sunset, then set up for the rest of the day. At startup also, alarms are set up for the rest of the day.
 *
 * Because alarms are cleared regularly, reminders are stored in local storage and must be created in the service worker each day.
 *
 * All reminders are stored in local storage, not in sync storage. If the user uses multiple devices, they will have to set up reminders on each device.
 *
 * This code runs only in the service worker.
 *
 */

function RemindersEngine() {
  console.log("RemindersEngine created");
  const _ports = [];
  let _specialDays = {};
  let _allReminders = [];
  let _now = new Date();
  // let _nowDi = null;
  let _nowNoon = null;
  let _nowSunTimes = null;
  let _nowAlmostMidnight = null;
  let _nowMidnight = null;
  let _baseBDayImage;

  const BEFORE = -1;
  const AFTER = 1;

  async function initializeAsync() {
    console.log("RemindersEngine initializing");

    prepareBaseImageAsync();

    connectToPort();

    chrome.alarms.onAlarm.addListener((alarm) => {
      triggerAlarmNowAsync(alarm); // no need to await it
    });

    _allReminders = (await getFromStorageLocalAsync(localStorageKey.reminders)) || [];

    await setAlarmsForRestOfTodayAsync(true);

    dumpAlarms(); // for debugging
  }

  async function setAlarmsForRestOfTodayAsync(initialLoad) {
    if (!_notificationsEnabled) return;

    // clear, then set again
    await clearReminderAlarmsAsync(async () => {
      await setAlarmsInternalAsync(initialLoad);
    });
  }

  /** Assumes all alarms are cleared */
  async function setAlarmsInternalAsync(initialLoad) {
    _now = new Date();
    // _nowDi = getDateInfo(_now);
    _nowNoon = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), 12, 0, 0, 0);
    _nowSunTimes = sunCalculator.getTimes(_nowNoon, common.locationLat, common.locationLong);

    _nowMidnight = new Date();
    _nowMidnight.setHours(24, 0, 0, 0); // midnight coming tonight
    _nowAlmostMidnight = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), 23, 59, 0, 0);

    console.log(`processing ${_allReminders.length} reminder(s) at ${_now}`);

    for (let i = 0; i < _allReminders.length; i++) {
      const reminder = _allReminders[i];
      if (reminder.trigger === "load" && !initialLoad) {
        continue;
      }

      try {
        await addTypedAlarmAsync[reminder.trigger](reminder);
      } catch (e) {
        console.log("Error adding alarm", reminder, e.message);
      }
    }

    broadcast({ code: "alarmsUpdated" });
  }

  const addTypedAlarmAsync = {
    load: async (reminder, isTest) => {
      await addTimeAlarmAsync(new Date(), reminder, isTest);
    },
    sunset: async (reminder, isTest) => {
      await addTimeAlarmAsync(_nowSunTimes.sunset, reminder, isTest);
    },
    sunrise: async (reminder, isTest) => {
      await addTimeAlarmAsync(_nowSunTimes.sunrise, reminder, isTest);
    },
    noon: async (reminder, isTest) => {
      await addTimeAlarmAsync(_nowNoon, reminder, isTest);
    },
    midnight: async (reminder, isTest) => {
      await addTimeAlarmAsync(_nowMidnight, reminder, isTest);
    },
    feast: async (reminder, isTest) => {
      await addEventAlarmAsync(reminder, isTest);
    },
    holyday: async (reminder, isTest) => {
      await addEventAlarmAsync(reminder, isTest);
    },
    bday: async (reminder, isTest) => {
      await addBDayAlarmAsync(reminder, isTest);
    },
  };

  /** Add time-based alarm */
  async function addTimeAlarmAsync(eventDate, reminder, isTest) {
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

    await createAlarmAsync(alarmInfo, isTest);
  }

  /** Add event-based alarm */
  async function addEventAlarmAsync(reminder, isTest) {
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

    await createAlarmAsync(alarmInfo, isTest);
  }

  /** Add Badi-date alarm */
  async function addBDayAlarmAsync(reminder, isTest) {
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
    alarmInfo.delta = alarmInfo.eventTime > alarmInfo.triggerTime ? BEFORE : AFTER; // TODO - verify

    // add extra for debugging
    alarmInfo.DI = testDI;

    buildUpAlarmInfo(alarmInfo, testDI, null);

    await createAlarmAsync(alarmInfo, isTest);
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

  const createAlarmAsync = async (alarmInfo, isTest) => {
    const alarmName = await storeAlarmAsync(alarmInfo, isTest);
    await chrome.alarms.create(alarmName, {
      when: alarmInfo.triggerTime,
    });
  };

  async function storeAlarmAsync(alarmInfo, isTest) {
    // store, and give back key to get it later
    // need to start with a prefix, so we can find them all and end with TEST if it is a test
    const alarmName = `${_reminderPrefix}-${alarmInfo.trigger}-${randomUUID()}-${isTest ? "TEST" : ""}`;

    alarmInfo.alarmName = alarmName; // store, so we can use it later

    await putInStorageLocalAsync(alarmName, alarmInfo);
    return alarmName;
  }

  async function clearReminderAlarmsAsync(fnAfter) {
    console.log("clearReminderAlarms");
    await chrome.alarms.getAll(async (alarms) => {
      console.log("found alarms", alarms);
      for (let i = 0; i < alarms.length; i++) {
        const alarm = alarms[i];
        const alarmName = alarm.name;
        if (alarmName.startsWith(_reminderPrefix)) {
          console.log("removing alarm", alarm);
          Promise.all([chrome.alarms.clear(alarmName), removeFromStorageLocalAsync(alarmName)]);
        } else {
          console.log("not a reminder", alarm);
        }
      }
    });
    if (fnAfter) {
      console.log("fnAfter");
      fnAfter();
    }
  }

  const getFullTime = (eventDateTime, triggerDate, onlyDateIfOther) => {
    // determine time to show
    const eventDate = new Date(eventDateTime);
    const eventTime = getTimeDisplay(eventDate);
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

  async function triggerAlarmNowAsync(alarm) {
    const alarmName = alarm.name;
    //TODO
    if (alarmName.startsWith(_reminderPrefix)) {
      console.log("Reminder:", alarm);
      refreshDateInfoAndShow();
      setAlarmsForRestOfToday();
    } else if (alarmName.startsWith("alarm_")) {
      triggerAlarmNowAsync(alarmName);
    }

    if (!alarmName.startsWith(_reminderPrefix)) {
      console.log(`unexpected reminder alarm: ${alarmName}`);
      return;
    }

    const alarmInfo = await getFromStorageLocalAsync(alarmName);
    if (!alarmInfo) {
      console.log(`no info for ${alarmName}`);
      return;
    }

    const isTest = alarmName.endsWith("TEST");

    if (!isTest && alarmInfo.triggerTime + 1000 < new Date().getTime()) {
      console.log("reminder requested, but past trigger.", alarmInfo);
      return;
    }

    showAlarmNow(alarmInfo, alarmName);

    await removeFromStorageLocalAsync(alarmInfo.alarmKey);

    if (!isTest) {
      setAlarmsForRestOfTodayAsync();
    }
  }

  function showTestAlarm(reminder) {
    addTypedAlarmAsync[reminder.trigger](reminder, true);
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
        when: getTimeDisplay(new Date()),
      });
    }

    alarmInfo.tagLine = tagLine;
    alarmInfo.alarmName = alarmName;

    console.log("DISPLAYED {alarmName}: {messageBody} ".filledWith(alarmInfo));

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
      doAdditionalAction(alarmInfo);
    }
  }

  function doAdditionalAction(alarmInfo) {
    switch (alarmInfo.action) {
      case "speak": {
        speakAlarm(alarmInfo);
        break;
      }

      case "ifttt": {
        sendIFTTT(alarmInfo);
        break;
      }

      case "zapier": {
        sendZapier(alarmInfo);
        break;
      }
    }
  }

  function speakAlarm(alarmInfo) {
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
  }

  function sendIFTTT(alarmInfo) {
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
    } catch (e) {
      console.log(e);
    }
  }

  function sendZapier(alarmInfo) {
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
    } catch (e) {
      console.log(e);
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

  function dumpAlarms() {
    console.log("dumping alarms");
    chrome.alarms.getAll(async (alarms) => {
      console.log(`found ${alarms.length} alarms`);
      for (let i = 0; i < alarms.length; i++) {
        const alarm = alarms[i];
        console.log("{0} {1}".filledWith(alarm.name, new Date(alarm.scheduledTime).toLocaleString()));
        console.log(await getFromStorageLocalAsync(alarm.name));
      }
    });
  }

  async function saveAllReminders(newSetOfReminders) {
    _allReminders = newSetOfReminders || [];
    await putInStorageLocalAsync(localStorageKey.reminders, _allReminders);
  }

  function connectToPort() {
    console.log("listening for new ports");
    chrome.runtime.onConnect.addListener((port) => {
      console.log("received on part", port.name, port.sender.id);

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

      port.onMessage.addListener(async (msg) => {
        console.log("port received: ", msg);

        switch (msg.code) {
          case "getReminders":
            // send back the list
            msg.reminders = _allReminders;
            port.postMessage(msg);
            break;

          case "saveAllReminders":
            await saveAllReminders(msg.reminders);
            // send back (to all ports)
            broadcast(msg);

            setAlarmsForRestOfTodayAsync();
            break;

          case "showTestAlarm":
            showTestAlarm(msg.reminder);
            break;

          case "makeSamples":
            await makeSamples();

            msg.reminders = _allReminders;
            port.postMessage(msg);
            break;
        }
      });
    });
  }

  async function makeSamples() {
    const samples = [
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
    await saveAllReminders(samples);
  }

  function broadcast(msg) {
    // send to all ports
    for (let i = 0; i < _ports.length; i++) {
      _ports[i].postMessage(msg);
    }
  }

  return {
    // called from service worker
    initializeAsync: initializeAsync,
    setAlarmsForRestOfTodayAsync: setAlarmsForRestOfTodayAsync,
    triggerAlarmNowAsync: triggerAlarmNowAsync,

    // for testing...
    dumpAlarms: dumpAlarms,
    clearReminderAlarms: clearReminderAlarmsAsync,
    saveAllReminders: saveAllReminders,
    _specialDays: _specialDays, // testing
    makeBadiNum: makeBadiNum,
    eraseReminders: () => saveAllReminders(),
    getReminders: () => _allReminders,
  };
}
