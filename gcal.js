///<reference path='gcalsetup.js'/>
///<reference path='shared.js'/>


/*
 * This code is very specific to the normal English Google calendar layout and formats!
 * 
 *  
 * 
 */

function fillCalendar() {
  var hash = location.hash;
  var parts = hash.split(/%7C|,|-/g);
  var layout = parts.length > 1 ? parts[1] : 'month';
  var selector = '';
  var dateTopFormat = '';
  var dayRegEx = '';

  switch (layout) {
    case 'week':
      selector = '.wk-dayname span';
      dateTopFormat = 'MMM DD - -, YYYY'; //Sep 4 – 10, 2016
      dayRegEx = /.* (\d+)\/(\d+)/; // Tue 9/13
      break;

    case 'month':
      selector = '.st-dtitle span';
      dateTopFormat = 'MMMM YYYY';
      dayRegEx = /(\w+ )?(\d+)/; // Sep 1  or  5
      break;

    case 'day':
      selector = '.wk-dayname span';
      dateTopFormat = 'dddd, MMM DD, YYYY'; //Tuesday, Sep 6, 2016
      dayRegEx = /.* (\d+)\/(\d+)/;// Tuesday 9/13
      break;

    case 'custom': // 5 day
      selector = '.wk-dayname span';
      dateTopFormat = 'MMM DD - -, YYYY'; //Sep 4 – 10, 2016
      dayRegEx = /.* (\d+)\/(\d+)/;// Tue 9/13
      break;

    case 'list': // agenda
      selector = '.lv-datecell span';
      dateTopFormat = 'dddd, MMM DD, YYYY'; //Tuesday, Sep 6, 2016
      dayRegEx = /(\w+)\s(\d+)/;// Tue Sep 14
      break;

    default:
      console.log('unexpected layout: ' + layout);
      return;
  }

  addToAllDays(selector, layout, dateTopFormat, dayRegEx);
}

function addToAllDays(dayLabelSelector, layout, dateTopFormat, dayRegEx) {
  //  console.log($('.calHeaderSpace').eq(1).text());

  let dateTopText = $('.date-top').text();
  var firstDate = moment(dateTopText, dateTopFormat);
  //  var firstDate = moment.utc(dateTopText, dateTopFormat);

  var lastDate = null;
  var startedMonth = false;

  var toInsert = [];

  $(dayLabelSelector)
    .each(function (i, el) {
      var span = $(el);

      var thisDate = moment(firstDate);
      thisDate.hour(12); // move to noon

      var monthOffset = 0;
      let inMonth = span.closest('td').hasClass('st-dtitle-nonmonth');
      let rawDateText = span.text();
      var matches = rawDateText.match(dayRegEx);

      switch (layout) {
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
        layout: layout
      }, function (info) {
        span.addClass('gDay');
        var div;
        switch (layout) {
          case 'month':
          case 'week':
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
//      console.log(`insert ${toInsert.length + 1} elements`);
      for (var j = 0; j < toInsert.length; j++) {
        var item = toInsert[j];

        switch (layout) {
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
function calendarUpdated(element) {
  refreshCount++;

  // seems to redraw twice on first load
  var threshold = 1;

  //  if (element.id === 'mvEventContainer') {
  //    threshold = 1; 
  //  }

  if (refreshCount > threshold) {
    fillCalendar();
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


ready('#mvEventContainer', calendarUpdated);
ready('.wk-weektop', calendarUpdated);
ready('#lv_listview', calendarUpdated);