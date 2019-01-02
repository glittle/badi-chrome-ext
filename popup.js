/* Code by Glen Little */
/* global getStorage */
/* global getMessage */
/* global knownDateInfos */
/* global di */
/* global _initialDiStamp */
/* global _currentPageId */
/* global chrome */
/* global _languageCode */
/* global $ */
var _showingInfo = false;
var _changingBDate = false;
var _currentPageNum = 0;
var _cal1 = null;
var _cal2 = null;
var _cal3 = null;
var _calWheel = null;
var _calGreg = null;
var _pageReminders = null;
var _pageExporter = null;
var _pagePlanner = null;
var _pageCustom = null;
var _enableSampleKeys = true;
var _enableDayKeysLR = true;
var _enableDayKeysUD = true;
var _upDownKeyDelta = null;
var _pageHitTimeout = null;
var _initialStartupDone = false;
var _loadingNum = 0;
var _lastLoadingTime = null;
var _lastLoadingComment = null;
var _inTab = false;
var _pageIdList = [];
var _inPopupPage = true;

var _remindersEnabled = browserHostType === browser.Chrome;

function attachHandlers() {
    $('#samples').on('click', 'button', copySample);
    $('.btnChangeDay').on('click', changeDay);
    $('.btnChangeYear').on('click', changeYear);

    $('.btnJumpTo').on('click', moveDays);
    $('.btnJumpToday').on('click', function() {
        changeDay(null, 0);
    });
    $('.jumpTo').val(getStorage('jumpTo', '90'));

    $('.bDatePickerInputs input, .bYearPicker').on('change paste keydown keypress', changeToBDate);
    $('.bKullishayPicker, .bVahidPicker, .bYearInVahidPicker').on('change paste keydown keypress', changeInVahid);

    $('#btnEveOrDay').on('click', toggleEveOrDay);
    $('#datePicker').on('change', jumpToDate);
    $('#eventStart').on('change', function() {
        setStorage('eventStart', $(this).val());
        _lastSpecialDaysYear = 0;
        BuildSpecialDaysTable(_di);
        $('.eventTime').effect("highlight", 1000);
    });
    $('.includeThis').on('change, click', SetFiltersForSpecialDaysTable);

    $('.btnRetry').on('click', function() {
        $('.setupPlace .place').text(''); //blank the copy on the setup page
        $('.btnRetry').addClass('active').blur();
        startGettingLocation();

    });
    $('#datePicker').on('keydown', function(ev) {
        ev.stopPropagation();
    });
    $('.selectPages').on('click', 'button', changePage);
    $(document).on('keydown', keyPressed);
    //$('#btnOpen').click(function () {
    //  chrome.tabs.create({ active: true, url: this.href });
    //});

    $('#cbShowPointer').on('change', function() {
        setStorage('showPointer', $(this).prop('checked'));
        _calWheel.showCalendar(_di);
    });

    //chrome.alarms.onAlarm.addListener(function (alarm) {
    //  console.log(alarm.name);
    //  console.log(new Date(alarm.scheduledTime));
    //  chrome.alarms.clear(alarm.name, function (wasCleared) { console.log(wasCleared); });
    //  refreshDateInfoAndShow();
    //});

    $('#btnOpen').click(openInTab);
    $('#btnPrint').click(function() {
        window.print();
    });

    $('.setupPlace')
        .on('paste keydown keypress', 'input', function() {
            updateLocation(false)
        })
        .on('change', 'input', function() {
            updateLocation(true)
        });

    $('input:radio[name=language]').click(function(ev) {
        settings.useArNames = ev.target.value === 'Ar';
        ApplyLanguage();
    });

    $('#setupLang').on('change', langSelectChanged);
}

function ApplyLanguage() {
    UpdateLanguageBtn();
    setStorage('useArNames', settings.useArNames);
    tracker.sendEvent('useArabic', settings.useArNames);
    knownDateInfos = {};
    resetForLanguageChange();
    refreshDateInfoAndShow();

    // find and update some html
    $('*[data-msg-di]').each(function(i, el) {
        localizeHtml($(el).parent());
    });
}

var sampleNum = 0;
var showInfoDelay = null;

function showInfo(di) {
    _showingInfo = true;
    clearTimeout(showInfoDelay);

    getUpcoming(di);
    updateSpecial(di);

    // show current page first, then the others
    updatePageContent(_currentPageId, di);

    updateSharedContent(di);

    showInfoDelay = setTimeout(function() {
        $.each(_pageIdList, function(i, id) {
            if (id !== _currentPageId) {
                updatePageContent(id, di);
            }
        });
    }, 500);

    $('#day, #gDay').toggleClass('notToday', _di.stamp !== _initialDiStamp.stamp);

    _showingInfo = false;
}

function resetForLanguageChange() {
    setupLanguageChoice();
    _lastSpecialDaysYear = 0;
    $.each(_pageIdList, function(i, id) {
        resetPageForLanguageChange(id);
    });
}

function updateSpecial(di) {
    $('#special1').hide();
    $('#special2').hide();
    if (di.special1) {
        $('#special1').html(di.special1).show();
        $('#day').addClass('withSpecial');
        if (di.special2) {
            $('#special2').html(' - ' + di.special2).show();
        }
    } else {
        $('#day').removeClass('withSpecial');
    }
}

function updateSharedContent(di) {
    $('#day').html(getStorage('formatTopDay', getMessage('bTopDayDisplay')).filledWith(di));
    $('#sunset').html(di.nearestSunset);
    $('#gDay').html(getMessage('gTopDayDisplay', di));

    if (!_changingBDate) {
        $('.bYearPicker').val(di.bYear);
        $('#bMonthPicker').val(di.bMonth);
        $('#bDayPicker').val(di.bDay);
        $('.bKullishayPicker').val(di.bKullishay);
        $('.bVahidPicker').val(di.bVahid);
        $('.bYearInVahidPicker').val(di.bYearInVahid);
    }

    var manifest = chrome.runtime.getManifest();
    $('#version').text(getMessage('version', manifest.version));

    //if (_initialStartupDone) {
    //  BuildSpecialDaysTable(di);
    //}

    if (getStorage('locationNameKnown', false)) {
        showLocation();
    } else {
        startGetLocationName();
    }
}

function changePage(ev, delta) {

    if (ev) {
        var btn = $(ev.target);
        var id = btn.data('page');
        showPage(id);
    } else {
        var pageButtons = $('.selectPages button').filter(':visible');
        var lastPageNum = pageButtons.length - 1;
        var num = _currentPageNum;

        switch (delta) {
            case -1:
                if (num > 0) {
                    num -= 1;
                } else {
                    num = lastPageNum;
                }
                break;
            case 1:
                if (num < lastPageNum) {
                    num += 1;
                } else {
                    num = 0;
                }
                break;
        }

        showPage(pageButtons.eq(num).data('page'));
    }
}

