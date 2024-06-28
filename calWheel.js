/* global getStorage */
/* global getMessage */
/* global di */
/* global chrome */
/* global $ */

const CalWheel = () => {
    let _yearShown = null;
    let _lastAngle = null;
    let _rotateTimeout = null;
    let _rotating = null;

    // this page replicates a common format
    // don't know where the original is from
    // not rotating text of Month names as done in the original


    const angle1 = 18.94736842105263;

    function showCalendar(newDi) {
        //var x = '43.5px';
        //var y = '335px';

        const showPointer = $('#cbShowPointer').prop('checked');
        $('#pointerToday').toggle(showPointer);

        const sameYear = newDi.bYear === _yearShown;

        if (sameYear && !showPointer && _lastAngle === null) {
            return;
        }

        const di = newDi;
        _yearShown = newDi.bYear;

        const wheel = $('#wheel');

        if (!sameYear) {
            $('#wheelYear').html(getMessage('yearWithEra', di));

            wheel.find('.slice').remove();

            const template = $('#templateSlice')[0].outerHTML;

            for (let i = 0; i < 19; i++) {
                const slice = $(template);
                const bm = i + 1;
                const angle = i * angle1;
                const css = browserHostType === browser.Chrome ? {
                    transform: `rotate(${angle}deg)`,
                    transformOrigin: '39px 335px' //x + ' ' + y
                } : {
                    transform: `rotate(${angle}deg)`,
                    transformOrigin: '39px 335px' //x + ' ' + y
                };

                const inner = slice.find('.innerSlice');
                slice.removeAttr('id');
                slice.css(css);

                inner.attr('id', `slice${bm}`);

                slice.find('.monthNum').html(bm);
                slice.find('.monthNameAr').html(forSvg(bMonthNamePri[bm]));
                //log(bMonthNamePri[bm] + ' - ' + settings.useArNames + ' - ' + bMonthNameSec[bm]);
                slice.find('.monthName').html(forSvg(bMonthNameSec[bm]));

                const gd = holyDays.getGDate(di.bYear, bm, 1, false);

                slice.find('.firstDayG').html(forSvg(`${gMonthShort[gd.getMonth()]} ${gd.getDate()}`));
                slice.find('.firstDayWk').html(forSvg(gWeekdayShort[gd.getDay()]));
                slice.find('.firstDayYr').html(gd.getFullYear());

                wheel.append(slice);
            }
        }

        let offsetAngle = 0;
        if (showPointer) {
            $('#wheelDay').html(forSvg('{bDay} {^bMonthNamePri}'.filledWith(di)));

            let dayOfYear = (di.bMonth - 1) * 19 + di.bDay - 1;
            if (di.bMonth === 0) {
                dayOfYear = 18 * 19;
            } else if (di.bMonth === 19) {
                // dayOfYear -= 4;// don't need to be precise here
            }
            const pctOfYear = dayOfYear / 361;

            //log(pctOfYear);

            const magicAdjustment = 0.434;

            offsetAngle = 90 - 360 * pctOfYear + magicAdjustment * angle1;

            let s = $('style#specialStyle');
            if (s.length === 0) {
                const style = document.createElement('style');
                style.id = 'specialStyle';
                $('head').append(style);
                s = $('style#specialStyle');
            }

            if (_lastAngle === null) {
                _lastAngle = offsetAngle;
            }

            const keyframes = `@-webkit-keyframes spinner {from {-webkit-transform:rotateZ(${_lastAngle}deg)}  to {-webkit-transform:rotateZ(${offsetAngle}deg)}}`;

            wheel.css({ transform: 'rotate({0}deg)'.filledWith(_lastAngle) });
            wheel.removeClass('rotating');

            s.html(keyframes);

            clearTimeout(_rotateTimeout);
            _rotateTimeout = setTimeout(() => {
                wheel.addClass('rotating');
                _lastAngle = offsetAngle;
            }, 0);

            //wheel.css({ transform: 'rotate({0}deg)'.filledWith(offsetAngle) })

        } else {
            _lastAngle = null;
            wheel.css({ transform: 'rotate(0deg)' });
            wheel.removeClass('rotating');
        }
    }

    function forSvg(s) {
        if (!s) debugger;
        return s.replace('<u>', '<tspan class=u>').replace('</u>', '</tspan>');
    }

    //  function toHex(d) {
    //    return ("0" + (Number(d).toString(16))).slice(-2).toUpperCase();
    //  }

    function gotoYear(year) {
        year = year || 173;
        const gDate = holyDays.getGDate(+year, 1, 1, true);
        setFocusTime(gDate);
        refreshDateInfo();
        showInfo(_di);
    }

    function rotateYear(year, speed) {
        year = year || 173;
        speed = speed || 100;
        const gDate = holyDays.getGDate(+year, 1, 1, true);

        $('#cbShowPointer').prop('checked', true);
        $('#askShowPointer').hide();

        const show = () => {
            const di = getDateInfo(gDate);
            if (di.bYear !== year) {
                return;
            }

            showCalendar(di);
            gDate.setDate(gDate.getDate() + 1);
            _rotating = setTimeout(show, speed);
        };
        show();
    }


    return {
        showCalendar: showCalendar,
        gotoYear: gotoYear,
        rotateYear: rotateYear,
        resetPageForLanguageChange: () => {
            _yearShown = -1;
        },
        stopRotation: () => {
            clearTimeout(_rotating);
        }
    };
};