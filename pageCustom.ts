/* global addSamples */
var PageCustom = () => {

  //var _maxToUseAsSamples: number = 3;
  var _currentEditId: number = 0;
  var _currentUseForSample: boolean = false;
  var _samplesAddedToFirstPage: boolean = false;
  var _itemsForDefaultSelects: any[] = [];

  function preparePartsList() {
    var parts = [];
    var source = shallowCloneOf(_di);
    var partsToSkip = ';upcomingHtml;bNow;frag1SunTimes;frag2SunTimes;frag1;frag2;currentTime;stamp;';

    for (var partName in source) {
      if (source.hasOwnProperty(partName)) {
        if (partsToSkip.search(';' + partName + ';') !== -1) {
          continue;
        }

        parts.push({
          name: partName,
          type: typeof source[partName]
        });
      };
    }

    parts.sort((a, b) => (a.name < b.name ? -1 : 1));

    var template = '<div><span class=customPart>#{name}*</span>' +
      '<button type=button class=button>Add</button>' +
      '<span class="customPartSample part_{type}" data-part="#{name}*"></span></div>';
    var html = template.filledWithEach(parts).replace(/\#/g, '{').replace(/\*/g, '}');

    $('#partsList').html(html);

    setTimeout(() => {
      showForCurrentDate();
    }, 0);
  };

  function showForCurrentDate() {
    $('#partsList .customPartSample, .customFormats .customSample').each(function (i, el) {
      var span = $(el);
      var part = span.data('part');
      span.html(part.filledWith(_di));
    });
    updateActive();
    updateFirstPageSamples();
    updateDefaultDropdowns();
  }

  function inputChanged() {
    updateActive();
  }

  function updateActive() {
    var rawSource = $('#customBuilderInput');
    var rawText = rawSource.val();
    _nextFilledWithEach_UsesExactMatchOnly = true;
    var converted = rawText.filledWith(_di);
    _nextFilledWithEach_UsesExactMatchOnly = false;

    var echo = $('#customBuilderEcho');
    echo.html(converted || '&nbsp;');

    var hasError = converted.search(/{/) !== -1 || converted.search(/}/) !== -1;
    rawSource.toggleClass('hasError', hasError);

    updateEditButtons();
  }


  function addPart(ev: JQueryEventObject) {
    var btn = $(ev.target);
    var template = btn.next().data('part');
    var input = $('#customBuilderInput');

    var rawInput = input[0];

    var startPos = rawInput.selectionStart;
    var endPos = rawInput.selectionEnd;
    if (endPos === rawInput.value.length && endPos > 0) {
      template = ' ' + template; // if at the end of the input, add a space
    }

    var before = rawInput.value.substring(0, startPos);
    rawInput.value = before + template + rawInput.value.substring(endPos, rawInput.value.length);

    input.focus().trigger('change');

    rawInput.selectionStart =
      rawInput.selectionEnd = startPos + template.length;

  }

  function saveEdits() {
    var editInput = $('#customBuilderInput');
    var value = editInput.val();

    if (!value && !_currentEditId) {
      return;
    }

    var data = {
      f: value,
      checked: _currentUseForSample ? 'checked' : ''
    };

    var templateDiv = getCustomSample();
    _nextFilledWithEach_UsesExactMatchOnly = true;
    var newDiv = $(templateDiv.filledWith(data));
    _nextFilledWithEach_UsesExactMatchOnly = false;

    var sample = newDiv.find('.customSample');
    sample.html(data.f.filledWith(_di));

    if (!_currentEditId) {
      newDiv.addClass('inEdit');
      $('.customFormats').append(newDiv);
      _currentEditId = renumberSamples();
    } else {
      var id = 'customFormat_' + _currentEditId;
      newDiv.attr('id', id);

      $('#' + id).replaceWith(newDiv);
    }


    saveFormats();
    updateEditButtons();
  }

  function renumberSamples(): number {
    var lastNum = 0;
    $('.customFormats .customFormatDiv').each(function (i, el) {
      lastNum = 1 + i;
      el.id = 'customFormat_' + lastNum;
    });
    return lastNum;
  }

  function deleteSample(ev) {
    var div = $('#customFormat_' + _currentEditId);
    div.remove();

    cancelEditing();
    saveFormats();
  }

  function copySample(ev) {
    var btn = $(ev.target);
    var div = btn.closest('.customFormatDiv');

    var format = div.find('.customFormat').html();

    tracker.sendEvent('customSample', format);

    var text = div.find('.customSample').html();
    $('#sampleCopy').val(text).focus().select();
    document.execCommand('copy');

    btn.text(getMessage('copied'));
    setTimeout(function () {
      btn.text(getMessage('customBtnCopy'));
    }, 1000);
  }

  function editSample(ev) {
    var btn = $(ev.target);
    var div = btn.closest('.customFormatDiv');

    $('.customFormats .customFormatDiv').removeClass('inEdit');
    div.addClass('inEdit');

    // remember setting while editing
    _currentEditId = +div.attr('id').split('_')[1];
    _currentUseForSample = div.find('.customIsSample input').is(':checked');

    $('#customBuilderInput').val(div.find('.customFormat').html()).trigger('change');
    updateEditButtons();
  }

  function loadCustom(ev) {
    cancelEditing();

    var btn = $(ev.target);
    $('#customBuilderInput').val(btn.data('format')).trigger('change');

    updateEditButtons();
  }

  function updateEditButtons() {
    var notEditing = !_currentEditId;
    var notEditingAndBlank = notEditing && $('#customBuilderInput').val() === '';

    $('#btnCustomBuilderSave').prop('disabled', notEditingAndBlank);
    $('#btnCustomBuilderDelete').prop('disabled', notEditing);
    $('#btnCustomBuilderCancel').prop('disabled', notEditingAndBlank);
  }

  function cancelEditing() {
    $('.customFormats .customFormatDiv').removeClass('inEdit');
    _currentEditId = 0;
    _currentUseForSample = false;
    $('#customBuilderInput').val('').removeClass('hasError');
    $('#customBuilderEcho').html('&nbsp;');
    updateEditButtons();
  }

  function addFromFirstPage(letter: string, format: string) {
    var button = '<button type=button class="button btnLoadCustom" data-format="'
      + format
      + '">' + letter + '</button>';
    $('.customLettersFromFirstPage').append(button);


    if (!_samplesAddedToFirstPage) {
      _itemsForDefaultSelects.push({
        letter: letter,
        format: format
      });
    }
  }

  function clearFromFirstPage() {
    $('.customLettersFromFirstPage').html('');
  }

  function updateFirstPageSamples(forceRefresh?: boolean) {
    if (!_samplesAddedToFirstPage || forceRefresh) {
      addSamplesToFirstPage();
    }

    $('#sampleList2 span').each(function (i, el) {
      var span = $(el);
      span.html(span.data('template').filledWith(_di));
    });
  }

  function addSamplesToFirstPage() {
    var selected = [];
    var nextItemNumber = 1 + $('#sampleList1 > div').length;
    if (nextItemNumber === 1) {
      addSamples(_di);
      return;
    }

    $('.customFormats .customFormatDiv').each(function (i, el) {
      var div = $(el);
      var span = div.find('.customIsSample span');
      var checked = div.find('.customIsSample input').is(':checked');

      if (nextItemNumber > 26) {
        div.find('.customIsSample input').prop('checked', false);
        checked = false;
      }

      if (!checked) {
        span.html('');
        return;
      }

      var letter = String.fromCharCode(64 + nextItemNumber);
      span.html(letter);

      selected.push({
        currentNote: '',
        letter: letter,
        tooltip: getMessage('pressKeyOrClick', letter),
        template: div.find('.customFormat').text()
      });

      nextItemNumber++;
    });

    _nextFilledWithEach_UsesExactMatchOnly = true;
    var host = $('#samples').find('#sampleList2');
    host.html(('<div><button title="{tooltip}"'
      + ' type=button data-letter={letter} id="key{letter}">{letter}{currentNote}</button>'
      + ' <span data-template="{template}"></span></div>').filledWithEach(selected));
    host.toggleClass('hasSamples', selected.length > 0);

    if (!_samplesAddedToFirstPage) {
      fillSelectForDefaults();
    }
    _samplesAddedToFirstPage = true;
  }

  function saveFormats() {
    var formats = [];
    $('.customFormats .customFormatDiv').each(function (i, el) {
      var div = $(el);
      formats.push({
        f: div.find('.customFormat').text(),
        s: div.find('.customIsSample input').is(':checked')
      });
    });
    setStorage('customFormats', formats);

    chrome.storage.local.set({
      customFormats: formats
    }, function () {
      console.log('stored formats with local');
      if (chrome.runtime.lastError) {
        console.log(chrome.runtime.lastError);
      }
    });
    if (browserHostType === browser.Chrome) {
      chrome.storage.sync.set({
        customFormats: formats
      }, function () {
        console.log('stored stored with sync');
        if (chrome.runtime.lastError) {
          console.log(chrome.runtime.lastError);
        }
      });
    }
    updateFirstPageSamples(true);
    fillSelectForDefaults();
  }


  function loadFormatsFromSync() {
    var localLoad = function () {
      chrome.storage.local.get({
        customFormats: []
      }, function (info: any) {
        if (chrome.runtime.lastError) {
          console.log(chrome.runtime.lastError);
        }

        if (info.customFormats.length) {
          console.log('formats loaded from local: ' + info.customFormats.length);
          recallSettings(info.customFormats);
        } else {
          console.log('loading from local.storage');
          recallSettings();
        }
      });
    }

    if (browserHostType === browser.Chrome) {

      chrome.storage.sync.get({
        customFormats: []
      }, function (info: any) {
        if (chrome.runtime.lastError) {
          console.log(chrome.runtime.lastError);
        }

        if (info.customFormats.length) {
          console.log('formats loaded from sync: ' + info.customFormats.length);
          recallSettings(info.customFormats);
        } else {
          localLoad();
        }
      });
    } else {
      localLoad();
    }
  }

  function getCustomSample(): string {
    return $('#customSampleTemplate').html().replace('data-x=""', '{checked}');
  }

  function recallSettings(formats?: any) {
    formats = formats || getStorage('customFormats', []);
    if (formats && formats.length) {
      $.each(formats, function (i, el) {
        el.checked = el.s ? 'checked' : '';
        //log(el);
      });

      var templateDiv = getCustomSample();
      _nextFilledWithEach_UsesExactMatchOnly = true;
      var result = templateDiv.filledWithEach(formats);
      _nextFilledWithEach_UsesExactMatchOnly = false;

      $('.customFormats').html(result);

      setTimeout(() => {
        addSamplesToFirstPage();
        showForCurrentDate();
      }, 0);
      renumberSamples();
      updateEditButtons();
    }
  };

  function isSampleChanged() {
    saveFormats();
    updateEditButtons();
  }

  function attachHandlers() {
    $('#customBuilderInput').on('change keyup paste', inputChanged);
    $('#partsList').on('click', 'button', addPart);
    $('.customFormats').on('click', '.btnCopy', copySample);
    $('.customFormats').on('click', '.btnEdit', editSample);
    $('.customFormats').on('change', '.cbIsSample', isSampleChanged);
    $('#pageCustom').on('click', '.btnLoadCustom', loadCustom);
    $('#btnCustomBuilderSave').on('click', saveEdits);
    $('#btnCustomBuilderCancel').on('click', cancelEditing);
    $('#btnCustomBuilderDelete').on('click', deleteSample);
    $('#customLoadTopDay').on('change', saveTopDayFormat);
    $('#customLoadToolTip1').on('change', saveTopToolTipFormat1);
    $('#customLoadToolTip2').on('change', saveTopToolTipFormat2);
  };

  function fillSelectForDefaults() {
    // each item in list is:  letter:'A',format:'{format}'
    fillSelectDefault('customLoadToolTip1', 'formatToolTip1', getMessage('formatIconToolTip'));
    fillSelectDefault('customLoadToolTip2', 'formatToolTip2', getMessage('nearestSunset'));
    fillSelectDefault('customLoadTopDay', 'formatTopDay', getMessage('bTopDayDisplay'));
    updateDefaultDropdowns();
  }

  function fillSelectDefault(id: string, storageId: string, message: string) {
    var defaultFormat = message;
    var defaultFound: boolean;
    var optionsHtml: string[] = ['<optgroup label="{0}">'.filledWith(getMessage('standardFormats'))];

    $.each(_itemsForDefaultSelects, function (i, el) {
      var format = el.format;
      var isDefault = false;
      if (format === defaultFormat) {
        defaultFound = true;
        isDefault = true;
      }
      optionsHtml.push('<option value="' + format.replace(/"/g, '&quot;') + '" data-prefix="' + (isDefault ? getMessage("defaultFormat") : '') + el.letter + ' - " data-format="' + format + '"></option>');
    });
    optionsHtml.push('</optgroup>');

    // add local custom formats
    var formats = getStorage('customFormats', []);
    if (formats.length > 0) {
      optionsHtml.push('<optgroup label="{0}">'.filledWith(getMessage('customFormats')));

      $.each(formats, function (i, el) {
        var format = el.f;
        optionsHtml.push('<option value="' + format.replace(/"/g, '&quot;') + '" data-prefix="' + (i + 1) + ' - " data-format="' + format + '"></option>');
      });

      optionsHtml.push('</optgroup>');
    }

    // fill select
    var ddl = $('#' + id)
      .html((defaultFound ? '' : '<option value="' + defaultFormat + '" data-prefix="Default - " data-format="' + defaultFormat + '"></option>')
            + optionsHtml.join(''));
    ddl.val(getStorage(storageId, ''));

    if (!ddl.val()) {
      ddl.val(defaultFormat);
    }
  }

  function saveTopToolTipFormat1(ev: JQueryInputEventObject) {
    setStorage('formatToolTip1', $(ev.target).find('option:selected').data('format'));
    showIcon();
  }

  function saveTopToolTipFormat2(ev: JQueryInputEventObject) {
    setStorage('formatToolTip2', $(ev.target).find('option:selected').data('format'));
    showIcon();
  }

  function saveTopDayFormat(ev: JQueryInputEventObject) {
    setStorage('formatTopDay', $(ev.target).find('option:selected').data('format'));
    showInfo(_di);
  }

  function updateDefaultDropdowns() {
    $('.customLoadDefaults option').each(function (i, el) {
      var option = $(el);
      option.html(option.data('prefix') + option.data('format').filledWith(_di));
    });
  }

  function startup() {
    recallSettings(); // do local storage quickly... let sync storage overwrite later
    preparePartsList();
    loadFormatsFromSync();
    attachHandlers();
    $('.customSelect').html(getMessage('customSelectForFrontPage').filledWith(getMessage('pick_pageDay')));
  }

  startup();

  return {
    updateDate: showForCurrentDate,
    updateFirstPage: updateFirstPageSamples,
    clearFromFirstPage: clearFromFirstPage,
    addFromFirstPage: addFromFirstPage
  };
}