function showPage(id) {
    id = id || _currentPageId || 'pageDay';
    var pages = $('.page');
    var btns = $('.selectPages button').filter(':visible');
    var thisPage = pages.filter('#' + id);

    pages.css({
        visibility: 'hidden'
    }); // reduce flicker?

    var other = '.vahidInputs'; // don't fit on any page... likely need to remove it
    var pageDay = '#gDay, #showUpcoming, .explains, .normal, #show, .iconArea, #special';
    var pageEvents = '#yearSelector, .iconArea, #specialDaysTitle';
    var pageCal1 = '#yearSelector, .JumpDays, #show, #gDay, #special';
    var pageCalWheel = '#yearSelector, #show, #gDay, #special, .iconArea';
    var pageCalGreg = '#yearSelector, .JumpDays, #show, #gDay, #special, .iconArea, .monthNav';
    var pageCal2 = '#yearSelector, .JumpDays, #show, #gDay, #special, .iconArea, .monthNav';
    var pageCal3 = '#yearSelector, .JumpDays, #show, #gDay, #special, .iconArea, .monthNav';
    var pageLists = '#gDay, #show, .iconArea, #special';
    var pageFast = '#yearSelector, .iconArea';
    var pageReminders = '.iconArea, #otherPageTitle';
    var pageExporter = '#yearSelector, .iconArea, #otherPageTitle';
    var pagePlanner = '.iconArea, #otherPageTitle';
    var pageCustom = '#yearSelector, .JumpDays, #show, #gDay, .iconArea, #special';
    var pageSetup = '#otherPageTitle, .iconArea';

    $([other, pageDay, pageEvents, pageCal1, pageCalWheel, pageCalGreg, pageCal2, pageCal3, pageLists, pageFast, pageReminders, pageExporter, pagePlanner, pageSetup].join(',')).hide();

    _currentPageId = id;
    btns.each(function(i, el) {
        if ($(el).data('page') === id) {
            _currentPageNum = i;
            return false;
        }
    });

    if (thisPage.data('diStamp') !== _di.stamp) {
        updatePageContent(_currentPageId, _di);
        thisPage.data('diStamp', _di.stamp);
    }

    $('body').attr('data-pageid', id);
    switch (id) {
        case 'pageDay':
            $(pageDay).show();
            _enableSampleKeys = true;
            _enableDayKeysLR = true;
            _enableDayKeysUD = false;
            break;

        case 'pageEvents':
            $(pageEvents).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = false;
            _enableDayKeysUD = false;
            break;

        case 'pageCal1':
            $(pageCal1).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = true;
            _enableDayKeysUD = true;
            _upDownKeyDelta = function() {
                return 19;
            }
            break;

        case 'pageCalWheel':
            $(pageCalWheel).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = true;
            _enableDayKeysUD = false;
            break;

        case 'pageCalGreg':
            $(pageCalGreg).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = true;
            _enableDayKeysUD = true;
            _upDownKeyDelta = function() {
                return 7;
            }
            break;

        case 'pageCal2':
            $(pageCal2).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = true;
            _enableDayKeysUD = true;
            _upDownKeyDelta = function(direction) {
                var bDay = _di.bDay;
                var bMonth = _di.bMonth;
                if (bMonth === 0) {
                    if (direction === -1) {
                        return 6;
                    }
                    //log(holyDays.daysInAyyamiHa(_di.bYear));
                    return holyDays.daysInAyyamiHa(_di.bYear) - (bDay > 3 ? (1 + holyDays.daysInAyyamiHa(_di.bYear) - bDay) : 0);
                }
                switch (direction) {
                    case -1: // up
                        if (bDay <= 3) {
                            if (bMonth === 19) {
                                return holyDays.daysInAyyamiHa(_di.bYear);
                            }
                            return 6;
                        }
                        if (bDay <= 6) {
                            return 3;
                        }
                        if (bDay <= 11) {
                            return 4;
                        }
                        if (bDay <= 12) {
                            return 5;
                        }
                        return 6;

                    case 1: // down
                        if (bDay <= 3) {
                            return 3;
                        }
                        if (bDay <= 7) {
                            return 4;
                        }
                        if (bDay <= 16) {
                            return 6;
                        }
                        return (19 + (bMonth === 18 ? holyDays.daysInAyyamiHa(_di.bYear) : 3)) - bDay;
                }
                return 0;
            }
            break;

        case 'pageCal3':
            $(pageCal3).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = true;
            _enableDayKeysUD = true;
            _upDownKeyDelta = function(direction) {
                // var bDay = _di.bDay;
                // var bMonth = _di.bMonth;
                // if (bMonth === 0) {
                //     if (direction === -1) {
                //         return 7;
                //     }
                //     //log(holyDays.daysInAyyamiHa(_di.bYear));
                //     return holyDays.daysInAyyamiHa(_di.bYear) - (bDay > 3 ? (1 + holyDays.daysInAyyamiHa(_di.bYear) - bDay) : 0);
                // }
                switch (direction) {
                    case -1: // up
                        return 7;

                    case 1: // down
                        return 7;
                }
                return 0;
            }
            break;

        case 'pageLists':
            $(pageLists).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = true;
            _enableDayKeysUD = false;
            break;

        case 'pageFast':
            $(pageFast).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = false;
            _enableDayKeysUD = false;
            break;

        case 'pageReminders':
            $(pageReminders).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = false;
            _enableDayKeysUD = false;
            break;

        case 'pageExporter':
            $(pageExporter).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = true;
            _enableDayKeysUD = false;
            break;

        case 'pagePlanner':
            $(pagePlanner).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = false;
            _enableDayKeysUD = false;
            break;

        case 'pageCustom':
            $(pageCustom).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = true;
            _enableDayKeysUD = true;
            break;

        case 'pageSetup':
            $(pageSetup).show();
            _enableSampleKeys = false;
            _enableDayKeysLR = false;
            _enableDayKeysUD = false;
            break;


    }

    btns.removeClass('showing');
    btns.filter('*[data-page="{0}"]'.filledWith(id)).addClass('showing');

    thisPage.show();
    pages.not(thisPage).hide();
    pages.css({
        visibility: 'visible'
    });

    updatePageContentWhenVisible(_currentPageId, _di);

    setStorage('focusPage', id);
    setStorage('focusTimeAsOf', new Date().getTime());

    clearTimeout(_pageHitTimeout);

    // delay a bit, to ensure we are not just moving past this page
    if (tracker) {
        _pageHitTimeout = setTimeout(function() {
            tracker.sendAppView(id);
        }, 500);
    }
}

