/* Code by Glen Little */

/*
 * Notes...
 * Firefox does not support canvas or geolocation in the background. Must open the tab to work.
 * 
 */


var _isBackgroundPage = true;
var _backgroundReminderEngine = {};
var popupUrl = chrome.extension.getURL('popup.html');

var BackgroundModule = function () {

  var alarmHandler = function (alarm) {
    if (alarm.name.startsWith('refresh')) {
      console.log('ALARM: ' + alarm.name);
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
          console.log(oldVersion + ' --> ' + newVersion);
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
    var msg = chrome.runtime.lastError;
    if (msg) {
      console.log(msg);
    }
  }

  function makeTab() {
    chrome.tabs.create({ url: popupUrl }, function (newTab) {
      setStorage('tabId', newTab.id);
    });
  };

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
      chrome.browserAction.onClicked.addListener(function () {
        var oldTabId = +getStorage('tabId', 0);
        if (oldTabId) {
          chrome.tabs.update(oldTabId, {
            active: true
          }, function (updatedTab) {
            if (!updatedTab) {
              makeTab();
            }
            if (chrome.runtime.lastError) {
              console.log(chrome.runtime.lastError.message);
            }
          });
        } else {
          makeTab();
        }

      });
    }

    chrome.contextMenus.create({
      'id': 'openInTab',
      'title': getMessage('browserMenuOpen'),
      'contexts': ['browser_action']
    }, showErrors);
    //chrome.contextMenus.create({
    //  'id': 'paste',
    //  'title': 'Insert Badíʿ Date',
    //  'contexts': ['editable']
    //}, showErrors);

    chrome.contextMenus.onClicked.addListener(function (info, tab) {
      switch (info.menuItemId) {
        //case 'paste':
        //  console.log(info, tab);
        //  chrome.tabs.executeScript(tab.id, {code: 'document.targetElement.value = "help"'}, showErrors);
        //  break;

        case 'openInTab':
          var afterUpdate = function (updatedTab) {
            if (!updatedTab) {
              makeTab();
            }
            if (chrome.runtime.lastError) {
              console.log(chrome.runtime.lastError.message);
            }
          };

          switch (browserHostType) {
            case browser.Chrome:
              chrome.tabs.query({ url: popupUrl }, function (foundTabs) {
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

    console.log('prepared background');

    if (browserHostType === browser.Firefox) {
      makeTab();
    }
  }

  return {
    prepare: prepare,
    makeTab: makeTab
  };
}

var _backgroundModule = new BackgroundModule();

$(function () {
  _backgroundModule.prepare();
});
