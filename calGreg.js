/* global getStorage */
/* global getMessage */
/* global di */
/* global chrome */
/* global $ */
var CalGreg = function (di, host) {
  var _yearShown = null;
  var _specialDays = {};
  var _scrollToMonth = -1;
  var _calendarDiv = $('#pageCalGreg .calendar');

  var hourFactor = 3.2;

  function preparePage() {
    attachHandlers();
  }

  function attachHandlers() {
    _calendarDiv.on('click', '.morn, .aft, .outside', function (ev) {
      var cell = $(this).closest('.outside, .gd');
      var id = cell.attr('id').substring(3).split('_');
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

    $(document).on('click', 'body[data-pageid=pageCalGreg] .btnChangeMonth', changeMonth);
  }

  function changeMonth(ev) {
    var delta = +$(ev.target).closest('button').data('delta') || 0;

    // rough... if 29,30,31 may skip two months...
    var gDate = new Date(_di.currentTime);
    gDate.setMonth(gDate.getMonth() + delta);

    setFocusTime(gDate);
    refreshDateInfo();

    showInfo(_di);
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

    if (newDi.frag2Year !== _yearShown) {
      buildCalendar();
    }
    highlightTargetDay(newDi);
  }

  function highlightTargetDay(di) {
    _calendarDiv.find('.morn.selected, .aft.selected, .eve.selected, .gd.selected').removeClass('selected');
    _calendarDiv.find('.morn.today, .aft.today, .eve.today, .gd.today').removeClass('today');
    var sel = ('.bMonth{bMonth}.bDay{bDay}, #gd{frag2Month}_{frag2Day}').filledWith(di);
    _calendarDiv.find(sel).addClass('selected');

    sel = ('.bMonth{bMonth}.bDay{bDay}, #gd{frag2Month}_{frag2Day}').filledWith(getDateInfo(new Date()));
    _calendarDiv.find(sel).addClass('today');

    if (_scrollToMonth != di.frag2Month) {
      scrollToMonth(di.frag2Month);
    }
  }

  function buildCalendar() {

    var gYear = _di.frag2Year;
    _yearShown = gYear;

    var gMonth = _di.frag2Month;
    //    console.log(_yearShown + ' ' + gYear + ' ' + gMonth);

    _calendarDiv.html('');

    for (var m = 0; m < 12; m++) {
      buildMonth(gYear, m);
    }

    scrollToMonth(gMonth);
  }

  function scrollToMonth(gMonth) {
    _scrollToMonth = gMonth;
    //log(gMonth);
    var month = _calendarDiv.find('#m{0}'.filledWith(gMonth));

    _calendarDiv.find('.month').hide();
    month.show();
    return;
    //
    //    var monthTop = month.position().top - 50; // move a bit higher
    //    var top;
    //    if (_inTab) {
    //      top = monthTop + _calendarDiv.position().top;
    //      $("html, body").stop().animate({
    //        scrollTop: top + "px"
    //      }, {
    //        always: function () {
    //          $("html, body").stop().scrollTop(top);
    //        }
    //      });
    //    } else {
    //      top = _calendarDiv.scrollTop() + monthTop;
    //      _calendarDiv.stop().animate({
    //        scrollTop: top + "px"
    //      }, {
    //        always: function () {
    //          _calendarDiv.stop().scrollTop(top);
    //        }
    //      });
    //    }
  }

  function buildMonth(gYear, gMonth) {
    var gDay = 1;
    var focusMonth = gMonth;
    var focusDate = new Date(gYear, gMonth, gDay);

    // move to saturday
    var gDate = new Date(focusDate.getTime());
    var dow = gDate.getDay();
    if (dow != 6) {
      gDate.setDate(gDate.getDate() - 1 - dow);
      gYear = gDate.getFullYear();
      gMonth = gDate.getMonth();
      gDay = gDate.getDate();
    }

    var weeks = [];
    var week = ['<tr>'];
    var weekNum = 0;
    var inFinalWeek = false;
    var bMonthsInMonth = [];
    var activeBadiYear = 0;
    var bYear = 0;

    while (!isNaN(gDate)) {
      var desiredDay = gDay;
      gDate = new Date(gYear, gMonth, gDay);
      gYear = gDate.getFullYear();
      gMonth = gDate.getMonth();
      gDay = gDate.getDate();
      dow = gDate.getDay();

      //log(gDate.toDateString() + ' ' + gDay + ' ' + dow);
      if (gDate.getDate() != desiredDay && gMonth != focusMonth) {
        inFinalWeek = true;
      }
      if (dow == 6) {
        if (week.length > 1) {
          week.push('</tr>');
          weeks.push(week.join(''));
          if (inFinalWeek) {
            week = [];
            break;
          }
        }
        week = ['<tr>'];

        weekNum++;
        if (weekNum > 8) {
          break;  // temp failsafe for dev
        }
      }


      var thisDayInfo = getDateInfo(gDate);
      var tomorrowDayInfo = getDateInfo(new Date(gDate.getFullYear(), gDate.getMonth(), 1 + gDate.getDate()));

      var sunrise = thisDayInfo.frag2SunTimes.sunrise;
      var sunriseHr = (sunrise.getHours() + sunrise.getMinutes() / 60);

      var sunset = thisDayInfo.frag2SunTimes.sunset;
      var sunsetHr = (sunset.getHours() + sunset.getMinutes() / 60);
      var outside = gMonth != focusMonth;
      var bMonthToShow;

      var fnRecordMonth = function (di) {
        // don't list ayyam-i-ha
        if (di.bMonth === 0) {
          return;
        }
        bMonthToShow = di.bMonthNamePri;
        bYear = di.bYear;
        if (activeBadiYear && activeBadiYear != bYear) {
          bMonthsInMonth[bMonthsInMonth.length - 1] += ' ' + activeBadiYear;
        }
        bMonthsInMonth.push(bMonthToShow);
        activeBadiYear = bYear;
      }

      if (!outside) {
        // record badi month
        if (tomorrowDayInfo.bDay === 1) {
          fnRecordMonth(tomorrowDayInfo);
        } else if (gDay === 1) {
          fnRecordMonth(thisDayInfo);
        }
      }

      var total = hourFactor * 24;

      //      var mornSize = +(sunriseHr * hourFactor).toFixed(3);
      //      var eveSize = Math.max(15, +((24 - sunsetHr) * hourFactor).toFixed(3));
      var mornSize = .28 * total;
      var eveSize = .28 * total;
      var aftSize = total - eveSize - mornSize; //  +((sunsetHr - sunriseHr) * hourFactor).toFixed(3);

      $.extend(thisDayInfo, {
        classesInner: [
        ],
        classesOuter: [
          'gd'
        ],
        cellId: 'gd' + gMonth + '_' + gDay,
        mornSize: mornSize,
        aftSize: aftSize,
        eveSize: eveSize,
        tomorrowMonth: tomorrowDayInfo.bMonth,
        tomorrowDay: tomorrowDayInfo.bDay,
        monthName: tomorrowDayInfo.bDay == 1 ? (tomorrowDayInfo.bMonthNamePri + '<span>{0}</span>'.filledWith(tomorrowDayInfo.bMonth)) : (gDay === 1 ? thisDayInfo.bMonthNamePri : ''),
        isFirst: tomorrowDayInfo.bDay == 1 ? 'first' : (gDay === 1 ? 'continuing' : '')
      });

      if (thisDayInfo.bMonth == 19) {
        $.extend(thisDayInfo, {
          sunriseDiv: '<span class=sunrise>{0}</span>'.filledWith(showTime(sunrise))
        });
      }

      // add holy days
      if (!_specialDays[thisDayInfo.bYear]) {
        _specialDays[thisDayInfo.bYear] = holyDays.prepareDateInfos(thisDayInfo.bYear);
      }
      if (!_specialDays[tomorrowDayInfo.bYear]) {
        _specialDays[tomorrowDayInfo.bYear] = holyDays.prepareDateInfos(tomorrowDayInfo.bYear);
      }

      var holyDayInfo = $.grep(_specialDays[thisDayInfo.bYear], function (el, i) {
        return !outside && el.Type.substring(0, 1) == 'H' && el.BDateCode == thisDayInfo.bDateCode;
      });
      if (holyDayInfo.length) {
        thisDayInfo.holyDayAftStar = '<span class="hd{0}"></span>'.filledWith(holyDayInfo[0].Type);
        thisDayInfo.holyDayAftName = '<span class="hdName">{0}</span>'.filledWith(getMessage(holyDayInfo[0].NameEn));
        thisDayInfo.classesOuter.push('hdDay' + holyDayInfo[0].Type);
      }

      holyDayInfo = $.grep(_specialDays[tomorrowDayInfo.bYear], function (el, i) {
        return !outside && el.Type.substring(0, 1) == 'H' && el.BDateCode == tomorrowDayInfo.bDateCode;
      });
      if (holyDayInfo.length) {
        thisDayInfo.holyDayEveStar = '<span class="hd{0}"></span>'.filledWith(holyDayInfo[0].Type);
        thisDayInfo.classesOuter.push('hdEve' + holyDayInfo[0].Type);
      }

      thisDayInfo.classesInner = thisDayInfo.classesInner.join(' ');
      thisDayInfo.classesOuter = thisDayInfo.classesOuter.join(' ');
      thisDayInfo.zIndex = 35 - gDay;

      if (!outside) {
        week.push([
          '<div class="{classesOuter}" id=i{cellId}><div class="dayCell {classesInner}">', '<div class="morn bMonth{bMonth} bDay{bDay}" style="height:{mornSize}px">'
          + '<span class=bDay>{^holyDayAftStar}{bDay}</span>'
          + '<span class=gDay>{frag2Day}</span></div>'
          + '<div class="aft bMonth{bMonth} bDay{bDay}" style="height:{aftSize}px">'
          + '{^sunriseDiv}'
          + '{^holyDayAftName}'
          + '<div>'
          + '<span class=sunset>{endingSunsetDesc}</span>'
          + '</div>'
          + '</div><div class="eve bMonth{tomorrowMonth} bDay{tomorrowDay}" style="height:{eveSize}px; z-index:{zIndex}">'
          + '<span class="monthName {isFirst}">{^monthName}</span>'
          + '<span class="bDay">{^holyDayEveStar}{tomorrowDay}</span>'
          + '</div>', '</div></div>'
        ].join('').filledWith(thisDayInfo));
      } else {
        thisDayInfo.outsideHeight = total.toFixed(3);
        week.push(['<div class="outside" id=o{cellId}><div style="height:{outsideHeight}px">'
          , '<div class=morn>'
             + '<span class=gDay>{frag2Day}</span></div>'
          , '<div class=aft></div>'
          , '<div class=eve></div>'
          , '</div></div>'].join('').filledWith(thisDayInfo))
      }

      gDay++;
    }

    if (week.length) {
      //week.push('</tr>');
      weeks.push(week.join(''));
    }

    var dayHeaders = [];
    for (var d = 0; d < 7; d++) {
      dayHeaders.push({
        gDayName: gWeekdayShort[d == 0 ? 6 : d - 1],
        mDayName: bWeekdayNameSec[d + 1],//<div>{mDayName}</div>
        arDayName: bWeekdayNamePri[d + 1],
      });
    }

    var monthTitleInfo = {
      gMonthName: gMonthLong[focusMonth],
      gYear: focusDate.getFullYear(),
      bMonths: bMonthsInMonth.join(', ') + ' ' + activeBadiYear
    };

    // tried to use real caption, but gets messed on on some print pages
    var html = [
      '<div class=month id=m{0}>'.filledWith(focusMonth),
      '<div class=caption>{gMonthName} {gYear} <span>({bMonths})</span></div>'.filledWith(monthTitleInfo),
      '<div class=placeName>{0}</div>'.filledWith(localStorage.locationName),
      '{^0}'.filledWith('<div class=colName><div>{gDayName}</div><div class=weekDay>{arDayName}</div></div>'.filledWithEach(dayHeaders)),
      '{^0}'.filledWith(weeks.join('\n')),
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
