const configFileName = "opendtu-config.json"; // Name of the config file
const cacheFileName = "opendtu-cache-medium.json"; // Name of the cache file
const settingsCacheFileName = "opendtu-settings-cache.json"; // Cached settings
const SETTINGS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

// Load settings with local caching for performance
async function loadSettings() {
  let fmLocal = FileManager.local();
  let dir = fmLocal.documentsDirectory();
  let cachePath = fmLocal.joinPath(dir, settingsCacheFileName);

  // Try to load from local cache first (fastest)
  if (fmLocal.fileExists(cachePath)) {
    try {
      let cached = JSON.parse(fmLocal.readString(cachePath));
      let age = Date.now() - cached.timestamp;

      // If cache is fresh (< 5 minutes), use it
      if (age < SETTINGS_CACHE_DURATION) {
        return cached.settings;
      }
    } catch (error) {
      console.log("Settings cache read error, will reload from iCloud");
    }
  }

  // Load from iCloud (slower but authoritative)
  let fm = FileManager.iCloud();
  let iCloudPath = fm.joinPath(fm.documentsDirectory(), configFileName);

  let settings;
  if (fm.fileExists(iCloudPath)) {
    let raw = await fm.readString(iCloudPath);
    settings = JSON.parse(raw);
  } else {
    // First time run, create default settings
    settings = {
      dtuApiUrl: "http://change-me/api/livedata/status/", // Make sure to add a trailing slash for the medium widget to work!
      dtuUser: "changeme",
      dtuPass: "changeme",
      powermeter: "tasmota",
      tasmotaApiUrl: "http://change-me/cm?cmnd=status%208",
      tasmotaUser: "changeme",
      tasmotaPass: "changeme",
      shellyApiUrl: "https://change-me/",
      shellyUser: "changeme",
      shellyPass: "changeme",
      showPowerDraw: 0,
      powerDrawThreshold: 0,
      redThreshold: 220,
      yellowThreshold: 260,
      greenThreshold: 400,
      inverterSerial: "XXXXXXXXXXXX",
    };
    await fm.writeString(iCloudPath, JSON.stringify(settings));
  }

  // Save to local cache for next time
  try {
    fmLocal.writeString(cachePath, JSON.stringify({
      timestamp: Date.now(),
      settings: settings
    }));
  } catch (error) {
    console.log("Could not cache settings locally");
  }

  return settings;
}

// Save cached data
function saveCache(data) {
  try {
    let fm = FileManager.local();
    let dir = fm.documentsDirectory();
    let path = fm.joinPath(dir, cacheFileName);
    fm.writeString(path, JSON.stringify({
      timestamp: Date.now(),
      data: data
    }));
  } catch (error) {
    console.error(`Could not save cache: ${error}`);
  }
}

// Load cached data
function loadCache() {
  try {
    let fm = FileManager.local();
    let dir = fm.documentsDirectory();
    let path = fm.joinPath(dir, cacheFileName);
    if (fm.fileExists(path)) {
      let raw = fm.readString(path);
      return JSON.parse(raw);
    }
  } catch (error) {
    console.error(`Could not load cache: ${error}`);
  }
  return null;
}

let settings = await loadSettings(); // Load settings

// Here the script continues, replacing the hardcoded variables
// with settings.dtuApiUrl, settings.dtuUser, etc.

async function fetchData(apiUrl, username, password, timeoutMillis = 3) {
  let request = new Request(`${apiUrl}?inv=${settings.inverterSerial}`);

  // Only set essential headers (minimized for performance)
  request.headers = {
    Authorization: `Basic ${btoa(`${username}:${password}`)}`
  };

  request.timeoutInterval = timeoutMillis;

  try {
    let response = await request.loadJSON();
    return { success: true, data: response };
  } catch (error) {
    console.error(`Could not fetch data from ${apiUrl}: ${error}`);
    return { success: false, error: error.toString() };
  }
}

// Helper function to retrieve power draw value from the API response
function getPowerDrawValue(powerDrawData) {
  if (settings.powermeter === "tasmota") {
    // Handle Tasmota API response structure
    if (
      powerDrawData &&
      powerDrawData.StatusSNS &&
      powerDrawData.StatusSNS.hasOwnProperty("")
    ) {
      return parseFloat(powerDrawData.StatusSNS[""]["current"]) || 0;
    }
  } else if (settings.powermeter === "shelly") {
    // Handle Shelly API response structure
    if (
      powerDrawData &&
      powerDrawData.meters &&
      powerDrawData.meters.length > 0
    ) {
      return parseFloat(powerDrawData.meters[0].power) || 0;
    }
  }
  return 0;
}

