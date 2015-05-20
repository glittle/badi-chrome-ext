/* global getMessage */
/* global di */
/* global chrome */
/* global $ */
var samplesDiv = $('#samples');

samplesDiv.on('click', 'button', copySample);
$('.btnChangeDay').on('click', changeDay);
$('#btnEveOrDay').on('click', toggleEveOrDay);
$('#datePicker').on('change', jumpToDate);
$('#btnRefeshLocation').on('click', function(ev){
  registerHandlers();
});
$('#datePicker').on('keydown', function(ev){
  ev.stopPropagation();
});
$(document).on('keydown', keyPressed);

$('.iconArea a').click(function(){
  chrome.tabs.create({active: true, url: this.href });
});

chrome.alarms.onAlarm.addListener(function(){
  showInfo(_di);
});

$('#sampleTitle').html(getMessage('pressToCopy'));

var sampleNum = 0;

function showInfo(di){
  var dayDetails = [
     {name:getMessage('DayOfWeek'), value: "{bWeekday} - {bWeekdayNameAr} ({bWeekdayMeaning})".filledWith(di)}
   , {name:getMessage('DayOfMonth'), value: "{bDay} - {bDayNameAr} ({bDayMeaning})".filledWith(di)}
   , {name:getMessage('Month'), value: di.bMonth ? "{bMonth} - {bMonthNameAr} ({bMonthMeaning})".filledWith(di) : "{bMonthNameAr} ({bMonthMeaning})".filledWith(di)}
   , {name:getMessage('YearOfVahid'), value: "{bYearInVahid} - {bYearInVahidNameAr} ({bYearInVahidMeaning})".filledWith(di)}
   , {name:getMessage('Vahid'), value: "{bVahid}".filledWith(di)}
   , {name:getMessage('Kullishay'), value: "{bKullishay}".filledWith(di)}
   , {name:getMessage('YearOfEra'), value: "{bYear}".filledWith(di)}
  ];
  
  var explain1 = getMessage('shoghiExample', di);

  var explain2 = getMessage('example2', di);

  // prepare samples
  var samples = [''

    // 3 Jamál 172
    , '{bDay} {bMonthNameAr} {bYear}'.filledWith(di)

    // Jamal 4, 172
    , di.bMonthDayYear

    // Jamal 4, 172 -> 7:55pm
    , '{bMonthDayYear} ⇨ {endingSunsetDesc}'.filledWith(di)

    // 1 Beauty (Jamal) 172 B.E.
    , '{bDay} {bMonthMeaning} ({bMonthNameAr}) {bYear} {bEraAbbrev}'.filledWith(di)
    
    // 1 Jamal (Beauty) 172
    , '{bDay} {bMonthNameAr} ({bMonthMeaning}) {bYear}'.filledWith(di)
    
    // 30 April 2015 / 3 Beauty 172 -- NSA Canada
    , {value:'{frag2Day} {frag2MonthLong} {frag2Year} / {bDay} {bMonthMeaning} {bYear}'.filledWith(di), currentTime:true}

    // 1 May 2015 / 4 Jamál 172  -- Susan Gammage
    , {value:'{frag2Day} {frag2MonthLong} {frag2Year} / {bDay} {bMonthNameAr} {bYear}'.filledWith(di), currentTime:true}


    // 04 Jamal / Glory 172 B.E. (Fri 01 May 2015) -- bahai-readings@bcca.org
    // 05 Jamal / Glory (12th Day of Ridvan) 172 B.E. (Sat 02 May 2015)
    , ('{bDay00} {bMonthNameAr} / {bMonthMeaning} {bYear} {bEraAbbrev}'
       + ' ({currentWeekdayShort} {currentDay00} {currentMonthLong} {currentYear})').filledWith(di)

    
    // 1 Jamál (Beauty) 172 - April 27/28, 2015  -- Calgary Feast report (drop the 1)
    , {value:'{bDay} {bMonthNameAr} ({bMonthMeaning}) {bYear} - {gCombined}'.filledWith(di), currentTime:true}
          
    // Jamál / Bahá, 1st ‘Aẓamat     or [weekday] / [monthday], [day no.] [month] - james@19months.com
    , '{bWeekdayNameAr} / {bDayNameAr}, {bDayOrdinal} {bMonthNameAr} {bYear}'.filledWith(di) 

    // 3 Jamál 172 BE / 30 April 2015 -- Calgary LSA minutes
    , '{bDay} {bMonthNameAr} {bYear} {eraShort} / {currentDay} {currentMonthLong} {currentYear}'.filledWith(di)
    //, {currentTime:true, value: '{bDay} {bMonthNameAr} {bYear} {eraShort} / {currentDay} {currentMonthLong} {currentYear}'.filledWith(di)}
    
    // 172.03.13
    , '{bYear}.{bMonth00}.{bDay00}'.filledWith(di)
  ];
  
  $('#day').html('{bDay} {bMonthNameAr} {bYear}'.filledWith(di));
  $('#sunset').html(di.nearestSunset);
  $('#place').html(localStorage.locationName);
  $('#gDay').html('{currentDay} {currentMonthShort} {currentYear}'.filledWith(di));

  $('#dayDetails').html('<dl>' + '<dt>{^name}</dt><dd>{^value}</dd>'.filledWithEach(dayDetails) + '</dl>');

  $('#explain').html(explain1);
  $('#explain2').html(explain2);
  
  $('#gDate').html('{currentWeekdayShort}, {currentDay} {currentMonthLong} {currentYear}'.filledWith(di));
  $('#gDateDesc').html('({^currentRelationToSunset})'.filledWith(di));

  $('#datePicker').val(di.currentDateString);

    $('#special1').hide(); 
    $('#special2').hide()
  if(di.special1){
    $('#special1').html(di.special1).show();
    if(di.special2){
      $('#special2').html(di.special2).show();
    }
    else{
      $('#special2').hide()
    }
  }
  $('#upcoming').html(di.upcomingHtml);
     
  clearSamples();
  var showFootnote = false;
  for (var i = 0; i < samples.length; i++) {
    var sample = samples[i];
    if(sample) {
       if(sample.currentTime){
         showFootnote = true;
       }
       addSample(sample);
    }
  }
  $('#sampleFootnote').toggle(showFootnote);
  
  var manifest = chrome.runtime.getManifest();
  $('#version').text(getMessage('version', manifest.version_name));
  $('body')
    .addClass(manifest.current_locale)
    .addClass(manifest.current_locale.slice(0,2));
    
  $('button.today').toggleClass('notToday', di.stamp !== getStorage('originalStamp'));  
}

