const configFileName = "opendtu-config.json"; // Name of the config file
const cacheFileName = "opendtu-cache.json"; // Name of the cache file

// This function handles loading settings
async function loadSettings() {
  let fm = FileManager.iCloud(); // Keep config in iCloud for syncing across devices
  let dir = fm.documentsDirectory();
  let path = fm.joinPath(dir, configFileName);

  if (fm.fileExists(path)) {
    // Read existing settings file
    let raw = await fm.readString(path);
    return JSON.parse(raw);
  } else {
    // First time run, create a default settings file
    let defaultSettings = {
      dtuApiUrl: "http://change-me/api/livedata/status/",
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
    await fm.writeString(path, JSON.stringify(defaultSettings));
    return defaultSettings;
  }
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

// Fetch data from the API
async function fetchData(apiUrl, username, password, timeoutMillis = 3) {
  let request = new Request(`${apiUrl}?inv=${settings.inverterSerial}`);

  // Add basic authentication
  const auth = `${username}:${password}`;
  const base64Auth = btoa(auth);
  request.headers = {
    Authorization: `Basic ${base64Auth}`,
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
  errorText.font = Font.systemFont(10);

  if (isFromCache) {
    widget.addSpacer(2);
    let cacheNote = widget.addText("(Zeige alte Daten)");
    cacheNote.textColor = Color.gray();
    cacheNote.font = Font.systemFont(8);
  }

  return widget;
}

// Create widget
function createWidget(data, powerDrawData, timestamp = new Date()) {
  let widget = new ListWidget();

  // Define gradient background color
  let startColor = new Color("#434C5E"); // Light Gray
  let endColor = new Color("#2E3440"); // Black
  let gradient = new LinearGradient();
  gradient.colors = [startColor, endColor];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;

  // Check if data is valid
  if (!data || !data.total || !data.inverters || !data.inverters[0]) {
    return createErrorWidget("Ungültige Daten empfangen");
  }

  let powerData = parseFloat(data.total.Power.v); // Update powerData to use Shelly API response
  let yieldDayData = (parseFloat(data.total.YieldDay.v) / 1000).toFixed(2); // Convert Wh to kWh
  let yieldTotalData = parseFloat(data.total.YieldTotal.v).toFixed(2);
  let isProducing = data.inverters[0].producing;
  let isReachable = data.inverters[0].reachable;

  // Choose icon based on status
  let icon = "☀️";
  if (!isReachable) {
    icon = "⚠️";
  } else if (!isProducing) {
    icon = "🌙";
  }

  let title = widget.addText(`OpenDTU${icon}`);
  title.textColor = Color.white();
  title.font = Font.boldSystemFont(16);

  widget.addSpacer(2); // Add some space between title and data

  let gridStack = widget.addStack();
  gridStack.layoutHorizontally();

  let leftStack = gridStack.addStack();
  leftStack.layoutVertically();

  let powerLabel = leftStack.addText(`Power:`);
  powerLabel.textColor = Color.white();
  powerLabel.font = Font.systemFont(8);

  if (!isReachable) {
    // If not reachable, display "Keine Verbindung" in orange
    let errorLabel = leftStack.addText(`Keine Verbindung`);
    errorLabel.textColor = Color.orange();
    errorLabel.font = Font.systemFont(13);
  } else if (!isProducing) {
    // If not producing, display "Offline" in gray (normal at night)
    let offlineLabel = leftStack.addText(`Offline`);
    offlineLabel.textColor = Color.gray();
    offlineLabel.font = Font.systemFont(13);
  } else {
    // Display power data when producing
    let powerText = leftStack.addText(`${powerData.toFixed(2)} W`);
    powerText.font = Font.systemFont(13);
    // Adjust color based on power value
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

  if (settings.showPowerDraw && powerDrawData) {
    let rightStack = gridStack.addStack();
    rightStack.layoutVertically();
    let powerDrawDataValue = parseFloat(getPowerDrawValue(powerDrawData));

    let powerDrawLabel = rightStack.addText(`Power Draw: `);
    powerDrawLabel.textColor = Color.white();
    powerDrawLabel.font = Font.systemFont(8);
    let powerDrawText = rightStack.addText(
      `${powerDrawDataValue.toFixed(2)} W`
    );
    powerDrawText.font = Font.systemFont(13);
    // Adjust color based on power draw value
    if (powerDrawDataValue > settings.powerDrawThreshold) {
      powerDrawText.textColor = Color.yellow();
    } else {
      powerDrawText.textColor = Color.green();
    }
  }

  let yieldTotalLabel = leftStack.addText(`Yield Total: `);
  yieldTotalLabel.textColor = Color.white();
  yieldTotalLabel.font = Font.systemFont(8);

  let yieldTotalText = leftStack.addText(`${yieldTotalData} kWh`);
  yieldTotalText.textColor = Color.white();
  yieldTotalText.font = Font.systemFont(13);

  // Add last updated timestamp
  widget.addSpacer(); // Add some space before the timestamp
  let timeStampStack = widget.addStack();
  timeStampStack.layoutVertically();
  timeStampStack.addSpacer();
  let dateText = timeStampStack.addDate(timestamp);
  dateText.textColor = Color.white();
  dateText.applyRelativeStyle();
  dateText.font = Font.systemFont(8); // set font size on the date text
  let agoText = timeStampStack.addText(" ago");
  agoText.textColor = Color.white();
  agoText.font = Font.systemFont(8);

  return widget;
}

// Main script
async function run() {
  let widget;

  try {
    // Fetch DTU and power draw data in parallel for better performance
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
      // Successfully fetched new data
      let data = dtuResult.data;
      let powerDrawData = powerDrawResult && powerDrawResult.success ? powerDrawResult.data : null;

      // Save to cache
      saveCache({
        dtu: data,
        powerDraw: powerDrawData
      });

      widget = createWidget(data, powerDrawData);
    } else {
      // DTU fetch failed, try to use cached data
      let cache = loadCache();
      if (cache && cache.data && cache.data.dtu) {
        console.log("Using cached data due to fetch error");
        widget = createWidget(
          cache.data.dtu,
          cache.data.powerDraw,
          new Date(cache.timestamp)
        );

        // Add warning that we're showing old data
        let warningStack = widget.addStack();
        warningStack.layoutVertically();
        warningStack.addSpacer(2);
        let warningText = warningStack.addText("⚠️ Verbindungsfehler");
        warningText.textColor = Color.orange();
        warningText.font = Font.systemFont(8);
      } else {
        // No cache available
        widget = createErrorWidget(
          "Verbindung fehlgeschlagen\nund kein Cache verfügbar"
        );
      }
    }
  } catch (error) {
    console.error(`Unexpected error: ${error}`);

    // Try to load from cache as fallback
    let cache = loadCache();
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
    widget.presentSmall();
  }

  Script.complete();
}

await run();
