/**
 *
 * Reminder definitions have full information about an event... alarm time, etc. They exist regardless of times.
 * Reminder definitions are kept in storage and must be created in the service worker each day, at least as sunset and midnight.
 * All reminder definitions are stored in local storage, not in sync storage. If the user uses multiple devices, they will have to set up reminders on each device.
 *
 * Alarms are the way to implement an upcoming event defined in a Reminder definition.
 * On each day, alarms are refreshed (cleared and recreated) at midnight and sunset, and at startup.
 * Alarms are created for any events for the rest of the day based on the reminder definitions.
 * Extra alarms are created to trigger the next refresh.
 *
 * The name of each alarm indicate if it was set from a reminder definition, if it was a test, or a scheduled refresh.
 *
 * This code runs only in the service worker.
 */

function RemindersEngine() {
  console.log("RemindersEngine created");
  const _ports = [];
  const _testAlarmText = "_TEST";
  let _specialDays = {};
  let _reminderDefinitions = [];
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

    browser.alarms.onAlarm.addListener((alarm) => {
      triggerAlarmNowAsync(alarm); // no need to await it
    });

    _reminderDefinitions = (await getFromStorageLocalAsync(localStorageKey.reminderDefinitions)) || [];

    console.log("reminder definitions", _reminderDefinitions);

    await setAlarmsForRestOfTodayAsync(true);

    dumpAlarms(); // for debugging
  }

  async function setAlarmsForRestOfTodayAsync(initialLoad) {
    if (!_notificationsEnabled) return;

    await setAlarmsInternalAsync(initialLoad);
  }

  /** Assumes all alarms are cleared */
  async function setAlarmsInternalAsync(initialLoad) {
    // clear all active alarms
    await browser.alarms.clearAll();

    // remove all stored instances
    await removeFromStorageByPrefixLocalAsync(_alarmNamePrefix);

    _now = new Date();
    // _nowDi = getDateInfo(_now);
    _nowNoon = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), 12, 0, 0, 0);
    _nowSunTimes = sunCalculator.getTimes(_nowNoon, common.locationLat, common.locationLong);

    _nowMidnight = new Date();
    _nowMidnight.setHours(24, 0, 0, 0); // midnight coming tonight
    _nowAlmostMidnight = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), 23, 59, 0, 0);

    console.log(`processing ${_reminderDefinitions.length} reminder definition(s) at ${_now}`);

    for (let i = 0; i < _reminderDefinitions.length; i++) {
      const reminderDefinition = _reminderDefinitions[i];
      if (reminderDefinition.trigger === "load" && !initialLoad) {
        continue;
      }

      try {
        await addTypedAlarmAsync[reminderDefinition.trigger](reminderDefinition);
      } catch (e) {
        console.log("Error adding alarm", reminderDefinition, e.message);
      }
    }

    broadcast({ code: "alarmsUpdated" });
  }

  const addTypedAlarmAsync = {
    load: async (reminderDefinition, isTest) => {
      await addTimeAlarmAsync(new Date(), reminderDefinition, isTest);
    },
    sunset: async (reminderDefinition, isTest) => {
      await addTimeAlarmAsync(_nowSunTimes.sunset, reminderDefinition, isTest);
    },
    sunrise: async (reminderDefinition, isTest) => {
      await addTimeAlarmAsync(_nowSunTimes.sunrise, reminderDefinition, isTest);
    },
    noon: async (reminderDefinition, isTest) => {
      await addTimeAlarmAsync(_nowNoon, reminderDefinition, isTest);
    },
    midnight: async (reminderDefinition, isTest) => {
      await addTimeAlarmAsync(_nowMidnight, reminderDefinition, isTest);
    },
    feast: async (reminderDefinition, isTest) => {
      await addEventAlarmAsync(reminderDefinition, isTest);
    },
    holyday: async (reminderDefinition, isTest) => {
      await addEventAlarmAsync(reminderDefinition, isTest);
    },
    bday: async (reminderDefinition, isTest) => {
      await addBDayAlarmAsync(reminderDefinition, isTest);
    },
  };

  /** Add time-based alarm */
  async function addTimeAlarmAsync(eventDate, reminderDefinition, isTest) {
    const reminderInstance = shallowCloneOf(reminderDefinition);
    reminderInstance.eventTime = eventDate.getTime();

    let triggerDate;
    switch (reminderInstance.calcType) {
      case "Absolute":
        triggerDate = determineTriggerTimeToday(reminderInstance);
        break;

      default:
        triggerDate = new Date(reminderInstance.eventTime);
        adjustTime(triggerDate, reminderInstance);
        break;
    }

    if (isTest) {
      // remember when it should have been shown
      reminderInstance.testForTime = triggerDate.getTime();
      triggerDate = _now;
    }

    if (_now.toDateString() !== triggerDate.toDateString() || triggerDate < _now) {
      // desired time for reminderDefinition has already past for today
      return;
    }

    reminderInstance.triggerTime = triggerDate.getTime();

    enhanceReminderInstance(reminderInstance, null, null);

    await createAlarmAsync(reminderInstance, isTest);
  }

  /** Add event-based alarm */
  async function addEventAlarmAsync(reminderDefinition, isTest) {
    let triggerDate = determineTriggerTimeToday(reminderDefinition);

    if (_now.toDateString() !== triggerDate.toDateString() || triggerDate < _now) {
      // desired time for reminderDefinition has already past for today
      return;
    }

    const typeWanted = reminderDefinition.trigger === "feast" ? "M" : "H";

    //if(typeWanted=='H') console.log("reminderDefinition", reminderDefinition);

    // check for an event this number of days away, at this time
    let testDate = new Date(_nowAlmostMidnight);
    testDate.setDate(testDate.getDate() - reminderDefinition.delta * reminderDefinition.num);

    let testDayDi = getDateInfo(testDate);
    let holyDayInfo = getMatchingEventDateFor(testDayDi, typeWanted);

    if (!isTest && !holyDayInfo) {
      return;
    }

    const reminderInstance = shallowCloneOf(reminderDefinition);

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
        if (testEvent.Type === (reminderDefinition.trigger === "feast" ? "M" : "HS")) {
          holyDayInfo = testEvent;
          testDayDi = getDateInfo(holyDayInfo.GDate);

          // remember when it should have been shown
          testDate = new Date(holyDayInfo.GDate.getTime());
          testDate.setDate(testDate.getDate() + reminderDefinition.delta * reminderDefinition.num);
          testDate.setHours(triggerDate.getHours(), triggerDate.getMinutes());

          reminderInstance.testForTime = testDate.getTime();
          triggerDate = _now;
          break;
        }
      }
    }

    // got one!
    reminderInstance.eventTime = testDayDi.frag1SunTimes.sunset.getTime();
    reminderInstance.triggerTime = triggerDate.getTime();

    // add extra for debugging
    reminderInstance.DI = testDayDi;
    reminderInstance.HDI = holyDayInfo;

    //log(reminderInstance);

    enhanceReminderInstance(reminderInstance, testDayDi, holyDayInfo);

    await createAlarmAsync(reminderInstance, isTest);
  }

  /** Add Badi-date alarm */
  async function addBDayAlarmAsync(reminderDefinition, isTest) {
    let triggerDate = determineTriggerTimeToday(reminderDefinition);
    if (triggerDate < _now && !isTest) {
      // desired time for reminderDefinition has already past for today
      return;
    }

    let testDate = new Date(triggerDate);
    let testDI = getDateInfo(testDate);

    if (testDI.bDay !== reminderDefinition.num) {
      // check after sunset
      testDate = new Date(_nowAlmostMidnight);
      testDI = getDateInfo(testDate);
      if (testDI.bDay !== reminderDefinition.num && !isTest) {
        // not currently the right day
        return;
      }
    }

    const reminderInstance = shallowCloneOf(reminderDefinition);

    if (isTest) {
      // remember when it should have been shown
      reminderInstance.testForTime = triggerDate.getTime();
      triggerDate = _now;
    }

    reminderInstance.triggerTime = triggerDate.getTime();

    reminderInstance.eventTime = testDI.frag1SunTimes.sunset.getTime();
    reminderInstance.delta = reminderInstance.eventTime > reminderInstance.triggerTime ? BEFORE : AFTER; // TODO - verify

    // add extra for debugging
    reminderInstance.DI = testDI;

    enhanceReminderInstance(reminderInstance, testDI, null);

    await createAlarmAsync(reminderInstance, isTest);
  }

  function enhanceReminderInstance(reminderInstance, testDayDi, holyDayInfo) {
    let triggerDisplayName = getMessage(`reminderTrigger_${reminderInstance.trigger}`);
    reminderInstance.title = getMessage("reminderTitle", triggerDisplayName);

    let units = reminderInstance.units;
    const dayName = "";
    const dateName = "";

    //log(reminderInstance);

    let messageType = "";
    switch (reminderInstance.trigger) {
      case "sunrise":
      case "sunset":
        messageType = reminderInstance.calcType === "Absolute" || reminderInstance.num === 0 ? "Time" : "DeltaTime";
        break;

      case "midnight":
      case "noon":
        messageType = "Delta";
        break;

      case "holyday":
        messageType = reminderInstance.num === 0 ? "StartTime" : "StartDeltaTime";
        triggerDisplayName = getMessage("reminderHolyDay", getMessage(holyDayInfo.NameEn));
        break;

      case "feast": {
        messageType = reminderInstance.num === 0 ? "StartTime" : "StartDeltaTime";
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
        triggerDisplayName = getMessage("reminderBDay", reminderInstance);
        break;

      case "load":
        messageType = "DeltaTime";
        break;
    }

    const triggerDate = new Date(reminderInstance.triggerTime);
    const showDate = new Date(reminderInstance.testForTime ? reminderInstance.testForTime : triggerDate.getTime());
    reminderInstance.triggerTimeDisplay = getFullTime(showDate.getTime(), showDate, true);

    const futurePast = reminderInstance.eventTime > showDate.getTime() ? "Future" : "Past";
    const messageKey = "{0}_{1}".filledWith(futurePast, messageType);

    const unitInfo = getMessage("reminderNum_{0}_1_more".filledWith(units));

    const unitNames = unitInfo ? unitInfo.split(";") : ["?", "?"];
    const unitDisplay = reminderInstance.num === 1 ? unitNames[0] : unitNames[1];

    const bodyInfo = {
      numUnits: getMessage("numUnits", {
        num: reminderInstance.num,
        units: unitDisplay,
      }),
      time: getFullTime(reminderInstance.eventTime, triggerDate),
    };
    const info = {
      triggerDisplayName: triggerDisplayName,
      desc: getMessage(messageKey, bodyInfo),
    };

    reminderInstance.messageBody = getMessage("messageBody", info);
  }

  const createAlarmAsync = async (reminderInstance, isTest) => {
    const alarmName = await storeInstanceAndMakeName(reminderInstance, isTest);
    await browser.alarms.create(alarmName, {
      when: reminderInstance.triggerTime,
    });
  };

  const randomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  async function storeInstanceAndMakeName(reminderInstance, isTest) {
    // store, and give back key to get it later
    // need to start with a prefix, so we can find them all and end with TEST if it is a test
    // use a random number to avoid collisions
    const alarmName = `${_alarmNamePrefix}${reminderInstance.displayId} ${reminderInstance.trigger} ${reminderInstance.triggerTimeDisplay}${
      isTest ? _testAlarmText : ""
    } ${randomNumber(1000, 9999)}`;

    reminderInstance.alarmName = alarmName; // store, so we can use it later

    await putInStorageLocalAsync(alarmName, reminderInstance);
    return alarmName;
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
      _specialDays[testDayDi.bYear] = _holyDaysEngine.prepareDateInfos(testDayDi.bYear);
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

  const adjustTime = (d, reminderInstance) => {
    let ms = 0;
    reminderInstance.delta = reminderInstance.delta || BEFORE;
    switch (reminderInstance.units) {
      case "seconds":
        ms = reminderInstance.num * 1000;
        break;

      case "minutes":
        ms = reminderInstance.num * 1000 * 60;
        break;

      case "hours":
        ms = reminderInstance.num * 1000 * 60 * 60;
        break;

      case "days":
        ms = reminderInstance.num * 1000 * 60 * 60 * 24;
        break;
    }

    d.setTime(d.getTime() + ms * reminderInstance.delta);
  };

  function determineTriggerTimeToday(reminderDefinition) {
    const date = new Date();
    date.setHours(+reminderDefinition.triggerTimeRaw.substr(0, 2), +reminderDefinition.triggerTimeRaw.substr(3, 2), 0, 0);
    return date;
  }

  async function triggerAlarmNowAsync(alarm) {
    const alarmName = alarm.name;
    console.log("Alarm triggered in service worker:", alarm);

    // if (alarmName.startsWith(_alarmNamePrefix)) {
    //   refreshDateInfoAndShowAsync();
    //   await setAlarmsForRestOfTodayAsync();
    // } else if (alarmName.startsWith("alarm_")) {
    //   await triggerAlarmNowAsync(alarmName);
    // }

    // if (!alarmName.startsWith(_alarmNamePrefix)) {
    //   console.log(`unexpected reminderDefinition alarm: ${alarmName}`);
    //   return;
    // }

    const reminderInstance = await getFromStorageLocalAsync(alarmName);
    if (!reminderInstance) {
      console.log(`no info for ${alarmName}`);
      return;
    }

    const isTest = alarmName.includes(_testAlarmText);

    if (!isTest && reminderInstance.triggerTime + 1000 < new Date().getTime()) {
      console.log("reminderDefinition requested, but past trigger.", reminderInstance);
      return;
    }

    showAlarmNow(reminderInstance, alarmName);

    await removeFromStorageLocalAsync(reminderInstance.alarmName);

    if (!isTest) {
      setAlarmsForRestOfTodayAsync();
    }
  }

  function showTestAlarm(reminderDefinition) {
    addTypedAlarmAsync[reminderDefinition.trigger](reminderDefinition, true);
  }

  function showAlarmNow(reminderInstance, alarmName) {
    const iconUrl = getIcon(reminderInstance);
    let tagLine;

    if (reminderInstance.testForTime) {
      tagLine = getMessage("reminderTestTagline").filledWith({
        when: reminderInstance.triggerTimeDisplay,
      });
    } else {
      tagLine = getMessage("reminderTagline").filledWith({
        when: getTimeDisplay(new Date()),
      });
    }

    reminderInstance.tagLine = tagLine;
    reminderInstance.alarmName = alarmName;

    console.log("DISPLAYED {alarmName}: {messageBody} ".filledWith(reminderInstance));

    const api = "chrome"; // for now, ONLY use Chrome

    switch (api) {
      case "chrome":
        // closes automatically after a few seconds
        browser.notifications
          .create(null, {
            type: "basic",
            iconUrl: iconUrl,

            title: reminderInstance.title,
            message: reminderInstance.messageBody,
            priority: 2,
            contextMessage: tagLine,
          })
          .then((id) => {
            //log('chrome notification ' + id);
          });
        break;

      //case 'html':
      //  const n = new Notification('HTML ' + reminderInstance.title, {
      //    icon: iconUrl,

      //    body: reminderInstance.messageBody + '\n\n' + tagLine,
      //    lang: common.languageCode,
      //    dir: common.languageDir,
      //    tag: 'html' + alarmName
      //  });
      //  break;
    }

    try {
      tracker.sendEvent(
        "showReminder",
        reminderInstance.trigger,
        `${reminderInstance.delta * reminderInstance.num} ${reminderInstance.units} ${api}`
      );
    } catch (e) {
      console.log(e);
    }

    if (reminderInstance.action) {
      doAdditionalAction(reminderInstance);
    }
  }

  function doAdditionalAction(reminderInstance) {
    switch (reminderInstance.action) {
      case "speak": {
        speakAlarm(reminderInstance);
        break;
      }

      case "ifttt": {
        sendIFTTT(reminderInstance);
        break;
      }

      case "zapier": {
        sendZapier(reminderInstance);
        break;
      }
    }
  }

  function speakAlarm(reminderInstance) {
    const options = {
      //'lang': common.languageCode,
      voiceName: reminderInstance.speakVoice,
      enqueue: true,
    };
    console.log(options);
    // TODO - how to do this in Firefox?
    chrome.tts.speak("{title}.\n\n {messageBody}".filledWith(reminderInstance), options, () => {
      if (browser.runtime.lastError) {
        console.log(`Error: ${browser.runtime.lastError}`);
      }
    });
  }

  function sendIFTTT(reminderInstance) {
    const url = "https://maker.ifttt.com/trigger/{iftttEvent}/with/key/{iftttKey}".filledWith(reminderInstance);
    const content = {
      value1: reminderInstance.title,
      value2: reminderInstance.messageBody,
      value3: reminderInstance.tagLine,
    };
    try {
      fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content), // Use only for POST or PUT requests
      })
        .then((response) => response.json())
        .then((data) => {
          browser.notifications.create(null, {
            type: "basic",
            iconUrl: "badi19a-128.png",
            title: reminderInstance.actionDisplay,
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

  function sendZapier(reminderInstance) {
    const zap = {
      title: reminderInstance.title,
      body: reminderInstance.messageBody,
      tag: reminderInstance.tagLine,
      time: new Date(),
    };
    try {
      fetch(reminderInstance.zapierWebhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zap),
      })
        .then((response) => response.json())
        .then((data) => {
          browser.notifications.create(null, {
            type: "basic",
            iconUrl: "badi19a-128.png",
            title: reminderInstance.actionDisplay,
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

  function getIcon(reminderDefinition) {
    let icon;
    switch (reminderDefinition.trigger) {
      case "bday":
        icon = makeBadiNum(reminderDefinition.num);
        break;
      default:
        icon = "imagesForReminders/{0}.jpg".filledWith(reminderDefinition.trigger);
        break;
    }
    //log('icon for {0} = {1}'.filledWith(reminderDefinition.trigger, icon));
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
    browser.alarms.getAll().then(async (alarms) => {
      console.log(`found ${alarms.length} pending alarms...`);
      for (let i = 0; i < alarms.length; i++) {
        const alarm = alarms[i];
        console.log("Alarm {0} {1}".filledWith(alarm.name, new Date(alarm.scheduledTime).toLocaleString()));
        console.log("Reminder instance", await getFromStorageLocalAsync(alarm.name));
      }
    });
  }

  async function saveAllReminders(reminderDefinitions) {
    _reminderDefinitions = reminderDefinitions || [];
    await putInStorageLocalAsync(localStorageKey.reminderDefinitions, _reminderDefinitions);
  }

  function connectToPort() {
    console.log("listening for new ports");
    browser.runtime.onConnect.addListener((port) => {
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
            msg.reminderDefinitions = _reminderDefinitions;
            port.postMessage(msg);
            break;

          case "saveAllReminders":
            await saveAllReminders(msg.reminderDefinitions);
            // send back (to all ports)
            broadcast(msg);

            setAlarmsForRestOfTodayAsync();
            break;

          // case "refreshAlarms":
          //   await setAlarmsForRestOfTodayAsync();
          //   break;

          case "showTestAlarm":
            showTestAlarm(msg.reminderDefinition);
            break;

          case "makeSamples":
            await makeSamples();

            msg.reminderDefinitions = _reminderDefinitions;
            port.postMessage(msg);
            break;
        }
      });
    });
  }

  async function makeSamples() {
    const sampleDefinitions = [
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
    await saveAllReminders(sampleDefinitions);
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

    // for testing...
    dumpAlarms: dumpAlarms,
    // clearReminderAlarms: clearReminderAlarmsAsync,
    saveAllReminders: saveAllReminders,
    _specialDays: _specialDays, // testing
    makeBadiNum: makeBadiNum,
    eraseReminders: () => saveAllReminders(),
    getReminders: () => _reminderDefinitions,
  };
}
