/* global getStorage */
/* global getMessage */
/* global di */
/* global chrome */
/* global $ */
var Cal2 = function () {
  var _yearShown = null;
  var _specialDays = {};
  var _scrollToMonth = -1;
  var _calendarDiv = $('#pageCal2 .calendar');


  function preparePage() {
    attachHandlers();
  }

  function attachHandlers() {
    return;
    //TODO

    _calendarDiv.on('click', '.morn, .aft, .outside', function (ev) {
      var cell = $(this).closest('.outside, .gd');
      var id = cell.attr('id').substring(7).split('_');
      var month = +id[0];
      var day = +id[1];

      var target = new Date(_yearShown, month, day);
      setFocusTime(target);
      refreshDateInfo();
      showInfo(_di);
    });
    _calendarDiv.on('click', '.eve', function (ev) {
      var cell = $(this).closest('.gd');
      var id = cell.attr('id').substring(3).split('_');
      var month = +id[0];
      var day = +id[1];

      var target = new Date(_yearShown, month, day);
      target.setDate(target.getDate() + 1);
      setFocusTime(target);
      refreshDateInfo();
      showInfo(_di);
    });
  }

  function showCalendar(newDi) {
    _di = newDi;

    //color swab
    //for (var i = 1; i <= 19; i++) {
    //  $('.calendar2').append('<div class=bMonth{0}>Test {0}</div>'.filledWith(i));
    //  if (i == 18) {
    //    $('.calendar2').append('<div class=bMonth{0}>Test {0}</div>'.filledWith(0));
    //  }
    //}

    if (newDi.bYear !== _yearShown) {
      buildCalendar();
    }
    highlightTargetDay(newDi);
  }

  function highlightTargetDay(di) {
    _calendarDiv.find('.dayCell.selected').removeClass('selected');

    var sel = ('#cal2_igd{bMonth}_{bDay}').filledWith(di);

    //    _calendarDiv.find('.morn.selected, .aft.selected, .eve.selected, .gd.selected').removeClass('selected');
    //    _calendarDiv.find('.morn.today, .aft.today, .eve.today, .gd.today').removeClass('today');
    //    var sel = ('.bMonth{bMonth}.bDay{bDay}, #gd{frag2Month}_{frag2Day}').filledWith(di);
    _calendarDiv.find(sel).addClass('selected');
    //
    //    sel = ('.bMonth{bMonth}.bDay{bDay}, #gd{frag2Month}_{frag2Day}').filledWith(getDateInfo(new Date()));
    //    _calendarDiv.find(sel).addClass('today');

    //    if (_scrollToMonth !== di.bMonth) {
    scrollToMonth(di.bMonth);
    //    }
  }

  function buildCalendar() {
    var bYear = _di.bYear;
    _yearShown = bYear;

    var bMonth = _di.bMonth;

    _calendarDiv.html('');

    for (var m = 1; m <= 19; m++) {
      if (m === 19) {
        // add ayyam-i-ha first
        buildMonth(bYear, 0);
      }
      buildMonth(bYear, m);
    }

    scrollToMonth(bMonth);
  }

  function scrollToMonth(bMonth) {
    _scrollToMonth = bMonth;
    var month = _calendarDiv.find('#cal2_m{0}'.filledWith(bMonth));
    if (month.length === 0) {
      log("no month " + bMonth);
      return;
    }

    var monthTop = month.position().top;
    log('SCROLL ' + bMonth + ' ' + monthTop);
    if (_inTab) {
      $('body').scrollTop(monthTop + _calendarDiv.position().top);
    } else {
      _calendarDiv.scrollTop(_calendarDiv.scrollTop() + monthTop);
    }
  }

  function buildMonth(bYear, bMonth) {
    var focusMonth = bMonth;
    //    var focusDate = holyDays.getGDate(bYear, bMonth, 1);
    var newRow = '<div class="dayRow dayGroup{0}">';
    var dayCells = [newRow.filledWith(bMonth === 0 ? 0 : 1)];
    var day1Di;
    var gMonths = [];
    var lastGMonth = '';
    var gYear = 0;

    for (var bDay = 1; bDay <= 19; bDay++) {
      var bDateCode = bMonth + '.' + bDay;
      var gDate;
      try {
        gDate = holyDays.getGDate(bYear, bMonth, bDay, false);
        gDate.setHours(12, 0, 0, 0); // set to noon to avoid DST issues
      }
      catch (e) {
        if (bMonth === 0 && e === 'invalid Badi date') {
          break;
        }
        else {
          throw e;
        }
      }
      if (bMonth === 0) {
        log(gDate);
      }
      var dayGroup;
      var di = getDateInfo(gDate);
      if (bDay === 1) {
        day1Di = di;
        dayGroup = bMonth === 0 ? 0 : 1;
      }

      var gMonth = di.frag2MonthLong;
      if (lastGMonth !== gMonth) {
        gMonths.push(gMonth);
        lastGMonth = gMonth;
        gYear = di.frag2Year; // remember last year used
      }

      if (bMonth === 0) {
      } else {
        switch (bDay) {
          case 4:
          case 8:
          case 14:
            dayCells.push('</div>');
            dayGroup++;
            dayCells.push(newRow.filledWith(dayGroup));
            break;
        }
      }

      var startSunset = di.frag1SunTimes.sunset;
      var startSunsetHr = (startSunset.getHours() + startSunset.getMinutes() / 60);

      //      var endingSunsetHr = (endingSunset.getHours() + endingSunset.getMinutes() / 60);

      var sunrise = di.frag2SunTimes.sunrise;
      var sunriseHr = (sunrise.getHours() + sunrise.getMinutes() / 60);

      var hourFactor = 88 / 24;
      var total = hourFactor * 24;

      var eveSize = Math.max(14, Math.max(0, +((24 - startSunsetHr) * hourFactor).toFixed(3)));
      var mornSize = +(sunriseHr * hourFactor).toFixed(3);
      var aftSize = total - eveSize - mornSize; //  +((sunsetHr - sunriseHr) * hourFactor).toFixed(3);

      $.extend(di, {
        classesOuter: [
          'gd'
        ],
        cellId: 'gd' + bMonth + '_' + bDay,
        mornSize: mornSize,
        aftSize: aftSize,
        eveSize: eveSize,
        //        monthName: frag1.bDay == 1 ? frag1.bMonthNamePri : (bDay == 1 ? frag2.bMonthNamePri : ''),
        //        isFirst: frag1.bDay == 1 ? 'first' : ''
      });

      if (di.bMonth === 19) {
        $.extend(di, {
          sunriseDesc: '<span class=sunrise>{0}</span>'.filledWith(showTime(sunrise)),
          fastSunsetDesc: '<span class=sunsetEnd>{0}</span>'.filledWith(showTime(di.frag2SunTimes.sunset))
        });
      }

      // add holy days
      if (!_specialDays[bYear]) {
        _specialDays[bYear] = holyDays.prepareDateInfos(bYear);
      }

      var holyDayInfo = $.grep(_specialDays[bYear], function (el, i) {
        return el.Type.substring(0, 1) === 'H' && el.BDateCode === bDateCode;
      });

      if (holyDayInfo.length) {
        di.holyDayAftStar = '<span class="hd{0}"></span>'.filledWith(holyDayInfo[0].Type);
        di.holyDayAftName = '<div class="hdName">{0}</div>'.filledWith(getMessage(holyDayInfo[0].NameEn));
        di.classesOuter.push('hdDay' + holyDayInfo[0].Type);
      }

      di.classesOuter = di.classesOuter.join(' ');

      dayCells.push([
        '<div class="bDay{bDay} dayCell {classesOuter}" id=cal2_i{cellId}>',
          '<div>',
            '<span class=sunset>{startingSunsetDesc}</span>',
            '<div class="top" style="height:{eveSize}px">{bDay} {^holyDayAftStar}</div>',
            '<div class="night" style="height:{mornSize}px"><span>{frag2WeekdayShort}, {frag2MonthShort} {frag2Day}</span></div>',
            '<div class="day" style="height:{aftSize}px">',
              '{^sunriseDesc}',
              '{^holyDayAftName}',
              '{^fastSunsetDesc}',
            '</div>',
          '</div>',
        '</div>'
      ].join('').filledWith(di));
    }

    dayCells.push('</div>');

    var mGroup = 1;
    if (bMonth >= 4 && bMonth <= 7) {
      mGroup = 2;
    } else if (bMonth >= 8 && bMonth <= 13) {
      mGroup = 3;
    } else if (bMonth >= 14 && bMonth <= 19) {
      mGroup = 4;
    } else if (bMonth === 0) {
      mGroup = 0;
    }

    var monthTitleInfo = {
      bMonthName: day1Di.bMonthNamePri,
      bYear: bYear
    };

    var bMonthInfo = (bMonth === 0 ? '{bMonthNameSec}' : '{bMonth},  {bMonthNameSec} - {element}').filledWith(day1Di);
    var gMonthInfo = gMonths.join(', ') + ' ' + gYear;

    var html = [
      '<div class="month mGroup{1}" id=cal2_m{0}>'.filledWith(focusMonth, mGroup),
      '<div class=caption>',
        '<div class=monthNames>{bMonthName} {bYear}</div>'.filledWith(monthTitleInfo),
        '<div class=monthInfo>{0}</div>'.filledWith(bMonthInfo),
        '<div class=gMonths>{0}</div>'.filledWith(gMonthInfo),
        '<div class=placeName>{0}</div>'.filledWith(bMonth === 0 ? '' : localStorage.locationName),
      '</div>',
      '<div class=monthDays>',
//      '{^0}'.filledWith('<div class=colName><div>{bDayName}</div><div class=dayRowDay>{arDayName}</div></div>'.filledWithEach(dayHeaders)),
      '{^0}'.filledWith(dayCells.join('\n')),
      '</div>',
      '</div>'
    ];

    _calendarDiv.append(html.join('\n'));

  }

  preparePage();

  return {
    showCalendar: showCalendar,
    resetPageForLanguageChange: function () {
      _yearShown = -1;
    },
    di: _di,
    scrollToMonth: scrollToMonth
  };
}
