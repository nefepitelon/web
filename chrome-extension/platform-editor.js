(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WelinkEditorFill = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const normalizeLines = (value) => String(value || "").replace(/\r\n?/g, "\n").split("\n");
  const semanticText = (value) => String(value || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  const comparableText = (value) => String(value || "").replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n+$/, "");

  function dispatch(editor, type, options = {}) {
    const view = editor.ownerDocument?.defaultView || globalThis;
    const EventType = type === "input" && view.InputEvent ? view.InputEvent : view.Event;
    editor.dispatchEvent(new EventType(type, { bubbles: true, composed: true, ...options }));
  }

  function replaceFormValue(editor, text) {
    const view = editor.ownerDocument?.defaultView || globalThis;
    const prototype = editor.tagName === "TEXTAREA" ? view.HTMLTextAreaElement?.prototype : view.HTMLInputElement?.prototype;
    const setter = prototype && Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(editor, text);
    else editor.value = text;
    dispatch(editor, "input", { inputType: "insertText", data: text });
  }

  function clearEditable(editor, documentRef) {
    const selection = documentRef.defaultView?.getSelection?.() || documentRef.getSelection?.();
    const range = documentRef.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const canCommand = typeof documentRef.execCommand === "function";
    const cleared = canCommand && documentRef.execCommand("delete", false);
    if (!cleared) range.deleteContents();
    return { canCommand, range, selection };
  }

  function insertXLines(documentRef, lines) {
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index] && !documentRef.execCommand("insertText", false, lines[index])) return false;
      if (index < lines.length - 1) {
        const paragraphInserted = documentRef.execCommand("insertParagraph", false);
        if (!paragraphInserted && !documentRef.execCommand("insertLineBreak", false)) return false;
      }
    }
    return true;
  }

  function fallbackEditable(editor, text, documentRef, selection) {
    const range = documentRef.createRange();
    range.selectNodeContents(editor);
    range.deleteContents();
    const textNode = documentRef.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    dispatch(editor, "input", { inputType: "insertText", data: text });
  }

  function setEditorValue(editor, value, platform, documentOverride) {
    if (!editor) throw new Error("没有找到可写入的发布编辑框。");
    const text = String(value || "").replace(/\r\n?/g, "\n");
    const documentRef = documentOverride || editor.ownerDocument || document;
    editor.focus();
    const tagName = String(editor.tagName || "").toUpperCase();
    if (tagName === "TEXTAREA" || tagName === "INPUT") {
      replaceFormValue(editor, text);
      dispatch(editor, "change");
      return { mode: "form", lineCount: normalizeLines(text).length };
    }

    const { canCommand, selection } = clearEditable(editor, documentRef);
    let inserted = false;
    if (platform === "x" && canCommand) inserted = insertXLines(documentRef, normalizeLines(text));
    else if (canCommand) inserted = documentRef.execCommand("insertText", false, text);
    if (!inserted) fallbackEditable(editor, text, documentRef, selection);
    dispatch(editor, "change");
    return { mode: platform === "x" ? "x-paragraphs" : "editable", lineCount: normalizeLines(text).length };
  }

  function makePlainTextTransfer(view, text) {
    const transfer = new view.DataTransfer();
    transfer.setData("text/plain", text);
    transfer.setData("text", text);
    return transfer;
  }

  function dispatchPlainTextPaste(editor, documentRef, text) {
    const view = documentRef.defaultView || globalThis;
    const transfer = makePlainTextTransfer(view, text);
    let event;
    try { event = new view.ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true, clipboardData: transfer }); }
    catch { event = new view.Event("paste", { bubbles: true, cancelable: true, composed: true }); }
    if (!event.clipboardData) Object.defineProperty(event, "clipboardData", { configurable: true, value: transfer });
    const dispatched = editor.dispatchEvent(event);
    return { pasteHandled: event.defaultPrevented || dispatched === false };
  }

  async function commitXEditorState(editor, value, documentOverride) {
    if (!editor) throw new Error("没有找到 X 发布编辑框。");
    const documentRef = documentOverride || editor.ownerDocument || document;
    const text = String(value || "").replace(/\r\n?/g, "\n");
    const lines = normalizeLines(text);
    const expectedText = comparableText(text);
    editor.focus();

    if (comparableText(editor.innerText || editor.textContent || "")) {
      const selection = documentRef.defaultView?.getSelection?.() || documentRef.getSelection?.();
      const range = documentRef.createRange();
      range.selectNodeContents(editor);
      selection?.removeAllRanges(); selection?.addRange(range);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    const { pasteHandled } = dispatchPlainTextPaste(editor, documentRef, text);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const firstObservedText = editor.innerText || editor.textContent || "";
    await new Promise((resolve) => setTimeout(resolve, 280));
    const observedText = editor.innerText || editor.textContent || "";
    const exact = comparableText(observedText) === expectedText;
    const stable = comparableText(firstObservedText) === comparableText(observedText);
    const stateAccepted = pasteHandled && exact && stable;
    return { exact, stable, stateAccepted, pasteHandled, observedText, lineCount: lines.length };
  }

  return { normalizeLines, semanticText, comparableText, setEditorValue, commitXEditorState };
});
