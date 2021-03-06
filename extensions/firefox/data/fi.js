(function () {

  /**
   * Common utilities
   */

  var toArray = function (arrayish) {
    return [].slice.call(arrayish);
  };

  var trim = function (s) {
    return s.replace(/^\s+|\s+$/g, '');
  };

  var collapse = function (s) {
    return s.replace(/\s+/g, ' ');
  };

  var compact = function (s) {
    return collapse(trim(s));
  };

  /**
   * DOM utilities
   */

  var walk = function (node, callback, filter) {
    if (typeof filter === 'function' && !filter(node)) {
      return;
    }

    if (node.childNodes.length) {
      var childNodes = toArray(node.childNodes);
      for (var i = 0, j = childNodes.length; i < j; i++) {
        walk(childNodes[i], callback, filter);
      }
    }

    if (typeof callback === 'function') {
      callback(node);
    }
  };

  var isTextNode = function (node) {
    return node.nodeType === Node.TEXT_NODE;
  };

  // heuristic approach to detect actual visibility of an element
  var elemCache = [];
  var indexCache = {};

  var isVisible = function (elem, omit) {
    if (!elem || elem === document.documentElement) {
      return true;
    }

    var i;
    if ((i = elemCache.indexOf(elem)) !== -1) {
      return indexCache[i];
    }

    var style = window.getComputedStyle(elem);
    var parent = elem.parentNode;
    var result = style.display !== 'none' // totally none
      && style.visibility !== 'hidden' // hidden
      && parseFloat(style.opacity) !== 0 // transparent
      && parseFloat(style.textIndent) > -512 && style.textIndent !== '100%' // usual image replace method: -9999px, -9999em, 100%
      && (parseFloat(style.width) * parseFloat(style.height) > 1 || style.overflow === 'visible') // hide but accessible through screen readers
      && !/rect\(1px(?:(?:,\s*|\s+)1px){3}\)/.test(style.clip) // hide text using clip: rect(1px, 1px, 1px, 1px)
      && isVisible(elem.parentNode);

    indexCache[elemCache.length] = result;
    elemCache.push(elem);

    return result;
  };

  var ignoreTags = {
    'SCRIPT': true,
    'NOSCRIPT': true,
    'STYLE': true,
    'IFRAME': true,
    'OPTION': true
  };
  var isVisibleText = function (node) {
    var parent = node.parentNode;
    var fontSize = parseFloat(window.getComputedStyle(parent).fontSize);
    return isTextNode(node) && isVisible(parent) && fontSize > 0 && !ignoreTags[parent.tagName];
  };

  var hasClass = function (elem, clazz) {
    var className = ' ' + elem.className + ' ';
    return className.indexOf(' ' + clazz + ' ') !== -1;
  };

  var addClass = function (elem, clazz) {
    if (elem.classList) {
      elem.classList.add(clazz);
    } else if (!hasClass(elem, clazz)) {
      elem.className = trim(elem.className + ' ' + clazz);
    }
  };

  var removeClass = function (elem, clazz) {
    if (elem.classList) {
      elem.classList.remove(clazz);
    } else {
      elem.className = compact((' ' + elem.className + ' ').replace(new RegExp('\\s' + clazz + '\\s', 'g'), ''));
    }
  };

  function createStyle(styleText, context) {
      var style = document.createElement('style');
      style.type = 'text/css';

      // <style> element must be appended into DOM before setting `cssText`
      // otherwise IE8 will interpret the text in IE7 mode.
      context = context || document.body;
      context.appendChild(style);
      if (style.styleSheet) {
          style.styleSheet.cssText = styleText;
      } else {
          style.appendChild(document.createTextNode(styleText));
      }
  }

  var removeNode = function (node) {
    if (node) {
      node.parentNode.removeChild(node);
    }
  };

  var matches = function (elem, selector) {
    var m = (elem.document || elem.ownerDocument).querySelectorAll(selector);
    var i = 0;

    while (m[i] && m[i] !== elem) {
      i++;
    }

    return !!m[i];
  };

  var getEvent = function (e) {
    return e || window.event;
  };

  var getTarget = function (e) {
    e = e || getEvent(e);
    return e.target || e.sourceElement;
  };

  var stopPropagation = function (e) {
    e = e || getEvent(e);
    if (e.stopPropagation) {
      e.stopPropagation();
    }
    else {
      e.cancelBubble = true;
    }
  };

  /**
   * All prepared, let's get started
   */

  // Use this to store result
  var weightMap = {};
  var elemMap = {};
  var maxSize = 36;
  var minSize = 18;
  var id = 'fi-report';
  var highlightedClass = 'fi-highlighted';
  var collapsedClass = 'fi-collapsed';

  var calculate = function () {

    // cleanup
    weightMap = {};
    elemMap = {};

    walk(document.body, function (n) {
      if (!isVisibleText(n)) {
        return;
      }

      var text = compact(n.nodeValue);
      var count = text.replace(/[\s\r\n]+/g, '').length;
      if (!count) {
        return;
      }

      var parent = n.parentNode;
      var family = window.getComputedStyle(parent).fontFamily;

      if (!weightMap.hasOwnProperty(family)) {
        weightMap[family] = 0;
        elemMap[family] = [];
      }

      weightMap[family] += count;

      var elemList = elemMap[family];
      var last = elemList[elemList.length - 1];
      // push in three cases in order to prevent duplication
      // 1. empty list
      // 2. already in the list
      // 3. following the last added node in document order
      if (!last || last === parent || last.compareDocumentPosition(parent) & 4) { // Node.DOCUMENT_POSITION_FOLLOWING === 2
        elemList.push(parent);
      }
    }, function (n) {
      return n.id !== id;
    });

    var rank = [];
    for (var family in weightMap) {
      if (weightMap[family] === 0) {
        continue;
      }
      rank.push({
        family: family,
        count: weightMap[family],
        weight: Math.log(weightMap[family])
      });
    }

    rank.sort(function (a, b) {
      return b.weight - a.weight;
    });

    return rank;
  };

  var report;
  var list;
  var usedList;

  var show = function (rank) {
    if (!rank.length) {
      return;
    }

    report = document.getElementById(id);
    if (!report) {
      report = document.createElement('aside');
      report.id = id;

      list = document.createElement('ol');
      list.className = 'fi-computed-list';
      report.appendChild(list);
      usedList = document.createElement('ol');
      usedList.className = 'fi-used-list';
      report.appendChild(usedList);

      var switcher = document.createElement('span');
      switcher.className = 'fi-switcher';
      report.insertBefore(switcher, list);

      var computed = {
        className: 'fi-computed',
        hint: 'Showing computed font families',
        title: 'Click “switch” to see used (rendered) font families'
      };

      var used = {
        className: 'fi-used',
        hint: 'Showing used (rendered) font families',
        title: 'Click “switch” to see computed font families'
      };

      function updateHint(data) {
        hint.textContent = data.hint;
        hint.title = data.title;
        report.className = data.className;
      }

      var hint = document.createElement('span');
      hint.className = 'fi-switcher-hint';
      updateHint(computed);
      switcher.appendChild(hint);

      var proceed = document.createElement('button');
      proceed.textContent = 'Switch';
      proceed.className = 'fi-proceed';
      switcher.appendChild(proceed);

      proceed.onclick = function () {
        if (report.className === used.className) {
          show(calculate());
          updateHint(computed);
        } else {
          self.port.emit('check-used');
          updateHint(used);
        }
      };
      var expand = document.createElement('button');
      expand.className = 'fi-expand';
      expand.textContent = 'fi';
      report.appendChild(expand);
      expand.onclick = function () {
        // expand
        removeClass(report, collapsedClass);
        unhighlight();
      }

      var close = document.createElement('button');
      close.className = 'fi-close';
      close.textContent = '×';
      report.appendChild(close);
      close.onclick = destroy;

      var link = document.createElement('a');
      link.className = 'fi-link';
      link.href = 'http://justineo.github.io/fi/';
      link.innerHTML = 'Powered by <strong>fi</strong>';
      report.appendChild(link);

      var style = '#fi-report button::-moz-focus-inner{padding:0;border:0}#fi-report{overflow:auto;position:fixed;top:0;right:0;bottom:auto;left:auto;width:100%;height:100%;margin:0;padding:0;background-color:rgba(0,0,0,.8);text-align:left;z-index:2147483647;transition:all .5s}#fi-report ol{margin:0;padding:10px}#fi-report li{float:left;clear:left;margin:0 0 10px;padding:0 0 0 10px;border-left:3px solid rgba(255,255,255,.1);background-color:rgba(255,255,255,.1);list-style:none;line-height:1.5;color:#fff;text-shadow:1px 1px 0 #000;text-align:left;cursor:default}#fi-report .fi-computed-list li{cursor:pointer}#fi-report li:hover{background-color:rgba(255,255,255,.2);border-left-color:#fff}#fi-report .fi-count{float:right;border:none;margin:0 0 0 10px;padding:0 5px;background-color:#000;font-size:.5em;font-weight:400;vertical-align:middle;cursor:help}#fi-report .fi-link{position:fixed;right:10px;bottom:10px;padding:0 10px;border:none;border-radius:0;background-color:rgba(255,255,255,.1);font-size:12px;line-height:1.5;color:rgba(255,255,255,.7)}#fi-report .fi-link strong{color:#fff;font-family:inherit;font-size:12px;font-weight:100}#fi-report a,#fi-report button,#fi-report span{display:block;font-family:"Avenir Next","Segoe UI",Helvetica,Arial,sans-serif!important;font-weight:100!important;border-radius:0!important;text-transform:none}#fi-report .fi-close,#fi-report .fi-expand,#fi-report .fi-proceed,#fi-report .fi-switcher-hint{background:rgba(255,255,255,.1)!important;border:none!important;color:rgba(255,255,255,.7)!important;box-shadow:none!important;text-shadow:1px 1px 0 #000!important;cursor:pointer}#fi-report .fi-close,#fi-report .fi-expand{position:fixed;top:10px;right:10px;width:48px;padding:0;line-height:48px;text-align:center;font-size:28px;font-weight:700!important;border-radius:0;box-shadow:none}#fi-report .fi-switcher{display:inline-block;margin:10px 0 0 10px;font-size:14px;line-height:24px;cursor:help}#fi-report .fi-proceed,#fi-report .fi-switcher-hint{display:inline-block;vertical-align:middle;overflow:hidden;line-height:24px;font-size:inherit}#fi-report .fi-switcher-hint{padding:0 10px;border:none;cursor:help}#fi-report .fi-proceed{width:0;padding:0;background:rgba(255,255,255,.3)!important;text-align:center;font-weight:400;word-wrap:normal;transition:width .5s 1s;cursor:pointer}#fi-report .fi-switcher:hover .fi-proceed{width:80px;transition-delay:0s}#fi-report .fi-close:hover,#fi-report .fi-link:hover,#fi-report .fi-switcher-hint:hover{background:rgba(255,255,255,.2)!important;color:#fff!important}#fi-report .fi-expand{display:none;top:10px;right:10px;background:rgba(0,0,0,.1)!important;color:#fff!important}#fi-report .fi-expand:hover{background:rgba(0,0,0,.2)!important}#fi-report.fi-collapsed{width:68px;height:68px;background-color:transparent}#fi-report.fi-collapsed .fi-expand{display:block}#fi-report.fi-collapsed .fi-close,#fi-report.fi-collapsed .fi-link,#fi-report.fi-collapsed .fi-switcher,#fi-report.fi-collapsed ol,#fi-report.fi-computed .fi-used-list,#fi-report.fi-used .fi-computed-list{display:none}.fi-highlighted{outline:#c00 dotted 2px;outline-offset:-1px;-webkit-animation:highlight 1s infinite;animation:highlight 1s infinite}@keyframes highlight{0%{opacity:1}50%{opacity:.2}100%{opacity:1}}@-webkit-keyframes highlight{0%{opacity:1}50%{opacity:.2}100%{opacity:1}}';
      createStyle(style, report);

      document.body.appendChild(report);

      report.onclick = function (e) {
        var target = getTarget(e);

        // remove highlighted
        var highlighted = document.body.querySelector('.' + highlightedClass);
        highlighted && removeClass(highlighted, highlightedClass);

        // click on sigle family, highlight the first matched element
        if (matches(target, '#' + id + ' .fi-computed-list li, #' + id + ' .fi-computed-list li *')) {
          while(!matches(target, '#' + id + ' .fi-computed-list li')) {
            target = target.parentNode;
          }

          var family = target.getAttribute('data-family');
          var elemList = elemMap[family];
          if (elemList && elemList.length) {
            // scroll the first one into view
            elemList[0].scrollIntoView();

            for (var i = 0, j = elemList.length; i < j; i++) {
              var elem = elemList[i];
              addClass(elem, highlightedClass);
              addClass(report, collapsedClass);
            }
          }
        }
        stopPropagation(e);
      };
    }

    var max = rank[0].weight;
    var min = rank[rank.length - 1].weight;
    var output;
    var isUsed = report.className === 'fi-used';
    if (isUsed) {
      output = usedList;
    } else {
      output = list;
    }
    output.innerHTML = '';
    rank.forEach(function (item) {
      var size = rank.length === 1
        ? maxSize
        : (item.weight - min) / (max - min) * (maxSize - minSize) + minSize;
      var li = document.createElement('li');
      var family = item.family;
      if (isUsed) {
        family = '"' + family + '"';
      }
      li.style.cssText = 'font-family: ' + family + '; font-size: ' + size + 'px;';
      li.setAttribute('data-family', item.family);
      li.title = item.family;
      li.textContent = item.family;

      var count = document.createElement('span');
      count.className = 'fi-count';
      count.title = item.count + ' glyph' + (item.count > 1 ? 's' : '');
      count.textContent = item.count;

      li.appendChild(count);
      output.appendChild(li);
    });
  };

  var destroy = function () {
    removeNode(report);
    unhighlight();
  };

  var unhighlight = function () {
    var highlighted = toArray(document.querySelectorAll('.' + highlightedClass));

    for (var i = 0, j = highlighted.length; i < j; i++) {
      removeClass(highlighted[i], highlightedClass);
    }
  };

  show(calculate());

  self.port.on('used-checked', function (data) {
    show(JSON.parse(data));
  });

  return false;
})();