function updatePageContentWhenVisible(id, di) {
    switch (id) {
        case 'pageCal1':
            $('#otherPageTitle').html(getMessage('yearWithEra', di));
            break;

        case 'pageDay':
            adjustHeight();
            break;

        case 'pageEvents':
            BuildSpecialDaysTable(_di);
            break;

        case 'pageCalGreg':
            if (_calGreg) {
                _calGreg.scrollToMonth(di.currentMonth);
            }
            break;

        case 'pageCal2':
            if (_cal2) {
                _cal2.scrollToMonth(di.bMonth, true);
            }
            break;

        case 'pageCal3':
            if (_cal3) {
                _cal3.scrollToMonth(di.bMonth, true);
            }
            break;

        case 'pageReminders':
            $('#otherPageTitle').html(getMessage('pick_pageReminders'));
            if (_pageReminders) {
                _pageReminders.showReminders();
            }
            break;

        case 'pageExporter':
            $('#otherPageTitle').html(getMessage('exporterTitle'));
            break;

        case 'pagePlanner':
            $('#otherPageTitle').html(getMessage('plannerTitle'));
            break;

        case 'pageSetup':
            $('#otherPageTitle').html(getMessage('pick_pageSetup'));
            break;

            //        case 'pageCustom':
            //            break;

    }

}

function resetPageForLanguageChange(id) {
    switch (id) {
        case 'pageCal1':
            if (_cal1) {
                _cal1.resetPageForLanguageChange();
            }
            break;
        case 'pageCalWheel':
            if (_calWheel) {
                _calWheel.resetPageForLanguageChange();
            }
            break;
        case 'pageCalGreg':
            if (_calGreg) {
                _calGreg.resetPageForLanguageChange();
            }
            break;
        case 'pageCal2':
            if (_cal2) {
                _cal2.resetPageForLanguageChange();
            }
            break;
        case 'pageCal3':
            if (_cal3) {
                _cal3.resetPageForLanguageChange();
            }
            break;
        case 'pagePlanner':
            if (_pagePlanner) {
                _pagePlanner.resetPageForLanguageChange();
            }
            break;

    }
}

function updatePageContent(id, di) {
    switch (id) {
        case 'pageDay':
            var makeObj = function(key, name) {
                return {
                    name: name || getMessage(key, di),
                    value: getMessage(key + 'Format', di)
                };
            };
            var dayDetails = [
                makeObj('DayOfWeek'), makeObj('DayOfMonth'), {
                    name: getMessage('Month'),
                    value: getMessage(di.bMonth ? 'MonthFormatNormal' : "MonthFormatAyyam", di)
                },
                makeObj('YearOfVahid'), makeObj('Vahid', di.VahidLabelPri), makeObj('Kullishay', di.KullishayLabelPri), makeObj('YearOfEra')
            ];
            var explain1 = getMessage('shoghiExample', di);
            var explain2 = getMessage('example2', di);

            $('#upcoming').html(di.upcomingHtml);

            $('#explain').html(explain1);
            $('#explain2').html(explain2);
            $('#ayyamIs0').html(getMessage('ayyamIs0').filledWith(bMonthNamePri[0]));
            $('#dayDetails').html('<dl>' + '<dt>{^name}</dt><dd>{^value}</dd>'.filledWithEach(dayDetails) + '</dl>');

            $('#gDate').html(getMessage('gregorianDateDisplay', di));
            $('#gDateDesc').html('({^currentRelationToSunset})'.filledWith(di));
            $('button.today').toggleClass('notToday', di.stamp !== _initialDiStamp.stamp);
            $('#datePicker').val(di.currentDateString);

            addSamples(di);

            break;

        case 'pageEvents':
            BuildSpecialDaysTable(_di);
            break;

        case 'pageCal1':
            if (_cal1) {
                _cal1.showCalendar(di);
            }
            break;

        case 'pageCalWheel':
            if (_calWheel) {
                _calWheel.showCalendar(di);
            }
            break;

        case 'pageCalGreg':
            if (_calGreg) {
                _calGreg.showCalendar(di);
            }
            break;

        case 'pageCal2':
            if (_cal2) {
                _cal2.showCalendar(di);
            }
            break;

        case 'pageCal3':
            if (_cal3) {
                _cal3.showCalendar(di);
            }
            break;

        case 'pageLists':
            $('#pageLists table tr.selected').removeClass('selected');
            $('#pageLists table tr.selectedDay').removeClass('selectedDay');

            $('.yearListNum{bYearInVahid}, .monthListNum{bMonth}'.filledWith(di)).addClass('selected');
            if (di.bMonth !== 0) {
                $('.dayListNum{bDay}, .weekdayListNum{bWeekday}'.filledWith(di)).addClass('selectedDay');
            } else {
                // ayyam-i-ha
                $('.weekdayListNum{bWeekday}'.filledWith(di)).addClass('selectedDay');
            }

            break;

        case 'pageFast':
            BuildSpecialDaysTable(_di);
            break;

        case 'pageReminders':
            //if (_pageReminders) {
            //  _pageReminders.showReminders();
            //}
            break;

        case 'pageExporter':
            if (_pageExporter) {
                _pageExporter.updateYear(true);
            }
            break;

        case 'pagePlanner':
            if (_pagePlanner) {
                //_pagePlanner.updateYear(true);
            }
            break;

        case 'pageCustom':
            if (_pageCustom) {
                _pageCustom.updateDate();
            }
            break;
    }
}

function changeInVahid(ev) {
    if (_showingInfo) {
        return;
    }

    ev.cancelBubble = true;
    ev.stopPropagation();
    if (ev.type === 'keydown') {
        return; // wait for keypress
    }

    var bKullishay = $('.bKullishayPicker').val();
    if (bKullishay === '') return;
    bKullishay = +bKullishay;

    var bVahid = $('.bVahidPicker').val();
    if (bVahid === '') return;
    bVahid = +bVahid;

    var bYearInVahid = $('.bYearInVahidPicker').val();
    if (bYearInVahid === '') return;
    bYearInVahid = +bYearInVahid;

    var maxKullishay = 3;

    // fix to our supported range
    if (bYearInVahid < 1) {
        bVahid--;
        if (bVahid < 1) {
            bKullishay--;
            if (bKullishay < 1) {
                bKullishay = 1;
            } else {
                bVahid = 19;
                bYearInVahid = 19;
            }
        } else {
            bYearInVahid = 19;
        }
    }
    if (bYearInVahid > 19) {
        bVahid++;
        if (bVahid > 19) {
            bKullishay++;
            if (bKullishay > maxKullishay) {
                bKullishay = maxKullishay;
            } else {
                bVahid = 1;
                bYearInVahid = 1;
            }
        } else {
            bYearInVahid = 1;
        }
    }

    if (bVahid < 1) {
        bKullishay--;
        if (bKullishay < 1) {
            bKullishay = 1;
        } else {
            bVahid = 19;
        }
    }
    if (bVahid > 19) {
        bKullishay++;
        if (bKullishay > maxKullishay) {
            bKullishay = maxKullishay;
        } else {
            bVahid = 1;
        }
    }

    if (bKullishay < 1) {
        bKullishay = 1;
    }
    if (bKullishay > maxKullishay) {
        bKullishay = maxKullishay;
    }

    tracker.sendEvent('changeInVahid', bKullishay + '-' + bVahid + '-' + bYearInVahid);

    var year = Math.min(1000, 19 * 19 * (bKullishay - 1) + 19 * (bVahid - 1) + bYearInVahid);
    changeYear(null, null, year);
}

