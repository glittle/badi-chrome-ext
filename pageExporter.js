/* global getMessage */

var PageExporter = function() {

    var _lines = [];
    var _forCsv = false;
    var _doingCsvLine = false;
    var _csvLine = [];
    var _numEntries = 0;
    var _uidPrefix = 'UID:Chrome Badi Calendar Extension//';
    var _nowCalDate = '';
    var _specialDays = {};
    var _includeLocation = true;
    var _includeAlert = false;

    var prepareInputs = function() {
        var template = '{title}<label><input type="checkbox" value="{val}" data-num="{n}" /><span>{name}</span></label>';
        var items = [
            { val: 'Date_AllDay', n: 365 },
            { val: 'Date_BeginningSunset', n: 365 },
            { val: 'Date_Sun', n: 365 },
            { val: 'Hd_AllDay', n: 11 },
            { val: 'Hd_Sun', n: 11 },
            { val: 'Hd_Start', n: 11 },
            { val: 'Feast_AllDay', n: 19 },
            { val: 'Feast_Sun', n: 19 },
            { val: 'Feast_BeginningSunset', n: 19 },
            { val: 'Feast_Usual', n: 19 },
            { val: 'Fast_Sunrise', n: 19 },
            { val: 'Fast_Sunset', n: 19 },
            { val: 'Fast_SunriseToSunset', n: 19 }
        ];
        var lastWhat = '';
        $.each(items, function(i, item) {
            var valParts = item.val.split('_');
            var type = valParts[1];
            item.name = getMessage('exportOption_' + type);
            var what = valParts[0];
            if (what != lastWhat) {
                item.title = '<div class=exportItemTitle>{0}</div>'.filledWith(getMessage('exportOption_' + what));
                lastWhat = what;
            } else {
                item.title = '';
            }
        });

        $('.exportOptionList').html(template.filledWithEach(items));

        localizeHtml('.exportOptionList', function(value) {
            value = value.replace(/\(/g, '<span class=comment>(');
            value = value.replace(/\)/g, ')</span>');
            return value;
        });

        var alerts = [
            { v: 'B0' },
            { v: 'B1' },
            { v: 'B5' },
            { v: 'B10' },
            { v: 'B15' },
            { v: 'B30' },
            { v: 'B60' },
            // can't go after...
        ];
        $.each(alerts, function(i, a) {
            a.t = getMessage('exportAlert_' + a.v);
        });
        $('#exporterIncludeAlertMin').html('<option value="{v}">{t}</option>'.filledWithEach(alerts));

        setByYear();
    };
    var setByYear = function(highlight) {
        var select = $('#exporterDateRange');
        select.find('option').each(function(i, el) {
            var option = $(el);
            var key = option.attr('id');
            var parts = key.split('_');
            var type = parts[1];
            var offset = +parts[2];

            var year = offset + (type === 'Greg' ? _di.currentYear : _di.bYear);
            option.val(type + year);
            option.text(getMessage('Export' + type + 'Year' + offset, year));
        });
        if (highlight) {
            select.effect("highlight", 1000);
        }
    };
    var calFormat = function(date, addHours, addMinutes) {
        if (addHours + addMinutes) {
            date.setHours(date.getHours() + addHours, date.getMinutes() + addMinutes, 0, 0);
        }
        return date.toJSON().replace(/[\-\:]/g, '').split('.')[0] + 'Z';
    };
    var makeEntries = function(asCsv) {
        _lines = [];
        _forCsv = !!asCsv;
        _nowCalDate = calFormat(new Date());
        _includeLocation = $('#exporterIncludeLocation').is(':checked');
        _includeAlert = $('#exporterIncludeAlert').is(':checked');

        addLine('BEGIN:VCALENDAR');
        addLine('VERSION:2.0');
        addLine('CALSCALE:GREGORIAN');
        addLine('METHOD:PUBLISH');
        addLine('X-WR-CALNAME:' + $('#exporterName').val());
        addLine('X-WR-TIMEZONE:' + moment.tz.guess());
        addLine('X-WR-CALDESC:' + getMessage('exportCalendarDescription', { location: localStorage.locationName }));

        addEntries();

        addLine('END:VCALENDAR');
        addLine('');
    };
    var addEntries = function() {
        var ddl = $('#exporterDateRange');
        if (!ddl.val()) {
            ddl[0].selectedIndex = 0;
        }
        var range = ddl.val();
        var rangeType = range.substr(0, 4);
        var year = +range.substr(4);
        var date = null;
        var nextYearStarts = null;
        var maxEntries = 0;
        //if (amount == 'some') {
        //  maxEntries = 5;
        //}

        // what range of dates?
        switch (rangeType) {
            case 'Badi':
                date = new Date(holyDays.getGDate(year, 1, 1).getTime());
                date.setHours(12, 0, 0, 0);
                nextYearStarts = new Date(holyDays.getGDate(year + 1, 1, 1).getTime());
                nextYearStarts.setHours(12, 0, 0, 0);
                break;
            case 'Greg':
                date = new Date(year, 0, 1);
                date.setHours(12, 0, 0, 0);
                nextYearStarts = new Date(year + 1, 0, 1);
                nextYearStarts.setHours(12, 0, 0, 0);
                break;
            default:
                console.log("unexpected: {0} {1}".filledWith(rangeType, year));
                return;
        }

        var wantedEventTypes = $('.exportOptionList input:checked').map(function(i, el) { return el.value; }).get();
        console.log(wantedEventTypes);

        // process each day... see if there is a wanted type for that day
        while (date < nextYearStarts) {
            //log(calFormat(date));
            var di = getDateInfo(date);

            for (var i = 0; i < wantedEventTypes.length; i++) {
                var eventType = wantedEventTypes[i];
                var parts = eventType.split('_');
                var type = parts[0];
                var variation = parts[1];
                switch (type) {
                    case 'Date': // badi days
                        addEntryDate(type, di, variation);
                        break;
                    case 'Hd':
                        addHolyDay(type, di, variation);
                        break;
                    case 'Feast':
                        addFeast(type, di, variation);
                        break;
                    case 'Fast':
                        addFastEntries(type, di, variation);
                        break;

                    default:
                        console.log('unknown: ' + eventType)
                }
            }

            // entry
            //if (maxEntries && _numEntries > maxEntries) {
            //  break;
            //}

            date.setDate(date.getDate() + 1);
        }
    };
    /* BADI DAY
  *
BEGIN:VEVENT
DTSTART;VALUE=DATE:20140321
DTSTAMP:20160118T064745Z
UID:nvevsld1q4sbso76qsfbj9a7f4@google.com
LAST-MODIFIED:20141224T090214Z
CREATED:20141224T090214Z
DESCRIPTION:1 Bahá 171 ⇨7:51 pm\n\nTimes customized for Northeast Calgary\,
Calgary\, AB\, Canada\nGenerated by "Badi Calendar Tools" on 13 Masá'il 17
1
LOCATION:
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:1 Bahá 171 ⇨7:51 pm
TRANSP:TRANSPARENT
END:VEVENT

   * 
   * 
   * 
   */


    var addEntryDate = function(type, di, variation) {
        addLine('BEGIN:VEVENT');

        var dayInfo = '{bDay} {bMonthNamePri} {bYear}'.filledWith(di);

        switch (variation) {
            case 'AllDay':
                addLine('DTSTART;VALUE=DATE:' + di.currentDateString.replace(/\-/g, ''));
                addLine('SUMMARY:' + dayInfo + ' ⇨{endingSunsetDesc}'.filledWith(di));
                noTimes = true;
                break;
            case 'Sun':
                addLine('DTSTART:' + calFormat(di.frag1SunTimes.sunset));
                addLine('DTEND:' + calFormat(di.frag2SunTimes.sunset, 0, -5));
                addLine('SUMMARY:' + dayInfo);
                break;
            case 'BeginningSunset':
                addLine('DTSTART:' + calFormat(di.frag1SunTimes.sunset));
                addLine('DTEND:' + calFormat(di.frag1SunTimes.sunset));
                addLine('SUMMARY:' + getMessage('exportDayFromSunset', dayInfo));
                break;
            default:
                console.log('unexpected date variation: ' + variation);
                break;
        }

        addDescription(getMessage('exporterItemDescDay'), variation === 'AllDay');

        addLine(_uidPrefix + '{0}//{1}-{2}'.filledWith(di.stampDay, type, variation));
        addEndOfEntry();
    };

    var addHolyDay = function(type, di, variation) {
        if (!_specialDays[di.bYear]) {
            _specialDays[di.bYear] = holyDays.prepareDateInfos(di.bYear);
        }
        var holyDayInfo = $.grep(_specialDays[di.bYear], function(el, i) {
            return el.Type.substring(0, 1) == 'H' && el.BDateCode == di.bDateCode;
        });

        if (!holyDayInfo.length) {
            return;
        }
        holyDayInfo = holyDayInfo[0]; // focus on first event only

        var dayName = getMessage(holyDayInfo.NameEn);

        //log(dayName, holyDayInfo, di);

        var targetTime = holyDayInfo.Time || $('#eventStart').val();
        var startTime;

        if (targetTime == 'SS2') {
            startTime = new Date(di.frag1SunTimes.sunset.getTime());
            startTime.setHours(startTime.getHours() + 2);
            // about 2 hours after sunset
            var minutes = startTime.getMinutes();
            minutes = minutes > 30 ? 30 : 0; // start 1/2 hour before
            startTime.setMinutes(minutes);
        } else {
            var adjustDTtoST = 0;
            if (targetTime.slice(-1) == 'S') {
                targetTime = targetTime.slice(0, 4);
                adjustDTtoST = inStandardTime(di.frag1) ? 0 : 1;
            }
            startTime = new Date(di.frag1.getTime());
            var timeHour = +targetTime.slice(0, 2);
            var timeMin = targetTime.slice(-2);
            startTime.setHours(timeHour + adjustDTtoST);
            startTime.setMinutes(timeMin);

            if (di.frag1SunTimes.sunset.getTime() < startTime.getTime()) {
                //isEve = " *";
            } else {
                startTime.setHours(startTime.getHours() + 24);
            }
        }

        addLine('BEGIN:VEVENT');

        addLine('SUMMARY:{0}'.filledWith(dayName));

        switch (variation) {
            case 'AllDay':
                addLine('DTSTART;VALUE=DATE:' + di.currentDateString.replace(/\-/g, ''));
                break;
            case 'Sun':
                addLine('DTSTART:' + calFormat(di.frag1SunTimes.sunset));
                addLine('DTEND:' + calFormat(di.frag2SunTimes.sunset, 0, -5));
                break;
            case 'Start':
                // put as single point in time... meetings may start earlier, if this time is honoured during the meeting
                addLine('DTSTART:' + calFormat(startTime));
                addLine('DTEND:' + calFormat(startTime));
                break;
            default:
                console.log('unexpected date variation: ' + variation);
                break;
        }

        var key;
        var extraInfo = { location: localStorage.locationName };

        if (holyDayInfo.Time) {
            extraInfo.SpecialTime = getMessage('specialTime_' + holyDayInfo.Time);
            key = 'exporterItemDescSpecialTime';
        } else {
            key = 'exporterItemDescGeneralTime';
        }

        addDescription(getMessage(key, extraInfo), variation === 'AllDay');


        addLine(_uidPrefix + '{0}//{1}-{2}'.filledWith(di.stampDay, type, variation));
        addEndOfEntry();
    };

    var addFeast = function(type, di, variation) {
        if (!_specialDays[di.bYear]) {
            _specialDays[di.bYear] = holyDays.prepareDateInfos(di.bYear);
        }
        var feastInfo = $.grep(_specialDays[di.bYear], function(el, i) {
            return el.Type.substring(0, 1) == 'M' && el.BDateCode == di.bDateCode;
        });

        if (!feastInfo.length) {
            return;
        }
        feastInfo = feastInfo[0]; // focus on first event only

        var dayName = getMessage('FeastOf').filledWith(di.bMonthMeaning);

        //log(dayName, feastInfo, di);

        var targetTime = $('#eventStart').val();

        var startTime = new Date(di.frag1.getTime());
        var timeHour = +targetTime.slice(0, 2);
        var timeMin = targetTime.slice(-2);
        startTime.setHours(timeHour);
        startTime.setMinutes(timeMin);

        if (di.frag1SunTimes.sunset.getTime() < startTime.getTime()) {
            //isEve = " *";
        } else {
            startTime.setHours(startTime.getHours() + 24);
        }

        addLine('BEGIN:VEVENT');

        addLine('SUMMARY:{0}'.filledWith(dayName));

        switch (variation) {
            case 'AllDay':
                addLine('DTSTART;VALUE=DATE:' + di.currentDateString.replace(/\-/g, ''));
                break;
            case 'Sun':
                addLine('DTSTART:' + calFormat(di.frag1SunTimes.sunset));
                addLine('DTEND:' + calFormat(di.frag2SunTimes.sunset, 0, -5));
                break;
            case 'Usual':
                // put as single point in time... 
                addLine('DTSTART:' + calFormat(startTime));
                addLine('DTEND:' + calFormat(startTime));
                break;
            case 'BeginningSunset':
                // put as single point in time... 
                addLine('DTSTART:' + calFormat(di.frag1SunTimes.sunset));
                addLine('DTEND:' + calFormat(di.frag1SunTimes.sunset));
                break;
            default:
                console.log('unexpected date variation: ' + variation);
                break;
        }

        addDescription(getMessage('exporterItemDescGeneralTime'), variation === 'AllDay');

        addLine(_uidPrefix + '{0}//{1}-{2}'.filledWith(di.stampDay, type, variation));
        addEndOfEntry();
    };

    var addFastEntries = function(type, di, variation) {
        if (di.bMonth != 19) {
            return;
        }

        addDescription(getMessage('exporterItemDescFast'));

        //        di.sunriseDesc = showTime(di.frag2SunTimes.sunrise);
        switch (variation) {
            case 'SunriseToSunset':
                addLine('BEGIN:VEVENT');
                addLine('DTSTART:' + calFormat(di.frag2SunTimes.sunrise));
                addLine('DTEND:' + calFormat(di.frag2SunTimes.sunset));

                var summary = getMessage('exporterFastUntil', di);
                addLine('SUMMARY:' + summary);
                addAlert(summary);

                addLine(_uidPrefix + '{0}//{1}-{2}'.filledWith(di.stampDay, type, variation));
                addEndOfEntry();

                break;
            case 'Sunrise':
                addLine('BEGIN:VEVENT');
                addLine('DTSTART:' + calFormat(di.frag2SunTimes.sunrise));
                addLine('DTEND:' + calFormat(di.frag2SunTimes.sunrise));

                summary = getMessage('exporterFastStart');
                addLine('SUMMARY:' + summary);
                addAlert(summary);

                addLine(_uidPrefix + '{0}//{1}-{2}'.filledWith(di.stampDay, type, variation));
                addEndOfEntry();
                break;

            case 'Sunset':
                addLine('BEGIN:VEVENT');
                addLine('DTSTART:' + calFormat(di.frag2SunTimes.sunset));
                addLine('DTEND:' + calFormat(di.frag2SunTimes.sunset));

                summary = getMessage('exporterFastEnd');
                addLine('SUMMARY:' + summary);
                addAlert(summary);

                addLine(_uidPrefix + '{0}//{1}-{2}'.filledWith(di.stampDay, type, variation));
                addEndOfEntry();
                break;
            default:
                console.log('unexpected date variation: ' + variation);
                break;
        }

    };

    var addAlert = function(msg) {
        if (!_includeAlert) {
            return;
        }
        var alertOffset = $('#exporterIncludeAlertMin').val();
        var sign = alertOffset[0] == 'B' ? '-' : '';
        var num = alertOffset.substr(1);
        addLine('BEGIN:VALARM');
        addLine('TRIGGER:{0}PT{1}M'.filledWith(sign, num));
        addLine('ACTION:DISPLAY');
        addLine('DESCRIPTION:' + msg);
        addLine('END:VALARM');

        //BEGIN:VALARM
        //ACTION:DISPLAY
        //DESCRIPTION:This is an event reminder
        //TRIGGER:-P0DT0H10M0S
        //END:VALARM
    };

    var addDescription = function(msg, allDay) {
        if (!allDay) {
            var extraInfo = { location: localStorage.locationName };
            var timesLocation = getMessage('exporterItemDescShared', extraInfo);
            msg = msg + ' ' + timesLocation;
        }

        addLine('DESCRIPTION:' + msg); // strip out HTML ?
        //addLine('X-ALT-DESC:' + msg);
    }

    var addEndOfEntry = function() {
        if (_doingCsvLine) {
            _lines.push(_csvLine.join(','));
            _csvLine = []
            _doingCsvLine = false;
            _numEntries++;
            return;
        }

        addLine('TRANSP:TRANSPARENT');
        addLine('CLASS:PUBLIC');
        addLine('DTSTAMP:' + _nowCalDate);
        addLine('LAST-MODIFIED:' + _nowCalDate);
        if (_includeLocation) {
            addLine('LOCATION:' + localStorage.locationName);
        }
        addLine('END:VEVENT');

        _numEntries++;
    };
    var addLine = function(line) {
        if (line === 'BEGIN:VEVENT') {
            _doingCsvLine = _forCsv;
            if (_doingCsvLine) {
                return;
            }
        }
        if (_forCsv && !_doingCsvLine) {
            return;
        }
        if (_doingCsvLine) {
            _csvLine.push(line.split(':')[1]);
            return;
        }

        var maxLength = 65; // actually 75, but need to handle extended characters, etc
        if (line.length < maxLength) {
            _lines.push(line);
            return;
        }
        _lines.push(line.substr(0, maxLength));
        addLine(' ' + line.substr(maxLength));
    };
    var sendTo = function(target) {
        switch (target) {
            case 'test':
                var html = [];
                for (var i = 0; i < _lines.length; i++) {
                    var line = _lines[i];
                    //if (line == 'BEGIN:VEVENT') {
                    //  html.push('\n');
                    //}
                    html.push(_lines[i] + '\n');
                }
                $('#exporterTest').show().val(html.join(''));
                $('#btnHideSample').show();
                break;
            case 'google':
                break;
            case 'file':
                //TODO: name file with content and time stamp
                var wantedEventTypes = $('.exportOptionList input:checked').map(function(i, el) { return el.value.replace(/\_/g, ''); }).get();
                var filename = 'Badi__{0}_{1}.ics'.filledWith(wantedEventTypes.join('_'), moment().format('DDHHmmss'));
                var element = document.createElement('a');
                element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(_lines.join('\r\n')));
                element.setAttribute('download', filename);

                element.style.display = 'none';
                document.body.appendChild(element);

                element.click();

                document.body.removeChild(element);
                break;
        }
    };
    var updateTotalToExport = function() {
        var total = 0;
        $('#pageExporter input[type=checkbox]:checked').each(function(i, el) {
            total += $(el).data('num') || 0;
        });
        $('#exportNum').text(total);
    };
    var saveValue = function(ev) {
        var input = ev.target;
        setStorage('exporter_' + input.id, input.value);
    };
    var clearQuickPick = function() {
        $('#pageExporter input[type=checkbox]:checked, #exporterIncludeAlert')
            .each(function(i, el) { $(el).prop('checked', false).trigger('change'); });
    };
    var setQuickPicks = function(list, alert) {
        clearQuickPick();
        $.each(list, function(i, l) {
            $('#pageExporter input[value={0}]'.filledWith(l)).prop('checked', true).trigger('change');
        });
        if (alert) {
            $('#exporterIncludeAlertMin').val(alert).trigger('change');
            $('#exporterIncludeAlert').prop('checked', true).trigger('change');
        }
    };
    var attachHandlers = function() {
        $('#pageExporter').on('change', 'input[type=checkbox]', function(ev) {
            var cb = $(ev.target);
            setStorage('exporter_' + cb.val(), cb.is(':checked'));
            updateTotalToExport();
        });
        $('#exporterName, #exporterDateRange').on('change', saveValue);

        $('#btnExportFile').click(function() {
            makeEntries();
            sendTo('file');
        });

        $('#btnExportGoogle').click(function() {
            makeEntries();
            sendTo('google');
        });

        $('#btnQuickPickClear').click(clearQuickPick);
        $('#btnQuickPick1').click(function() {
            setQuickPicks(['Date_AllDay', 'Hd_AllDay', 'Feast_BeginningSunset']);
        });
        $('#btnQuickPick2').click(function() {
            setQuickPicks(['Fast_Sunrise'], 'B10');
        });
        $('#btnQuickPick3').click(function() {
            setQuickPicks(['Fast_Sunset'], 'B0');
        });
        $('#btnExportTest').click(function() {
            makeEntries();
            sendTo('test');
        });
        $('#cbExportTestCsv').click(function() {
            makeEntries(true);
            sendTo('test');
        });
        $('#btnHideSample').click(function() {
            $('#exporterTest').hide();
            $(this).hide();
        });
        $('#exporterIncludeAlert, #exporterIncludeAlertMin').on('change', refreshAlert);
    };
    var recallSettings = function() {
        $('#pageExporter input[type=checkbox]').each(function(i, el) {
            var cb = $(el);
            cb.prop('checked', getStorage('exporter_' + cb.val(), false));
        });
        $('#exporterName').val(getStorage('exporter_exporterName', getMessage('title')));
        var ddlRange = $('#exporterDateRange');
        ddlRange.val(getStorage('exporter_exporterDateRange'));
        if (!ddlRange.val()) {
            ddlRange[0].selectedIndex = 0;
        }
        $('#exporterIncludeAlertMin').val(getStorage('exporter_alertMin', 'B0'));
    };
    var refreshAlert = function() {
        var ddl = $('#exporterIncludeAlertMin');
        ddl.toggle($('#exporterIncludeAlert').is(':checked'));
        setStorage('exporter_alertMin', ddl.val());
    };

    function startup() {
        prepareInputs();
        recallSettings();
        updateTotalToExport();
        refreshAlert();
        attachHandlers();
    }

    startup();

    return {
        updateYear: setByYear,
        special: _specialDays
    };
}