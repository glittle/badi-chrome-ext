/**
 *  Likely many improvements to be made here, but this is a start.
 *
 * This service worker is used to handle background tasks and notifications.
 * It also needs to respond to external messages from associated extensions.
 *
 */

// console.log("Loading service worker...");

self.addEventListener("install", (event) => {
  // console.log("Service Worker installed");

  self.skipWaiting(); // Forces the waiting service worker to become the active service worker
});

self.addEventListener("activate", (event) => {
  // console.log("Service Worker activated");
  event.waitUntil(clients.claim()); // Claims control of all clients
});

importScripts("third-party/browser-polyfill.min.js");

importScripts("third-party/dayjs.min.js");
// console.log("Loaded dayjs");
importScripts("third-party/utc.js");
// console.log("Loaded utc");
importScripts("third-party/timezone.js");
// console.log("Loaded timezone");

importScripts("suncalc.js");
// console.log("Loaded suncalc");
importScripts("holyDays.js");
// console.log("Loaded holydays");
importScripts("shared.js");
// console.log("Loaded shared");

// browser.storage.local.getBytesInUse().then((bytesInUse) => {
//   console.log("Space used by local storage", bytesInUse, "bytes");
// });
// browser.storage.local.get().then((storage) => {
//   console.log("Local storage", storage);
// });

// browser.storage.sync.getBytesInUse().then((bytesInUse) => {
//   console.log("Space used by sync storage", bytesInUse, "bytes");
// });
// browser.storage.sync.get().then((storage) => {
//   console.log("Sync storage", storage);
// });

// can't use async/await here, so have to build a pending function queue

var _notificationsEnabled = false;
var _remindersEngineLoaded = false;

async function configureNotificationsAsync() {
  const permissionLevel = Notification.permission;
  _notificationsEnabled = permissionLevel === "granted";

  // console.log("Notifications permission level:", permissionLevel);

  if (_notificationsEnabled) {
    if (!_remindersEngineLoaded) {
      importScripts("reminders_engine.js");
      // console.log("Loaded reminders_engine.js");
      _remindersEngineLoaded = true;
      _remindersEngine = new RemindersEngine();
    }
    await AddFunctionToPendingInstallFunctionsAsync(_remindersEngine.initializeAsync);
  } else {
    console.log("Notifications are disabled");
  }
}

configureNotificationsAsync();
browser.permissions.onAdded.addListener(configureNotificationsAsync);
browser.permissions.onRemoved.addListener(configureNotificationsAsync);

browser.runtime.onInstalled.addListener((info) => {
  // console.log("onInstalled", info);
  if (info.reason === "update") {
    // delay this, to let everything settle before opening the page
    setTimeout(async () => {
      const newVersion = browser.runtime.getManifest().version;
      const oldVersion = await getFromStorageLocalAsync(localStorageKey.updateVersion);
      if (!oldVersion) {
        // console.log("Version check... no old version found, likely dev or first use");
      } else {
        if (newVersion !== oldVersion) {
          console.log(`${oldVersion} --> ${newVersion}`);
          putInStorageLocalAsync(localStorageKey.updateVersion, newVersion);
          browser.tabs.create({
            url: getMessage(`${browserHostType}_History`) + "?{0}:{1}".filledWith(newVersion, common.languageCode),
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
  setTimeout(async () => {
    // let the language resources load first
    showIcon();
    browser.contextMenus.create(
      {
        id: "openInTab",
        type: "normal",
        title: getMessage("browserMenuOpen"),
        contexts: ["all"],
      },
      () => {
        const msg = browser.runtime.lastError;
        if (msg) {
          console.error("Error in contextMenus.create", msg);
          debugger; // stop on error in dev mode
        } else {
          // console.log("Context menu created");
        }
      }
    );
    browser.contextMenus.onClicked.addListener((info) => {
      if (info.menuItemId === "openInTab") {
        openInTab();
      }
    });
  }, 1000);
});

//--> Keep for debugging
// browser.storage.onChanged.addListener((changes, namespace) => {
//   // watch for storage changes
//   console.log("Storage changed in namespace:", namespace, changes);
//   for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
//     console.log(`Storage key "${key}" in namespace "${namespace}" changed.`, `Old value was "${oldValue}", new value is "${newValue}".`);
//   }
// });

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("message received:", request);

  (async () => {
    switch (request.action) {
      case "Wake Up":
        console.log("Waking up...");
        sendResponse({ message: "Thanks. I'm awake now!" });
        break;

      case "languageChanged":
        _knownDateInfos = {};
        await prepareForBackgroundAndPopupAsync();
        sendResponse({ message: "Language changed" });
        break;

      case "getCityName":
        const lat = request.lat;
        const long = request.long;
        const key = "AIzaSyAURnmEv_3iDQNwEuqWosERggnbJhJPymc";
        const unknownLocation = request.unknownLocation || "Unknown location";
        console.log("getting City name... lat:", lat, "long:", long, "key:", key);
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
              console.log(results);
              const city = findLocationName("locality", results) || findLocationName("political", results) || unknownLocation;
              console.log("city:", city);
              sendResponse({ city });
            } else {
              sendResponse({ city: unknownLocation });
            }
          })
          .catch((error) => {
            console.error("Error fetching city name:", error);
            sendResponse({ city: "Error" });
          });
        break;
    }
  })();

  return true;
});

const findLocationName = (typeName, results, getLastMatch) => {
  let match = null;
  for (let r = 0; r < results.length; r++) {
    const result = results[r];
    if (result.types.indexOf(typeName) !== -1) {
      match = result.formatted_address;
      if (!getLastMatch) return match;
    }
  }
  return match;
};

browser.runtime.onMessageExternal.addListener(
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
        const holyDay = _holyDaysEngine.prepareDateInfos(di.bYear).filter((el) => el.Type.substring(0, 1) === "H" && el.BDateCode === di.bDateCode);
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
          id: browser.runtime.id,
        });
        break;

      default:
        callback();
        break;
    }
  }
);

(async () => {
  await prepareForBackgroundAndPopupAsync();
})();
