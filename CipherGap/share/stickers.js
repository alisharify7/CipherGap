// Sticker purpose and original metadata live INSIDE the authenticated CGPE body.
// Adapters only transport files; encryption remains in file_crypto.
(function (shared) {
  const maxBytes = 5 * 1024 * 1024;
  const types = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    webm: "video/webm",
  };
  const choices = [
    "😀",
    "😂",
    "🥰",
    "😎",
    "🥳",
    "🤔",
    "😴",
    "😭",
    "😡",
    "🤯",
    "👍",
    "👏",
    "🙏",
    "💪",
    "❤️",
    "💔",
    "🔥",
    "✨",
    "🎉",
    "🌹",
    "☕",
    "🎂",
    "🐱",
    "🦊",
  ];
  let active = null;
  async function pack(file) {
    const type = file.type || types[file.name.split(".").at(-1).toLowerCase()];
    if (!Object.values(types).includes(type))
      throw new Error("Choose a PNG, JPEG, WebP, GIF, AVIF or WebM sticker.");
    if (!file.size || file.size > maxBytes)
      throw new Error("Stickers must be 5 MB or smaller.");
    const meta = new TextEncoder().encode(
      JSON.stringify({
        name: shared.file_crypto.sanitize_cgpe_filename(file.name),
        type,
      }),
    );
    if (meta.length > 4096)
      throw new Error("The sticker filename is too long.");
    const header = new Uint8Array(8);
    header.set([67, 71, 83, 49]);
    new DataView(header.buffer).setUint32(4, meta.length, true);
    return new File(
      [header, meta, await file.arrayBuffer()],
      `ciphergap-sticker-${crypto.randomUUID()}.cgst`,
      { type: "application/x-ciphergap-sticker" },
    );
  }
  function unpack(file) {
    const bytes = new Uint8Array(file.data);
    if (
      bytes.length < 4 ||
      ![67, 71, 83, 49].every((byte, i) => bytes[i] === byte)
    )
      return null;
    if (bytes.length < 8) throw new Error("Invalid encrypted sticker.");
    const length = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(4, true);
    if (
      !length ||
      length > 4096 ||
      bytes.length <= 8 + length ||
      bytes.length - 8 - length > maxBytes
    )
      throw new Error("Invalid encrypted sticker.");
    // Views and an explicit copy avoid Firefox Xray TypedArray species lookup.
    const meta = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        new Uint8Array(bytes.buffer, bytes.byteOffset + 8, length),
      ),
    );
    if (
      typeof meta.name !== "string" ||
      !Object.values(types).includes(meta.type)
    )
      throw new Error("Invalid encrypted sticker.");
    const data = new Uint8Array(bytes.length - 8 - length);
    data.set(
      new Uint8Array(bytes.buffer, bytes.byteOffset + 8 + length, data.length),
    );
    return {
      name: shared.file_crypto.sanitize_cgpe_filename(meta.name),
      type: meta.type,
      data: data.buffer,
      purpose: "sticker",
    };
  }
  async function emoji_file(emoji) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    context.font =
      '190px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(emoji, 128, 138);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("Could not create this sticker.");
    return new File([blob], "sticker.png", { type: "image/png" });
  }
  function close() {
    active?.close();
  }
  function open_picker({ insertEmoji, sendSticker, theme = "light" }) {
    close();
    let previous = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = "ciphergap-file-viewer ciphergap-media-picker";
    dialog.dataset.ciphergapUi = "media-picker";
    dialog.dataset.ciphergapTheme = theme;
    const header = document.createElement("header"),
      title = document.createElement("h2");
    title.id = "ciphergap-media-title";
    title.textContent = "Emoji & stickers";
    dialog.setAttribute("aria-labelledby", title.id);
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Close";
    dismiss.onclick = () => dialog.close();
    header.append(title, dismiss);
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Choose media");
    nav.setAttribute("role", "tablist");
    const grid = document.createElement("div");
    grid.className = "ciphergap-media-picker__grid";
    grid.setAttribute("role", "tabpanel");
    grid.id = "ciphergap-media-panel";
    const hint = document.createElement("p");
    hint.className = "ciphergap-media-picker__hint";
    const imported = document.createElement("button");
    imported.type = "button";
    imported.className = "ciphergap-media-picker__import";
    imported.textContent = "Choose sticker file";
    const status = document.createElement("div");
    status.setAttribute("role", "status");
    let mode = "emoji",
      busy = false;
    const perform = async (file) => {
      if (busy) return;
      busy = true;
      dialog.setAttribute("aria-busy", "true");
      dialog.querySelectorAll("button").forEach((b) => {
        if (b !== dismiss) b.disabled = true;
      });
      status.textContent = "Encrypting sticker…";
      try {
        await sendSticker(file);
        if (dialog.isConnected) dialog.close();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy = false;
        dialog.removeAttribute("aria-busy");
        dialog.querySelectorAll("button").forEach((b) => (b.disabled = false));
      }
    };
    const tabs = ["Emoji", "Stickers"].map((label, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = "ciphergap-media-tab-" + index;
      button.textContent = label;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", grid.id);
      button.onclick = () => select(index);
      button.onkeydown = (event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
          tabs[next].focus();
          select(next);
        }
      };
      nav.append(button);
      return button;
    });
    function select(index) {
      mode = index ? "sticker" : "emoji";
      tabs.forEach((tab, i) => {
        tab.setAttribute("aria-selected", String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
      });
      grid.setAttribute("aria-labelledby", tabs[index].id);
      hint.textContent = index
        ? "Stickers are encrypted before the messenger preview opens. Confirm Send there."
        : "Emoji are added to your draft. Use Encrypt to send.";
      imported.hidden = !index;
      grid.replaceChildren();
      for (const emoji of choices) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = emoji;
        button.setAttribute("translate", "no");
        button.setAttribute(
          "aria-label",
          (index ? "Send sticker: " : "Insert emoji: ") + emoji,
        );
        button.onclick = async () => {
          if (mode === "emoji") {
            previous = insertEmoji(emoji) || previous;
            dialog.close();
          } else {
            try {
              await perform(await emoji_file(emoji));
            } catch (error) {
              status.textContent = error.message;
            }
          }
        };
        grid.append(button);
      }
    }
    imported.onclick = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = Object.values(types).join(",");
      input.hidden = true;
      input.dataset.ciphergapInternalFileInput = "true";
      input.onchange = () => {
        const file = input.files?.[0];
        input.remove();
        if (file) perform(file);
      };
      input.oncancel = () => input.remove();
      dialog.append(input);
      input.click();
    };
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        if (active === dialog) active = null;
        if (previous?.isConnected) previous.focus();
      },
      { once: true },
    );
    dialog.append(header, nav, hint, grid, imported, status);
    select(0);
    document.body.append(dialog);
    active = dialog;
    dialog.showModal();
    tabs[0].focus();
    return dialog;
  }
  shared.stickers = Object.freeze({
    pack,
    unpack,
    open_picker,
    close,
    max_bytes: maxBytes,
  });
})(globalThis.CipherGapShared);