function changeToBDate(ev) {
    if (_showingInfo) {
        return;
    }
    ev.cancelBubble = true;
    ev.stopPropagation();
    if (ev.type === 'keydown') {
        return; // wait for keypress
    }

    var input = $(ev.target);
    var bYear = input.hasClass('bYearPicker') ? input.val() : $('.bYearPicker').val(); // we have 2... use this one
    if (bYear === '') return;
    bYear = +bYear;
    // fix to our supported range
    if (bYear < 1) bYear = 1;
    if (bYear > 1000) bYear = 1000;

    var bMonth = $('#bMonthPicker').val(); // month and day will be fixed by getGDate
    if (bMonth === '') return;

    var bDay = $('#bDayPicker').val();
    if (bDay === '') return;

    tracker.sendEvent('changeToBDate', bYear + '.' + bMonth + '.' + bDay);

    try {
        var gDate = holyDays.getGDate(+bYear, +bMonth, +bDay, true);

        setFocusTime(gDate);

        refreshDateInfo();

        //    _changingBDate = true;
        showInfo(_di);
        _changingBDate = false;

    } catch (error) {
        console.log(error);
    }

}

function addSamples(di) {

    // prepare samples
    clearSamples();

    var msg;
    var notInMessagesJson = '_$$$_';

    if (_pageCustom) {
        _pageCustom.clearFromFirstPage();
    }

    var sampleGroupNum = 1;
    for (var sampleNum = 1; sampleNum < 30; sampleNum++) {
        var key = 'sampleGroup{0}_{1}'.filledWith(sampleGroupNum, sampleNum);
        msg = getMessage(key, di, notInMessagesJson);
        if (msg === notInMessagesJson) {
            continue;
        }
        addSample(msg, getMessage(key), sampleGroupNum);
    }
    if (_pageCustom) {
        _pageCustom.updateFirstPage();
    }

    //$('#sampleFootnote').toggle(showFootnote);
    //<div id=sampleFootnote data-msg="_id_"></div>
}

function keyPressed(ev) {
    if (ev.altKey) {
        return;
    }
    if (ev.target.tagName === 'INPUT' && ev.target.type === 'text') {
        //don't intercept
        return;
    }
    var key = String.fromCharCode(ev.which) || '';
    switch (ev.which) {
        case 65: // Ctrl+Shift+A -- change lang to/from Arabic - mostly for during development and demos, not translatable
            if (ev.shiftKey && ev.ctrlKey) {
                settings.useArNames = !settings.useArNames;
                ApplyLanguage();
                ev.preventDefault();
                return;
            }
            break;

        case 18:
            return; // 08 (ALT) causes a crashes

        case 37: //left
            if (ev.shiftKey) {
                changeYear(null, -1);
                ev.preventDefault();
            } else {
                if (ev.ctrlKey) {
                    changeDay(null, -7);
                    ev.preventDefault();
                } else {
                    if (_enableDayKeysLR) {
                        changeDay(null, -1);
                        ev.preventDefault();
                    }
                }
            }
            return;
        case 39: //right
            if (ev.shiftKey) {
                changeYear(null, 1);
                ev.preventDefault();
            } else {
                if (ev.ctrlKey) {
                    changeDay(null, 7);
                    ev.preventDefault();
                } else {
                    if (_enableDayKeysLR) {
                        changeDay(null, 1);
                        ev.preventDefault();
                    }
                }
            }
            return;

        case 38: //up
            if (_enableDayKeysUD) {
                if (_upDownKeyDelta) {
                    changeDay(null, 0 - _upDownKeyDelta(-1));
                    ev.preventDefault();
                }
            }
            return;
        case 40: //down
            if (_enableDayKeysUD) {
                if (_upDownKeyDelta) {
                    changeDay(null, _upDownKeyDelta(1));
                    ev.preventDefault();
                }
            }
            return;

        case 33: //pgup
            changePage(null, -1);
            ev.preventDefault();
            return;
        case 34: //pgdn
            changePage(null, 1);
            ev.preventDefault();
            return;

        case 36: //home
            changeDay(null, 0);
            ev.preventDefault();
            return;

        case 191: // slash
            toggleEveOrDay(!_di.bNow.eve);
            ev.preventDefault();
            return;
    }

    //log(ev.which);
    if (_enableSampleKeys && !ev.ctrlKey) {
        try {
            var sample = $('#key' + key);
            if (sample.length) {
                sample.trigger('click'); // effective if a used letter is typed
                ev.preventDefault();
            }
        } catch (ex) {
            // ignore jquery error
        }
    }

    if (_currentPageId === 'pageEvents') {
        // don't require ALT...
        try {
            $('input[accessKey=' + key + ']', '#pageEvents').click();
            $('select[accessKey=' + key + ']', '#pageEvents').click();
        } catch (e) {
            // key may have odd symbol in it
        }
    }

    if (key === getMessage('keyToOpenInTab') && ev.shiftKey) {
        openInTab();
    }

    if (ev.target.tagName !== 'INPUT' && ev.target.tagName !== 'TEXTAREA') {
        var pageNum = +key;
        var validPagePicker = key == pageNum; // don't use ===
        if (!validPagePicker) {
            if (key >= 'a' && key <= 'i') {
                pageNum = key.charCodeAt(0) - 96;
                validPagePicker = true;
            }

            var extraKeys;
            switch (browserHostType) {
                case browser.Chrome:
                    extraKeys = {
                        dash: 189,
                        equal: 187
                    };
                    break;
                case browser.Firefox:
                    extraKeys = {
                        dash: 173,
                        equal: 61
                    };
                    break;
            }
            if (ev.which === extraKeys.dash) {
                // -  (next after 8,9,0...)
                pageNum = 11;
                validPagePicker = true;
            }
            if (ev.which === extraKeys.equal) {
                // =  (next after 8,9,0...)
                pageNum = 12;
                validPagePicker = true;
            }
            //log(ev.which);
        }

        if (validPagePicker) {
            if (pageNum === 0) {
                pageNum = 10;
            }
            var pageButtons = $('.selectPages button').filter(':visible');
            if (pageNum > 0 && pageNum <= pageButtons.length) {
                var id = pageButtons.eq(pageNum - 1).data('page');
                showPage(id);
            }
        }
    }

    return;
}

