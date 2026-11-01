(function () {
  'use strict';

  /*
   * Phantom — safe input/debug edition
   * - Detects Maths/Reader mode.
   * - Lists visible editable answer fields.
   * - Lets you enter your own value into a selected field.
   * - Verifies whether the value was accepted.
   * - Does NOT call an AI API, choose answers, click options, or submit work.
   */

  var PANEL_ID = 'ph-safe-panel';
  var running = true;
  var logItems = [];
  var selectedInput = null;

  if (document.getElementById(PANEL_ID)) {
    console.warn('[Phantom] Panel is already running.');
    return;
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;

    var cs = window.getComputedStyle(el);
    var rect = el.getBoundingClientRect();

    return cs.display !== 'none' &&
      cs.visibility !== 'hidden' &&
      Number(cs.opacity) !== 0 &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function detectMode() {
    var url = location.href.toLowerCase();
    var title = (document.title || '').toLowerCase();

    if (
      url.includes('/maths') ||
      url.includes('/math') ||
      title.includes('maths')
    ) {
      return 'Maths';
    }

    if (
      url.includes('/reader') ||
      url.includes('/reading') ||
      title.includes('reader')
    ) {
      return 'Reader';
    }

    return document.querySelector('input[type="number"]')
      ? 'Maths'
      : 'Reader';
  }

  var style = document.createElement('style');
  style.id = 'ph-safe-style';

  style.textContent = `
    #${PANEL_ID} {
      position: fixed;
      top: 16px;
      left: 16px;
      z-index: 2147483647;
      width: 330px;
      color: #d9f7e8;
      font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace;
      user-select: none;
    }

    #${PANEL_ID} * {
      box-sizing: border-box;
    }

    #${PANEL_ID} .ph-card {
      background: rgba(4, 8, 20, .97);
      border: 1px solid rgba(0, 255, 170, .3);
      border-radius: 14px;
      box-shadow: 0 12px 48px rgba(0, 0, 0, .65);
      overflow: hidden;
    }

    #${PANEL_ID} .ph-head {
      padding: 12px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(0, 255, 170, .15);
      cursor: move;
    }

    #${PANEL_ID} .ph-title {
      font-weight: 900;
      letter-spacing: 2px;
      color: #00ffaa;
      font-size: 15px;
    }

    #${PANEL_ID} .ph-badge {
      font-size: 10px;
      color: #00ffaa;
      border: 1px solid rgba(0, 255, 170, .3);
      padding: 3px 8px;
      border-radius: 20px;
    }

    #${PANEL_ID} .ph-status {
      padding: 9px 14px;
      background: rgba(0, 0, 0, .25);
      color: #b7d8c8;
      border-bottom: 1px solid rgba(0, 255, 170, .1);
    }

    #${PANEL_ID} .ph-body {
      padding: 12px 14px;
    }

    #${PANEL_ID} label {
      display: block;
      margin: 9px 0 4px;
      color: #7cbca0;
      font-size: 10px;
      letter-spacing: .8px;
      text-transform: uppercase;
    }

    #${PANEL_ID} input,
    #${PANEL_ID} select {
      width: 100%;
      background: #07150f;
      color: #eafff4;
      border: 1px solid rgba(0, 255, 170, .25);
      border-radius: 7px;
      padding: 8px;
      font: inherit;
    }

    #${PANEL_ID} button {
      cursor: pointer;
      background: rgba(0, 255, 170, .09);
      color: #00ffaa;
      border: 1px solid rgba(0, 255, 170, .3);
      border-radius: 8px;
      padding: 8px 10px;
      font: 700 11px ui-monospace, SFMono-Regular, Consolas, monospace;
      letter-spacing: .4px;
    }

    #${PANEL_ID} .ph-row {
      display: flex;
      gap: 8px;
      margin-top: 9px;
    }

    #${PANEL_ID} .ph-row button {
      flex: 1;
    }

    #${PANEL_ID} .ph-note {
      color: #8da99b;
      font-size: 10px;
      margin-top: 9px;
    }

    #${PANEL_ID} .ph-log {
      max-height: 120px;
      overflow: auto;
      margin-top: 10px;
      border-top: 1px solid rgba(0, 255, 170, .1);
      padding-top: 6px;
    }

    #${PANEL_ID} .ph-logline {
      padding: 3px 0;
      border-bottom: 1px solid rgba(255, 255, 255, .04);
      overflow-wrap: anywhere;
    }

    #${PANEL_ID} .ph-good {
      color: #00ffaa;
    }

    #${PANEL_ID} .ph-warn {
      color: #ffcc66;
    }

    #${PANEL_ID} .ph-err {
      color: #ff6680;
    }

    #${PANEL_ID} .ph-foot {
      padding: 0 14px 12px;
      color: #829b8e;
      font-size: 10px;
    }
  `;

  document.head.appendChild(style);

  var panel = document.createElement('div');
  panel.id = PANEL_ID;

  panel.innerHTML = `
    <div class="ph-card">
      <div class="ph-head" id="ph-safe-head">
        <div class="ph-title">⚡ PHANTOM</div>
        <div class="ph-badge" id="ph-safe-mode">INIT</div>
      </div>

      <div class="ph-status" id="ph-safe-status">
        Ready — diagnostic mode
      </div>

      <div class="ph-body">
        <label for="ph-safe-inputs">Visible answer field</label>
        <select id="ph-safe-inputs"></select>

        <div class="ph-row">
          <button id="ph-safe-refresh" type="button">
            REFRESH FIELDS
          </button>

          <button id="ph-safe-inspect" type="button">
            INSPECT
          </button>
        </div>

        <label for="ph-safe-value">Value to enter</label>
        <input
          id="ph-safe-value"
          type="text"
          autocomplete="off"
          placeholder="Type your own answer"
        >

        <div class="ph-row">
          <button id="ph-safe-fill" type="button">
            FILL FIELD
          </button>

          <button id="ph-safe-clear" type="button">
            CLEAR LOG
          </button>
        </div>

        <div class="ph-note">
          Check the selected field before filling.
          This tool never chooses an answer or presses Check/Submit.
        </div>

        <div class="ph-log" id="ph-safe-log" aria-live="polite"></div>
      </div>

      <div class="ph-foot">
        Local diagnostics only • no API key • no remote requests
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  var statusEl = panel.querySelector('#ph-safe-status');
  var modeEl = panel.querySelector('#ph-safe-mode');
  var selectEl = panel.querySelector('#ph-safe-inputs');
  var valueEl = panel.querySelector('#ph-safe-value');
  var logEl = panel.querySelector('#ph-safe-log');

  modeEl.textContent = detectMode().toUpperCase();

  function log(message, type) {
    logItems.unshift({
      time: new Date().toLocaleTimeString(),
      message: String(message),
      type: type || ''
    });

    if (logItems.length > 30) {
      logItems.length = 30;
    }

    logEl.textContent = '';

    logItems.forEach(function (item) {
      var row = document.createElement('div');

      row.className =
        'ph-logline ' + (item.type ? 'ph-' + item.type : '');

      row.textContent = item.time + '  ' + item.message;

      logEl.appendChild(row);
    });
  }

  function describeInput(input, index) {
    var type = (input.type || 'text').toLowerCase();

    var label =
      input.getAttribute('aria-label') ||
      input.getAttribute('placeholder') ||
      input.name ||
      input.id ||
      ('field ' + (index + 1));

    return (index + 1) + '. [' + type + '] ' + label;
  }

  function getCandidates() {
    return Array.from(
      document.querySelectorAll(
        'input:not([type="hidden"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]'
      )
    ).filter(function (el) {
      return visible(el) &&
        !panel.contains(el) &&
        !el.disabled &&
        !el.readOnly &&
        el.getAttribute('aria-hidden') !== 'true';
    });
  }

  function refreshFields() {
    var candidates = getCandidates();

    selectEl.textContent = '';

    candidates.forEach(function (input, index) {
      var option = document.createElement('option');

      option.value = String(index);
      option.textContent = describeInput(input, index);

      selectEl.appendChild(option);
    });

    if (!candidates.length) {
      var empty = document.createElement('option');

      empty.value = '';
      empty.textContent = 'No visible editable fields found';

      selectEl.appendChild(empty);

      selectedInput = null;
      statusEl.textContent = 'No visible editable fields found';

      log('No visible editable fields found', 'warn');
      return;
    }

    selectedInput = candidates[0];

    statusEl.textContent =
      candidates.length + ' visible editable field(s) found';

    log('Found ' + candidates.length + ' editable field(s)', 'good');
  }

  function selectedCandidate() {
    var candidates = getCandidates();
    var index = Number(selectEl.value);

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= candidates.length
    ) {
      return null;
    }

    return candidates[index];
  }

  function inspectSelected() {
    var input = selectedCandidate();

    selectedInput = input;

    if (!input) {
      statusEl.textContent = 'Select a visible editable field first';
      log('No selected field to inspect', 'warn');
      return;
    }

    var tag = input.tagName.toLowerCase();

    var type = input.type ||
      (input.isContentEditable ? 'contenteditable' : tag);

    var rect = input.getBoundingClientRect();

    var details =
      tag + ' / ' + type +
      ' / disabled=' + !!input.disabled +
      ' / readOnly=' + !!input.readOnly +
      ' / size=' +
      Math.round(rect.width) + 'x' +
      Math.round(rect.height);

    statusEl.textContent =
      'Selected: ' + (input.id || input.name || tag);

    log(details, 'good');
  }

  function setNativeValue(input, value) {
    if (input.isContentEditable) {
      input.focus();
      input.textContent = value;

      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value
      }));

      input.dispatchEvent(
        new Event('change', { bubbles: true })
      );

      return;
    }

    var proto = input.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

    var descriptor =
      Object.getOwnPropertyDescriptor(proto, 'value');

    input.focus();

    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }

    try {
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: value
      }));
    } catch (_) {
      input.dispatchEvent(
        new Event('input', { bubbles: true })
      );
    }

    input.dispatchEvent(
      new Event('change', { bubbles: true })
    );
  }

  function fillSelected() {
    var input = selectedCandidate();

    if (!input) {
      statusEl.textContent = 'No field selected';
      log('Cannot fill: no selected field', 'warn');
      return;
    }

    if (input.disabled || input.readOnly) {
      statusEl.textContent = 'Selected field is not editable';
      log('Selected field is disabled or read-only', 'err');
      return;
    }

    var value = valueEl.value;

    try {
      setNativeValue(input, value);

      setTimeout(function () {
        var current = input.isContentEditable
          ? input.textContent
          : input.value;

        if (String(current) === String(value)) {
          statusEl.textContent =
            'Field value updated — review it, then submit manually';

          log('Field value updated and verified', 'good');
        } else {
          statusEl.textContent =
            'Value did not persist; the page may use a custom keypad';

          log(
            'Value did not persist; try the page control or keypad manually',
            'warn'
          );
        }
      }, 100);

    } catch (error) {
      statusEl.textContent = 'Fill failed — see log';

      log(
        'Fill error: ' +
        (error && error.message ? error.message : error),
        'err'
      );
    }
  }

  panel.querySelector('#ph-safe-refresh')
    .addEventListener('click', refreshFields);

  panel.querySelector('#ph-safe-inspect')
    .addEventListener('click', inspectSelected);

  panel.querySelector('#ph-safe-fill')
    .addEventListener('click', fillSelected);

  panel.querySelector('#ph-safe-clear')
    .addEventListener('click', function () {
      logItems = [];
      logEl.textContent = '';
      statusEl.textContent = 'Log cleared';
    });

  selectEl.addEventListener('change', function () {
    selectedInput = selectedCandidate();
  });

  // Draggable panel.
  (function () {
    var head = panel.querySelector('#ph-safe-head');
    var dragging = false;
    var offsetX = 0;
    var offsetY = 0;

    head.addEventListener('mousedown', function (event) {
      if (event.button !== 0) return;

      dragging = true;

      var rect = panel.getBoundingClientRect();

      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;

      event.preventDefault();
    });

    document.addEventListener('mousemove', function (event) {
      if (!dragging || !running) return;

      panel.style.left =
        Math.max(0, event.clientX - offsetX) + 'px';

      panel.style.top =
        Math.max(0, event.clientY - offsetY) + 'px';
    });

    document.addEventListener('mouseup', function () {
      dragging = false;
    });
  })();

  // Stop control.
  var stop = document.createElement('button');

  stop.type = 'button';
  stop.textContent = '■ STOP PHANTOM';

  stop.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:2147483647;' +
    'background:rgba(20,0,10,.97);color:#ff6680;padding:8px 14px;' +
    'border-radius:20px;font:700 12px monospace;cursor:pointer;' +
    'border:1px solid rgba(255,102,128,.5);';

  stop.addEventListener('click', function () {
    running = false;

    panel.remove();
    stop.remove();

    var existingStyle =
      document.getElementById('ph-safe-style');

    if (existingStyle) {
      existingStyle.remove();
    }
  });

  document.body.appendChild(stop);

  refreshFields();

  log(
    'Phantom diagnostic mode started (' + detectMode() + ')',
    'good'
  );
})();
