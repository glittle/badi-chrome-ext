// Example service worker script
self.addEventListener('install', (event) => {
    console.log('Service Worker installed');
    setAlarm('test', 1);
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activated');
});


async function setAlarm(name, delayInMinutes) {
    console.log('startAlarm:', name, delayInMinutes);
    await chrome.alarms.create(name, { delayInMinutes: delayInMinutes });
}

chrome.alarms.onAlarm.addListener((alarm) => {
    console.log('Alarm fired:', alarm);
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getCityName') {
        const lat = request.lat;
        const long = request.long;
        const key = 'AIzaSyAURnmEv_3iDQNwEuqWosERggnbJhJPymc';
        var unknownLocation = request.unknownLocation || 'Unknown location';
        // debugger;
        fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${long}&key=${key}`)
            .then(response => response.json())
            .then(data => {
                const error = data.error_message;
                if (error) {
                    console.error('Error fetching city name:', error);
                    sendResponse({ city: 'Error' });
                    return;
                }

                const status = data.status;
                const results = data.results;
                if (results.length > 0) {

                    let city =
                        findName('locality', results) ||
                        findName('political', results) ||
                        unknownLocation;

                    sendResponse({ city });
                } else {
                    sendResponse({ city: unknownLocation });
                }
            })
            .catch(error => {
                console.error('Error fetching city name:', error);
                sendResponse({ city: 'Error' });
            });

        // Return true to indicate you want to send a response asynchronously
        return true;
    }
});

var findName = function (typeName, results, getLastMatch) {
    var match = null;
    for (var r = 0; r < results.length; r++) {
        var result = results[r];
        if (result.types.indexOf(typeName) !== -1) {
            match = result.formatted_address;
            if (!getLastMatch) return match;
        }
    }
    return match;
};