// Create widget with error state
function createErrorWidget(errorMessage, isFromCache = false) {
  let widget = new ListWidget();

  let startColor = new Color("#434C5E");
  let endColor = new Color("#2E3440");
  let gradient = new LinearGradient();
  gradient.colors = [startColor, endColor];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;

  let title = widget.addText("OpenDTU ⚠️");
  title.textColor = Color.orange();
  title.font = Font.boldSystemFont(16);

  widget.addSpacer(4);

  let errorText = widget.addText(errorMessage);
  errorText.textColor = Color.white();
  errorText.font = Font.systemFont(12);

  if (isFromCache) {
    widget.addSpacer(2);
    let cacheNote = widget.addText("(Zeige alte Daten)");
    cacheNote.textColor = Color.gray();
    cacheNote.font = Font.systemFont(10);
  }

  return widget;
}

function createWidget(data, powerDrawData, timestamp = new Date()) {
  try {
    let widget = new ListWidget();

    let startColor = new Color("#434C5E");
    let endColor = new Color("#2E3440");
    let gradient = new LinearGradient();
    gradient.colors = [startColor, endColor];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;

    // Check if data is valid
    if (!data || !data.inverters || !data.inverters[0]) {
      return createErrorWidget("Ungültige Daten empfangen");
    }

  let inverter = data.inverters[0];
  let isProducing = inverter.producing || false;

  // Choose icon based on status (only check if producing)
  let icon = isProducing ? "☀️" : "🌙";

  let title = widget.addText(`OpenDTU ${icon}`);
  title.textColor = Color.white();
  title.font = Font.boldSystemFont(16);

  // Safely extract data with fallbacks
  let powerData = 0;
  let yieldDayData = "0.00";
  let yieldTotalData = "0.00";

  if (inverter.AC && inverter.AC["0"] && inverter.AC["0"].Power) {
    powerData = parseFloat(inverter.AC["0"].Power.v) || 0;
  }

  if (inverter.DC && inverter.DC["0"]) {
    if (inverter.DC["0"].YieldDay) {
      yieldDayData = (parseFloat(inverter.DC["0"].YieldDay.v) / 1000).toFixed(2);
    }
    if (inverter.DC["0"].YieldTotal) {
      yieldTotalData = parseFloat(inverter.DC["0"].YieldTotal.v).toFixed(2);
    }
  }

  widget.addSpacer(2);

  let gridStack = widget.addStack();
  gridStack.layoutHorizontally();

  let leftStack = gridStack.addStack();
  leftStack.layoutVertically();

  let powerLabel = leftStack.addText(`Power:`);
  powerLabel.textColor = Color.white();
  powerLabel.font = Font.systemFont(8);

  if (!isProducing) {
    // Not producing - offline (night/cloudy)
    let offlineLabel = leftStack.addText(`Offline`);
    offlineLabel.textColor = Color.gray();
    offlineLabel.font = Font.systemFont(13);
  } else {
    // Producing - show power value with color coding
    let powerText = leftStack.addText(`${powerData.toFixed(2)} W`);
    powerText.font = Font.systemFont(13);
    if (powerData < settings.redThreshold) {
      powerText.textColor = Color.red();
    } else if (
      powerData >= settings.redThreshold &&
      powerData < settings.yellowThreshold
    ) {
      powerText.textColor = Color.yellow();
    } else {
      powerText.textColor = Color.green();
    }
  }

  let yieldDayLabel = leftStack.addText(`Yield Day: `);
  yieldDayLabel.textColor = Color.white();
  yieldDayLabel.font = Font.systemFont(8);

  let yieldDayText = leftStack.addText(`${yieldDayData} kWh`);
  yieldDayText.textColor = Color.white();
  yieldDayText.font = Font.systemFont(13);

  let yieldTotalLabel = leftStack.addText(`Yield Total: `);
  yieldTotalLabel.textColor = Color.white();
  yieldTotalLabel.font = Font.systemFont(8);

  let yieldTotalText = leftStack.addText(`${yieldTotalData} kWh    `);
  yieldTotalText.textColor = Color.white();
  yieldTotalText.font = Font.systemFont(13);

  let dcStack = gridStack.addStack();
  dcStack.layoutVertically();

  if (inverter.DC) {
    const dcOutputs = inverter.DC;
    for (let key in dcOutputs) {
      if (dcOutputs[key].name && dcOutputs[key].Power) {
        let dcName = dcOutputs[key].name.u || `DC ${key}`;
        let dcPower = parseFloat(dcOutputs[key].Power.v) || 0;

        let dcLabel = dcStack.addText(`${dcName}: `);
        dcLabel.textColor = Color.white();
        dcLabel.font = Font.systemFont(8);

        let dcText = dcStack.addText(`${dcPower.toFixed(2)} W`);
        dcText.font = Font.systemFont(13);
        dcText.textColor = Color.white();
      }
    }
  }

  let rightStack = gridStack.addStack();
  rightStack.layoutVertically();

  if (settings.showPowerDraw && powerDrawData) {
    let powerDrawDataValue = getPowerDrawValue(powerDrawData);

    let powerDrawLabel = rightStack.addText(`Power Draw: `);
    powerDrawLabel.textColor = Color.white();
    powerDrawLabel.font = Font.systemFont(8);
    let powerDrawText = rightStack.addText(`${powerDrawDataValue.toFixed(2)} W`);
    powerDrawText.font = Font.systemFont(13);

    if (powerDrawDataValue > settings.powerDrawThreshold) {
      powerDrawText.textColor = Color.yellow();
    } else {
      powerDrawText.textColor = Color.green();
    }
  }

  let timeStampStack = widget.addStack();
  timeStampStack.layoutVertically();
  let dateText = timeStampStack.addDate(timestamp);
  dateText.textColor = Color.white();
  dateText.applyRelativeStyle();
  dateText.font = Font.systemFont(8);
  let agoText = timeStampStack.addText(" ago");
  agoText.textColor = Color.white();
  agoText.font = Font.systemFont(8);

    return widget;
  } catch (error) {
    console.error(`Widget creation error: ${error}`);
    return createErrorWidget(`Fehler: ${error.message}`);
  }
}

