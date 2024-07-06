self.addEventListener("install", (event) => {
  self.skipWaiting(); // Forces the waiting service worker to become the active service worker
});

// self.addEventListener("activate", (event) => {
//   event.waitUntil(clients.claim()); // Claims control of all clients
// });

importScripts("third-party/dayjs.min.js");
importScripts("third-party/utc.js");
importScripts("third-party/timezone.js");

importScripts("suncalc.js");
importScripts("holydays.js");
importScripts("shared.js");
importScripts("service_worker_reminders.js");

prepareForBackgroundAndPopup();

_backgroundReminderEngine = {};

chrome.notifications.getPermissionLevel((level) => {
  // ensure flag is off if user has disabled them
  if (level !== "granted") {
    _notificationsEnabled = false;
  }
});

chrome.contextMenus.create(
  {
    id: "openInTab",
    title: getMessage("browserMenuOpen"),
    contexts: ["browser_action"],
  },
  showLastError
);

chrome.runtime.onInstalled.addListener((info) => {
  console.log("onInstalled", info);
  if (info.reason === "update") {
    setTimeout(async () => {
      const newVersion = chrome.runtime.getManifest().version;
      const oldVersion = await getFromStorageLocal(localStorageKey.updateVersion);
      if (!oldVersion) {
        console.log("no old version found, likely dev or first use");
      } else {
        if (newVersion !== oldVersion) {
          console.log(`${oldVersion} --> ${newVersion}`);
          putInStorageLocal(localStorageKey.updateVersion, newVersion);
          chrome.tabs.create({
            url: getMessage(`${browserHostType}_History`) + "?{0}:{1}".filledWith(chrome.runtime.getManifest().version, common.languageCode),
          });

          putInStorageLocal(localStorageKey.firstPopup, true);

          try {
            tracker.sendEvent("updated", getVersionInfo());
          } catch (e) {
            console.log(e);
          }
        } else {
          console.log(newVersion);
        }
      }
    }, 1000);
  } else {
    console.log("onInstalled", info);
  }
});

chrome.alarms.clearAll();
chrome.alarms.onAlarm.addListener((alarm) => {
  debugger;
  if (alarm.name.startsWith("refresh")) {
    console.log("ALARM:", alarm);
    refreshDateInfoAndShow();
    _backgroundReminderEngine.setAlarmsForRestOfToday();
  } else if (alarm.name.startsWith("alarm_")) {
    _backgroundReminderEngine.triggerAlarmNow(alarm.name);
  }
});

// Example service worker script
// self.addEventListener("install", (event) => {
// console.log("addEventListener install", event);
//   setAlarm("test", 1);
// });

// self.addEventListener("activate", (event) => {
//   console.log("addEventListener activate", event);
// });

async function setAlarm(name, delayInMinutes) {
  console.log("startAlarm:", name, delayInMinutes);
  await chrome.alarms.create(name, { delayInMinutes: delayInMinutes });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log("Alarm fired:", alarm);
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  // watch for alarms to change?
  console.log("Storage changed in namespace:", namespace, changes);
  for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
    console.log(`Storage key "${key}" in namespace "${namespace}" changed.`, `Old value was "${oldValue}", new value is "${newValue}".`);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("request:", request.action);
  debugger;
  if (request.action === "getCityName") {
    const lat = request.lat;
    const long = request.long;
    const key = "AIzaSyAURnmEv_3iDQNwEuqWosERggnbJhJPymc";
    const unknownLocation = request.unknownLocation || "Unknown location";
    console.log("lat:", lat, "long:", long, "key:", key, "unknownLocation:", unknownLocation);
    fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${long}&key=${key}`)
      .then((response) => response.json())
      .then((data) => {
        const error = data.error_message;
        if (error) {
          console.error("Error fetching city name:", error);
          sendResponse({ city: "Error" });
          return;
        }

        const status = data.status;
        const results = data.results;
        if (results.length > 0) {
          const city = findName("locality", results) || findName("political", results) || unknownLocation;

          sendResponse({ city });
        } else {
          sendResponse({ city: unknownLocation });
        }
      })
      .catch((error) => {
        console.error("Error fetching city name:", error);
        sendResponse({ city: "Error" });
      });

    // Return true to indicate you want to send a response asynchronously
    return true;
  }
});
