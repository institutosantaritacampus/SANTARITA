(() => {
  "use strict";

  const CONFIG_API = "https://script.google.com/macros/s/AKfycbwlh1kMeJjrKdIR6wkZrOS5kCFzg4ASalbs3llnNRI5V95EuHmXuqOUvOSCwRlaouwC3w/exec";
  let OS = null;
  let initPromise = null;

  function repoInfo() {
    const isGithubProject = location.hostname.endsWith(".github.io");
    const parts = location.pathname.split("/").filter(Boolean);
    const repo = isGithubProject && parts.length ? parts[0] : "";
    return {
      workerPath: repo ? `${repo}/OneSignalSDKWorker.js` : "OneSignalSDKWorker.js",
      scope: repo ? `/${repo}/` : "/"
    };
  }

  function loadConfig() {
    return new Promise((resolve, reject) => {
      const cb = "__srPushConfig_" + Date.now() + "_" + Math.floor(Math.random()*10000);
      const s = document.createElement("script");

      window[cb] = payload => {
        try {
          delete window[cb];
          s.remove();
        } catch(e) {}
        if(payload && payload.ok) resolve(payload);
        else reject(new Error("No se pudo obtener la configuración de notificaciones."));
      };

      s.onerror = () => {
        try { delete window[cb]; s.remove(); } catch(e) {}
        reject(new Error("No se pudo conectar con el sistema de notificaciones."));
      };

      s.src = CONFIG_API + "?api=pushconfig&callback=" + encodeURIComponent(cb) + "&t=" + Date.now();
      document.head.appendChild(s);
    });
  }

  async function init() {
    if(initPromise) return initPromise;

    initPromise = (async () => {
      const cfg = await loadConfig();
      if(!cfg.enabled || !cfg.appId) {
        return {ready:false, reason:"not-configured"};
      }

      const info = repoInfo();
      window.OneSignalDeferred = window.OneSignalDeferred || [];

      return await new Promise((resolve, reject) => {
        OneSignalDeferred.push(async function(OneSignal) {
          try {
            await OneSignal.init({
              appId: cfg.appId,
              serviceWorkerPath: info.workerPath,
              serviceWorkerParam: { scope: info.scope },
              notifyButton: { enable: false },
              welcomeNotification: { disable: true },
              autoResubscribe: true,
              notificationClickHandlerMatch: "origin",
              notificationClickHandlerAction: "navigate"
            });
            OS = OneSignal;
            window.dispatchEvent(new CustomEvent("santarita-push-ready"));
            resolve({ready:true});
          } catch(err) {
            console.error("Santa Rita push init:", err);
            reject(err);
          }
        });
      });
    })();

    return initPromise;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }

  async function subscribe(level) {
    const result = await init();
    if(!result.ready) throw new Error("Las notificaciones todavía no están habilitadas por el colegio.");

    if(isIOS() && !isStandalone()) {
      const err = new Error("En iPhone/iPad: agregá primero la página a la pantalla de inicio, abrila desde ese ícono y luego activá las notificaciones.");
      err.code = "IOS_HOME_SCREEN";
      throw err;
    }

    await OS.Notifications.requestPermission();

    if(!OS.Notifications.permission) {
      throw new Error("No se otorgó permiso para recibir notificaciones.");
    }

    try {
      await OS.User.PushSubscription.optIn();
    } catch(e) {}

    OS.User.addTags({
      rol: "padre",
      nivel: String(level || "todos")
    });

    return {
      permission: OS.Notifications.permission,
      optedIn: OS.User.PushSubscription.optedIn
    };
  }

  async function status() {
    try {
      const result = await init();
      if(!result.ready) return {ready:false};
      return {
        ready:true,
        permission:Boolean(OS.Notifications.permission),
        optedIn:Boolean(OS.User.PushSubscription.optedIn),
        tags:OS.User.getTags ? OS.User.getTags() : {}
      };
    } catch(err) {
      return {ready:false,error:String(err?.message || err)};
    }
  }

  window.SantaRitaPush = { init, subscribe, status };
  init().catch(() => {});
})();