function addSample(info, format, group) {
    sampleNum++;

    var letter = String.fromCharCode(64 + sampleNum);
    var sample = {
        value: '',
        currentTime: false,
        letter: letter,
        tooltip: getMessage('pressKeyOrClick', letter)
    };

    if (typeof info === 'string') {
        sample.value = info;
    } else {
        $.extend(sample, info);
    }
    sample.currentNote = sample.currentTime ? ' *' : '';

    if (_pageCustom) {
        _pageCustom.addFromFirstPage(letter, format);
    }

    // also in pageCustom
    $('#samples').find('#sampleList' + group)
        .append(('<div><button title="{tooltip}"' +
            ' type=button data-letter={letter} id="key{letter}">{letter}{currentNote}</button>' +
            ' <span>{^value}</span></div>').filledWith(sample));
}

function clearSamples() {
    sampleNum = 0;
    var samplesDiv = $('#samples');
    samplesDiv.find('#sampleList1').text('');
    //samplesDiv.find('#sampleList2').text('');
}

function copySample(ev) {
    var btn = $(ev.target);
    var letter = btn.text();
    tracker.sendEvent('sample', letter);

    var div = btn.closest('div');
    var text = div.find('span').text();
    $('#sampleCopy').val(text).focus().select();
    document.execCommand('copy');

    div.addClass('copied');
    btn.text(getMessage('copied'));
    setTimeout(function() {
        div.removeClass('copied');
        btn.text(btn.data('letter'));
        if (!_inTab) {
            window.close();
        }
    }, 1000);
}

function toggleEveOrDay(toEve) {
    setFocusTime(getFocusTime());
    toEve = typeof toEve === 'boolean' ? toEve : !_di.bNow.eve;
    if (toEve) {
        _focusTime.setHours(23, 55, 0, 0);
    } else {
        _focusTime.setHours(12, 0, 0, 0);
    }

    setStorage('focusTimeIsEve', toEve);
    if (tracker) {
        tracker.sendEvent('toggleEveDay', toEve ? 'Eve' : 'Day');
    }

    refreshDateInfo();
    showInfo(_di);
}

function moveDays(ev) {
    var input = $('input.jumpTo');
    var days = +input.val();
    if (!days) {
        days = 0;
        input.val(days);
    } else {
        var min = +input.attr('min');
        if (days < min) {
            days = min;
            input.val(days);
        } else {
            var max = +input.attr('max');
            if (days > max) {
                days = max;
                input.val(days);
            }
        }
    }
    setStorage('jumpTo', days);
    tracker.sendEvent('jumpDays', days);

    if (!days) {
        return;
    }
    var target = new Date(_di.currentTime);
    target.setTime(target.getTime() + days * 864e5);
    setFocusTime(target);
    refreshDateInfo();
    showInfo(_di);
}

function jumpToDate(ev) {
    var date = moment($(ev.target).val()).toDate();
    if (!isNaN(date)) {
        setFocusTime(date);

        refreshDateInfo();
        showInfo(_di);
    }
}

function changeYear(ev, delta, targetYear) {
    delta = ev ? +$(ev.target).data('delta') : +delta;

    var year = targetYear ? targetYear : _di.bYear + delta;
    var gDate = holyDays.getGDate(year, _di.bMonth, _di.bDay, true);
    setFocusTime(gDate);

    tracker.sendEvent('changeYear', delta);

    refreshDateInfo();
    showInfo(_di);
}

function changeDay(ev, delta) {
    delta = ev ? +$(ev.target).data('delta') : +delta;

    if (delta === 0) {
        // reset to real time
        setStorage('focusTimeIsEve', null);
        setFocusTime(new Date());
    } else {
        var time = getFocusTime();
        if (_di.bNow.eve) {
            time.setHours(23, 55, 0, 0);
        } else {
            time.setHours(12, 0, 0, 0);
        }
        time.setDate(time.getDate() + delta);
        setFocusTime(time);
    }

    if (tracker) {
        tracker.sendEvent('changeDay', delta);
    }

    refreshDateInfo();

    if (_di.stamp === _initialDiStamp.stamp) {
        setStorage('focusTimeIsEve', null);
    }

    if (_di.bNow.eve) {
        _focusTime.setHours(23, 55, 0, 0);
    } else {
        _focusTime.setHours(12, 0, 0, 0);
    }

    showInfo(_di);

    if (delta === 0) {
        showWhenResetToNow();
    }
}

function showWhenResetToNow() {
    _initialDiStamp = getDateInfo(new Date(), true);
    if (_cal2) {
        _cal2.showTodayTime();
    }
    if (_cal3) {
        _cal3.showTodayTime();
    }
}

function fillSetup() {
    var optedOut = settings.optedOutOfGoogleAnalytics === true;
    var cb = $('#setupOptOut');
    cb.prop('checked', optedOut);
    cb.on('change', function() {
        var optingOut = cb.prop('checked');
        if (optingOut) {
            tracker.sendEvent('optOut', optingOut);
        }
        setStorage('optOutGa', optingOut);
        settings.optedOutOfGoogleAnalytics = optingOut;

        if (!optingOut) {
            tracker.sendEvent('optOut', optingOut);
        }
    });

    var langInput = $('#setupLang');
    startFillingLanguageInput(langInput);
    // console.log('finished call to start filling')

    var colorInput = $('#setupColor');
    colorInput.val(settings.iconTextColor);
    colorInput.on('change', function() {
        var newColor = colorInput.val();
        setStorage('iconTextColor', newColor);
        settings.iconTextColor = newColor;
        showIcon();
    });

    $('#inputLat').val(localStorage.lat);
    $('#inputLng').val(localStorage.long);

}

