// -----------------------------------------------------------------------------
// go-app
// -----------------------------------------------------------------------------
console.log("app.js: entry")

var goappNav = function () {console.log("app.js : goappNav stub called")};
var goappOnUpdate = function () {console.log("app.js : goappOnUpdate stub called")};
var goappOnAppInstallChange = function () {console.log("app.js : goappOnAppInstallChange stub called")};
var goappHandlersSet = false;

const goappEnv = {"GOAPP_INTERNAL_URLS":"null","GOAPP_ROOT_PREFIX":"/goappdemo","GOAPP_STATIC_RESOURCES_URL":"/goappdemo","GOAPP_VERSION":"f7c4b6e38f65eb8abe8f8f5961348ad289ead1ce"};
const goappLoadingLabel = "{progress}%";
const goappWasmContentLengthHeader = "";

let goappServiceWorkerRegistration;
let deferredPrompt = null;

goappInitServiceWorker();
goappWatchForUpdate();
goappInitWebAssembly();
goappWatchForInstallable();

console.log("app.js: exit")

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
  console.log("app.js: goappWatchForUpdate()")
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("app.js: goappWatchForUpdate() beforeinstallprompt deferredPrompt = ", deferredPrompt)
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
  console.log("app.js: goappWatchForInstallable()")
  window.addEventListener("appinstalled", () => {
    console.log("app.js: goappWatchForInstallable() event appinstalled")
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
