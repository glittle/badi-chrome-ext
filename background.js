/* Code by Glen Little */

var _isBackgroundPage = true;
var _backgroundReminderEngine = {};

var BackgroundModule = function () {

  var alarmHandler = function (alarm) {
    if (alarm.name.startsWith('refresh')) {
      log('ALARM: ' + alarm.name);
      refreshDateInfoAndShow();
      _backgroundReminderEngine.setAlarmsForRestOfToday();
    }
    else if (alarm.name.startsWith('alarm_')) {
      _backgroundReminderEngine.triggerAlarmNow(alarm.name);
    }
  };

  function installed(info) {
    if (info.reason == 'update') {
      setTimeout(function () {
        var newVersion = chrome.runtime.getManifest().version;
        var oldVersion = localStorage.updateVersion;
        if (newVersion != oldVersion) {
          log(oldVersion + ' --> ' + newVersion);
          localStorage.updateVersion = newVersion;
          chrome.tabs.create({
            url: getMessage(browserHostType + '_History') + '?{0}:{1}'.filledWith(
              chrome.runtime.getManifest().version,
              _languageCode)
          });

          setStorage('firstPopup', true);

          try {
            tracker.sendEvent('updated', getVersionInfo());
          } catch (e) {
            log(e);
          }
        } else {
          log(newVersion);
        }
      }, 1000);
    } else {
      log(info);
    }
  }

  //  function messageHandler(request, sender, sendResponse) {
  //    //log(request, sender, sendResponse);
  //    log('message received: ' + request.code);
  //  }

  function showErrors() {
    var msg = chrome.runtime.lastError;
    if (msg) {
      log(msg);
    }
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
      chrome.browserAction.onClicked.addListener(function() {
        chrome.tabs.create({
          "url": chrome.extension.getURL("popup.html")
        });
      });
    }

    chrome.contextMenus.create({
      'id': 'openInTab',
      'title': getMessage('browserMenuOpen'),
      'contexts': ['browser_action']
    }, showErrors);
    //chrome.contextMenus.create({
    //  'id': 'paste',
    //  'title': 'Insert Badí Date',
    //  'contexts': ['editable']
    //}, showErrors);

    chrome.contextMenus.onClicked.addListener(function (info, tab) {
      switch (info.menuItemId) {
        //case 'paste':
        //  log(info, tab);
        //  chrome.tabs.executeScript(tab.id, {code: 'document.targetElement.value = "help"'}, showErrors);
        //  break;

        case 'openInTab':
          var url = chrome.extension.getURL('popup.html');

          var makeTab = function () {
            chrome.tabs.create({ url: url }, function (newTab) {
              setStorage('tabId', newTab.id);
            });
          };

          var afterUpdate = function (updatedTab) {
            if (!updatedTab) {
              makeTab();
            }
            if (chrome.runtime.lastError) {
              log(chrome.runtime.lastError.message);
            }
          };

          switch (browserHostType) {
            case browser.Chrome:
              chrome.tabs.query({ url: url }, function (foundTabs) {
                switch (foundTabs.length) {
                  case 1:
                    // resuse
                    chrome.tabs.update(foundTabs[0].id, {
                      active: true
                    }, afterUpdate);
                    break;

                  case 0:
                    makeTab();
                    break;

                  default:
                    // bug in March 2016 - all tabs returned!

                    var oldTabId = +getStorage('tabId', 0);
                    if (oldTabId) {
                      chrome.tabs.update(oldTabId, {
                        active: true
                      }, afterUpdate);
                    } else {
                      makeTab();
                    }
                    break;
                }

                if (tracker) {
                  // not working?...
                  tracker.sendEvent('openInTabContextMenu');
                }
              });

              break;

            default:
              makeTab();

              if (tracker) {
                // not working?...
                tracker.sendEvent('openInTabContextMenu');
              }
              break;
          }

          break;
      }
    });

    log('prepared background');
  }

  return {
    prepare: prepare
  };
}

var _backgroundModule = new BackgroundModule();

$(function () {
  _backgroundModule.prepare();
});
