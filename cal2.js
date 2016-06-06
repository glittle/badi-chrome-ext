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
    var _initialScrollDone = false;

    function preparePage() {
        attachHandlers();
    }

    function attachHandlers() {
        _calendarDiv.on('click', '.dayCell', function (ev) {
            var cell = $(ev.target).closest('td');
            var gDate = cell.data('gdate');

            var target = new Date(gDate);
            setFocusTime(target);
            refreshDateInfo();
            showInfo(_di);
        });
    }

    function showCalendar(newDi) {
        _di = newDi;

        var newYear = newDi.bYear;
        if (newYear !== _yearShown) {
            buildCalendar();
        }
        highlightTargetDay(newDi);
    }

    function highlightTargetDay(di) {
        _calendarDiv.find('td.selected').removeClass('selected');

        var sel = ('#cal2_igd{bMonth}_{bDay}').filledWith(di);

        _calendarDiv.find(sel).addClass('selected');

        setTimeout(function () {
            scrollToMonth(di.bMonth);
        }, 0);
    }

    function buildCalendar() {
        var bYear = _di.bYear;
        _yearShown = bYear;
        _scrollToMonth = -1;

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

    function scrollToMonth(bMonth, force) {
        if (_scrollToMonth === bMonth && !force) {
            return;
        }

        _scrollToMonth = bMonth;
        var month = _calendarDiv.find('#cal2_m{0}'.filledWith(bMonth));
        if (month.length === 0) {
            log("no month " + bMonth);
            return;
        }

        var monthTop = month.position().top - 50; // move a bit higher
        if (force) {
            if (_inTab) {
                $("html, body").stop().scrollTop(monthTop + _calendarDiv.position().top);
            } else {
                _calendarDiv.stop().scrollTop(_calendarDiv.scrollTop() + monthTop);
            }
        } else {
            if (_inTab) {
                $("html, body").stop().animate({ scrollTop: (monthTop + _calendarDiv.position().top) + "px" });
            } else {
                _calendarDiv.stop().animate({ scrollTop: (_calendarDiv.scrollTop() + monthTop) + "px" });
            }
        }
    }

    function buildMonth(bYear, bMonth) {
        var focusMonth = bMonth;
        var newRow = '<table class="dayRow dayGroup{0}"><tbody><tr>';
        var newRowEnd = '</tbody></tr></table>';

        var dayCellTemplate = [
            '<td class="bDay{bDay} {classesOuter} wd{frag2Weekday}" id=cal2_i{cellId} data-gdate="{frag2Year}/{frag2Month00}/{frag2Day00}">',
            '<div class=dayCell>',
                '<div class=top><span class=dayNum>{^holyDayAftStar}{bDay}</span> <span class=sunsetStart>{frag1WeekdayShort} {startingSunsetDesc}</span></div>',
                    '<div class=night>',
                        '<div class=gStart><span class=wd>{frag2WeekdayShort}</span>, {frag2MonthShort} {frag2Day}',
                        '<div class=bWeekDay>{bWeekdayNamePri}</div>',
                    '</div>',
                    '{^sunriseDesc}',
                '</div>',
                '<div class=day>{^holyDayAftName}</div>',
                '<div class=dayName>{bDayNamePri}</div>',
                '{^sunsetDesc}',
            '</div>',
            '</td>'
        ].join('');

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
                        dayCells.push(newRowEnd);
                        dayGroup++;
                        dayCells.push(newRow.filledWith(dayGroup));
                        break;
                }
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

            $.extend(di, {
                sunsetDesc: '<span class=sunsetEnd>{0}</span>'.filledWith(showTime(di.frag2SunTimes.sunset))
            });

            if (di.bMonth === 19) {
                $.extend(di, {
                    sunriseDesc: '<div class=sunrise>{0}</div>'.filledWith(showTime(sunrise))
                });
            }

            if (bDay === bMonth) {
                di.classesOuter.push('monthNameDay');
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

            dayCells.push(dayCellTemplate.filledWith(di));
        }

        dayCells.push(newRowEnd);

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

        var bMonthInfo = (bMonth === 0 ? '{bMonthNameSec}' : ('{bMonthNameSec} &mdash; ' + gMonths.join(', ') + ' ' + gYear)).filledWith(day1Di);
        var gMonthInfo = (bMonth === 0 ? '' : '{bMonth} &ndash; {element}'.filledWith(day1Di));

        var html = [
          '<div class="month mGroup{1}" id=cal2_m{0}>'.filledWith(focusMonth, mGroup),
          '<div class=caption>',
            '<div class=monthNames>{bMonthName} {bYear}</div>'.filledWith(monthTitleInfo),
            '<div class=monthInfo>{0}</div>'.filledWith(bMonthInfo),
            '<div class=monthInfo2>{0}</div>'.filledWith(gMonthInfo),
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