function startFillingLanguageInput(select) {
    var langs = [];
    // getMessage('languageList')
    //   .split(splitSeparator)
    //   .forEach(function (s) {
    //     // console.log(s)
    //     var parts = s.split(':', 2);
    //     // console.log(parts)
    //     langs[parts[0]] = parts[parts.length - 1];
    //   });
    // // console.log(langs);

    chrome.runtime.getPackageDirectoryEntry(function(directoryEntry) {
        // console.log('got directory')
        directoryEntry.getDirectory('_locales', {}, function(subDirectoryEntry) {
            // console.log('got subdirectory list')
            var directoryReader = subDirectoryEntry.createReader();
            directoryReader.readEntries(function(entries) {
                // console.log('got entries')
                for (var i = 0; i < entries.length; ++i) {
                    var langToLoad = entries[i].name;

                    var url = "/_locales/" + langToLoad + "/messages.json";
                    $.ajax({
                            dataType: "json",
                            url: url,
                            isLocal: true,
                            async: false
                        })
                        .done(function(messages) {
                            // console.log(langToLoad, messages);
                            var langLocalMsg = messages.rbDefLang_Local;
                            var name = langLocalMsg ? langLocalMsg.message : langToLoad;

                            var enNameMsg = messages.translationEnglishName;
                            var english = enNameMsg ? enNameMsg.message : '';

                            var info = {
                                code: langToLoad,
                                name: name || '',
                                english: english == name || english == langToLoad ? '' : english,
                                pct: Math.round(Object.keys(messages).length / _numMessagesEn * 100)
                            };
                            info.sort = info.english || info.name || info.code;
                            langs.push(info);

                        })
                        .fail(function() {});
                }

                var options = [];
                langs.sort(function(a, b) {
                    return a.sort > b.sort ? 1 : -1;
                });
                for (i = 0; i < langs.length; i++) {
                    var info = langs[i];
                    options.push('<option value={0}>{3}{1} ... {0} ... {2}%</option>'.filledWith(info.code,
                        info.name,
                        info.pct,
                        info.english ? (info.english + ' / ') : ''))
                }
                select.html(options.join(''))
                    // console.log('lang list filled')

                select.val(_languageCode);

                if (select[0].selectedIndex === -1) {
                    // code was not in the list
                    select.val('en');
                }

                var pctSpan = $('#setupLangPct');
                if (select.val() === 'en') {
                    pctSpan.hide();
                } else {
                    var msg = _rawMessageTranslationPct === 100 ?
                        getMessage('setupLangPct100') :
                        getMessage('setupLangPct').filledWith(_rawMessageTranslationPct);
                    pctSpan.html(msg).show();
                }

                langSelectChanged();
            });
        });
    });

}

function langSelectChanged() {
    var select = $('#setupLang');
    var lang = select.val();

    setStorage('lang', lang);

    if (lang === _languageCode) {
        return;
    }

    // reload to apply new language
    // location.reload(false);
    location.href = location.href;
}

var updateLocationTimer = null;

function updateLocation(immediately) {
    if (!immediately) {
        clearTimeout(updateLocationTimer);
        updateLocationTimer = setTimeout(function() {
            updateLocation(true);
        }, 1000);
        return;
    }

    var inputLat = $('#inputLat');
    var lat = +inputLat.val();

    var inputLng = $('#inputLng');
    var lng = +inputLng.val();

    if (lat === 0 || Math.abs(lat) > 85) {
        inputLat.addClass('error');
        lat = 0;
    }
    if (lng === 0 || Math.abs(lng) > 180) {
        inputLng.addClass('error');
        lng = 0;
    }
    if (lat === 0 || lng === 0) {
        return;
    }
    inputLat.removeClass('error');
    inputLng.removeClass('error');

    var changed = false;
    if (_locationLat !== lat) {
        localStorage.lat = _locationLat = lat;
        changed = true;
    }
    if (_locationLong !== lng) {
        localStorage.long = _locationLong = lng;
        changed = true;
    }

    if (changed) {
        knownDateInfos = {};
        setStorage('locationKnown', true);
        setStorage('locationNameKnown', false);
        localStorage.locationName = getMessage('browserActionTitle'); // temp until we get it

        startGetLocationName();

        refreshDateInfoAndShow();
    }
}

function fillStatic() {
    var nameList = [];
    var i;
    for (i = 1; i < bMonthNameAr.length; i++) {
        nameList.push({
            num: i,
            arabic: bMonthNameAr[i],
            meaning: bMonthMeaning[i]
        });
    }
    $('#monthListBody').html('<tr class="dayListNum{num} monthListNum{num}"><td>{num}</td><td>{arabic}</td><td>{meaning}</td></tr>'.filledWithEach(nameList));

    nameList = [];
    for (i = 1; i < bWeekdayNameAr.length; i++) {
        var gDay = i < 2 ? 5 + i : i - 2;
        var eveDay = gDay === 0 ? 6 : gDay - 1;
        nameList.push({
            num: i,
            arabic: bWeekdayNameAr[i],
            meaning: bWeekdayMeaning[i],
            equiv: gWeekdayShort[eveDay] + '/' + gWeekdayLong[gDay]
        });
    }
    $('#weekdayListBody').html('<tr class=weekdayListNum{num}><td>{num}</td><td>{arabic}</td><td>{meaning}</td><td>{equiv}</td></tr>'.filledWithEach(nameList));

    nameList = [];
    for (i = 1; i < bYearInVahidNameAr.length; i++) {
        nameList.push({
            num: i,
            arabic: bYearInVahidNameAr[i],
            meaning: bYearInVahidMeaning[i]
        });
    }
    $('#yearListBody').html('<tr class=yearListNum{num}><td>{num}</td><td>{arabic}</td><td>{meaning}</td></tr>'.filledWithEach(nameList));

}

function fillEventStart() {
    // fill ddl
    var startTime = new Date(2000, 5, 5, 0, 0, 0, 0); // random day
    var startTimes = [];
    for (var h = 1800; h <= 2000; h += 100) {
        for (var m = 0; m <= 30; m += 30) {
            startTime.setHours(h / 100, m);
            startTimes.push({
                v: h + m,
                t: showTime(startTime)
            });
            if (h === 2000) {
                break; // to end at 8pm
            }
        }
    }
    $('#eventStart')
        .html('<option value={v}>{t}</option>'.filledWithEach(startTimes))
        .val(getStorage('eventStart') || '1930');
}

function SetFiltersForSpecialDaysTable(ev) {
    var includeFeasts = $('#includeFeasts').prop('checked');
    var includeHolyDays = $('#includeHolyDays').prop('checked');

    if (!includeFeasts && !includeHolyDays) {
        if (ev) {
            // both turned off?  turn on one
            var clicked = $(ev.target).closest('input').attr('id');
            $(clicked === 'includeFeasts' ? '#includeHolyDays' : '#includeFeasts').prop('checked', true);
        } else {
            //default to holy days
            $('#includeHolyDays').prop('checked', true);
        }
        includeFeasts = $('#includeFeasts').prop('checked');
        includeHolyDays = $('#includeHolyDays').prop('checked');

    }

    setStorage('includeFeasts', includeFeasts);
    setStorage('includeHolyDays', includeHolyDays);
    $('#specialListsTable')
        .toggleClass('Feasts', includeFeasts)
        .toggleClass('HolyDays', includeHolyDays);
}

var _lastSpecialDaysYear = 0;

