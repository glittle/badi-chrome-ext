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
  if (!watchedDomElement) {
    return;
  }

  var hash = location.hash;
  var parts = hash.split(/%7C|,|-/g);

  var config = {
    layout: parts.length > 1 ? parts[1] : 'month',
    daySelector: '',
    dayRegEx: null,
    dayRegExItem: byFormat({
      month: 1,
      day: 2
    }, {
      day: 1,
      month: 2
    }, {
      month: 1,
      day: 2
    }),
    contextDateSelector: '.date-top',
    contextDateFormat: '',
    logDetails: false,
    hostSelector: '',
    wrapIn: '',
    showNextDayToo: false,
    inEditPage: false,
    classes: ''
  };

  var el = $(watchedDomElement); // may be null
  let popupType =
    el.hasClass('neb-date') ? 'view1'
    : el.hasClass('period-tile') ? 'new'
    : el.hasClass('datetime-container') ? 'view2'
    : '';

  if (popupType) {
    config.layout = 'popup';

  } else {
    if (config.layout === 'eid' && el.hasClass('mv-event-container')) {
      config.layout = 'month';
    }
  }

  log(config.layout + ' - ' + watchedDomElement.className);

  switch (config.layout) {
    case 'week':
      config.daySelector = '.wk-dayname span';
      config.contextDateFormat = byFormat('MMM DD - -, YYYY', 'MMM DD - -, YYYY', 'MMM DD - -, YYYY'); //Sep 4 – 10, 2016
      config.dayRegEx = byFormat(/.* (\d+)\/(\d+)/, /.* (\d+)\/(\d+)/, /.* (\d+)\/(\d+)/); // Tue 9/13
      break;

    case 'month':
      config.daySelector = '.st-dtitle span';
      config.contextDateFormat = byFormat('MMMM YYYY', 'MMMM YYYY', 'MMMM YYYY');
      config.dayRegEx = byFormat(/(\w+ )?(\d+)/, /(\w+ )?(\d+)/, /(\w+ )?(\d+)/); // Sep 1  or  5
      break;

    case 'day':
      config.daySelector = '.wk-dayname span';
      config.contextDateFormat = byFormat('dddd, MMM DD, YYYY', 'dddd, MMM DD, YYYY', 'dddd, MMM DD, YYYY'); //Tuesday, Sep 6, 2016
      config.dayRegEx = byFormat(/.* (\d+)\/(\d+)/, /.* (\d+)\/(\d+)/, /.* (\d+)\/(\d+)/);// Tuesday 9/13
      config.wrapIn = '<div class="bDayWrap" />';
      break;

    case 'custom': // 5 day
      config.daySelector = '.wk-dayname span';
      config.contextDateFormat = byFormat('MMM DD - -, YYYY', 'MMM DD - -, YYYY', 'MMM DD - -, YYYY'); //Sep 4 – 10, 2016
      config.dayRegEx = byFormat(/.* (\d+)\/(\d+)/, /.* (\d+)\/(\d+)/, /.* (\d+)\/(\d+)/);// Tue 9/13
      break;

    case 'list': // agenda
      config.daySelector = '.lv-datecell span';
      config.contextDateFormat = byFormat('dddd, MMM DD, YYYY', 'dddd, MMM DD, YYYY', 'dddd, MMM DD, YYYY'); //Tuesday, Sep 6, 2016
      config.dayRegEx = byFormat(/(\w+)\s(\d+)/, /(\w+)\s(\d+)/, /(\w+)\s(\d+)/);// Tue Sep 14
      break;

    case 'popup':
      config = parsePopupInfo(popupType, config);
      break;

    case 'eid':
      config = parseEditInfo(config);
      break;

    default:
      console.log('unexpected layout: ' + config.layout);
      console.log(el.attr('id'));
      console.log(el.className);
      return;
  }

  addToAllDays(config);
}

