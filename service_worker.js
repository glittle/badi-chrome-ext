/**
 *  Likely many improvements to be made here, but this is a start.
 *
 * This service worker is used to handle background tasks and notifications.
 * It also needs to respond to external messages from associated extensions.
 *
 */

console.log("Loading service worker...");

self.addEventListener("install", (event) => {
  console.log("Service Worker installed");

  self.skipWaiting(); // Forces the waiting service worker to become the active service worker
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker activated");
  event.waitUntil(clients.claim()); // Claims control of all clients
});

importScripts("third-party/dayjs.min.js");
console.log("Loaded dayjs");
importScripts("third-party/utc.js");
console.log("Loaded utc");
importScripts("third-party/timezone.js");
console.log("Loaded timezone");

importScripts("suncalc.js");
console.log("Loaded suncalc");
importScripts("holyDays.js");
console.log("Loaded holydays");
importScripts("shared.js");
console.log("Loaded shared");

console.log("starting to prepare for background and popup");

// can't use async/await here, so have to build a pending function queue
prepareForBackgroundAndPopup();

chrome.notifications.getPermissionLevel(configureNotifications);
chrome.notifications.onPermissionLevelChanged.addListener(configureNotifications);

var _notificationsEnabled = false;
var _remindersEngineLoaded = false;

function configureNotifications(level) {
  _notificationsEnabled = level === "granted";

  console.log("Notifications permission level:", level);

  if (_notificationsEnabled) {
    if (!_remindersEngineLoaded) {
      importScripts("reminders_engine.js");
      console.log("Loaded reminders_engine.js");
      _remindersEngineLoaded = true;
      _remindersEngine = new RemindersEngine();
    }
    AddFunctionToPendingInstallFunctions(_remindersEngine.initialize);
  } else {
    console.log("Notifications are disabled");
  }
}

chrome.runtime.onInstalled.addListener((info) => {
  console.log("onInstalled", info);
  if (info.reason === "update") {
    setTimeout(async () => {
      const newVersion = chrome.runtime.getManifest().version;
      const oldVersion = await getFromStorageLocalAsync(localStorageKey.updateVersion);
      if (!oldVersion) {
        console.log("no old version found, likely dev or first use");
      } else {
        if (newVersion !== oldVersion) {
          console.log(`${oldVersion} --> ${newVersion}`);
          putInStorageLocalAsync(localStorageKey.updateVersion, newVersion);
          chrome.tabs.create({
            url: getMessage(`${browserHostType}_History`) + "?{0}:{1}".filledWith(chrome.runtime.getManifest().version, common.languageCode),
          });

          putInStorageLocalAsync(localStorageKey.firstPopup, true);

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
  chrome.contextMenus.create(
    {
      id: "openInTab",
      title: getMessage("browserMenuOpen"),
      contexts: ["browser_action"],
    },
    showLastError
  );
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  // watch for storage changes
  console.log("Storage changed in namespace:", namespace, changes);
  for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
    console.log(`Storage key "${key}" in namespace "${namespace}" changed.`, `Old value was "${oldValue}", new value is "${newValue}".`);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("on message:", request);

  if (request.action === "Wake Up") {
    console.log("Waking up...");
    sendResponse({ message: "Thanks. I'm awake now!" });
    // sendResponse({ message: "Thanks. I'm awake now!", _rawMessages, _cachedMessages });
    // console.log(_rawMessages, _cachedMessages);
    return true; // Indicate that we will respond asynchronously
  }

  if (request.action === "languageChanged") {
    _knownDateInfos = {};
    prepareForBackgroundAndPopup();
    return true;
  }

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

chrome.runtime.onMessageExternal.addListener(
  /*
    cmd options:  getInfo, connect
  
     * payload:
     *  { 
     *    cmd: 'getInfo'
     *    targetDay: date/datestring for new Date(targetDay)
     *    labelFormat: '{bDay}' (optional)
     *  }
     * returns:
     *  {
     *   label: {bMonthNamePri} {bDay}
     *   title:
     *   classes: '[firstBDay] element4'
     *  }
     * 
     */
  async (payload, sender, callback1) => {
    console.log("onMessageExternal:", payload);

    const callback = callback1 || (() => {}); // make it optional
    switch (payload.cmd) {
      case "getInfo": {
        // layout, targetDay
        // can adjust per layout
        const di = getDateInfo(new Date(payload.targetDay));
        // const holyDay = $ .grep_holyDays.prepareDateInfos(di.bYear), (el, i) => el.Type.substring(0, 1) === "H" && el.BDateCode === di.bDateCode);
        const holyDay = _holyDays.prepareDateInfos(di.bYear).filter((el) => el.Type.substring(0, 1) === "H" && el.BDateCode === di.bDateCode);
        const holyDayName = holyDay.length > 0 ? getMessage(holyDay[0].NameEn) : null;

        callback({
          label: (payload.labelFormat || (await getFromStorageLocalAsync(localStorageKey.gCalLabel, "{bMonthNamePri} {bDay}"))).filledWith(di),
          title: (
            payload.titleFormat ||
            (await getFromStorageLocalAsync(localStorageKey.gCalTitle, "⇨ {endingSunsetDesc}\n{bYear}.{bMonth}.{bDay}\n{element}"))
          ).filledWith(di),
          classes: `${di.bDay === 1 ? " firstBDay" : ""} element${di.elementNum}`,
          di: di,
          hd: holyDayName,
        });
        break;
      }

      // case "getStorage":
      //   callback({
      //     value: await getFromStorageLocalAsync(payload.key, payload.defaultValue),
      //   });
      //   break;

      case "connect":
        callback({
          value: "Wondrous Calendar!",
          id: chrome.runtime.id,
        });
        break;

      default:
        callback();
        break;
    }
  }
);