function BuildSpecialDaysTable(di) {
    var year = di.bNow.y;
    if (_lastSpecialDaysYear === year) {
        return;
    }

    _lastSpecialDaysYear = year;
    var dayInfos = holyDays.prepareDateInfos(year);

    SetFiltersForSpecialDaysTable();

    dayInfos.forEach(function(dayInfo, i) {
        if (dayInfo.Type === 'Today') {
            // an old version... remove Today from list
            dayInfos.splice(i, 1);
            i--;
        }
    });

    var defaultEventStart = $('#eventStart').val() || getStorage('eventStart');

    dayInfos.forEach(function(dayInfo, i) {
        var targetDi = getDateInfo(dayInfo.GDate);
        var tempDate = null;
        dayInfo.di = targetDi;
        dayInfo.D = targetDi.bMonthNamePri + ' ' + targetDi.bDay;
        dayInfo.G = getMessage('evePartOfDay', targetDi);
        dayInfo.Sunset = targetDi.startingSunsetDesc;
        dayInfo.StartTime = null;
        dayInfo.EventTime = null;
        dayInfo.ST = null;
        dayInfo.STClass = null;
        dayInfo.NoWork = null;
        dayInfo.TypeShort = null;
        dayInfo.DefaultTimeClass = null;
        dayInfo.RowClass = null;
        var targetTime = dayInfo.Time || defaultEventStart;

        if (dayInfo.Type === 'M') {
            dayInfo.A = getMessage('FeastOf').filledWith(targetDi.bMonthNameSec);
        }
        if (dayInfo.Type.slice(0, 1) === 'H') {
            dayInfo.A = getMessage(dayInfo.NameEn);
        }
        if (dayInfo.Type === 'HS') {
            dayInfo.NoWork = getMessage('mainPartOfDay', targetDi);
        }
        if (dayInfo.Special && dayInfo.Special.slice(0, 5) === 'AYYAM') {
            dayInfo.A = getMessage(dayInfo.NameEn);
        }

        if (dayInfo.Type === 'Fast') {
            var sunrise = targetDi.frag2SunTimes.sunrise;
            dayInfo.FastSunrise = sunrise ? showTime(sunrise) : '?';
            dayInfo.FastSunset = sunrise ? showTime(targetDi.frag2SunTimes.sunset) : '?';
            dayInfo.FastDay = getMessage('mainPartOfDay', targetDi);
            if (targetDi.frag2Weekday === 6) {
                dayInfo.RowClass = 'FastSat';
            }
        }

        if (targetTime === 'SS2') {
            tempDate = new Date(dayInfo.di.frag1SunTimes.sunset.getTime());
            tempDate.setHours(tempDate.getHours() + 2);
            // about 2 hours after sunset
            var minutes = tempDate.getMinutes();
            minutes = minutes > 30 ? 30 : 0; // start 1/2 hour before
            tempDate.setMinutes(minutes);
            dayInfo.Event = {
                time: tempDate
            };

            dayInfo.StartTime = showTime(dayInfo.Event.time);
            addEventTime(dayInfo.Event);
            dayInfo.EventTime = getMessage('eventTime', dayInfo.Event);
        } else if (targetTime) {
            var adjustDTtoST = 0;
            if (targetTime.slice(-1) === 'S') {
                targetTime = targetTime.slice(0, 4);
                adjustDTtoST = inStandardTime(targetDi.frag1) ? 0 : 1;
            }
            tempDate = new Date(dayInfo.di.frag1.getTime());
            var timeHour = +targetTime.slice(0, 2);
            var timeMin = targetTime.slice(-2);
            tempDate.setHours(timeHour + adjustDTtoST);
            tempDate.setMinutes(timeMin);

            if (targetDi.frag1SunTimes.sunset.getTime() < tempDate.getTime()) {
                //dayInfo.isEve = " *";
            } else {
                tempDate.setHours(tempDate.getHours() + 24);
            }

            dayInfo.Event = {
                time: tempDate
            };
            dayInfo.StartTime = showTime(dayInfo.Event.time);
            addEventTime(dayInfo.Event);
            dayInfo.EventTime = getMessage('eventTime', dayInfo.Event);
        }

        if (dayInfo.Time) {
            if (dayInfo.Type !== 'Today') {
                dayInfo.ST = getMessage('specialTime_' + dayInfo.Time);
                dayInfo.STClass = ' SpecialTime';
            }
        } else {
            dayInfo.DefaultTimeClass = ' Default';
        }

        dayInfo.date = getMessage('upcomingDateFormat', targetDi);

        if (dayInfo.Type.substring(0, 1) === 'H') {
            dayInfo.TypeShort = ' H';
        }
    });

    var rowTemplate = [];
    rowTemplate.push('<tr class="{Type}{TypeShort}{DefaultTimeClass}{STClass}">');
    rowTemplate.push('<td>{D}</td>');
    rowTemplate.push('<td class=name>{A}</td>'); //{STColSpan}
    rowTemplate.push('<td class=forHD>{NoWork}</td>');
    rowTemplate.push('<td class=eventTime>{EventTime}<div class="forHD time">{ST}</div></td>'); // {isEve}
    rowTemplate.push('<td>{G}</td>');
    rowTemplate.push('</tr>');
    $('#specialListBody').html(rowTemplate.join('').filledWithEach(dayInfos.filter(function(el) {
        return el.Type !== 'Fast'
    })));

    $('#specialDaysTitle').html(getMessage('specialDaysTitle', di));


    var fastRowTemplate = [];
    fastRowTemplate.push('<tr class="{RowClass}">');
    fastRowTemplate.push('<td>{D}</td>');
    fastRowTemplate.push('<td class=centered>{FastSunrise}</td>');
    fastRowTemplate.push('<td class=centered>{FastSunset}</td>');
    fastRowTemplate.push('<td>{FastDay}</td>');
    fastRowTemplate.push('</tr>');

    $('#fastListBody')
        .html(fastRowTemplate.join('')
            .filledWithEach(dayInfos.filter(function(el) {
                return el.Type === 'Fast'
            })));

    $('#fastDaysTitle').html(getMessage('fastDaysTitle', di));
}

function showShortcutKeys() {
    if (chrome.commands && browserHostType === browser.Chrome) {
        chrome.commands.getAll(function(cmd) {
            for (var i = 0; i < cmd.length; i++) {
                var a = cmd[i];
                if (a.shortcut) {
                    $('#shortcutKeys').text(a.shortcut);
                };
            };
        });
    }
}

function showLocation() {
    $('.place').html(localStorage.locationName);
    $('#locationErrorHolder').toggle(!getStorage('locationKnown', false));
}

function hideCal1() {
    $('#iFrameCal1').hide();
}

function showCal1() {
    var iframe = $('#iFrameCal1');
    if (iframe.is(':visible')) {
        iframe.hide();
    } else {
        if (!iframe.attr('src')) {
            iframe.attr('src', 'cal1.html').fadeIn();
        } else {
            iframe.show();
        }
    }
}

