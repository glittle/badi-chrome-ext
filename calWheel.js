/* global getStorage */
/* global getMessage */
/* global di */
/* global chrome */
/* global $ */

var CalWheel = function () {
  var _yearShown = null;
  var _lastAngle = null;
  var _rotateTimeout = null;
  var _rotating = null;

  // this page replicates a common format
  // don't know where the original is from
  // not rotating text of Month names as done in the original


  var angle1 = 18.94736842105263;

  function showCalendar(newDi) {
    //var x = '43.5px';
    //var y = '335px';

    var showPointer = $('#cbShowPointer').prop('checked');
    $('#pointerToday').toggle(showPointer);

    var sameYear = newDi.bYear === _yearShown;

    if (sameYear && !showPointer) {
      return;
    }

    di = newDi;

    var wheel = $('#wheel');

    if (!sameYear) {
      $('#wheelYear').html('{bYear} {bEraAbbrev}'.filledWith(di));

      wheel.find('.slice').remove();

      var template = $('#templateSlice')[0].outerHTML;

      for (var i = 0; i < 19; i++) {
        var slice = $(template);
        var bm = i + 1;
        var angle = i * angle1;

        var inner = slice.find('.innerSlice');
        slice.removeAttr('id');
        slice.css({
          transform: 'rotate(' + angle + 'deg)'
          //transformOrigin: x + ' ' + y
        });

        inner.attr('id', 'slice' + bm);

        slice.find('.monthNum').text(bm);
        slice.find('.monthNameAr').text(bMonthNameAr[bm]);
        slice.find('.monthName').text(bMonthMeaning[bm]);

        var gd = holyDays.getGDate(di.bYear, bm, 1, false);

        slice.find('.firstDayG').text(gMonthShort[gd.getMonth()] + ' ' + gd.getDate());
        slice.find('.firstDayWk').text(gWeekdayShort[gd.getDay()]);
        slice.find('.firstDayYr').text(gd.getFullYear());

        wheel.append(slice);
      }
    }

    var offsetAngle = 0;
    if (showPointer) {
      $('#wheelDay').html('{bDay} {bMonthNameAr}'.filledWith(di));

      var dayOfYear = (di.bMonth - 1) * 19 + di.bDay - 1;
      if (di.bMonth === 0) {
        dayOfYear = 18 * 19;
      } else if (di.bMonth === 19) {
        // dayOfYear -= 4;// don't need to be precise here
      }
      var pctOfYear = dayOfYear / 361;

      //log(pctOfYear);

      var magicAdjustment = 0.434;

      offsetAngle = 90 - 360 * pctOfYear + magicAdjustment * angle1;

      var s = $('style#specialStyle');
      if (s.length == 0) {
        var style = document.createElement('style');
        style.id = 'specialStyle';
        $('head').append(style);
        s = $('style#specialStyle');
      }

      if (_lastAngle === null) {
        _lastAngle = offsetAngle;
      }

      var keyframes = '@-webkit-keyframes spinner {from {-webkit-transform:rotateZ(' + _lastAngle + 'deg)} '
        + ' to {-webkit-transform:rotateZ(' + offsetAngle + 'deg)}}';

      wheel.css({ transform: 'rotate({0}deg)'.filledWith(_lastAngle) })
      wheel.removeClass('rotating');

      s.html(keyframes);

      clearTimeout(_rotateTimeout);
      _rotateTimeout = setTimeout(function () {
        wheel.addClass('rotating');
        _lastAngle = offsetAngle;
      }, 0);

      //wheel.css({ transform: 'rotate({0}deg)'.filledWith(offsetAngle) })

    } else {
      wheel.css({ transform: 'rotate(0)' })
    }
  }

  function toHex(d) {
    return ("0" + (Number(d).toString(16))).slice(-2).toUpperCase();
  }

  function gotoYear(year) {
    year = year || 173;
    var gDate = holyDays.getGDate(+year, 1, 1, true);
    setFocusTime(gDate);
    refreshDateInfo();
    showInfo(_di);
  }

  function rotateYear(year, speed) {
    year = year || 173;
    speed = speed || 100;
    var gDate = holyDays.getGDate(+year, 1, 1, true);

    $('#cbShowPointer').prop('checked', true);
    $('#askShowPointer').hide();

    var show = function () {
      var di = getDateInfo(gDate);
      if (di.bYear != year) {
        return;
      }

      showCalendar(di);
      gDate.setDate(gDate.getDate() + 1);
      _rotating = setTimeout(show, speed);
    }

    show();
  }


  return {
    showCalendar: showCalendar,
    gotoYear: gotoYear,
    rotateYear: rotateYear,
    stopRotation: function () {
      clearTimeout(_rotating);
    }
  };
}


//var pageCalWheel = Cal2();

//if (top == window) {
//  $(function () {
//    refreshDateInfo();
//    pageCalWheel.showCalendar();
//  });
//}