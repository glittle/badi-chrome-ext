const PageReminders = () => {
  const saveMode = {
    save: 1,
    saveNew: 2,
    test: 3,
    savingInBatch: 4,
  };

  let _reminderModulePort = {};
  let _reminderDefinitions = [];

  const BEFORE = -1;
  const AFTER = 1;

  const _page = $("#pageReminders");
  let _currentEditId = 0;

  function editReminderDefnition(id) {
    // const matchingReminders = $ .grep(_reminders, (r, i) => r.displayId === id);
    const matchingDefinitions = _reminderDefinitions.filter((r) => r.displayId === id);
    if (!matchingDefinitions.length) {
      return;
    }
    const reminderDefinition = matchingDefinitions[0];

    resetInputs();

    setAsCurrentDisplay(id);

    //log(reminder);

    _page.find("#btnReminderSave").show();

    reminderDefinition.delta = reminderDefinition.delta || BEFORE;

    for (const prop in reminderDefinition) {
      if (Object.prototype.hasOwnProperty.call(reminderDefinition, prop)) {
        // do id and class
        _page.find("#reminder_{0}, .reminder_{0}".filledWith(prop)).val(reminderDefinition[prop]);
      }
    }

    updateEditArea(true);
  }

  function save(newMode) {
    if (!_page.find("form")[0].checkValidity()) {
      return;
    }

    if (!_currentEditId) {
      _currentEditId = _reminderDefinitions.length;
      console.log("new reminder", _currentEditId);
    }

    const reminderDefintion = buildReminder(_currentEditId);

    if (reminderDefintion.triggerTimeRaw) {
      reminderDefintion.triggerTimeRawDisplay = getTimeDisplay(determineTriggerTimeToday(reminderDefintion));
    }

    if (reminderDefintion.iftttKey) {
      // store this, for other reminders to use
      putInStorageSyncAsync(syncStorageKey.iftttKey, reminderDefintion.iftttKey);
    }
    if (reminderDefintion.zapierWebhook) {
      // store this, for other reminders to use
      putInStorageSyncAsync(syncStorageKey.zapierWebhook, reminderDefintion.zapierWebhook);
    }

    let saveToBackground = true;
    let resetAfter = true;

    switch (newMode) {
      case saveMode.save:
      case saveMode.savingInBatch:
        // find and replace
        _reminderDefinitions.forEach((el, i) => {
          if (el.displayId === reminderDefintion.displayId) {
            _reminderDefinitions[i] = reminderDefintion;
            return false; // done
          }
        });

        if (newMode === saveMode.savingInBatch) {
          saveToBackground = false;
        }
        break;

      case saveMode.saveNew:
        // add to the list
        _reminderDefinitions.push(reminderDefintion);
        break;

      case saveMode.test:
        _reminderModulePort.postMessage({
          code: "showTestAlarm",
          reminderDefinition: reminderDefintion,
        });
        resetAfter = false;
        saveToBackground = false;
        break;
    }

    if (saveToBackground) {
      try {
        tracker.sendEvent("savedReminder", { trigger: reminderDefintion.trigger, delta: reminderDefintion.delta, units: reminderDefintion.units });
      } catch (e) {
        console.log("Error", e);
      }
      _reminderModulePort.postMessage({
        code: "saveAllReminders",
        reminderDefinitions: _reminderDefinitions,
      });
    }
    if (resetAfter) {
      resetInputs();
    }
  }

  function buildReminder(id) {
    const r = {
      displayId: id,
    };

    _page
      .find('#reminder_trigger, .reminderEditInputs *[id^="reminder_"]:input, .reminderEditInputs *[class*="reminder_"]:input')
      .filter((i, el) => $(el).parent().is(":visible"))
      .each((i, el) => {
        const input = $(el);
        let name = "";
        if (el.id.startsWith("reminder_")) {
          name = el.id;
        } else {
          // const classes = $ .grep(el.className.split(" "), (n, g) => n.startsWith("reminder_"));
          const classes = el.className.split(" ").filter((n) => n.startsWith("reminder_"));
          if (classes.length) {
            name = classes[0];
          }
        }

        const prop = name.split("_")[1];
        let value = input.val();
        if (input[0].type === "hidden") {
          value = input.data("default");
        }
        if (input.data("type") === "num") {
          value = +value;
        }
        r[prop] = value;

        if (input[0].tagName === "SELECT") {
          r[`${prop}Display`] = input.find(":selected").text();
        }
        if (input[0].id === "reminder_trigger") {
          const selectedOption = input.find(":selected");
          r.model = selectedOption.data("model") || selectedOption.closest("optgroup").data("model");
        }
      });

    switch (r.trigger) {
      case "sunset":
      case "sunrise":
      case "midnight":
      case "noon":
        r.eventType = "Time";
        break;

      case "load":
        r.eventType = "Time";
        r.delta = AFTER;
        break;

      case "feast":
      case "holyday":
        r.eventType = "Event";
        r.unitsDisplay = getMessage("reminderNum_days"); //TODO...
        break;

      case "bday":
        r.delta = 0;
        r.eventType = "Event";
        break;
    }

    r.delta = r.delta || BEFORE;
    r.deltaText = r.delta === BEFORE ? getMessage("reminderBefore") : getMessage("reminderAfter");
    r.api = r.api || "html";

    //log(r);

    return r;
  }

  function updateEditArea(focusOnFirstInput) {
    // turn everything off
    _page.find(".reminderModel, .reminderEditInputs, .reminderAction, .reminderCalcType").hide();
    _page.find(".reminderModel :input").each((i, input) => {
      $(input).prop("disabled", true);
    });
    _page
      .find(".reminderAction")
      .find(":input")
      .each((i, input) => {
        $(input).prop("disabled", true);
      });

    // find what model to show
    const selectedOption = _page.find("#reminder_trigger option:selected");
    const model = selectedOption.data("model") || selectedOption.closest("optgroup").data("model");

    if (model) {
      const modelArea = _page.find("#model_{0}".filledWith(model));

      if (model === "sun") {
        const calcType = modelArea.find(".reminder_calcType").val();
        modelArea.find(`#reminderCalcType${calcType}`).show();
      }

      modelArea
        .show()
        .find(":input")
        .each((i, input) => {
          $(input).prop("disabled", false);
        });

      // deal with Action area
      const action = $("#reminder_action").val();
      _page
        .find("#reminderAction_{0}".filledWith(action))
        .show()
        .find(":input")
        .each((i, input) => {
          $(input).prop("disabled", false);
        });
      switch (action) {
        case "ifttt": {
          const id = $(".reminder_iftttKey");
          if (!id.val()) {
            id.val(common.iftttKey);
          }
          const eventName = $(".reminder_iftttEvent");
          if (!eventName.val()) {
            eventName.val(_page.find("#reminder_trigger").val());
          }
          break;
        }
        case "zapier": {
          const url = $(".reminder_zapierWebhook");
          if (!url.val()) {
            url.val(common.zapierWebhook);
          }
          break;
        }
      }

      _page.find(".modelTriggerEcho").html(selectedOption.html());
      _page.find(".reminderEditInputs").show();

      _page.find(".reminderEditInputs :input:visible").eq(0).focus();
    }
  }

  function getAndShowReminders() {
    // console.log("sending msg");

    _reminderModulePort.postMessage({
      code: "getReminders",
    });
  }

  function setAsCurrentDisplay(reminderDefinitionId) {
    _currentEditId = reminderDefinitionId;
    _page.find(".reminders > div, .alarms > li").removeClass("inEdit");
    _page.find(`#r_${reminderDefinitionId}`).addClass("inEdit");
    _page.find(`#a_${reminderDefinitionId}`).addClass("inEdit");
  }

  function showReminderDefinitions() {
    const listing = _page.find(".reminders");
    const html = [];
    let displayId = 1;
    // console.log('show reminders');
    _reminderDefinitions.sort(reminderSort);
    _reminderDefinitions.forEach((r) => {
      const lines = [];

      r.displayId = displayId;
      displayId++;

      r.delta = r.delta || BEFORE;
      switch (r.trigger) {
        case "sunset":
        case "sunrise":
        case "midnight":
        case "noon":
          lines.push(getMessage(`reminderTrigger_${r.trigger}`));
          lines.push(" - ");
          lines.push(getMessage(`reminderList_time${r.calcType}`, r));
          break;

        case "feast":
        case "holyday":
          lines.push(getMessage(`reminderTrigger_${r.trigger}`));
          lines.push(" - ");
          lines.push(getMessage("reminderList_dayEvent", r));
          break;

        case "bday":
          lines.push(getMessage("reminderTrigger_bday", r));
          lines.push(" - ");
          lines.push(getMessage("reminderList_bday", r));
          break;

        case "load":
          lines.push(getMessage(`reminderTrigger_${r.trigger}`));
          lines.push(" - ");
          lines.push(getMessage("reminderList_onload", r));
          break;

        default:
          lines.push(JSON.stringify(r));
      }

      if (r.action) {
        lines.push(" ({0})".filledWith(getMessage(`reminderAction_${r.action}`)));
      }

      html.push(
        "<div id=r_{0} class=reminderInfo><span class=reminderNum>{0}</span> <button class=button data-id={0}>{2}</button> <div>{^1}</div></div>".filledWith(
          r.displayId,
          lines.join(""),
          getMessage("btnReminderEdit")
        )
      );
    });

    if (html.length === 0) {
      html.push("<button class=button id=makeSamples>{0}</button>".filledWith(getMessage("noReminders")));
    }

    // html.push("<button class=button id=refreshAlarms>{0}</button>".filledWith("TEST: Refresh Alarms"));

    listing.html(html.join("\n"));

    showActiveAlarms();

    setAsCurrentDisplay(_currentEditId);
  }

  function showActiveAlarms() {
    // if (browserHostType !== browserType.Chrome) {
    //   return;
    // }
    _page.find("#remindersScheduled").html(getMessage("remindersScheduled", { time: getTimeDisplay(new Date()) }));

    // blank out the list
    const alarmList = _page.find(".alarms");
    alarmList.html("");

    browser.alarms.getAll().then(async (alarms) => {
      alarms.sort((a, b) => (a.scheduledTime < b.scheduledTime ? -1 : 1));

      for (let i = 0; i < alarms.length; i++) {
        const alarm = alarms[i];
        if (alarm.name.startsWith(_alarmNamePrefix)) {
          // console.log("Custom alarm", alarm);
          const alarmInfo = await getFromStorageLocalAsync(alarm.name);
          if (!alarmInfo) {
            console.log(`No alarmInfo for ${alarm.name}`);
            continue;
          }

          alarmList.append(
            "<li id=a_{1} class=alarmInfo><button class=button data-id={1}>{2}</button> {0}</li>".filledWith(
              getMessage("reminderAlarm", alarmInfo),
              alarmInfo.displayId,
              getMessage("btnReminderEdit")
            )
          );
        } else if (alarm.name.startsWith(_refreshPrefix)) {
          // console.log("Alarm for refresh", alarm);
        } else {
          console.log("Unexpected alarm", alarm);
        }
      }
    });
  }

  function reminderSort(a, b) {
    return reminderOrder(a) < reminderOrder(b) ? -1 : 1;
  }

  function reminderOrder(r) {
    if (r.sortOrder) {
      return r.sortOrder;
    }

    let delta = r.delta || BEFORE;
    let result;

    switch (r.trigger) {
      case "sunrise":
        result = "01";
        break;

      case "noon":
        result = "02";
        break;

      case "sunset":
        result = "03";
        break;

      case "midnight":
        result = "04";
        break;

      case "holyday":
        result = "05";
        break;

      case "feast":
        result = "06";
        break;

      case "bday":
        result = "07";
        delta = 1;
        break;

      case "load":
        result = "08";
        break;

      default:
        result = "99";
        break;
    }

    // result += delta == BEFORE ? 'A' : 'B';

    switch (r.units) {
      case "seconds":
        result += "A";
        break;

      case "minutes":
        result += "B";
        break;

      case "hours":
        result += "C";
        break;

      default:
        result += "D";
        break;
    }

    const num = +(r.num || 0);
    result += `000${500 + delta * num}`.slice(-3);

    if (r.triggerTimeRaw) {
      result += r.triggerTimeRaw;
    }

    r.sortOrder = result;
    return result;
  }

  function attachHandlers() {
    _page.on("submit", "form", (e) => {
      //prevent the form from doing a real submit
      e.preventDefault();
      return false;
    });

    _page.find("#btnReloadOptions").on("click", () => {
      window.location.reload();
    });

    _page.find("#reminder_trigger").on("change", () => {
      updateEditArea();
    });

    _page.find("#reminder_action").on("change", () => {
      updateEditArea();
    });

    _page.find(".reminder_calcType").on("change", () => {
      updateEditArea();
    });

    _page
      .on("click", ".reminders button", (ev) => {
        editReminderDefnition(+$(ev.target).data("id"));
      })
      .on("click", ".alarms button", (ev) => {
        editReminderDefnition(+$(ev.target).data("id"));
      })
      .on("click", "#makeSamples", (ev) => {
        // debugger;
        _reminderModulePort.postMessage({ code: "makeSamples" });
      })
      // .on("click", "#refreshAlarms", (ev) => {
      //   _reminderModulePort.postMessage({ code: "refreshAlarms" });
      // })
      .on("mouseover", ".alarmInfo, .reminderInfo", (ev) => {
        $(".reminderInfo, .alarmInfo").removeClass("tempHover");
        const id = $(ev.target).closest(".alarmInfo, .reminderInfo")[0].id;
        const num = id.split("_")[1];
        const matched = $("#a_{0},#r_{0}".filledWith(num));
        if (matched.length > 1) {
          matched.addClass("tempHover");
        }
      })
      .on("click", "#btnReminderSave", () => {
        save(saveMode.save);
      })
      .on("click", "#btnReminderSaveNew", () => {
        save(saveMode.saveNew);
      })
      .on("click", "#btnReminderTest", () => {
        save(saveMode.test);
      })
      .on("click", "#btnReminderCancel", () => {
        resetInputs();
      })
      .on("click", "#btnReminderDelete", () => {
        if (_currentEditId) {
          let deleted = false;
          _reminderDefinitions.forEach((r, i) => {
            if (r.displayId === _currentEditId) {
              _reminderDefinitions.splice(i, 1);
              deleted = true;
              _currentEditId = 0;
              return false;
            }
          });
          if (deleted) {
            _reminderModulePort.postMessage({
              code: "saveAllReminders",
              reminderDefinitions: _reminderDefinitions,
            });
            resetInputs();
          }
        }
      });
  }

  function resetInputs() {
    _page.find("*:input").each((i, el) => {
      const input = $(el);
      const defaultValue = input.data("default");
      if (typeof defaultValue !== "undefined") {
        input.val(defaultValue);
      }
    });
    _page.find("#btnReminderSave").hide();
    updateEditArea();
    setAsCurrentDisplay(0);
  }

  function establishPortToBackground() {
    // console.log("making port for reminderModule");
    _reminderModulePort = browser.runtime.connect({ name: "reminderModule" });
    _reminderModulePort.onMessage.addListener((msg) => {
      // console.log("pageReminders port received:", msg);

      // these are return call in response to our matching request
      switch (msg.code) {
        case "getReminders":
          _reminderDefinitions = msg.reminderDefinitions || [];
          showReminderDefinitions();
          break;

        case "alarmsUpdated":
          showActiveAlarms();
          break;

        case "saveAllReminders":
          _reminderDefinitions = msg.reminderDefinitions || [];
          showReminderDefinitions();
          break;

        case "makeSamples":
          _reminderDefinitions = msg.reminderDefinitions || [];
          showReminderDefinitions();

          // need to "edit" each of the samples to get all the settings!
          _reminderDefinitions.forEach((r) => {
            editReminderDefnition(r.displayId);
            _currentEditId = r.displayId;
            save(saveMode.savingInBatch);
          });
          _reminderModulePort.postMessage({
            code: "saveAllReminders",
            reminderDefinitions: _reminderDefinitions,
          });
          break;
      }
    });
  }

  function determineTriggerTimeToday(reminderDefinition) {
    const date = new Date();
    date.setHours(reminderDefinition.triggerTimeRaw.substr(0, 2), reminderDefinition.triggerTimeRaw.substr(3, 2), 0, 0);
    return date;
  }

  function showVoicesList() {
    getVoicesListAsync().then((voices) => {
      const options = [];
      voices.forEach((voice) => {
        // console.log(voice);
        options.push(
          '<option data-lang="{lang}" selected="{default}">{name}</option>'.filledWith({ name: voice.name, lang: voice.lang, default: voice.default })
        );
      });
      const ddl = $("#speakVoice");
      ddl.html(options.join(""));
    });

    // pre-select best match
    //full match
    // let match = $ .grep(voices, (v) => v.lang === common.languageCode);
    // let match = voices.filter((v) => v.lang === common.languageCode);
    // if (!match.length) {
    //   // match = $ .grep(voices, (v) => v.lang?.startsWith(common.languageCode));
    //   match = voices.filter((v) => v.lang?.startsWith(common.languageCode));
    //   if (!match.length) {
    //     // match = $ .grep(voices, (v) => v.lang?.startsWith("en"));
    //     match = voices.filter((v) => v.lang?.startsWith("en"));
    //   }
    // }
    // if (match.length) {
    //   ddl.data("default", match[0].voiceName);
    // }
  }

  function startup() {
    showVoicesList();
    establishPortToBackground();
    getAndShowReminders();
    attachHandlers();
    resetInputs();
  }

  startup();

  return {
    showReminders: showReminderDefinitions,
  };
};