// Background refresh: Updates cache without blocking widget display
async function backgroundRefresh() {
  try {
    let promises = [
      fetchData(settings.dtuApiUrl, settings.dtuUser, settings.dtuPass, 3)
    ];

    if (settings.showPowerDraw) {
      promises.push(
        fetchData(
          settings.powermeter === "tasmota"
            ? settings.tasmotaApiUrl
            : settings.shellyApiUrl,
          settings.powermeter === "tasmota"
            ? settings.tasmotaUser
            : settings.shellyUser,
          settings.powermeter === "tasmota"
            ? settings.tasmotaPass
            : settings.shellyPass,
          3
        )
      );
    }

    let results = await Promise.all(promises);
    let dtuResult = results[0];
    let powerDrawResult = results.length > 1 ? results[1] : null;

    if (dtuResult.success) {
      saveCache({
        dtu: dtuResult.data,
        powerDraw: powerDrawResult && powerDrawResult.success ? powerDrawResult.data : null
      });
    }
  } catch (error) {
    console.log(`Background refresh failed: ${error}`);
  }
}

// Main script with Optimistic UI
async function run() {
  let widget;
  let cache = loadCache();

  // OPTIMISTIC UI: Show cache immediately if available (instant load!)
  if (cache && cache.data && cache.data.dtu) {
    let cacheAge = Date.now() - cache.timestamp;

    // If cache is recent (< 2 minutes), show it instantly
    if (cacheAge < 2 * 60 * 1000) {
      widget = createWidget(
        cache.data.dtu,
        cache.data.powerDraw,
        new Date(cache.timestamp)
      );

      // Show widget immediately
      if (config.runsInWidget) {
        Script.setWidget(widget);
      } else {
        widget.presentMedium();
      }

      // Update cache in background for next refresh
      backgroundRefresh();
      Script.complete();
      return;
    }
  }

  // No cache or cache too old: Fetch fresh data
  try {
    let promises = [
      fetchData(settings.dtuApiUrl, settings.dtuUser, settings.dtuPass, 3)
    ];

    if (settings.showPowerDraw) {
      promises.push(
        fetchData(
          settings.powermeter === "tasmota"
            ? settings.tasmotaApiUrl
            : settings.shellyApiUrl,
          settings.powermeter === "tasmota"
            ? settings.tasmotaUser
            : settings.shellyUser,
          settings.powermeter === "tasmota"
            ? settings.tasmotaPass
            : settings.shellyPass,
          3
        )
      );
    }

    let results = await Promise.all(promises);
    let dtuResult = results[0];
    let powerDrawResult = results.length > 1 ? results[1] : null;

    if (dtuResult.success) {
      let data = dtuResult.data;
      let powerDrawData = powerDrawResult && powerDrawResult.success ? powerDrawResult.data : null;

      saveCache({
        dtu: data,
        powerDraw: powerDrawData
      });

      widget = createWidget(data, powerDrawData);
    } else {
      // Fetch failed, use stale cache if available
      if (cache && cache.data && cache.data.dtu) {
        console.log("Using stale cache due to fetch error");
        widget = createWidget(
          cache.data.dtu,
          cache.data.powerDraw,
          new Date(cache.timestamp)
        );

        let warningStack = widget.addStack();
        warningStack.layoutVertically();
        warningStack.addSpacer(2);
        let warningText = warningStack.addText("⚠️ Verbindungsfehler - Cache wird verwendet");
        warningText.textColor = Color.orange();
        warningText.font = Font.systemFont(8);
      } else {
        widget = createErrorWidget(
          "Verbindung fehlgeschlagen\nund kein Cache verfügbar"
        );
      }
    }
  } catch (error) {
    console.error(`Unexpected error: ${error}`);

    if (cache && cache.data && cache.data.dtu) {
      widget = createWidget(
        cache.data.dtu,
        cache.data.powerDraw,
        new Date(cache.timestamp)
      );
    } else {
      widget = createErrorWidget(`Fehler: ${error.message}`);
    }
  }

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    widget.presentMedium();
  }

  Script.complete();
}

await run();
