/* global getStorage */
/* global getMessage */
/* global di */
/* global chrome */
/* global $ */

var Cal1 = function(di, host) {
    var _yearShown = null;
    var gDaySerial = '{currentYear}{currentMonth01}{currentDay00}';

    if (typeof di === 'undefined') {
        host = window.top;
        di = host._di;
    } else {
        host = window;
    }

    function preparePage() {
        attachHandlers();
    }

    function attachHandlers() {
        //$('#btnClose').on('click', function () {
        //  host.hideCal1();
        //});
        //$('#btnReload').on('click', function () {
        //  window.location.reload();
        //});
        //$('#btnPrint').on('click', function () {
        //  window.print();
        //});
        $('#pageCal1 .months').on('click', '.bd', clickBd);
    }

    function clickBd(ev) {
        var dayDiv = $(ev.target).closest('div.bd');
        var monthDiv = dayDiv.closest('div.bm');
        var day = getNum(dayDiv, 'bd');
        var month = getNum(monthDiv, 'bm');

        var gDate = holyDays.getGDate(di.bYear, month, day, di.bNow.eve);

        setFocusTime(gDate);
        refreshDateInfo();
        showInfo(_di);
    }

    function getNum(el, prefix) {
        var classes = el.attr('class').split(' ');
        var len = prefix.length;
        for (var i = 0; i < classes.length; i++) {
            var className = classes[i];
            if (className.length > len && className.substring(0, len) === prefix) {
                return +className.substring(len);
            }
        }
        return 0;
    }

    function showCalendar(newDi) {
        di = newDi;
        if (newDi.bYear !== _yearShown) {
            holyDays.prepareDateInfos(newDi.bYear);
            buildCalendar();
        }
        highlightTargetDay();
    }

    function highlightTargetDay() {
        var cal = $('#pageCal1 .months');
        cal.find('.bd.selected, .gd.selected, .bm.selected').removeClass('selected');
        var sel = ('.bm{bMonth}, .bm{bMonth} .bd{bDay}, .g' + gDaySerial).filledWith(di);
        cal.find(sel).addClass('selected');
    }

    function buildCalendar() {
        _yearShown = di.bYear;

        var html = [];
        var gMonthAlt = 0;
        var lastMGroup = -1;
        var doneAyyamiHa = false;

        for (var bm = 1; bm <= 19; bm++) {
            if (bm === 1 && doneAyyamiHa) {
                bm = 19;
            }
            if (bm === 19 && !doneAyyamiHa) {
                bm = 0;
                doneAyyamiHa = true;
            }

            var monthGroup = [];
            var mGroup = getElementNum(bm);

            // outer
            monthGroup.push('<div class="month">'.filledWith(bm));

            var bMonthHtml = [];
            var gMonthHtml = [];

            if (mGroup && mGroup !== lastMGroup) {
                lastMGroup = mGroup;
                monthGroup.push('<div class="element mGroup{1}">{0}</div>'.filledWith(host.elements[mGroup - 1], mGroup));
            }

            bMonthHtml.push('<div class="bm bm{0}">'.filledWith(bm));
            bMonthHtml.push('<div class=bmName><i>{^1}</i>{0}</div>'.filledWith(host.bMonthNamePri[bm], bm === 0 ? "" : bm));


            gMonthHtml.push('<div class=gm>');

            var gd = holyDays.getGDate(di.bYear, bm, 1, false);
            var gMonthName = host.gMonthShort[gd.getMonth()];
            gMonthHtml.push('<div class="gmInitial gma0">{0}</div>'.filledWith(gMonthName));

            for (var bd = 1; bd <= 19; bd++) {
                //try {
                gd = holyDays.getGDate(di.bYear, bm, bd, false);
                //}
                if (!gd) {
                    //          if (bm === 0 && e == 'invalid Badi date') {
                    break;
                    //          }
                    //          else {
                    //            throw e;
                    //          }
                }
                var holyDay = getHolyDay(bm, bd);
                var holyDayMarker = '';
                var bdTip = '';
                if (holyDay) {
                    holyDayMarker = '<span class=hd{0}></span>'.filledWith(holyDay.Type);
                    bdTip = ' title="' + getMessage(holyDay.NameEn) + '"';
                }

                var gDayOfMonth = gd.getDate();

                var dow = gd.getDay();

                bMonthHtml.push('<div class="bd bd{0} dow{1} mGroup{2}"{^4}><b>{0}</b>{^3}</div>'.filledWith(bd, dow, mGroup, holyDayMarker, bdTip));

                var gDayClass = gDaySerial.filledWith({
                    currentYear: gd.getFullYear(),
                    currentMonth01: digitPad2(gd.getMonth() + 1),
                    currentDay00: digitPad2(gDayOfMonth)
                });

                if (gDayOfMonth == 1 && bd != 1) {
                    gMonthName = host.gMonthShort[gd.getMonth()];
                    gMonthAlt = 1 - gMonthAlt;
                    gMonthHtml.push('<div class="gd gd1 dow{1} gma{2}{3} g{4}"><i>{0} 1</i></div>'.filledWith(
                        gMonthName,
                        dow,
                        gMonthAlt,
                        bd === 19 ? ' gLast' : '',
                        gDayClass));
                } else {
                    gMonthHtml.push('<div class="gd dow{1}{2}{3} gma{4}{6} g{7}"><b>{0}</b>{5}</div>'.filledWith(
                        gDayOfMonth,
                        dow,
                        gDayOfMonth == 1 && bd != 1 ? ' gd1' : '',
                        gDayOfMonth % 2 ? ' gAlt' : '',
                        gMonthAlt,
                        host.gWeekdayShort[dow],
                        bd === 19 ? ' gLast' : '',
                        gDayClass));
                }
            }

            bMonthHtml.push('</div>');
            gMonthHtml.push('</div>');

            monthGroup.push(bMonthHtml.join(''));
            monthGroup.push(gMonthHtml.join(''));

            monthGroup.push('</div>');

            html.push(monthGroup.join(''));
        }

        $('#pageCal1 .months').html(html.join(''));
    }

    function getHolyDay(m, d) {
        var events = _cachedDateInfos[di.bYear];

        //if (!events) {
        //  prepareDateInfos(di.bYear);
        //}

        for (var i = 0; i < events.length; i++) {
            var event = events[i];
            if (event.BMonthDay.m === m) {
                if (event.BMonthDay.d === d && event.Type.substring(0, 1) === 'H') {
                    return event;
                }
            }
            if (event.MonthNum > m) {
                return null;
            }
        }


    }

    preparePage();

    return {
        showCalendar: showCalendar,
        resetPageForLanguageChange: function() {
            _yearShown = -1;
        },
        di: di
    };
};

//if (top != window) {
//  $(function () {
//    var cal1 = Cal1();
//    cal1.showCalendar();
//  });
//}