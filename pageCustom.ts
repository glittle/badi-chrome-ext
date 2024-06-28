﻿/* global addSamples */
const PageCustom = () => {
  let _currentEditId = 0;
  let _currentUseForSample = false;
  let _samplesAddedToFirstPage = false;
  const _itemsForDefaultSelects: {format: string, letter: string}[] = [];

  function preparePartsList() {
    const parts = [];
    const source = shallowCloneOf(_di);
    const partsToSkip =
      ";upcomingHtml;bNow;frag1SunTimes;frag2SunTimes;frag1;frag2;currentTime;stamp;";

    for (const partName in source) {
      // TODO verify this is correct
      if (Object.prototype.hasOwnProperty.call(source, partName)) {
        if (partsToSkip.search(`;${partName};`) !== -1) {
          continue;
        }

        parts.push({
          name: partName,
          type: typeof source[partName],
        });
      }
    }

    parts.sort((a, b) => (a.name < b.name ? -1 : 1));

    const template =
      "<div><span class=customPart>#{name}*</span>" +
      "<button type=button class=button>Add</button>" +
      '<span class="customPartSample part_{type}" data-part="#{name}*"></span></div>';
    const html = template
      .filledWithEach(parts)
      .replace(/\#/g, "{")
      .replace(/\*/g, "}");

    $("#partsList").html(html);

    setTimeout(() => {
      showForCurrentDate();
    }, 0);
  }

  function showForCurrentDate() {
    $("#partsList .customPartSample, .customFormats .customSample").each(
      (i, el) => {
        const span = $(el);
        const part = span.data("part");
        span.html(part.filledWith(_di));
      }
    );
    updateActive();
    updateFirstPageSamples();
    updateDefaultDropdowns();
  }

  function inputChanged() {
    updateActive();
  }

  function updateActive() {
    const rawSource = $("#customBuilderInput");
    const rawText = rawSource.val();
    _nextFilledWithEach_UsesExactMatchOnly = true;
    const converted = rawText.filledWith(_di);
    _nextFilledWithEach_UsesExactMatchOnly = false;

    const echo = $("#customBuilderEcho");
    echo.html(converted || "&nbsp;");

    const hasError = converted.search(/{/) !== -1 || converted.search(/}/) !== -1;
    rawSource.toggleClass("hasError", hasError);

    updateEditButtons();
  }

  function addPart(ev: { target: string; }) {
    const btn = $(ev.target);
    let template = btn.next().data("part");
    const input = $("#customBuilderInput");

    const rawInput = input[0];

    const startPos = rawInput.selectionStart;
    const endPos = rawInput.selectionEnd;
    if (endPos === rawInput.value.length && endPos > 0) {
      template = ` ${template}`; // if at the end of the input, add a space
    }

    const before = rawInput.value.substring(0, startPos);
    rawInput.value =
      before +
      template +
      rawInput.value.substring(endPos, rawInput.value.length);

    input.focus().trigger("change");

    rawInput.selectionStart = rawInput.selectionEnd =
      startPos + template.length;
  }

  function saveEdits() {
    const editInput = $("#customBuilderInput");
    const value = editInput.val();

    if (!value && !_currentEditId) {
      return;
    }

    const data = {
      f: value,
      checked: _currentUseForSample ? "checked" : "",
    };

    const templateDiv = getCustomSample();
    _nextFilledWithEach_UsesExactMatchOnly = true;
    const newDiv = $(templateDiv.filledWith(data));
    _nextFilledWithEach_UsesExactMatchOnly = false;

    const sample = newDiv.find(".customSample");
    sample.html(data.f.filledWith(_di));

    if (!_currentEditId) {
      newDiv.addClass("inEdit");
      $(".customFormats").append(newDiv);
      _currentEditId = renumberSamples();
    } else {
      const id = `customFormat_${_currentEditId}`;
      newDiv.attr("id", id);

      $(`#${id}`).replaceWith(newDiv);
    }

    saveFormats();
    updateEditButtons();
  }

  function renumberSamples() {
    let lastNum = 0;
    $(".customFormats .customFormatDiv").each((i, el) => {
      lastNum = 1 + i;
      el.id = `customFormat_${lastNum}`;
    });
    return lastNum;
  }

  function deleteSample() {
    const div = $(`#customFormat_${_currentEditId}`);
    div.remove();

    cancelEditing();
    saveFormats();
  }

  function copySample(ev: { target: string; }) {
    const btn = $(ev.target);
    const div = btn.closest(".customFormatDiv");

    const format = div.find(".customFormat").html();

    tracker.sendEvent("customSample", format);

    const text = div.find(".customSample").html();
    $("#sampleCopy").val(text).focus().select();
    document.execCommand("copy");

    btn.text(getMessage("copied"));
    setTimeout(() => {
      btn.text(getMessage("customBtnCopy"));
    }, 1000);
  }

  function editSample(ev: { target: string; }) {
    const btn = $(ev.target);
    const div = btn.closest(".customFormatDiv");

    $(".customFormats .customFormatDiv").removeClass("inEdit");
    div.addClass("inEdit");

    // remember setting while editing
    _currentEditId = +div.attr("id").split("_")[1];
    _currentUseForSample = div.find(".customIsSample input").is(":checked");

    $("#customBuilderInput")
      .val(div.find(".customFormat").html())
      .trigger("change");
    updateEditButtons();
  }

  function loadCustom(ev: { target: string; }) {
    cancelEditing();

    const btn = $(ev.target);
    $("#customBuilderInput").val(btn.data("format")).trigger("change");

    updateEditButtons();
  }

  function updateEditButtons() {
    const notEditing = !_currentEditId;
    const notEditingAndBlank =
      notEditing && $("#customBuilderInput").val() === "";

    $("#btnCustomBuilderSave").prop("disabled", notEditingAndBlank);
    $("#btnCustomBuilderDelete").prop("disabled", notEditing);
    $("#btnCustomBuilderCancel").prop("disabled", notEditingAndBlank);
  }

  function cancelEditing() {
    $(".customFormats .customFormatDiv").removeClass("inEdit");
    _currentEditId = 0;
    _currentUseForSample = false;
    $("#customBuilderInput").val("").removeClass("hasError");
    $("#customBuilderEcho").html("&nbsp;");
    updateEditButtons();
  }

  function addFromFirstPage(letter: string, format: string) {
    const button =
      `<button type=button class="button btnLoadCustom" data-format="${format}">${letter}</button>`;
    $(".customLettersFromFirstPage").append(button);

    if (!_samplesAddedToFirstPage) {
      _itemsForDefaultSelects.push({
        letter: letter,
        format: format,
      });
    }
  }

  function clearFromFirstPage() {
    $(".customLettersFromFirstPage").html("");
  }

  function updateFirstPageSamples(forceRefresh: boolean | null = null) {
    if (!_samplesAddedToFirstPage || forceRefresh) {
      addSamplesToFirstPage();
    }

    $("#sampleList2 span").each((i, el) => {
      const span = $(el);
      span.html(span.data("template").filledWith(_di));
    });
  }

  function addSamplesToFirstPage() {
    const selected: any[] = [];
    let nextItemNumber = 1 + $("#sampleList1 > div").length;
    if (nextItemNumber === 1) {
      _samplesAddedToFirstPage = true;
      addSamples(_di);
      return;
    }

    $(".customFormats .customFormatDiv").each((i, el) => {
      const div = $(el);
      const span = div.find(".customIsSample span");
      let checked = div.find(".customIsSample input").is(":checked");

      if (nextItemNumber > 26) {
        div.find(".customIsSample input").prop("checked", false);
        checked = false;
      }

      if (!checked) {
        span.html("");
        return;
      }

      const letter = String.fromCharCode(64 + nextItemNumber);
      span.html(letter);

      selected.push({
        currentNote: "",
        letter: letter,
        tooltip: getMessage("pressKeyOrClick", letter),
        template: div.find(".customFormat").text(),
      });

      nextItemNumber++;
    });

    _nextFilledWithEach_UsesExactMatchOnly = true;
    const host = $("#samples").find("#sampleList2");
    host.html(
      (
        '<div><button title="{tooltip}"' +
        ' type=button data-letter={letter} id="key{letter}">{letter}{currentNote}</button>' +
        ' <span data-template="{template}"></span></div>'
      ).filledWithEach(selected)
    );
    host.toggleClass("hasSamples", selected.length > 0);

    if (!_samplesAddedToFirstPage) {
      fillSelectForDefaults();
    }
    _samplesAddedToFirstPage = true;
  }

  function saveFormats() {
    const formats: { f: string; s: boolean; }[] = [];
    $(".customFormats .customFormatDiv").each((i, el) => {
      const div = $(el);
      formats.push({
        f: div.find(".customFormat").text(),
        s: div.find(".customIsSample input").is(":checked"),
      });
    });
    setStorage("customFormats", formats);

    chrome.storage.local.set(
      {
        customFormats: formats,
      },
      () => {
        console.log("stored formats with local");
        if (chrome.runtime.lastError) {
          console.log(chrome.runtime.lastError);
        }
      }
    );
    if (browserHostType === browser.Chrome) {
      chrome.storage.sync.set(
        {
          customFormats: formats,
        },
        () => {
          console.log("stored stored with sync");
          if (chrome.runtime.lastError) {
            console.log(chrome.runtime.lastError);
          }
        }
      );
    }
    updateFirstPageSamples(true);
    fillSelectForDefaults();
  }

  function loadFormatsFromSync() {
    const localLoad = () => {
      chrome.storage.local.get(
        {
          customFormats: [],
        },
        (info) => {
          if (chrome.runtime.lastError) {
            console.log(chrome.runtime.lastError);
          }

          if (info.customFormats.length) {
            console.log(
              `formats loaded from local: ${info.customFormats.length}`
            );
            recallSettings(info.customFormats);
          } else {
            console.log("loading from local.storage");
            recallSettings();
          }
        }
      );
    };

    if (browserHostType === browser.Chrome) {
      chrome.storage.sync.get(
        {
          customFormats: [],
        },
        (info) => {
          if (chrome.runtime.lastError) {
            console.log(chrome.runtime.lastError);
          }

          if (info.customFormats.length) {
            console.log(
              `formats loaded from sync: ${info.customFormats.length}`
            );
            recallSettings(info.customFormats);
          } else {
            localLoad();
          }
        }
      );
    } else {
      localLoad();
    }
  }

  function getCustomSample() {
    return $("#customSampleTemplate").html().replace('data-x=""', "{checked}");
  }

  function recallSettings(formats: string | any[] | undefined | null = null) {
    let formats2: any[] = [];
    if (typeof formats === "string") {
      formats2 = JSON.parse(formats);
    } else {
      formats2 = formats || getStorage("customFormats", []);
    }
    if (formats2?.length) {
      $.each(formats2, (i, el) => {
        el.checked = el.s ? "checked" : "";
        //log(el);
      });
  
      const templateDiv = getCustomSample();
      _nextFilledWithEach_UsesExactMatchOnly = true;
      const result = templateDiv.filledWithEach(formats2);
      _nextFilledWithEach_UsesExactMatchOnly = false;
  
      $(".customFormats").html(result);
  
      setTimeout(() => {
        addSamplesToFirstPage();
        showForCurrentDate();
      }, 0);
      renumberSamples();
      updateEditButtons();
    }
  }

  function isSampleChanged() {
    saveFormats();
    updateEditButtons();
  }

  function attachHandlers() {
    $("#customBuilderInput").on("change keyup paste", inputChanged);
    $("#partsList").on("click", "button", addPart);
    $(".customFormats").on("click", ".btnCopy", copySample);
    $(".customFormats").on("click", ".btnEdit", editSample);
    $(".customFormats").on("change", ".cbIsSample", isSampleChanged);
    $("#pageCustom").on("click", ".btnLoadCustom", loadCustom);
    $("#btnCustomBuilderSave").on("click", saveEdits);
    $("#btnCustomBuilderCancel").on("click", cancelEditing);
    $("#btnCustomBuilderDelete").on("click", deleteSample);
    $("#customLoadTopDay").on("change", saveTopDayFormat);
    $("#customLoadToolTip1").on("change", saveTopToolTipFormat1);
    $("#customLoadToolTip2").on("change", saveTopToolTipFormat2);
  }

  function fillSelectForDefaults() {
    // each item in list is:  letter:'A',format:'{format}'
    fillSelectDefault(
      "customLoadToolTip1",
      "formatToolTip1",
      getMessage("formatIconToolTip")
    );
    fillSelectDefault(
      "customLoadToolTip2",
      "formatToolTip2",
      getMessage("nearestSunset")
    );
    fillSelectDefault(
      "customLoadTopDay",
      "formatTopDay",
      getMessage("bTopDayDisplay")
    );
    updateDefaultDropdowns();
  }

  function fillSelectDefault(id: string, storageId: string, message: string) {
    const defaultFormat = message;
    let defaultFound = false;
    const optionsHtml = [
      '<optgroup label="{0}">'.filledWith(getMessage("standardFormats")),
    ];

    $.each(_itemsForDefaultSelects, (i, el) => {
      const format = el.format;
      let isDefault = false;
      if (format === defaultFormat) {
        defaultFound = true;
        isDefault = true;
      }
      optionsHtml.push(
        `<option value="${format.replace(/"/g, "&quot;")}" data-prefix="${isDefault ? getMessage("defaultFormat") : ""}${el.letter} - " data-format="${format}"></option>`
      );
    });
    optionsHtml.push("</optgroup>");

    // add local custom formats
    const formats = getStorage("customFormats", []);
    if (formats.length > 0) {
      optionsHtml.push(
        '<optgroup label="{0}">'.filledWith(getMessage("customFormats"))
      );

      $.each(formats, (i, el) => {
        const format = el.f;
        optionsHtml.push(
          `<option value="${format.replace(/"/g, "&quot;")}" data-prefix="${i + 1} - " data-format="${format}"></option>`
        );
      });

      optionsHtml.push("</optgroup>");
    }

    // fill select
    const ddl = $(`#${id}`).html(
      (defaultFound
        ? ""
        : `<option value="${defaultFormat}" data-prefix="Default - " data-format="${defaultFormat}"></option>`) + optionsHtml.join("")
    );
    ddl.val(getStorage(storageId, ""));

    if (!ddl.val()) {
      ddl.val(defaultFormat);
    }
  }

  function saveTopToolTipFormat1(ev: { target: string; }) {
    setStorage(
      "formatToolTip1",
      $(ev.target).find("option:selected").data("format")
    );
    showIcon();
  }

  function saveTopToolTipFormat2(ev: { target: string; }) {
    setStorage(
      "formatToolTip2",
      $(ev.target).find("option:selected").data("format")
    );
    showIcon();
  }

  function saveTopDayFormat(ev: { target: string; }) {
    setStorage(
      "formatTopDay",
      $(ev.target).find("option:selected").data("format")
    );
    showInfo(_di);
  }

  function updateDefaultDropdowns() {
    $(".customLoadDefaults option").each((i, el) => {
      const option = $(el);
      option.html(
        option.data("prefix") + option.data("format").filledWith(_di)
      );
    });
  }

  function startup() {
    recallSettings(); // do local storage quickly... let sync storage overwrite later
    preparePartsList();
    loadFormatsFromSync();
    attachHandlers();
    $(".customSelect").html(
      getMessage("customSelectForFrontPage").filledWith(
        getMessage("pick_pageDay")
      )
    );
  }

  startup();

  return {
    updateDate: showForCurrentDate,
    updateFirstPage: updateFirstPageSamples,
    clearFromFirstPage: clearFromFirstPage,
    addFromFirstPage: addFromFirstPage,
  };
};
