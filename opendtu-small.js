const configFileName = "opendtu-config.json"; // Name of the config file

// This function handles loading settings
async function loadSettings() {
  let fm = FileManager.iCloud();
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

let settings = await loadSettings(); // Load settings

// Fetch data from the API
async function fetchData(apiUrl, username, password, timeoutMillis) {
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
    return response;
  } catch (error) {
    console.error(`Could not fetch data: ${error}`);
    return null;
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

// Create widget
async function createWidget(data, powerDrawData) {
  let widget = new ListWidget();

  // Define gradient background color
  let startColor = new Color("#434C5E"); // Light Gray
  let endColor = new Color("#2E3440"); // Black
  let gradient = new LinearGradient();
  gradient.colors = [startColor, endColor];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;

  let title = widget.addText("OpenDTU☀️");
  title.textColor = Color.white();
  title.font = Font.boldSystemFont(16);

  let powerData = parseFloat(data.total.Power.v); // Update powerData to use Shelly API response
  let yieldDayData = (parseFloat(data.total.YieldDay.v) / 1000).toFixed(2); // Convert Wh to kWh
  let yieldTotalData = parseFloat(data.total.YieldTotal.v).toFixed(2);

  widget.addSpacer(2); // Add some space between title and data

  let gridStack = widget.addStack();
  gridStack.layoutHorizontally();

  let leftStack = gridStack.addStack();
  leftStack.layoutVertically();

  let powerLabel = leftStack.addText(`Power:`);
  powerLabel.textColor = Color.white();
  powerLabel.font = Font.systemFont(8);

  if (!data.inverters[0].producing) {
    // If not producing, display "Offline" in red below "Power:"
    let offlineLabel = leftStack.addText(`Offline`);
    offlineLabel.textColor = Color.red();
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

  if (settings.showPowerDraw) {
    let rightStack = gridStack.addStack();
    rightStack.layoutVertically();
    let powerDrawDataValue = powerDrawData
      ? parseFloat(getPowerDrawValue(powerDrawData))
      : 0;

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
  let dateText = timeStampStack.addDate(new Date());
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
  try {
    let data = await fetchData(
      settings.dtuApiUrl,
      settings.dtuUser,
      settings.dtuPass,
      10000
    );
    let powerDrawData = settings.showPowerDraw
      ? await fetchData(
          settings.powermeter === "tasmota"
            ? settings.tasmotaApiUrl
            : settings.shellyApiUrl,
          settings.powermeter === "tasmota"
            ? settings.tasmotaUser
            : settings.shellyUser,
          settings.powermeter === "tasmota"
            ? settings.tasmotaPass
            : settings.shellyPass
        )
      : null;

    let widget = await createWidget(data, powerDrawData);

    if (config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      widget.presentSmall();
    }
  } catch (error) {
    console.error(error.message);
    let widget = new ListWidget();
    widget.addText("Error: Unable to connect to powermeter");
    if (config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      widget.presentSmall();
    }
  }
}

await run();
