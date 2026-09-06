const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { setEditorValue, commitXEditorState } = require(path.resolve(__dirname, "..", "chrome-extension", "platform-editor.js"));

function createEditableHarness({ paragraphSupported = true, controlled = false } = {}) {
  let content = "";
  let publishState = "";
  let editor;
  const commands = [];
  const events = [];
  const pastePayloads = [];
  const listeners = new Map();
  const selection = { removeAllRanges() {}, addRange() {} };
  const range = {
    selectNodeContents() {}, deleteContents() { content = ""; }, insertNode(node) { content = node.textContent; },
    setStartAfter() {}, collapse() {}
  };
  class FakeEvent {
    constructor(type, options = {}) { this.type = type; Object.assign(this, options); this.defaultPrevented = false; }
    preventDefault() { if (this.cancelable !== false) this.defaultPrevented = true; }
  }
  class FakeDataTransfer {
    constructor() { this.values = new Map(); }
    setData(type, value) { this.values.set(type, String(value)); }
    getData(type) { return this.values.get(type) || ""; }
  }
  const documentRef = {
    defaultView: { Event: FakeEvent, InputEvent: FakeEvent, KeyboardEvent: FakeEvent, ClipboardEvent: FakeEvent, DataTransfer: FakeDataTransfer, getSelection: () => selection },
    createRange: () => range,
    createTextNode: (text) => ({ textContent: text }),
    execCommand(command, _ui, value) {
      commands.push([command, value]);
      let applied = true;
      if (command === "delete") content = "";
      else if (command === "insertText") content += value;
      else if (command === "insertParagraph") { if (!paragraphSupported) applied = false; else content += "\n"; }
      else if (command === "insertLineBreak") content += "\n";
      else applied = false;
      if (applied && controlled) editor.dispatchEvent(new FakeEvent("input", { inputType: command, data: value }));
      return applied;
    }
  };
  editor = {
    tagName: "DIV", contentEditable: "true", ownerDocument: documentRef,
    focus() {},
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
    dispatchEvent(event) {
      events.push(event.type);
      listeners.get(event.type)?.forEach((handler) => handler(event));
      if (event.type === "paste") {
        const pasted = event.clipboardData?.getData("text/plain") || "";
        pastePayloads.push(pasted);
        if (controlled) { publishState = pasted; content = pasted; event.preventDefault(); }
      }
      if (controlled && event.type === "beforeinput" && event.inputType === "insertText") { content += event.data; event.preventDefault(); }
      if (controlled && event.type === "keydown" && event.key === "Enter") { content += "\n"; event.preventDefault(); }
      if (controlled && event.type === "keydown" && event.key === "Backspace") { content = ""; event.preventDefault(); }
      return !event.defaultPrevented;
    },
    get textContent() { return content; }, get innerText() { return content; }
  };
  return { editor, documentRef, commands, events, pastePayloads, content: () => content, published: () => publishState };
}

test("X editor commits Chinese multiline text as editable paragraphs", () => {
  const harness = createEditableHarness();
  const text = "第一行：市场观察\n第二行：执行建议\n第三行：保持耐心";
  const result = setEditorValue(harness.editor, text, "x", harness.documentRef);
  assert.equal(harness.content(), text);
  assert.equal(result.mode, "x-paragraphs");
  assert.equal(result.lineCount, 3);
  assert.equal(harness.editor.contentEditable, "true");
  assert.equal(harness.commands.filter(([command]) => command === "insertParagraph").length, 2);
});

test("X editor preserves blank lines, hashtags, emoji and CRLF input", () => {
  const harness = createEditableHarness();
  const source = "标题 🚀\r\n\r\n正文 #BTC #AI\r\nhttps://welinkbtc-onchainmain.xyz";
  const expected = source.replace(/\r\n/g, "\n");
  setEditorValue(harness.editor, source, "x", harness.documentRef);
  assert.equal(harness.content(), expected);
  assert.equal(harness.commands.filter(([command]) => command === "insertParagraph").length, 3);
  assert.ok(harness.events.includes("change"));
});

test("X editor falls back to line breaks when paragraph insertion is unavailable", () => {
  const harness = createEditableHarness({ paragraphSupported: false });
  setEditorValue(harness.editor, "第一行\n第二行", "x", harness.documentRef);
  assert.equal(harness.content(), "第一行\n第二行");
  assert.equal(harness.commands.filter(([command]) => command === "insertLineBreak").length, 1);
});

test("X controlled editor accepts one plain-text paste into publish state", async () => {
  const harness = createEditableHarness({ controlled: true });
  const text = "第一行：完整正文\n\n第二行：#BTC 🚀\nhttps://welinkbtc-onchainmain.xyz";
  const result = await commitXEditorState(harness.editor, text, harness.documentRef);
  assert.equal(harness.content(), text);
  assert.equal(result.exact, true);
  assert.equal(result.stable, true);
  assert.equal(result.stateAccepted, true);
  assert.equal(result.pasteHandled, true);
  assert.equal(harness.published(), text);
  assert.deepEqual(harness.pastePayloads, [text]);
  assert.equal(harness.commands.length, 0);
});

test("X rejects an unhandled synthetic paste without writing surface-only DOM", async () => {
  const harness = createEditableHarness();
  const result = await commitXEditorState(harness.editor, "表面可见但未进入状态", harness.documentRef);
  assert.equal(result.exact, false);
  assert.equal(result.stateAccepted, false);
  assert.equal(result.pasteHandled, false);
  assert.equal(harness.content(), "");
  assert.equal(harness.commands.length, 0);
});

test("X replaces an existing draft atomically instead of appending a second copy", async () => {
  const harness = createEditableHarness({ controlled: true });
  const text = "标题保持原样\n\n正文第一段\n\n正文第二段 #AI获客";
  await commitXEditorState(harness.editor, text, harness.documentRef);
  const result = await commitXEditorState(harness.editor, text, harness.documentRef);
  assert.equal(harness.content(), text);
  assert.equal(harness.published(), text);
  assert.equal(result.exact, true);
  assert.equal(result.stateAccepted, true);
  assert.deepEqual(harness.pastePayloads, [text, text]);
  assert.equal(harness.commands.length, 0);
});

test("X paste path preserves formatting across multiple publishing scenarios", async () => {
  const scenarios = [
    "标题\n\n第一段正文\n\n末尾一行",
    "行情观察 🚀\n\n#BTC #AI_运营\nhttps://welinkbtc-onchainmain.xyz",
    "首行\r\n\r\n中间空行\r\n末行",
    "中英文 mixed content；标点，。！？\n\n标签 #AI获客",
    `${"接近字数限制的正文。".repeat(20).slice(0, 250)}\n#BTC`
  ];
  for (const source of scenarios) {
    const harness = createEditableHarness({ controlled: true });
    const expected = source.replace(/\r\n?/g, "\n");
    const result = await commitXEditorState(harness.editor, source, harness.documentRef);
    assert.equal(result.stateAccepted, true);
    assert.equal(harness.content(), expected);
    assert.equal(harness.published(), expected);
    assert.deepEqual(harness.pastePayloads, [expected]);
  }
});
