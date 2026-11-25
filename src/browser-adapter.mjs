export function createBrowserAdapter({
  playwright, url, goto, snapshot, screenshot, click, drag,
}) {
  if (!playwright || typeof url !== 'function' || typeof snapshot !== 'function') {
    throw new TypeError('A browser locator interface, URL reader, and snapshot reader are required.');
  }

  const tab = {
    playwright,
    url,
    async getAXState() {
      const state = await snapshot();
      const location = new URL(await url());
      // Include the result path for browser snapshots that omit the URL.
      // Drop query parameters and fragments from this added metadata.
      return `${location.origin}${location.pathname}\n${state}`;
    },
  };

  if (goto) tab.goto = goto;
  if (screenshot) tab.getScreenshot = screenshot;
  if (click) tab.click = click;
  if (drag) tab.drag = drag;
  return tab;
}
