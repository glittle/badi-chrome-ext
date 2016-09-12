///<reference path='gcalsetup.js'/>
///<reference path='shared.js'/>
/* global chrome */

/*
 * Warning...
 * 
 * This code is very specific to the 'normal' English Google calendar layout and formats!
 * It has to read the screen and try to determine which dates are being displayed.
 * 
 */

function fillCalendar(watchedDomElement) {
  var hash = location.hash;
  var parts = hash.split(/%7C|,|-/g);

  var config = {
    layout: parts.length > 1 ? parts[1] : 'month',
    daySelector: '',
    dayRegEx: null,
    contextDateSelector: '.date-top',
    contextDateFormat: '',
    logDetails: false
  };

  var el = $(watchedDomElement);
  let popupDisplay = el.hasClass('neb-date');
  let popupNew = el.hasClass('period-tile');
  if (popupDisplay || popupNew) {
    config = parsePopupInfo(popupDisplay, popupNew, config);

  } else {
    if (config.layout === 'eid' && el.hasClass('mv-event-container')) {
      config.layout = 'month';
    }
  }


  switch (config.layout) {
    case 'week':
      config.daySelector = '.wk-dayname span';
      config.contextDateFormat = 'MMM DD - -, YYYY'; //Sep 4 – 10, 2016
      config.dayRegEx = /.* (\d+)\/(\d+)/; // Tue 9/13
      break;

    case 'month':
      config.daySelector = '.st-dtitle span';
      config.contextDateFormat = 'MMMM YYYY';
      config.dayRegEx = /(\w+ )?(\d+)/; // Sep 1  or  5
      config.logDetails = true;
      break;

    case 'day':
      config.daySelector = '.wk-dayname span';
      config.contextDateFormat = 'dddd, MMM DD, YYYY'; //Tuesday, Sep 6, 2016
      config.dayRegEx = /.* (\d+)\/(\d+)/;// Tuesday 9/13
      break;

    case 'custom': // 5 day
      config.daySelector = '.wk-dayname span';
      config.contextDateFormat = 'MMM DD - -, YYYY'; //Sep 4 – 10, 2016
      config.dayRegEx = /.* (\d+)\/(\d+)/;// Tue 9/13
      break;

    case 'list': // agenda
      config.daySelector = '.lv-datecell span';
      config.contextDateFormat = 'dddd, MMM DD, YYYY'; //Tuesday, Sep 6, 2016
      config.dayRegEx = /(\w+)\s(\d+)/;// Tue Sep 14
      break;

    case 'popup':
      break;

    default:
      console.log('unexpected layout: ' + config.layout);
      console.log(el.attr('id'));
      console.log(el.className);
      return;
  }

  addToAllDays(config);
}

function parsePopupInfo(popupDisplay, popupNew, config) {
  config.layout = 'popup';
  config.daySelector = '.wk-dayname span';
  config.dayRegEx = /.* (\d+)\/(\d+)/;

  if (popupDisplay) {
    config.contextDateSelector = '.neb-date div';
  } else {
    config.contextDateSelector = '.period-tile .tile-content div';
  }

  //1 Mon, September 5

  //2 Thu, January 5, 2017
  //2 Tue, September 13, 1:30pm
  //2 Tue, September 20, 8am – 9am

  //3 Tue, May 9, 2017, 5:00pm – 5:01pm

  //4 Mon, August 29, 9am – Fri, September 2, 5pm

  //6 Sat, July 8, 2017, 9:51pm – Sun, July 9, 2017, 9:51pm

  var textDate = $(config.contextDateSelector).text();
  let textParts = textDate.split(',');
  var numCommas = textParts.length - 1;

  // VERY SPECIFIC to English layout!

  switch (numCommas) {
    case 1:
      config.contextDateFormat = '-, MMMM DD';
      break;
    case 2:
      if (!isNaN(textParts[2])) {
        config.contextDateFormat = '-, MMMM DD, YYYY';
      } else {
        config.contextDateFormat = '-, MMMM DD, -';
      }
      break;
    case 3:
      config.contextDateFormat = '-, MMMM DD, YYYY, -';
      break;
    case 4:
      config.contextDateFormat = '-, MMMM DD, -';
      break;
    case 6:
      config.contextDateFormat = '-, MMMM DD, YYYY, -';
      break;
    default:
      log(numCommas);
      break;
  }


  config.logDetails = true;

  return config;
}


