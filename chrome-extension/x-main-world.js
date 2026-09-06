(function () {
  const VERSION = "0.3.0";
  const SOURCE = "welinkbtc-x-main";
  const RUNTIME_KEY = "__welinkbtcXMainRuntime";
  const previousRuntime = window[RUNTIME_KEY];
  if (previousRuntime?.dispose) previousRuntime.dispose();

  const inflightRequests = new Map();
  const completedRequests = new Map();
  const visible = (element) => Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  const findEditor = () => [...document.querySelectorAll("[data-testid='tweetTextarea_0'], div[contenteditable='true'][role='textbox']")].find(visible) || null;
  const normalizeText = (value) => String(value || "").replace(/\r\n?/g, "\n");
  const comparableText = (value) => normalizeText(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n+$/, "");
  const readEditorText = (editor) => editor.innerText || editor.textContent || "";
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function selectEditorContents(editor) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function makePlainTextTransfer(text) {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", text);
    transfer.setData("text", text);
    return transfer;
  }

  function dispatchPlainTextPaste(editor, text) {
    const transfer = makePlainTextTransfer(text);
    let event;
    try {
      event = new ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true, clipboardData: transfer });
    } catch {
      event = new Event("paste", { bubbles: true, cancelable: true, composed: true });
    }
    if (!event.clipboardData) Object.defineProperty(event, "clipboardData", { configurable: true, value: transfer });
    const dispatched = editor.dispatchEvent(event);
    return { pasteHandled: event.defaultPrevented || dispatched === false };
  }

  async function commitXEditorState(editor, value) {
    if (!editor) throw new Error("没有找到 X 发布编辑框。");
    const text = normalizeText(value);
    const expectedText = comparableText(text);
    editor.focus();

    if (comparableText(readEditorText(editor))) {
      selectEditorContents(editor);
      // 给 X 的 selectionchange 处理器一个事件循环来同步全选状态。
      await wait(80);
    }

    // 只派发一次 text/plain paste。X 必须由自己的编辑器处理器接管事件；
    // 不再用 execCommand 或直接改 DOM，避免“表面完整、发布只剩末行”。
    const { pasteHandled } = dispatchPlainTextPaste(editor, text);
    await wait(220);
    const firstObservedText = readEditorText(editor);
    await wait(280);
    const observedText = readEditorText(editor);
    const exact = comparableText(observedText) === expectedText;
    const stable = comparableText(firstObservedText) === comparableText(observedText);
    const stateAccepted = pasteHandled && exact && stable;
    return { exact, stable, stateAccepted, pasteHandled, observedText, lineCount: text.split("\n").length };
  }

  function postResult(requestId, payload) {
    window.postMessage({ source: SOURCE, type: "COMMIT_X_RESULT", requestId, ...payload }, location.origin);
  }

  async function handleMessage(event) {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "welinkbtc-x-isolated" || event.data?.type !== "COMMIT_X_TEXT") return;
    const requestId = event.data.requestId;
    if (!requestId) return;
    if (completedRequests.has(requestId)) {
      postResult(requestId, completedRequests.get(requestId));
      return;
    }
    if (inflightRequests.has(requestId)) return;

    const task = (async () => {
      try {
        const text = typeof event.data.text === "string" ? event.data.text : "";
        if (!text.trim() || text.length > 10000) throw new Error("X 正文为空或过长。");
        return { ok: true, result: await commitXEditorState(findEditor(), text) };
      } catch (error) {
        return { ok: false, error: error.message || "X 正文提交失败。" };
      }
    })();

    inflightRequests.set(requestId, task);
    const payload = await task;
    inflightRequests.delete(requestId);
    completedRequests.set(requestId, payload);
    postResult(requestId, payload);
    setTimeout(() => completedRequests.delete(requestId), 15000);
  }

  window.addEventListener("message", handleMessage);
  window[RUNTIME_KEY] = {
    version: VERSION,
    dispose() {
      window.removeEventListener("message", handleMessage);
      inflightRequests.clear();
      completedRequests.clear();
    }
  };
  window.postMessage({ source: SOURCE, type: "X_MAIN_READY", version: VERSION }, location.origin);
})();