function parsePopupInfo(popupType, config) {
  config.daySelector = '';
  var textDate;

  switch (popupType) {
    case 'view1':
      config.contextDateSelector = '.neb-date div';
      config.hostSelector = '.neb-date';
      break;
    case 'new':
      config.contextDateSelector = '.period-tile .tile-content div';
      config.hostSelector = '.tile-content';
      config.showNextDayToo = true;
      break;
    case 'view2':
      // 9/18 at 8:00am
      config.contextDateSelector = '.datetime-container';
      config.hostSelector = '.datetime-container';
      break;
  }

  //1 Mon, September 5

  //2 Thu, January 5, 2017
  //2 Tue, September 13, 1:30pm
  //2 Tue, September 20, 8am – 9am
  //2 Tue, September 20, 8:15pm – 9:15pm

  //3 Tue, May 9, 2017, 5:00pm – 5:01pm

  //4 Mon, August 29, 9am – Fri, September 2, 5pm

  //6 Sat, July 8, 2017, 9:51pm – Sun, July 9, 2017, 9:51pm

  textDate = $(config.contextDateSelector).text();
  let textParts = textDate.split(',');
  var numCommas = textParts.length - 1;

  // VERY SPECIFIC to English layout!

  switch (numCommas) {
    case 0:
      config.contextDateFormat = byFormat('', '', 'M/DD - h:mma');
      break;
    case 1:
      config.contextDateFormat = byFormat('', '', '-, MMMM DD');
      break;
    case 2:
      if (!isNaN(textParts[2])) {
        config.contextDateFormat = byFormat('', '', '-, MMMM DD, YYYY');
      } else {
        config.contextDateFormat = byFormat('', '', '-, MMMM DD, hh:mma -');
      }
      break;
    case 3:
      config.contextDateFormat = byFormat('', '', '-, MMMM DD, YYYY, -');
      break;
    case 4:
      config.contextDateFormat = byFormat('', '', '-, MMMM DD, -');
      break;
    case 6:
      config.contextDateFormat = byFormat('', '', '-, MMMM DD, YYYY, -');
      break;
    default:
      break;
  }


  //  config.logDetails = true;

  return config;
}


function parseEditInfo(config) {
  config.inEditPage = true;
  config.classes = ' editBDay';

  config.hostSelector = '.ep-edr-first-line';

  config.contextDateSelector = '.dr-date';
  config.contextTimeSelector = '.dr-time';

  config.contextDateFormat = byFormat('', '', 'YYYY-MM-DD hh:mma');

  config.logDetails = true;

  return config;
}


function addToAllDays(config) {
  let contextDateSpan = $(config.contextDateSelector);
  let contextDateText;

  if (config.inEditPage) {
    contextDateText = contextDateSpan.val() + ' ' + $(config.contextTimeSelector).val();
  } else {
    contextDateText = contextDateSpan.text();
  }

  var firstDate = moment(contextDateText, config.contextDateFormat);

  if (config.logDetails) {
    log('context text: ' + contextDateText);
    log('context date: ' + firstDate.format());
    log(config.daySelector);
  }

  $('.editBDay').remove();

  var toInsert = [];

  if (config.daySelector) {

    var lastDate = null;
    var startedMonth = false;

    $(config.daySelector)
      .each(function (i, el) {
        var originalDateSpan = $(el);

        var thisDate = moment(firstDate);
        thisDate.hour(12); // move to noon

        var monthOffset = 0;
        let inMonth = originalDateSpan.closest('td').hasClass('st-dtitle-nonmonth');
        let rawDayNumberText = originalDateSpan.text();
        var matches = rawDayNumberText.match(config.dayRegEx);

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
            thisDate.date(+matches[config.dayRegExItem.day]);
            if (lastDate) {
              if (thisDate.isBefore(lastDate)) {
                thisDate.month(thisDate.month() + 1);
              }
            }
            break;

          default:
            thisDate.month(+matches[config.dayRegExItem.month] - 1);
            thisDate.date(+matches[config.dayRegExItem.day]);
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
        },
          function (info) {
            originalDateSpan.addClass('gDay');
            var div;
            switch (config.layout) {
              case 'month':
              case 'week':
              case 'day':
              case 'custom':
              case 'list':
                div = $('<div/>',
                {
                  html: info.label,
                  'class': 'bDay' + info.classes + config.classes,
                  title: info.title
                });
                if (config.wrapIn) {
                  var wrap = $(config.wrapIn);
                  wrap.append(div);
                  div = wrap;
                }
                toInsert.push([originalDateSpan, div]);
                break;
              default:
                log('unexpected layout 2:');
                log(config);
            }
          });
      });
  } else {
    // just one date - the context date in the popup
    chrome.runtime.sendMessage({
      cmd: 'getInfo',
      targetDay: firstDate.toDate().getTime(),
      layout: config.layout
    },
      function (info) {
        contextDateSpan.addClass('gDay');
        var host = contextDateSpan.closest(config.hostSelector);

        if (config.showNextDayToo) {
          firstDate.add(1, 'd');
          chrome.runtime.sendMessage({
            cmd: 'getInfo',
            targetDay: firstDate.toDate().getTime(),
            layout: config.layout
          },
          function (info2) {
            var div = $('<div/>',
            {
              html: info.label + ' / ' + info2.label,
              'class': 'bDay' + info.classes + config.classes,
              title: info.title
            });
            toInsert.push([host, div]);

            //            log('to insert double');
            addThem(config, toInsert);
          });
          return;
        }

        var div = $('<div/>',
        {
          html: info.label,
          'class': 'bDay' + info.classes + config.classes,
          title: info.title
        });
        toInsert.push([host, div]);
      });
  }

  addThem(config, toInsert);
}

