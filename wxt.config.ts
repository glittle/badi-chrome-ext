import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "wxt";
import { compileLess } from "./scripts/compile-less.mjs";

const publicDir = path.resolve("public");

async function compileStyles(outDir?: string) {
  // public/ so Vite serves /popup.css (and the other sheets) as static files.
  // Dev rewrites a missing stylesheet link to a localhost URL that 404s.
  await compileLess(publicDir);
  if (outDir) await compileLess(outDir);
}

function watchStyles(outDir: string) {
  const stylesDir = path.resolve("styles");
  let timer: NodeJS.Timeout | undefined;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      compileStyles(outDir).catch((error) => {
        console.error("Less compile failed", error);
      });
    }, 50);
  };
  fs.watch(stylesDir, rebuild);
}

// Same manifest the store package already uses, plus a Firefox id so
// `wxt build -b firefox` can emit an installable MV3 package. Publishing
// that package is deferred. Chrome and Edge do not get a gecko id, so the
// store signing key (and therefore the extension id) is unchanged.
const sharedManifest = {
  name: "__MSG_title__",
  description: "__MSG_titleDesc__",
  short_name: "BadiCal",
  author: "Glen Little",
  default_locale: "en",
  icons: {
    48: "badi19a-48.png",
    128: "badi19a-128.png",
  },
  action: {
    default_popup: "popup.html",
    default_title: "__MSG_browserActionTitle__",
    default_icon: {
      48: "badi19a-48.png",
    },
  },
  background: {
    service_worker: "service_worker.js",
  },
  permissions: ["alarms", "storage", "notifications", "geolocation", "contextMenus", "clipboardWrite"],
  host_permissions: ["https://www.google-analytics.com/*"],
  optional_host_permissions: ["https://maker.ifttt.com/*", "https://hooks.zapier.com/*"],
  commands: {
    // Opens the action popup. Chrome applies suggested_key only on a fresh
    // install, and skips it when the keys are already a browser shortcut.
    // Ctrl+Shift+D / Command+Shift+D is "Save all open tabs as bookmarks",
    // so that suggestion was often never assigned. Ctrl+Shift+Y is unused by
    // Chrome (it is the sample shortcut in the commands API docs). Alt+Shift+B
    // is also taken: it focuses the bookmarks bar on Windows and Linux.
    _execute_action: {
      suggested_key: {
        default: "Ctrl+Shift+Y",
        mac: "Command+Shift+Y",
      },
    },
  },
};

export default defineConfig({
  manifestVersion: 3,
  vite: () => ({
    build: {
      // The popup is classic scripts. Don't inject Vite's modulepreload helper.
      modulePreload: false,
    },
    plugins: [
      {
        name: "badi-dev-static-styles",
        apply: "serve",
        transformIndexHtml: {
          order: "post",
          // Dev rewrites stylesheet links to /@fs/... which 404s. The compiled
          // CSS is a static file in the output directory.
          handler(html: string) {
            return html
              .replace(/href="[^"]*fonts\.css[^"]*"/g, 'href="/fonts/fonts.css"')
              .replace(/href="[^"]*(popup|cal1|cal2|cal3|calWheel|calGreg)\.css[^"]*"/g, 'href="/$1.css"');
          },
        },
      },
    ],
  }),
  // The popup is a classic-script page. Public files are copied as-is so
  // storage keys, _locales, and script order stay the same.
  manifest: ({ browser }) => {
    if (browser !== "firefox") return sharedManifest;
    return {
      ...sharedManifest,
      browser_specific_settings: {
        gecko: {
          id: "badi-calendar@glittle.org",
          strict_min_version: "121.0",
          data_collection_permissions: {
            required: ["technicalData"],
          },
        },
      },
    };
  },
  hooks: {
    "build:before": async () => {
      await compileStyles();
    },
    "build:done": async (wxt) => {
      await compileStyles(wxt.config.outDir);
    },
    ready: async (wxt) => {
      await compileStyles(wxt.config.outDir);
      if (wxt.config.command === "serve") watchStyles(wxt.config.outDir);
    },
    "build:manifestGenerated": (_wxt, manifest) => {
      // Dev mode injects a reload worker. Keep the classic service worker,
      // which importScripts() the existing libraries. Firefox MV3 can load
      // that same worker (importScripts does not run in a background page).
      manifest.background = {
        service_worker: "service_worker.js",
      };
    },
  },
});
