"use strict";

var _ = require('./lodash');
var Dom = require('./packages/dom');

var SelectionHandler = function(wrapper, mediator, editor) {
  this.wrapper = wrapper;
  this.mediator = mediator;
  this.editor = editor;
  this.options = editor.options;

  this.startIndex = this.endIndex = 0;
  this.selecting = false;

  this._bindFunctions();
  this._bindMediatedEvents();

  this.initialize();
};

Object.assign(SelectionHandler.prototype, require('./function-bind'), require('./mediated-events'), {

  eventNamespace: 'selection',

  bound: ['onKeyDown', 'onMouseUp'],

  mediatedEvents: {
    'start': 'start',
    'render': 'render',
    'complete': 'complete',
    'all': 'all',
    'copy': 'copy',
    'update': 'update',
    'delete': 'delete',
    'cancel': 'cancel',
    'block': 'block'
  },

  cancelSelectAll: function() {
    // Don't select if within an input field
    var editorEl1 = Dom.getClosest(document.activeElement, 'input');
    if (editorEl1 !== document.body) return true;

    var editorEl2 = Dom.getClosest(document.activeElement, '.st-outer');

    // Don't select all if focused on element outside of the editor.
    if (this.options.selectionLimitToEditor) {
      if (editorEl2 !== this.wrapper) return true;
    }
  },

  initialize: function() {
    window.addEventListener("keydown", this.onKeyDown, false);
    window.addEventListener('mouseup', this.onMouseUp, false);
  },

  start: function(index, options = {}) {
    options = Object.assign({ mouseEnabled: false }, options);

    this.startIndex = this.endIndex = index;
    this.selecting = true;
    this.mediator.trigger("selection:render");

    if (options.mouseEnabled) {
      window.mouseDown = true;
      window.addEventListener("mousemove", this.onMouseMove);
    }
  },

  startAtEnd: function() {
    this.start(this.editor.getBlocks().length - 1);
  },

  move: function(offset) {
    this.start(this.endIndex + offset);
  },

  onMouseMove: function() {},

  update: function(index) {
    if (index < 0 || index >= this.editor.getBlocks().length) return;
    this.endIndex = index;
    this.mediator.trigger("selection:render");
  },

  expand(offset) {
    this.update(this.endIndex + offset);
  },

  expandToStart() {
    this.update(0);
  },

  expandToEnd() {
    this.update(this.editor.getBlocks().length - 1);
  },

  focusAtEnd() {
    const block = this.editor.getBlocks()[this.endIndex];
    block.el.scrollIntoView({ behavior: "smooth" });
  },

  complete: function() {
    window.removeEventListener("mousemove", this.onMouseMove);
  },

  all: function() {
    this.removeNativeSelection();

    var blocks = this.editor.getBlocks();
    this.selecting = true;
    this.startIndex = 0;
    this.endIndex = blocks.length - 1;
    this.mediator.trigger("selection:render");
  },

  cancel: function() {
    window.mouseDown = false;
    this.selecting = false;
    this.render();
  },

  removeNativeSelection: function() {
    var sel = window.getSelection ? window.getSelection() : document.selection;
    if (sel) {
      if (sel.removeAllRanges) {
        sel.removeAllRanges();
      } else if (sel.empty) {
        sel.empty();
      }
    }
    document.activeElement && document.activeElement.blur();
  },

  render: function() {
    this.editor.getBlocks().forEach((block, idx) => {
      block.select(this.selecting && this.indexSelected(idx));
    });
  },

  getClipboardData: function() {
    this.editor.getData();

    var output = [];

    this.editor.getBlocks().forEach((block, idx) => {
      if (this.indexSelected(idx)) output.push(block.asClipboardHTML());
    });

    return output.join("\n");
  },

  copy: function() {
    var copyArea = document.body.querySelector(".st-copy-area");
    if (!copyArea) {
      copyArea = Dom.createElement("div", {
        contenteditable: true,
        class: 'st-copy-area st-utils__hidden',
      });
      document.body.appendChild(copyArea);
    }
    copyArea.innerHTML = this.getClipboardData();

    var selection = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(copyArea);
    selection.removeAllRanges();
    selection.addRange(range);

    try {
      document.execCommand('copy');
      copyArea.blur();
    }
    catch (err) {
      console.log("Copy could not be performed");
    }
  },

  delete: function() {
    this.editor.getBlocks().forEach((blockEl, idx) => {
      if (this.indexSelected(idx)) this.mediator.trigger("block:remove", block.blockID, { focusOnNext: true });
    });
  },

  indexSelected: function(index) {
    return index >= this.getStartIndex() && index <= this.getEndIndex();
  },

  block: function(block) {
    var blockPosition = this.editor.blockManager.getBlockPosition(block.el);

    this.mediator.trigger("formatter:hide");
    this.removeNativeSelection();
    this.start(blockPosition);
  },

  getStartIndex: function() {
    return Math.min(this.startIndex, this.endIndex);
  },


  getEndIndex: function() {
    return Math.max(this.startIndex, this.endIndex);
  },

  getStartBlock: function() {
    return this.editor.getBlocks()[this.getStartIndex()];
  },

  getEndBlock: function() {
    return this.editor.getBlocks()[this.getEndIndex()];
  },

  onKeyDown: function(e) {
    e = e || window.event;
    var ctrlKey = e.ctrlKey || e.metaKey;
    var key = e.key;

    if (ctrlKey) {
      if (this.options.selectionCopy && key === "a") {
        if (this.cancelSelectAll()) return;
        e.preventDefault();
        this.mediator.trigger("selection:all");
      } else if (this.options.selectionCopy && key === "c") {
        if (!this.selecting) return;
        e.preventDefault();
        this.mediator.trigger("selection:copy");
      } else if (this.options.selectionDelete && key === "x") {
        this.mediator.trigger("selection:delete");
      }
    } else if (this.selecting && ["Down", "ArrowDown"].indexOf(key) > -1) {
      e.preventDefault();
      if (e.shiftKey && e.altKey) this.expandToEnd();
      else if (e.shiftKey) this.expand(1);
      else if (e.altKey) this.startAtEnd();
      else {
        this.cancel();
        this.mediator.trigger("block:focusNext", this.getEndBlock().blockID, { force: true });
        return;
      }
      this.focusAtEnd();
    } else if (this.selecting && ["Up", "ArrowUp"].indexOf(key) > -1) {
      e.preventDefault();
      if (e.shiftKey && e.altKey) this.expandToStart();
      else if (e.shiftKey) this.expand(-1);
      else if (e.altKey) this.start(0);
      else {
        this.cancel();
        this.mediator.trigger("block:focusPrevious", this.getStartBlock().blockID, { force: true });
        return;
      }
      this.focusAtEnd();
    }
  },

  onMouseUp: function() {
    if (!window.mouseDown) {
      this.mediator.trigger("selection:complete");
      this.mediator.trigger("selection:cancel");
      return;
    }

    window.mouseDown = false;
    this.mediator.trigger("selection:complete");
  }
});

module.exports = SelectionHandler;
