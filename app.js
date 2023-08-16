// -----------------------------------------------------------------------------
// go-app
// -----------------------------------------------------------------------------
var log = function (msg) {  console.log("app.js: " + msg) }

log("entry")

var goappNav = function () { log("goappNav stub called") };
var goappOnUpdate = function () { log("goappOnUpdate stub called") };
var goappOnAppInstallChange = function () { log("goappOnAppInstallChange stub called") };
var goappHandlersSet = false;

const goappEnv = {"GOAPP_INTERNAL_URLS":"null","GOAPP_ROOT_PREFIX":"/goappdemo","GOAPP_STATIC_RESOURCES_URL":"/goappdemo","GOAPP_VERSION":"405cf6a725e883b66e141cb31c0ccce6c96ef923"};
const goappLoadingLabel = "{progress}%";
const goappWasmContentLengthHeader = "";

let goappServiceWorkerRegistration;
let deferredPrompt = null;

goappInitServiceWorker();
goappInitWebAssembly();

function checkFlag() {
  if(!goappHandlersSet) {
    log("goappHandlersSet is false, re-checking")
    window.setTimeout(checkFlag, 100); /* this checks the flag every 100 milliseconds*/
  } else {
    log("goappHandlersSet is true, continuing")
    goappWatchForUpdate();
    goappWatchForInstallable();
  }
}
checkFlag();
log("exit")

// -----------------------------------------------------------------------------
// Service Worker
// -----------------------------------------------------------------------------
async function goappInitServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register(
        "/goappdemo/app-worker.js"
      );

      goappServiceWorkerRegistration = registration;
      goappSetupNotifyUpdate(registration);
      goappSetupAutoUpdate(registration);
      goappSetupPushNotification();
    } catch (err) {
      console.error("goapp service worker registration failed", err);
    }
  }
}

// -----------------------------------------------------------------------------
// Update
// -----------------------------------------------------------------------------
function goappWatchForUpdate() {
  log("goappWatchForUpdate()")
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    log("goappWatchForUpdate() beforeinstallprompt deferredPrompt = ", deferredPrompt)
    goappOnAppInstallChange();
  });
}

function goappSetupNotifyUpdate(registration) {
  registration.onupdatefound = () => {
    const installingWorker = registration.installing;

    installingWorker.onstatechange = () => {
      if (installingWorker.state != "installed") {
        return;
      }

      if (!navigator.serviceWorker.controller) {
        return;
      }

      goappOnUpdate();
    };
  };
}

function goappSetupAutoUpdate(registration) {
  const autoUpdateInterval = "0";
  if (autoUpdateInterval == 0) {
    return;
  }

  window.setInterval(() => {
    registration.update();
  }, autoUpdateInterval);
}

// -----------------------------------------------------------------------------
// Install
// -----------------------------------------------------------------------------
function goappWatchForInstallable() {
  log("goappWatchForInstallable()")
  window.addEventListener("appinstalled", () => {
    log("goappWatchForInstallable() event appinstalled")
    deferredPrompt = null;
    goappOnAppInstallChange();
  });
}

function goappIsAppInstallable() {
  return !goappIsAppInstalled() && deferredPrompt != null;
}

function goappIsAppInstalled() {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  return isStandalone || navigator.standalone;
}

async function goappShowInstallPrompt() {
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
}

// -----------------------------------------------------------------------------
// Environment
// -----------------------------------------------------------------------------
function goappGetenv(k) {
  return goappEnv[k];
}

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------
function goappSetupPushNotification() {
  navigator.serviceWorker.addEventListener("message", (event) => {
    const msg = event.data.goapp;
    if (!msg) {
      return;
    }

    if (msg.type !== "notification") {
      return;
    }

    goappNav(msg.path);
  });
}

async function goappSubscribePushNotifications(vapIDpublicKey) {
  try {
    const subscription =
      await goappServiceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapIDpublicKey,
      });
    return JSON.stringify(subscription);
  } catch (err) {
    console.error(err);
    return "";
  }
}

function goappNewNotification(jsonNotification) {
  let notification = JSON.parse(jsonNotification);

  const title = notification.title;
  delete notification.title;

  let path = notification.path;
  if (!path) {
    path = "/";
  }

  const webNotification = new Notification(title, notification);

  webNotification.onclick = () => {
    goappNav(path);
    webNotification.close();
  };
}

// -----------------------------------------------------------------------------
// Keep Clean Body
// -----------------------------------------------------------------------------
function goappKeepBodyClean() {
  const body = document.body;
  const bodyChildrenCount = body.children.length;

  const mutationObserver = new MutationObserver(function (mutationList) {
    mutationList.forEach((mutation) => {
      switch (mutation.type) {
        case "childList":
          while (body.children.length > bodyChildrenCount) {
            body.removeChild(body.lastChild);
          }
          break;
      }
    });
  });

  mutationObserver.observe(document.body, {
    childList: true,
  });

  return () => mutationObserver.disconnect();
}

// -----------------------------------------------------------------------------
// Web Assembly
// -----------------------------------------------------------------------------
async function goappInitWebAssembly() {
  const loader = document.getElementById("app-wasm-loader");

  if (!goappCanLoadWebAssembly()) {
    loader.remove();
    return;
  }

  let instantiateStreaming = WebAssembly.instantiateStreaming;
  if (!instantiateStreaming) {
    instantiateStreaming = async (resp, importObject) => {
      const source = await (await resp).arrayBuffer();
      return await WebAssembly.instantiate(source, importObject);
    };
  }

  const loaderIcon = document.getElementById("app-wasm-loader-icon");
  const loaderLabel = document.getElementById("app-wasm-loader-label");

  try {
    const showProgress = (progress) => {
      loaderLabel.innerText = goappLoadingLabel.replace("{progress}", progress);
    };
    showProgress(0);

    const go = new Go();
    const wasm = await instantiateStreaming(
      fetchWithProgress("/goappdemo/web/app.wasm", showProgress),
      go.importObject
    );

    log("go.run(wasm.instance)")
    go.run(wasm.instance);
    loader.remove();
  } catch (err) {
    loaderIcon.className = "goapp-logo";
    loaderLabel.innerText = err;
    console.error("loading wasm failed: ", err);
  }
}

function goappCanLoadWebAssembly() {
  if (
    /bot|googlebot|crawler|spider|robot|crawling/i.test(navigator.userAgent)
  ) {
    return false;
  }

  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("wasm") !== "false";
}

async function fetchWithProgress(url, progess) {
  const response = await fetch(url);

  let contentLength;
  try {
    contentLength = response.headers.get(goappWasmContentLengthHeader);
  } catch {}
  if (!goappWasmContentLengthHeader || !contentLength) {
    contentLength = response.headers.get("Content-Length");
  }

  const total = parseInt(contentLength, 10);
  let loaded = 0;

  const progressHandler = function (loaded, total) {
    progess(Math.round((loaded * 100) / total));
  };

  var res = new Response(
    new ReadableStream(
      {
        async start(controller) {
          var reader = response.body.getReader();
          for (;;) {
            var { done, value } = await reader.read();

            if (done) {
              progressHandler(total, total);
              break;
            }

            loaded += value.byteLength;
            progressHandler(loaded, total);
            controller.enqueue(value);
          }
          controller.close();
        },
      },
      {
        status: response.status,
        statusText: response.statusText,
      }
    )
  );

  for (var pair of response.headers.entries()) {
    res.headers.set(pair[0], pair[1]);
  }

  return res;
}