function addThem(config, toInsert) {
  chrome.runtime.sendMessage({
    cmd: 'dummy' // just to get in the queue after all the ones above
  },
    function () {
      //      console.log(`insert ${toInsert.length} elements`);
      for (var j = 0; j < toInsert.length; j++) {
        var item = toInsert[j];

        switch (config.layout) {
          case 'month':
          case 'list':
          case 'custom':
          case 'popup':
          case 'week':
          case 'eid':
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

function determineDateFormat() {
  // window['INITIAL_DATA'][2][0][0].substr(window['INITIAL_DATA'][2][0][0].indexOf('dtFldOrdr')+12,3)

  var master = document.getElementById('calmaster').innerHTML;
  var fieldDefinition = master.indexOf('dtFldOrdr');
  return master.substr(fieldDefinition + 12, 3);

  // 0 MDY 12/31/2016
  // 1 DMY 31/12/2016
  // 2 YMD 2016-12-31
}

function byFormat(mdy, dmy, ymd) {
  switch (googleFormat) {
    case 'MDY':
      return mdy;
    case 'DMY':
      return dmy;
    case 'YMD':
      return ymd;
  }
  return '';
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

var googleFormat;

chrome.runtime.sendMessage({
  cmd: 'getStorage',
  key: 'enableGCal',
  defaultValue: true
},
  function (info) {
    if (info.value) {
      googleFormat = determineDateFormat();
      log(googleFormat + ' ' + byFormat(0, 1, 2));

      ready('#mvEventContainer', calendarUpdated); // month
      ready('.wk-weektop', calendarUpdated); // week, custom
      ready('#lv_listview', calendarUpdated); // agenda
      ready('.neb-date', calendarUpdated); // popup
      //ready('.hin-dt', calendarUpdated); // popup
      ready('.datetime-container', calendarUpdated); // popup new event

      // ready('.ep-dpc', calendarUpdated); // edit page
      //
      // -- can't find an event to know when the input has been changed!
      //
      // $('body').on('change', '.dr-date', calendarUpdated); // edit page
      // $('body').on('change', '.dr-time', calendarUpdated); // edit page

      //$(document).on('change', ', .dr-time', function () {
      //  log('dr changed');
      //  fillCalendar($('.ep-dpc')[0]);
      //});

      console.log(`Dates from the Wondrous Calendar added via the Badí' Calendar extension (version ${chrome.runtime.getManifest().version}).`);
      calendarUpdated();
    }
  });


var pendingFormat = '';
$(document).on('change', '#dtFldOrdr', function () {
  pendingFormat = $(this).val();
  // tried to only apply when Save is clicked, but my handler is called too late, after the change is applied
  // need to set it when format is changed. Will be wrong if person clicks Cancel.
  googleFormat = pendingFormat;
  log(googleFormat + ' ' + byFormat(0, 1, 2));
});
//$(document).on('click', 'input[id=settings_save_btn]', function () {
//  if (pendingFormat) {
//    googleFormat = pendingFormat;
//    pendingFormat = '';
//  }
//  log(googleFormat + ' ' + byFormat(0, 1, 2));
//});