function adjustHeight() {

    // try to ensure that the tabs are not longer than page1 content
    //var content = $('.mainMiddle');
    //var contentHeight = content.height();
    //var tabsHeight = $('.selectPages').prop('scrollHeight');
    //if (tabsHeight > contentHeight) {
    //  content.css("min-height", (5 + tabsHeight) + 'px');
    //}
}

function prepareDefaults() {
    var feasts = getStorage('includeFeasts');
    var holyDays = getStorage('includeHolyDays');
    if (typeof(feasts) === 'undefined' && typeof(holyDays) === 'undefined') {
        feasts = false;
        holyDays = true;
    }

    $('#includeFeasts').prop('checked', feasts || false);
    $('#includeHolyDays').prop('checked', holyDays || false);

    var showPointer = getStorage('showPointer');
    if (typeof showPointer === 'undefined') {
        showPointer = true;
    }
    $('#cbShowPointer').prop('checked', showPointer);

}

function UpdateLanguageBtn() {
    $('#rbDefLang_' + (settings.useArNames ? 'Ar' : 'Local')).prop('checked', true);
}

function openInTab() {
    if (_inTab) {
        return;
    }
    var url = chrome.extension.getURL('popup.html');

    if (browserHostType === browser.Chrome) {
        chrome.tabs.query({
            url: url
        }, function(foundTabs) {
            if (foundTabs[0]) {
                chrome.tabs.update(foundTabs[0].id, {
                    active: true
                });
            } else {
                chrome.tabs.create({
                    url: url
                });
            }
            window.close();
            tracker.sendEvent('openInTab');
        });
    } else {
        chrome.tabs.create({
            url: url
        });
        window.close();
        tracker.sendEvent('openInTab');
    }
}


function prepare1() {
    $('#loadingMsg').html(getMessage('browserActionTitle'));

    var langCode = _languageCode.slice(0, 2);
    $('body')
        .addClass(_languageCode)
        .addClass(_languageDir)
        .addClass(langCode)
        .addClass(browserHostType)
        .attr('lang', _languageCode)
        .attr('dir', _languageDir);

    _initialDiStamp = getDateInfo(new Date(), true);

    recallFocusAndSettings();

    updateLoadProgress('refresh date info');

    UpdateLanguageBtn();

    updateLoadProgress('defaults');
    prepareDefaults();

    if (_iconPrepared) {
        refreshDateInfo();
    } else {
        refreshDateInfoAndShow();
    }

    var isEve = getStorage('focusTimeIsEve', 'x');
    if (isEve !== 'x' && isEve !== _di.bNow.eve) {
        toggleEveOrDay(isEve);
    }

    updateLoadProgress('localize');
    localizeHtml();

    updateLoadProgress('page custom');
    _pageCustom = PageCustom();

    updateLoadProgress('showInfo');
    showInfo(_di);

    updateLoadProgress('showPage');
    showPage();

    updateLoadProgress('shortcut keys');
    showShortcutKeys();

    updateLoadProgress('handlers');
    attachHandlers();

    updateLoadProgress('btn open');
    showBtnOpen();

    updateLoadProgress('tab names');
    updateTabNames();

    updateLoadProgress('prepare2 soon');

    setTimeout(prepare2, 0);

    // if viewing first page, show now
    if (_currentPageId === 'pageDay') {
        adjustHeight();
        $('#initialCover').hide();
    }
}

function updateTabNames() {
    $('.selectPages button').filter(':visible').each(function(i, el) {
        var tab = $(el);
        tab.html((i + 1) + ' ' + tab.html());
        _pageIdList.push(tab.data('page'));
    });
}

function showBtnOpen() {
    chrome.tabs.getCurrent(function(tab) {
        if (tab) {
            _inTab = true;
            $('body').addClass('inTab');
            $('#btnPrint').show();
        } else {
            $('#btnOpen').show();
        }
    });
}

function finishFirstPopup() {
    $('.buttons').removeClass('fakeHover');
    $('.buttons')
        .off('mouseover', finishFirstPopup);
    setStorage('firstPopup', false);
}

function prepare2() {

    _initialStartupDone = true;

    updateLoadProgress('prepare2 start');
    prepareAnalytics();

    updateLoadProgress('send event');
    tracker.sendEvent('opened');
    tracker.sendAppView(_currentPageId);

    if (getStorage('firstPopup', false)) {
        // first time popup is opened after upgrading to newest version
        $('.buttons')
            .addClass('fakeHover')
            .on('mouseover', finishFirstPopup);
        setTimeout(finishFirstPopup, 4000);
    }

    updateLoadProgress('fill eventStart');
    fillEventStart();

    updateLoadProgress('fill static');
    fillStatic();

    updateLoadProgress('fill setup');
    fillSetup();

    updateLoadProgress('localize');
    localizeHtml('#pageLists');

    updateLoadProgress('cal1');
    _cal1 = Cal1(_di);
    _cal1.showCalendar(_di);

    updateLoadProgress('calWheel');
    _calWheel = CalWheel();
    _calWheel.showCalendar(_di);

    updateLoadProgress('calGreg');
    _calGreg = CalGreg();
    _calGreg.showCalendar(_di);

    updateLoadProgress('cal2');
    _cal2 = Cal2();
    _cal2.showCalendar(_di);

    updateLoadProgress('cal3');
    _cal3 = Cal3();
    _cal3.showCalendar(_di);

    if (_remindersEnabled) {
        updateLoadProgress('reminders');
        _pageReminders = PageReminders();
    }
    $('#btnPageReminders').toggle(_remindersEnabled);

    updateLoadProgress('export & planner');
    _pageExporter = PageExporter();
    _pagePlanner = PagePlanner();

    updateLoadProgress('finish');
    $('#version').attr('href', getMessage(browserHostType + "_History"));
    $('#linkWebStore').attr('href', getMessage(browserHostType + "_WebStore"));
    $('#linkWebStoreSupport').attr('href', getMessage(browserHostType + "_WebStoreSupport"));

    if (_currentPageId !== 'pageDay') {
        adjustHeight();
        $('#initialCover').hide();
    }

    if (_di.stamp !== _initialDiStamp.stamp) {
        highlightGDay();
    }
}

function updateLoadProgress(comment) {
    _loadingNum++;
    //  var time = new Date().getTime();
    //  if (_lastLoadingTime) {
    //    var elapsed = `${_lastLoadingComment} (${time - _lastLoadingTime})`;
    //
    //    console.log(_loadingNum, elapsed);
    //  }
    //  _lastLoadingTime = new Date().getTime();
    //  _lastLoadingComment = comment;

    $('#loadingCount').text(new Array(_loadingNum + 1).join('.'));
}

// must be set immediately for tab managers to see this name
$('#windowTitle').text(getMessage('title'));

$(function() {
    prepare1();
});