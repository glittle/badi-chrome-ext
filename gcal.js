console.log('loaded gcal');

/*
 * This code is very specific to the normal English Google calendar layout and formats!
 * 
 *  
 * 
 */


function reload() {
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

      var di = getDateInfo(thisDate.toDate());

      console.log(thisDate.format('ll') + ' ' + di.bDay);

      span.addClass('gDay');
      switch (layout) {
        case 'month':
          let label = [];
          if (di.bDay === 1) {
            label.push(di.bMonthMeaning);
          } else {
            label.push(di.bMonthMeaning);
//            label.push(di.bMonthMeaning.substring(0, 3) + '.');
          }
          label.push(di.bDay);

          $('<div/>',
          {
            html: label.join(' '),
            'class': 'bDay' + (di.bDay === 1 ? ' firstBDay' : ''),
            title: thisDate.format()
          }).insertAfter(span);
          break;
      }
    });
}



$(window).bind('hashchange', function () {
  reload();
});

setTimeout(function () {
  // need a better way to trigger after calendar is fully displayed!
//  reload();
}, 100);

var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
var list = document.querySelector('.st-dtitle');

var observer = new MutationObserver(function (mutations) {
  mutations.forEach(function (mutation) {
    if (mutation.type === 'childList') {
      var list_values = [].slice.call(list.children)
          .map(function (node) { return node.innerHTML; })
          .filter(function (s) {
            if (s === '<br />') {
              return false;
            }
            else {
              return true;
            }
          });
      console.log(list_values);
    }
  });
});

observer.observe(list, {
  attributes: true,
  childList: true,
  characterData: true
});