/* global TweenMax */
/* global getStorage */
/* global getMessage */
/* global di */
/* global chrome */
/* global $ */
var Cal3 = function() {
    var _yearShown = null;
    var _specialDays = {};
    var _scrollToMonth = -1;
    var _page = $('#pageCal3');
    var _calendarDiv = _page.find('.calendar');
    var _initialScrollDone = false;
    var _timeoutTime = null;
    var _currentZoom = null;

    function preparePage() {
        attachHandlers();
        zoomTo('M');
    }

    function attachHandlers() {
        _calendarDiv.on('click', '.dayCell', function(ev) {
            var cell = $(ev.target).closest('.dayCell');
            var gDate = cell.data('gdate');

            var target = new Date(gDate);
            setFocusTime(target);
            refreshDateInfo();
            showInfo(_di);
        });
        _page.on('change', '#cbShowTimes', function() {
            _calendarDiv.toggleClass('showTimes', !!_page.find('#cbShowTimes').prop('checked'));
            // _calendarDiv.find('#cbShowTimes').blur();
        });
        _page.on('change', '#cbCal3Darker', function() {
            _page.toggleClass('darkerColors', !!_page.find('#cbCal3Darker').prop('checked'));
            // _calendarDiv.find('#cbCal3Darker').blur();
        });
        _page.on('change', '#cbCal3Print', function() {
            var show = !!_page.find('#cbCal3Print').prop('checked');
            _page.toggleClass('forPrint', show);
            if (show) {
                window.onafterprint = function() {
                    _page.find('#cbCal3Print').prop('checked', false);
                    _page.toggleClass('forPrint', false);
                    window.onafterprint = null;
                };
            }
        });

        // presets
        // _page.addClass('forPrint');
        // _page.find('#cbCal3Print').prop('checked', true)

        _page.find('#cbShowTimes').prop('checked', true);
        _calendarDiv.addClass('showTimes');

        _page.find('#btnCal3Y').click(function() {
            zoomTo('Y');
        });
        _page.find('#btnCal3M').click(function() {
            zoomTo('M');
        });
        $(document).on('click', 'body[data-pageid=pageCal3] .btnChangeMonth', changeMonth);
    }

    function changeMonth(ev) {
        var delta = +$(ev.target).closest('button').data('delta') || 0;
        var currentYear = _di.bYear;
        if (currentYear < 1) return;
        if (currentYear > 1000) return;

        var currentMonth = _di.bMonth;
        if (currentMonth === 0) {
            // ayyam-i-ha
            if (delta < 0) {
                // moving back in time
                currentMonth = 19;
            } else {
                currentMonth = 18;
            }
        }

        currentMonth += delta;

        if (currentMonth < 1) {
            currentMonth = 19;
            currentYear--;
        } else if (currentMonth > 19) {
            currentMonth = 1;
            currentYear++;
        }

        //    try {
        var gDate = holyDays.getGDate(currentYear, currentMonth, _di.bDay, true);

        setFocusTime(gDate);
        refreshDateInfo();

        showInfo(_di);
        //    } catch (error) {
        //      console.log('Error: ' + error);
        //    }


    }

    function zoomTo(level) {
        if (_currentZoom === level) {
            return;
        }

        _page.removeClass('zoomM zoomY zoomV zoomK').addClass('zoom' + level);

        var leftOffset = 11;
        var topOffset = 14;

        var monthShells = $('.monthShell');

        switch (level) {
            case 'Y':
                // replace month detail with month shell
                //        var currentMonth = _di.bMonth;
                //        monthShell.css({
                //          left: (leftOffset + getCol(currentMonth) * 123) + 'px',
                //          top: (topOffset + getRow(currentMonth) * 99) + 'px',
                //          width: '122px',
                //          height: '98px'
                //        });

                // make shell small
                monthShells.addClass('sizeY');

                monthShells.each(function(i, el) {
                    var monthNum = +el.id.replace('monthCell', '');
                    $(el).css({
                        left: (leftOffset + getCol(monthNum) * 123) + 'px',
                        top: (topOffset + getRow(monthNum) * 99) + 'px',
                        opacity: 1
                    });
                });

                // show other months around it

                break;

            case 'M':
                var currentMonth = _di.bMonth;
                monthShells.hide();
                $('#monthCell' + currentMonth).show();

                // zoom shell to full size
                monthShells.removeClass('sizeY');

                monthShells.css({
                    left: leftOffset + 'px',
                    top: topOffset + 'px',
                    opacity: 0
                });

                monthShells.show();

                // show month detail

                break;

        }

        _currentZoom = level;
    }

    function getCol(month) {
        console.log(month);
        switch (month) {
            case 1:
            case 4:
            case 8:
            case 14:
                return 0;
            case 2:
            case 5:
            case 9:
            case 15:
                return 1;
            case 3:
            case 6:
            case 10:
            case 16:
                return 2;
            case 7:
            case 11:
            case 17:
                return 3;
            case 12:
            case 18:
                return 4;
            case 13:
            case 19:
                return 5;
        }
        return null;
    }

    function getRow(month) {
        if (month <= 3) return 0;
        if (month <= 7) return 1;
        if (month <= 13) return 2;
        return 3;
    }

    //  function zoomTo(level) {
    //    // default is month
    //    // also have: zoomY, zoomV, zoomK
    //    _calendarDiv.removeClass('zoomM zoomY zoomV zoomK').addClass('zoom' + level);
    //    var wholeYear = _calendarDiv;
    //
    //    switch (level) {
    //      case 'Y':
    //        var otherMonths = _calendarDiv.find('.month:not(:visible)');
    //        otherMonths.css('opacity', 0);
    //        otherMonths.show();
    //        TweenMax.to(wholeYear, .2,
    //        {
    //          scaleX: 0.165,
    //          scaleY: 0.165,
    //          width: 440,
    //          height: 360
    //        });
    //        TweenMax.to(otherMonths, .2, { opacity: 1 });
    //        break;
    //      case 'M':
    //        highlightTargetDay(_di);
    //        TweenMax.to(wholeYear, 2,
    //        {
    //          scale: 1,
    //          width: 773,
    //          height: 427
    //        });
    //        break;
    //    }
    //  }

    function showCalendar(newDi) {
        _di = newDi;

        var newYear = newDi.bYear;
        if (newYear !== _yearShown) {
            buildCalendar();
        }
        highlightTargetDay(newDi);
    }

    function highlightTargetDay(di) {
        _calendarDiv.find('.selected').removeClass('selected');

        var sel = ('#cal3_igd{bMonth}_{bDay}').filledWith(di);

        _calendarDiv.find(sel).addClass('selected');

        setTimeout(function() {
            scrollToMonth(di.bMonth);
        }, 0);

    }

    function buildCalendar() {
        var bYear = _di.bYear;
        _yearShown = bYear;
        _scrollToMonth = -1;

        var bMonth = _di.bMonth;

        _calendarDiv.html('');

        var newRow = '<div class="monthRow elementNum{0}">';
        var newRowEnd = '</div>';
        var html = [newRow.filledWith(1)];

        for (var m = 1; m <= 19; m++) {
            if (m === 19) {
                // add ayyam-i-ha with Loftiness
                Array.prototype.push.apply(html, buildMonth(bYear, 0));
            }

            var elementNum = getElementNum(m);
            switch (m) {
                case 4:
                case 8:
                case 14:
                    html.push(newRowEnd);
                    html.push(newRow.filledWith(elementNum));
                    break;
            }


            Array.prototype.push.apply(html, buildMonth(bYear, m));
        }

        html.push(newRowEnd);

        for (var i = 1; i <= 19; i++) {
            html.push('<div id="monthCell{0}" class="monthShell elementNum{1}"><div class=monthNum>{0}</div></div>'.filledWith(i, getElementNum(i)));
        }

        _calendarDiv.html(html.join(''));

        showTodayTime();

        scrollToMonth(bMonth);
    }

    function scrollToMonth(bMonth) {
        _scrollToMonth = bMonth;
        var month = _calendarDiv.find('#cal3_m{0}'.filledWith(bMonth));
        if (month.length === 0) {
            console.log("no month " + bMonth);
            return;
        }
        _calendarDiv.find('.month').hide();
        month.show();
        return;

        //    // do the animate, then directly set it...
        //    // animate doesn't work if not visible, and sometimes even when visible
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

    function buildMonth(bYear, bMonth) {
        var focusMonth = bMonth;

        var dayCellTemplate = $('#cal3dayCell').text();

        var dayCells = [];
        var day1Di;
        var gMonths = [];
        var lastGMonth = '';
        var gYear = 0;
        var row = 2;

        for (var i = 1; i < bWeekdayNameAr.length; i++) {
            var gDay = i < 2 ? 5 + i : i - 2;
            var eveDay = gDay === 0 ? 6 : gDay - 1;
            var wdInfo = {
                row: 1,
                column: i,
                num: i,
                arabic: bWeekdayNamePri[i],
                meaning: bWeekdayNameSec[i],
                gEve: gWeekdayShort[eveDay],
                gDay: gWeekdayLong[gDay]
            };
            dayCells.push(`<div style="grid-area: {row} / {column}" class="weekdayTitle">
            <div class=b><span class=a>{arabic}</span><span class=m>({meaning})</span></div>
            <div class=g><span class=e>{gEve}</span><span class=d>{gDay}</span></div></div>`.filledWith(wdInfo));
        }

        for (var bDay = 1; bDay <= 19; bDay++) {
            var bDateCode = bMonth + '.' + bDay;
            var gDate;
            //      try {
            gDate = holyDays.getGDate(bYear, bMonth, bDay, false);
            if (!gDate) {
                break;
            }
            gDate.setHours(12, 0, 0, 0); // set to noon to avoid DST issues
            //      }
            //      catch (e) {
            //        if (bMonth === 0 && e === 'invalid Badi date') {
            //          break;
            //        }
            //        else {
            //          throw e;
            //        }
            //      }
            var dayGroup;
            var di = getDateInfo(gDate);
            if (bDay === 1) {
                day1Di = di;
                dayGroup = bMonth === 0 ? 0 : 1;
            }

            if (bDay > 1 && di.bWeekday === 1) {
                row++;
                // console.log(di);
            }
            di.row = row;
            di.column = di.bWeekday;
            // console.log('weekday', di.bMonth, di.bDay, di.row, di.column);
            di.elementNum = bMonth === 0 ? 0 : getElementNum(bDay);

            var gMonth = di.frag2MonthLong;
            if (lastGMonth !== gMonth) {
                gMonths.push(gMonth);
                lastGMonth = gMonth;
                gYear = di.frag2Year; // remember last year used
            }

            if (di.frag1MonthShort !== di.frag2MonthShort) {
                di.frag1MonthShortX = di.frag1MonthShort;
                di.frag1MonthShortXComma = ',';
            }

            var startSunset = di.frag1SunTimes.sunset;
            var startSunsetHr = (startSunset.getHours() + startSunset.getMinutes() / 60);

            var sunrise = di.frag2SunTimes.sunrise;
            var sunriseHr = (sunrise.getHours() + sunrise.getMinutes() / 60);

            //var hourFactor = 88 / 24;
            //var total = hourFactor * 24;
            //var minHeightTopRow = 14; // for font in use

            //var eveSize = Math.max(0, +((24 - startSunsetHr) * hourFactor).toFixed(3));
            //var eveExtra = minHeightTopRow - eveSize;
            //eveSize = Math.max(eveSize, minHeightTopRow);
            //var mornSize = +(sunriseHr * hourFactor - (eveExtra > 0 ? eveExtra : 0)).toFixed(3);
            //var aftSize = total - eveSize - mornSize; //  +((sunsetHr - sunriseHr) * hourFactor).toFixed(3);

            $.extend(di, {
                classesOuter: [
                    'gd'
                ],
                cellId: 'gd' + bMonth + '_' + bDay,
                //mornSize: mornSize,
                //aftSize: aftSize,
                //eveSize: eveSize,
            });

            if (di.bMonth === 19) {
                $.extend(di, {
                    sunriseDiv: '<div class=sunrise>{0}</div>'.filledWith(showTime(sunrise))
                });
            }

            $.extend(di, {
                sunsetDesc: '<div class=sunsetEnd>{0}{1}</div>'.filledWith(di.sunriseDiv || '', showTime(di.frag2SunTimes.sunset))
            });

            if (bDay === bMonth) {
                di.classesOuter.push('monthNameDay');
            }

            // add holy days
            if (!_specialDays[bYear]) {
                _specialDays[bYear] = holyDays.prepareDateInfos(bYear);
            }

            var holyDayInfo = $.grep(_specialDays[bYear], function(el, i) {
                return el.Type.substring(0, 1) === 'H' && el.BDateCode === bDateCode;
            });

            if (holyDayInfo.length) {
                di.holyDayAftStar = '<span class="hd{0}"></span>'.filledWith(holyDayInfo[0].Type);
                di.holyDayAftName = '<div class="hdName">{0}</div>'.filledWith(getMessage(holyDayInfo[0].NameEn));
                di.classesOuter.push('hdDay' + holyDayInfo[0].Type);
            }
            di.DayOfWeek = getMessage('DayOfWeek');
            di.classesOuter = di.classesOuter.join(' ');

            dayCells.push(dayCellTemplate.filledWith(di));
        }

        var elementNum = getElementNum(bMonth);
        var monthTitleInfo = {
            bMonthName: day1Di.bMonthNamePri,
            bYear: bYear
        };

        var monthElement = (bMonth === 0 ? '' : '<div class=monthElement>{element}</div>'.filledWith(day1Di));
        var bMonthInfo = (bMonth === 0 ? '{bMonthNameSec}' : '{bMonth} - {bMonthNameSec}').filledWith(day1Di) +
            monthElement; //&#8230;
        var gMonthInfo = gMonths.join(', ') + ' ' + gYear;

        var html = [
            '<div class="month elementNum{1}" id=cal3_m{0}>'.filledWith(focusMonth, elementNum),
            '<div class=caption>',
            '<div class=monthNames>{bMonthName}<span class=year> {bYear}</span></div>'.filledWith(monthTitleInfo),
            '<div class=gMonthInfo>{0}<div class=placeName>{1}</div></div>'.filledWith(gMonthInfo, localStorage.locationName),
            '<div class=bMonthInfo>{0}</div>'.filledWith(bMonthInfo),
            '</div>',
            '<div class=monthDays>',
            '{^0}'.filledWith(dayCells.join('')),
            '</div>',
            '</div>'
        ];

        return html;
    }

    function showTodayTime() {
        _calendarDiv.find('.today').removeClass('today');
        _calendarDiv.find('.todayTime').remove();

        var currentTime = new Date();
        var nowDi = getDateInfo(currentTime);

        var dayCell = _calendarDiv.find('#cal3_igd{bMonth}_{bDay}'.filledWith(nowDi));
        dayCell.addClass('today');

        var start = moment(nowDi.frag1SunTimes.sunset);
        var end = moment(nowDi.frag2SunTimes.sunset);
        var now = moment(currentTime); // moment seems to cache the time when the page loads

        //    console.log('------');
        //    console.log('start ' + start.format());
        //    console.log('end ' + end.format());
        //
        //    console.log('now ' + now.format());
        //    console.log('end->start ' + start.diff(now));
        //    console.log('now->start ' + now.diff(start));

        var pct = now.diff(start) / end.diff(start) * 100;

        // don't show too close to the edge... looks better
        if (pct < 1) pct = 1;
        if (pct > 99) pct = 99;

        // ~~ is like Math.floor()
        dayCell.append('<div class=todayTime title="{1} {2}" style="left:{0}%"></div>'.filledWith(~~pct, getMessage("Now"), now.format('HH:mm')));

        clearTimeout(_timeoutTime);
        _timeoutTime = setTimeout(showTodayTime, 15 * 60 * 1000); // 15 minutes
    }

    preparePage();

    return {
        showCalendar: showCalendar,
        resetPageForLanguageChange: function() {
            _yearShown = -1;
        },
        di: _di,
        showTodayTime: showTodayTime,
        scrollToMonth: scrollToMonth
    };
};