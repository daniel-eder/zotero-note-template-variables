/* global Zotero, ChromeUtils, Services */

var loaded = false;

async function install() {}

async function uninstall() {}

async function startup({ id, version, resourceURI, rootURI = resourceURI.spec }) {
  if (typeof Zotero === "undefined") {
    return;
  }

  if (Zotero.initializationPromise) {
    await Zotero.initializationPromise;
  }

  if (!loaded && !Zotero.__addonInstance__) {
    Services.scriptloader.loadSubScript(
      `${rootURI}content/scripts/__addonRef__.js`,
      { Zotero, ChromeUtils, Services }
    );
    loaded = true;
  }

  await Zotero.__addonInstance__?.startup({ id, version, rootURI });
}

function shutdown() {
  if (typeof Zotero !== "undefined" && Zotero.__addonInstance__) {
    Zotero.__addonInstance__.shutdown();
    delete Zotero.__addonInstance__;
  }
  loaded = false;
}

function onMainWindowLoad() {}

function onMainWindowUnload() {}
