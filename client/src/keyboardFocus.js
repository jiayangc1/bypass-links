export function isEditableTarget(target) {
  if (typeof target?.closest !== "function") return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function shouldFocusBypassInput(event) {
  if (event.defaultPrevented || isEditableTarget(event.target)) return false;

  const isPasteShortcut = (event.ctrlKey || event.metaKey)
    && !event.altKey
    && event.key.toLowerCase() === "v";

  if (isPasteShortcut) return true;
  if (event.ctrlKey || event.metaKey || event.altKey) return false;

  return event.key.length === 1;
}
