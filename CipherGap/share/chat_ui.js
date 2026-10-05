// Presentation shared by all messengers. Native DOM hooks stay in adapters.
(function (shared) {
  const paths = {
    lock: "M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v10H5z M12 15v2",
    file: "M14 2H6v20h12V6z M14 2v5h5 M9 12h6 M9 16h6",
    smile:
      "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M8 9h.01 M16 9h.01 M8 14s1 3 4 3 4-3 4-3",
    pause: "M8 5v14 M16 5v14",
    play: "m8 5 11 7-11 7z",
    send: "m3 3 18 9-18 9 4-9z M7 12h14",
    download: "M12 3v12 m-5-5 5 5 5-5 M4 17v4h16v-4",
  };
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.7",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    }))
      svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", paths[name] || paths.lock);
    svg.append(path);
    return svg;
  }
  function button(element, glyph, text, compact = false) {
    const label = document.createElement("span");
    label.dataset.cgButtonLabel = "true";
    label.textContent = text;
    if (compact) label.className = "ciphergap-sr-only";
    element.replaceChildren(icon(glyph), label);
    element.title = text;
    element.setAttribute("aria-label", text);
  }
  function set_label(element, text) {
    const label = element.querySelector("[data-cg-button-label]");
    if (label) label.textContent = text;
    else element.textContent = text;
  }
  function theme(input) {
    const color = input && getComputedStyle(input).color;
    const channels = color
      ?.match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    return channels
      ? channels.reduce((a, b) => a + b, 0) > 450
        ? "dark"
        : "light"
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  }
  function layout(row, payload) {
    // Telegram's text wrapper has inline-size containment. Replacing text
    // otherwise leaves a zero-width bubble, wrapping every character.
    for (
      let node = payload?.parentElement;
      node && node !== row;
      node = node.parentElement
    ) {
      // Pending outgoing bubbles acquire containment only after delivery.
      // Mark every ancestor now so that native transition cannot collapse it.
      node.dataset.ciphergapLayout = "message";
    }
  }
  function read_editor(element) {
    if (/^(TEXTAREA|INPUT)$/.test(element.tagName)) return element.value;
    if (!element.querySelector("img[alt]"))
      return element.innerText ?? element.textContent;
    function text(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      if (node.tagName === "IMG") return node.getAttribute("alt") || "";
      if (node.tagName === "BR") return "\n";
      let result = "";
      for (const child of node.childNodes) {
        if (
          child.nodeType === Node.ELEMENT_NODE &&
          /^(DIV|P)$/.test(child.tagName) &&
          result &&
          !result.endsWith("\n")
        )
          result += "\n";
        result += text(child);
      }
      return result;
    }
    return text(element);
  }
  function write_editor(element, text) {
    if (/^(TEXTAREA|INPUT)$/.test(element.tagName)) {
      // Call the native setter so React's value tracker sees the input event.
      const prototype = element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, text);
    } else element.textContent = text;
    element.dispatchEvent(new InputEvent("input", {bubbles:true,inputType:text ? "insertText" : "deleteContentBackward",data:text || null}));
  }
  function scroll_container(element) {
    for (let node=element?.parentElement;node && node!==document.body;node=node.parentElement) {
      if (/^(auto|scroll)$/.test(getComputedStyle(node).overflowY)) return node;
    }
    return null;
  }
  shared.chat_ui = Object.freeze({
    icon,
    button,
    set_label,
    theme,
    layout,
    read_editor,
    write_editor,
    scroll_container,
  });
})(globalThis.CipherGapShared);