function keyPressed(ev){
  var key = String.fromCharCode(ev.which) || '';
  switch(ev.which){
    case 18:
      return; // 08 (ALT) causes a crashes
      
    case 37:
      changeDay(null, -1);
      ev.preventDefault();
      return;
    case 39:
      changeDay(null, 1);
      ev.preventDefault();
      return;
      
    case 38:
      toggleEveOrDay(false);
      ev.preventDefault();
      return;
    case 40:
      toggleEveOrDay(true);
      ev.preventDefault();
      return;
      
    default:
      try{
        var sample = $('#key' + key);
        if(sample.length){
          sample.trigger('click'); // effective if a used letter is typed
          ev.preventDefault();
        }
      }catch(ex){
        // ignore jquery error
      }
      return;
  }
}

function addSample(info){
  sampleNum++;
  var char = String.fromCharCode(64 + sampleNum);
  
  var sample = {
    value:'',
    currentTime:false,
    char:char,
    tooltip:getMessage('pressKeyOrClick', char)
  };
  
  if(typeof info === 'string'){
    sample.value = info;
  }else{
    $.extend(sample, info);
  }
  sample.currentNote = sample.currentTime ? ' *' : '';
  samplesDiv.find('#sampleList')
    .append(('<div><button title="{tooltip}"'
    + ' type=button data-char={char} id="key{char}">{char}{currentNote}</button>'
    + ' <span>{^value}</span></div>').filledWith(sample));
}

function clearSamples(){
  sampleNum = 0;
  samplesDiv.find('#sampleList').text('');
}

function copySample(ev){
  var btn = $(ev.target);
  var div = btn.closest('div');
  var text = div.find('span').text();
  $('#sampleCopy').val(text).focus().select();
  document.execCommand('copy');
  
  div.addClass('copied');
  btn.text(getMessage('copied'));
  setTimeout(function(){
    div.removeClass('copied');
    btn.text(btn.data('char'));
  }, 1000);
}
function toggleEveOrDay(toEve){
  _targetDate = getCurrentTime();
  toEve = typeof toEve === 'boolean' ? toEve : !di.bNow.eve;
  if(toEve){
    _targetDate.setHours(23,59,0,0);
  }else{
    _targetDate.setHours(12,0,0,0);
  }
  refreshDateInfo();
  showInfo(_di);
}

function jumpToDate(ev){
  var date = moment($(ev.target).val()).toDate();
  if(!isNaN(date)){
    _targetDate = date;
    
    refreshDateInfo();
    showInfo(_di);
  }
}

function changeDay(ev, delta){
  delta = ev ? +$(ev.target).data('delta') : +delta;
  if (delta === 0) {
    _targetDate = null;
 } else{
    _targetDate = getCurrentTime();
    // console.log(delta + ' ' + di.bNow.eve);  

    _targetDate.setDate(_targetDate.getDate() + delta);   

//    if(delta == 1){
//      if(!di.bNow.eve){
//        toggleEveOrDay(true);
//        return;
//      }
//      _targetDate.setDate(_targetDate.getDate() + delta);   
//      toggleEveOrDay(false);
//    }
//
//
//    if(delta == -1){
//      if(di.bNow.eve){
//        toggleEveOrDay(false);
//        return;
//      }
//      _targetDate.setDate(_targetDate.getDate() + delta);   
//      toggleEveOrDay(true);
//    } 
  }
  
  _targetDate = getCurrentTime();

  refreshDateInfo();
  
  if(_di.bNow.eve){
    _targetDate.setHours(23,59,0,0);
  }else{
    _targetDate.setHours(12,0,0,0);
  }

  showInfo(_di);
  
}

refreshDateInfo();
showInfo(_di);
localizeHtml();
