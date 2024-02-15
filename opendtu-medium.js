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
    await fm.writeString(path, JSON.stringify(defaultSettings));
    return defaultSettings;
  }
}

let settings = await loadSettings(); // Load settings

// Here the script continues, replacing the hardcoded variables
// with settings.dtuApiUrl, settings.dtuUser, etc.

async function fetchData(apiUrl, username, password, timeoutMillis) {
  let request = new Request(`${apiUrl}?inv=${settings.inverterSerial}`);
  const auth = `${username}:${password}`;
  const base64Auth = btoa(auth);
  request.headers = {
    Authorization: `Basic ${base64Auth}`,
  };

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

async function createWidget(data, powerDrawData) {
  let widget = new ListWidget();

  let settings = await loadSettings();

  let startColor = new Color("#434C5E");
  let endColor = new Color("#2E3440");
  let gradient = new LinearGradient();
  gradient.colors = [startColor, endColor];
  gradient.locations = [0, 1];
  widget.backgroundGradient = gradient;

  let title = widget.addText("OpenDTU☀️");
  title.textColor = Color.white();
  title.font = Font.boldSystemFont(16);

  let powerData = parseFloat(data.inverters[0].AC["0"].Power.v);
  let yieldDayData = (
    parseFloat(data.inverters[0].DC["0"].YieldDay.v) / 1000
  ).toFixed(2);
  let yieldTotalData = parseFloat(
    data.inverters[0].DC["0"].YieldTotal.v
  ).toFixed(2);

  widget.addSpacer(2);

  let gridStack = widget.addStack();
  gridStack.layoutHorizontally();

  let leftStack = gridStack.addStack();
  leftStack.layoutVertically();

  let powerLabel = leftStack.addText(`Power:`);
  powerLabel.textColor = Color.white();
  powerLabel.font = Font.systemFont(8);

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

  const dcOutputs = data.inverters[0].DC;
  for (let key in dcOutputs) {
    let dcName = dcOutputs[key].name.u;
    let dcPower = parseFloat(dcOutputs[key].Power.v);

    let dcLabel = dcStack.addText(`${dcName}: `);
    dcLabel.textColor = Color.white();
    dcLabel.font = Font.systemFont(8);

    let dcText = dcStack.addText(`${dcPower.toFixed(2)} W`);
    dcText.font = Font.systemFont(13);
    dcText.textColor = Color.white();
  }

  let rightStack = gridStack.addStack();
  rightStack.layoutVertically();

  if (settings.showPowerDraw) {
    let powerDrawDataValue = powerDrawData
      ? getPowerDrawValue(powerDrawData)
      : 0;

    let powerDrawLabel = rightStack.addText(`Power Draw: `);
    powerDrawLabel.textColor = Color.white();
    powerDrawLabel.font = Font.systemFont(8);
    let powerDrawText = rightStack.addText(`${powerDrawDataValue} W`);
    powerDrawText.font = Font.systemFont(13);

    if (powerDrawDataValue > settings.powerDrawThreshold) {
      powerDrawText.textColor = Color.yellow();
    } else {
      powerDrawText.textColor = Color.green();
    }
  }

  let timeStampStack = widget.addStack();
  timeStampStack.layoutVertically();
  let dateText = timeStampStack.addDate(new Date());
  dateText.textColor = Color.white();
  dateText.applyRelativeStyle();
  dateText.font = Font.systemFont(8);
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
            : settings.shellyPass,
          10000
        )
      : null;

    let widget = await createWidget(data, powerDrawData);

    if (config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      widget.presentMedium();
    }
  } catch (error) {
    console.error(error.message);
    let widget = new ListWidget();
    widget.addText("Error: Unable to connect to powermeter");
    if (config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      widget.presentMedium();
    }
  }
}

await run();
