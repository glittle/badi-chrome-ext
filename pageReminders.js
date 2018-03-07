/* global getMessage */

//"options_ui": {
//  "_page": "options.html",
//  "chrome_style":  true
//},


var PageReminders = function () {
  var _reminderPrefix = 'alarm_';

  var saveMode = {
    save: 1,
    saveNew: 2,
    test: 3,
    saveFast: 4
  }

  var _reminderModulePort = {};
  var _reminders = [];

  var BEFORE = -1;
  var AFTER = 1;

  var _page = $('#pageReminders');
  var _currentEditId = 0;

  function editReminder(id) {
    var matchingReminders = $.grep(_reminders, function (r, i) {
      return r.displayId == id;
    });
    if (!matchingReminders.length) {
      return;
    }
    var reminder = matchingReminders[0];

    resetInputs();

    setAsCurrentDisplay(id);

    //log(reminder);

    _page.find('#btnReminderSave').show();

    reminder.delta = reminder.delta || BEFORE;

    for (var prop in reminder) {
      if (reminder.hasOwnProperty(prop)) {
        // do id and class
        _page.find('#reminder_{0}, .reminder_{0}'.filledWith(prop)).val(reminder[prop]);
      }
    }

    updateEditArea(true);
  }

  function save(mode) {
    if (!_page.find('form')[0].checkValidity()) {
      return;
    }
    if (!_currentEditId || mode == saveMode.saveNew) {
      mode = saveMode.saveNew;
      _currentEditId = _reminders.length;
      console.log('new reminder');
    }

    var r = buildReminder(_currentEditId);

    if (r.triggerTimeRaw) {
      r.triggerTimeRawDisplay = showTime(determineTriggerTimeToday(r));
    }

    if (r.iftttKey) {
      // store this, for other reminders to use
      setStorage('iftttKey', r.iftttKey);
    }
    if (r.zapierWebhook) {
      // store this, for other reminders to use
      setStorage('zapierWebhook', r.zapierWebhook);
    }


    var saveToBackground = true;
    var resetAfter = true;

    switch (mode) {
      case saveMode.save:
      case saveMode.saveFast:
        // find and replace
        $.each(_reminders, function (i, el) {
          if (el.displayId === r.displayId) {
            _reminders[i] = r;
            return false; // done
          }
        });

        if (mode === saveMode.saveFast) {
          saveToBackground = false;
        }
        break;

      case saveMode.saveNew:
        // add to the list
        _reminders.push(r);
        break;

      case saveMode.test:
        _reminderModulePort.postMessage({
          code: "showTestAlarm",
          reminder: r
        });
        resetAfter = false;
        saveToBackground = false;
        break;
    }

    if (saveToBackground) {
      try {
        tracker.sendEvent('saveReminder', r.trigger, r.delta * r.num + ' ' + r.units);
      }
      catch (e) {
        console.log('Error', e);
      }
      _reminderModulePort.postMessage({ code: "saveAllReminders", reminders: _reminders });
    }
    if (resetAfter) {
      resetInputs();
    }
  }

  function buildReminder(id) {
    var r = {
      displayId: id
    };

    _page.find('#reminder_trigger, .reminderEditInputs *[id^="reminder_"]:input, .reminderEditInputs *[class*="reminder_"]:input')
      .filter(function (i, el) { return $(el).parent().is(':visible') })
      .each(function (i, el) {
        var input = $(el);
        var name = '';
        if (el.id.startsWith('reminder_')) {
          name = el.id;
        }
        else {
          var classes = $.grep(el.className.split(' '), function (n, g) {
            return n.startsWith('reminder_');
          });
          if (classes.length) {
            name = classes[0];
          }
        }

        var prop = name.split('_')[1];
        var value = input.val();
        if (input[0].type == 'hidden') {
          value = input.data('default');
        };
        if (input.data('type') == 'num') {
          value = +value;
        }
        r[prop] = value;

        if (input[0].tagName === 'SELECT') {
          r[prop + 'Display'] = input.find(':selected').text();
        }
        if (input[0].id === 'reminder_trigger') {
          var selectedOption = input.find(':selected');
          r.model = selectedOption.data('model') || selectedOption.closest('optgroup').data('model');
        }
      });

    switch (r.trigger) {
      case 'sunset':
      case 'sunrise':
      case 'midnight':
      case 'noon':
        r.eventType = 'Time';
        break;

      case 'load':
        r.eventType = 'Time';
        r.delta = AFTER;
        break;

      case 'feast':
      case 'holyday':
        r.eventType = 'Event';
        r.unitsDisplay = getMessage('reminderNum_days'); //TODO...
        break;

      case 'bday':
        r.delta = 0;
        r.eventType = 'Event';
        break;
    }

    r.delta = r.delta || BEFORE;
    r.deltaText = r.delta === BEFORE ? getMessage('reminderBefore') : getMessage('reminderAfter');
    r.api = r.api || 'html';

    //log(r);

    return r;
  }


  function updateEditArea(focusOnFirstInput) {
    // turn everything off
    _page.find('.reminderModel, .reminderEditInputs, .reminderAction, .reminderCalcType').hide();
    _page.find('.reminderModel :input').each(function (i, input) { $(input).prop('disabled', true) });
    _page.find('.reminderAction').find(':input').each(function (i, input) { $(input).prop('disabled', true) });

    // find what model to show
    var selectedOption = _page.find('#reminder_trigger option:selected');
    var model = selectedOption.data('model') || selectedOption.closest('optgroup').data('model');

    if (model) {
      var modelArea = _page.find('#model_{0}'.filledWith(model));

      if (model == 'sun') {
        var calcType = modelArea.find('.reminder_calcType').val();
        modelArea.find('#reminderCalcType' + calcType).show();
      }

      modelArea.show().find(':input').each(function (i, input) { $(input).prop('disabled', false) });

      // deal with Action area
      var action = $('#reminder_action').val();
      _page.find('#reminderAction_{0}'.filledWith(action)).show().find(':input').each(function (i, input) { $(input).prop('disabled', false) });
      switch (action) {
        case 'ifttt':
          var id = $('.reminder_iftttKey');
          if (!id.val()) {
            id.val(getStorage('iftttKey', ''));
          }
          var eventName = $('.reminder_iftttEvent');
          if (!eventName.val()) {
            eventName.val(_page.find('#reminder_trigger').val());
          }
          break;
        case 'zapier':
          var url = $('.reminder_zapierWebhook');
          if (!url.val()) {
            url.val(getStorage('zapierWebhook', ''));
          }
          break;
      }

      _page.find('.modelTriggerEcho').html(selectedOption.html());
      _page.find('.reminderEditInputs').show();

      _page.find('.reminderEditInputs :input:visible').eq(0).focus();
    }
  }

  function getAndShowReminders() {
    console.log('sending msg');

    _reminderModulePort.postMessage({
      code: "getReminders"
    });
  }

  function setAsCurrentDisplay(id) {
    _currentEditId = id;
    _page.find('.reminders > div, .alarms > li').removeClass('inEdit');
    _page.find('#r_' + id).addClass('inEdit');
    _page.find('#a_' + id).addClass('inEdit');
  }

  function showReminders() {
    var listing = _page.find('.reminders');
    var html = [];
    var displayId = 1;
    // console.log('show reminders');
    _reminders.sort(reminderSort);
    $.each(_reminders, function (i, r) {
      var lines = [];

      r.displayId = displayId;
      displayId++;

      r.delta = r.delta || BEFORE;
      switch (r.trigger) {
        case 'sunset':
        case 'sunrise':
        case 'midnight':
        case 'noon':
          lines.push(getMessage('reminderTrigger_' + r.trigger));
          lines.push(' - ');
          lines.push(getMessage('reminderList_time' + r.calcType, r));
          break;

        case 'feast':
        case 'holyday':
          lines.push(getMessage('reminderTrigger_' + r.trigger));
          lines.push(' - ');
          lines.push(getMessage('reminderList_dayEvent', r));
          break;

        case 'bday':
          lines.push(getMessage('reminderTrigger_bday', r));
          lines.push(' - ');
          lines.push(getMessage('reminderList_bday', r));
          break;

        case 'load':
          lines.push(getMessage('reminderTrigger_' + r.trigger));
          lines.push(' - ');
          lines.push(getMessage('reminderList_onload', r));
          break;

        default:
          lines.push(JSON.stringify(r));
      }

      if (r.action) {
        lines.push(' ({0})'.filledWith(getMessage('reminderAction_' + r.action)));
      }

      html.push('<div id=r_{0} class=reminderInfo><span class=reminderNum>{0}</span> <button class=button data-id={0}>{2}</button> <div>{^1}</div></div>'.filledWith(
        r.displayId, lines.join(''), getMessage('btnReminderEdit')));
    });

    if (html.length === 0) {
      html.push('<button class=button id=makeSamples>{0}</button>'.filledWith(getMessage('noReminders')));
    }

    listing.html(html.join('\n'));

    showActiveAlarms();

    setAsCurrentDisplay(_currentEditId);
  }

  function showActiveAlarms() {
    if (browserHostType !== browser.Chrome) {
      return;
    }

    //update heading
    _page.find('#remindersScheduled').html(getMessage('remindersScheduled', { time: showTime(new Date()) }));

    // blank out the list
    var alarmList = _page.find('.alarms');
    alarmList.html('');

    chrome.alarms.getAll(function (alarms) {
      alarms.sort(function (a, b) {
        return a.scheduledTime < b.scheduledTime ? -1 : 1;
      });

      for (var i = 0; i < alarms.length; i++) {
        var alarm = alarms[i];
        if (alarm.name.startsWith(_reminderPrefix)) {
          var alarmInfo = getStorage(alarm.name);
          if (!alarmInfo) {
            console.log('No alarmInfo for ' + alarm.name);
            continue;
          }

          //log(alarmInfo);
          //alarmList.append('<li id=a_{2}>{0} --> {1} <button class=button data-id={2}>{3}</button></li>'.filledWith(alarmInfo.triggerTimeDisplay, alarmInfo.messageBody, alarmInfo.displayId, getMessage('btnReminderEdit')));

          alarmList.append('<li id=a_{1} class=alarmInfo><button class=button data-id={1}>{2}</button> {0}</li>'.filledWith(
            getMessage('reminderAlarm', alarmInfo),
            alarmInfo.displayId, getMessage('btnReminderEdit')));
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

    var delta = r.delta || BEFORE;
    var result;

    switch (r.trigger) {
      case 'sunrise':
        result = '01';
        break;

      case 'noon':
        result = '02';
        break;

      case 'sunset':
        result = '03';
        break;

      case 'midnight':
        result = '04';
        break;

      case 'holyday':
        result = '05';
        break;

      case 'feast':
        result = '06';
        break;

      case 'bday':
        result = '07';
        delta = 1;
        break;

      case 'load':
        result = '08';
        break;

      default:
        result = '99';
        break;
    }


    // result += delta == BEFORE ? 'A' : 'B';

    switch (r.units) {
      case 'seconds':
        result += 'A';
        break;

      case 'minutes':
        result += 'B';
        break;

      case 'hours':
        result += 'C';
        break;

      default:
        result += 'D';
        break;
    }

    var num = +(r.num || 0);
    result += ('000' + (500 + delta * num)).slice(-3);

    if (r.triggerTimeRaw) {
      result += r.triggerTimeRaw;
    }

    r.sortOrder = result;
    return result;
  }


  function attachHandlers() {
    _page.on('submit', 'form', function (e) {
      //prevent the form from doing a real submit
      e.preventDefault();
      return false;
    });

    _page.find('#btnReloadOptions').on('click', function () {
      window.location.reload();
    });

    _page.find('#reminder_trigger').on('change', function () {
      updateEditArea();
    });

    _page.find('#reminder_action').on('change', function () {
      updateEditArea();
    });

    _page.find('.reminder_calcType').on('change', function () {
      updateEditArea();
    });

    _page
      .on('click', '.reminders button', function (ev) {
        editReminder(+$(ev.target).data('id'));
      })
      .on('click', '.alarms button', function (ev) {
        editReminder(+$(ev.target).data('id'));
      })
      .on('click', '#makeSamples', function (ev) {
        _reminderModulePort.postMessage({ code: "makeSamples" });
      })
      .on('mouseover', '.alarmInfo, .reminderInfo', function (ev) {
        $('.reminderInfo, .alarmInfo').removeClass('tempHover');
        var id = $(ev.target).closest('.alarmInfo, .reminderInfo')[0].id;
        var num = id.split('_')[1];
        var matched = $('#a_{0},#r_{0}'.filledWith(num));
        if (matched.length > 1) {
          matched.addClass('tempHover');
        }
      })
      .on('click', '#btnReminderSave', function () {
        save(saveMode.save);
      })
      .on('click', '#btnReminderSaveNew', function () {
        save(saveMode.saveNew);
      })
      .on('click', '#btnReminderTest', function () {
        save(saveMode.test);
      })
      .on('click', '#btnReminderCancel', function () {
        resetInputs();
      })
      .on('click', '#btnReminderDelete', function () {
        if (_currentEditId) {
          var deleted = false;
          $.each(_reminders, function (i, r) {
            if (r.displayId === _currentEditId) {
              _reminders.splice(i, 1);
              deleted = true;
              _currentEditId = 0;
              return false;
            }
          });
          if (deleted) {
            _reminderModulePort.postMessage({ code: "saveAllReminders", reminders: _reminders });
            resetInputs();
          }
        }
      });
  }

  function resetInputs() {
    _page.find('*:input').each(function (i, el) {
      var input = $(el);
      var defaultValue = input.data('default');
      if (typeof defaultValue !== 'undefined') {
        input.val(defaultValue);
      }
    });
    _page.find('#btnReminderSave').hide();
    updateEditArea();
    setAsCurrentDisplay(0);
  }

  function establishPortToBackground() {
    console.log('making port');
    _reminderModulePort = chrome.runtime.connect({ name: "reminderModule" });
    _reminderModulePort.onMessage.addListener(function (msg) {
      console.log('received:', msg);

      // these are return call in response to our matching request
      switch (msg.code) {
        case 'getReminders':
          _reminders = msg.reminders || [];
          showReminders();
          break;

        case 'alarmsUpdated':
          showActiveAlarms();
          break;

        case 'saveAllReminders':
          _reminders = msg.reminders || [];
          showReminders();
          break;

        case 'makeSamples':
          _reminders = msg.reminders || [];
          showReminders();

          // need to "edit" each of the samples to get all the settings!
          $.each(_reminders, function (i, r) {
            editReminder(r.displayId);
            _currentEditId = r.displayId;
            save(saveMode.saveFast);
          });
          _reminderModulePort.postMessage({ code: "saveAllReminders", reminders: _reminders });
          break;
      }


    });
  }

  function determineTriggerTimeToday(reminder) {
    var date = new Date();
    date.setHours(reminder.triggerTimeRaw.substr(0, 2), reminder.triggerTimeRaw.substr(3, 2), 0, 0);
    return date;
  }

  function loadVoices() {
    if (browserHostType !== browser.Chrome) {
      return;
    }

    chrome.tts.getVoices(
          function (voices) {
            var options = [];
            for (var i = 0; i < voices.length; i++) {
              var voice = voices[i];
              if (voice.lang) {
                options.push('<option data-lang="{lang}">{voiceName}</option>'.filledWith(voice));
              }
              // https://developer.chrome.com/extensions/tts
            }
            var ddl = $('#speakVoice');
            ddl.html(options.join(''));

            // pre-select best match
            //full match
            var match = $.grep(voices, function (v) {
              return v.lang === _languageCode
            });
            if (match.length == 0) {
              match = $.grep(voices, function (v) {
                return v.lang && v.lang.startsWith(_languageCode);
              })
              if (match.length == 0) {
                match = $.grep(voices, function (v) {
                  return v.lang && v.lang.startsWith('en');
                })
              }
            }
            if (match.length) {
              ddl.data('default', match[0].voiceName);
            }
          });
  }

  function startup() {
    loadVoices();
    establishPortToBackground();
    getAndShowReminders();
    attachHandlers();
    resetInputs();
  }

  startup();

  return {
    showReminders: showReminders
  }
}