function addToAllDays(config) {

  let dateTopText = $(config.contextDateSelector).text();
  var firstDate = moment(dateTopText, config.contextDateFormat);
  //  var firstDate = moment.utc(dateTopText, dateTopFormat);

  if (config.logDetails) {
    log('top text: ' + dateTopText);
    log('first date: ' + firstDate.format());
  }

  var lastDate = null;
  var startedMonth = false;

  var toInsert = [];

  $(config.daySelector)
    .each(function (i, el) {
      var span = $(el);

      var thisDate = moment(firstDate);
      thisDate.hour(12); // move to noon

      var monthOffset = 0;
      let inMonth = span.closest('td').hasClass('st-dtitle-nonmonth');
      let rawDateText = span.text();
      var matches = rawDateText.match(config.dayRegEx);

      switch (config.layout) {
        case 'month':
          if (inMonth) {
            if (!startedMonth) {
              // before the month
              monthOffset = -1;
            }
            if (startedMonth) {
              // before the month
              monthOffset = 1;
            }
          } else {
            startedMonth = true;
          }
          thisDate.month(thisDate.month() + monthOffset);
          thisDate.date(+matches[2]);
          break;

        case 'list':
          thisDate.date(+matches[2]);
          if (lastDate) {
            if (thisDate.isBefore(lastDate)) {
              thisDate.month(thisDate.month() + 1);
            }
          }
          break;

        default:
          thisDate.month(+matches[1] - 1);
          thisDate.date(+matches[2]);
          break;
      }

      if (lastDate) {
        if (thisDate.isBefore(lastDate)) {
          thisDate.year(thisDate.year() + 1);
        }
      }

      lastDate = thisDate;

      //      console.log(thisDate.format('YYYY MM DD'));

      chrome.runtime.sendMessage({
        cmd: 'getInfo',
        targetDay: thisDate.toDate().getTime(),
        layout: config.layout
      }, function (info) {
        span.addClass('gDay');
        var div;
        switch (config.layout) {
          case 'month':
          case 'week':
          case 'popup':
          case 'day':
          case 'custom':
          case 'list':
            div = $('<div/>',
            {
              html: info.label,
              'class': 'bDay' + info.classes,
              title: info.title
            });
            toInsert.push([span, div]);
            break;
        }
      });
    });


  chrome.runtime.sendMessage({
    cmd: 'dummy' // just to get in the queue after all the ones above
  },
    function () {
      // just in case we are called twice...
      $('.bDay').remove();

      //      console.log(`insert ${toInsert.length + 1} elements`);
      for (var j = 0; j < toInsert.length; j++) {
        var item = toInsert[j];

        switch (config.layout) {
          case 'month':
          case 'list':
          case 'custom':
          case 'week':
          case 'day':
            item[1].insertAfter(item[0]);
            break;
            //          case 'day':
            //            item[1].insertBefore(item[0]);
            //            break;
        }
      }
    });
}

var refreshCount = 0;
function calendarUpdated(watchedDomElement) {
  refreshCount++;

  // seems to redraw twice on first load
  var threshold = 1;

  //  if (element.id === 'mvEventContainer') {
  //    threshold = 1; 
  //  }

  if (refreshCount > threshold) {
    fillCalendar(watchedDomElement);
  }
}





(function (win) {
  'use strict';

  var listeners = [],
  doc = win.document,
  MutationObserver = win.MutationObserver || win.WebKitMutationObserver,
  observer;

  function ready(selector, fn) {
    // Store the selector and callback to be monitored
    listeners.push({
      selector: selector,
      fn: fn
    });
    if (!observer) {
      // Watch for changes in the document
      observer = new MutationObserver(check);
      observer.observe(doc.documentElement, {
        childList: true,
        subtree: true
      });
    }
    // Check if the element is currently in the DOM
    check();
  }

  function check() {
    // Check the DOM for elements matching a stored selector
    for (var i = 0, len = listeners.length, listener, elements; i < len; i++) {
      listener = listeners[i];
      // Query for elements matching the specified selector
      elements = doc.querySelectorAll(listener.selector);
      for (var j = 0, jLen = elements.length, element; j < jLen; j++) {
        element = elements[j];
        // Make sure the callback isn't invoked with the 
        // same element more than once
        if (!element.ready) {
          element.ready = true;
          // Invoke the callback with the element
          listener.fn.call(element, element);
        }
      }
    }
  }

  // Expose `ready`
  win.ready = ready;

})(this);


ready('#mvEventContainer', calendarUpdated); // month
ready('.wk-weektop', calendarUpdated); // week, custom
ready('#lv_listview', calendarUpdated); // agenda
ready('.neb-date', calendarUpdated); // popup
ready('.period-tile', calendarUpdated); // popup new event
ready('.ep-dpc', calendarUpdated); // edit page
