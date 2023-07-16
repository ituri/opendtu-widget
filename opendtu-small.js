const dtuApiUrl = "http://change-me/api/livedata/status"; // API endpoint for OpenDTU
const dtuUser = "changeme"; // replace with actual username for dtuApiUrl
const dtuPass = "changeme"; // replace with actual password for dtuApiUrl

const powermeter = "tasmota"; // Choose between "tasmota" or "shelly"

// Tasmota configuration
const tasmotaApiUrl = "http://change-me/cm?cmnd=status%208"; // API endpoint for Tasmota
const tasmotaUser = "changeme"; // replace with actual username for tasmotaApiUrl
const tasmotaPass = "changeme"; // replace with actual password for tasmotaApiUrl

// Shelly configuration
const shellyApiUrl = "https://change-me/"; // API endpoint for Shelly
const shellyUser = "changeme"; // replace with actual username for shellyApiUrl
const shellyPass = "changeme"; // replace with actual password for shellyApiUrl

const showPowerDraw = 0;
const powerDrawThreshold = 0;

const redThreshold = 220;
const yellowThreshold = 260;
const greenThreshold = 400;

// Fetch data from the API
async function fetchData(apiUrl, username, password) {
  let request = new Request(apiUrl);

  // Add basic authentication
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
  if (powermeter === "tasmota") {
    // Handle Tasmota API response structure
    if (
      powerDrawData &&
      powerDrawData.StatusSNS &&
      powerDrawData.StatusSNS.hasOwnProperty("")
    ) {
      return parseFloat(powerDrawData.StatusSNS[""]["current"]) || 0;
    }
  } else if (powermeter === "shelly") {
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

  let powerText = leftStack.addText(`${powerData.toFixed(2)} W`);
  powerText.font = Font.systemFont(13);
  // Adjust color based on power value
  if (powerData < redThreshold) {
    powerText.textColor = Color.red();
  } else if (powerData >= redThreshold && powerData < yellowThreshold) {
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

  if (showPowerDraw) {
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
    if (powerDrawDataValue > powerDrawThreshold) {
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
    let data = await fetchData(dtuApiUrl, dtuUser, dtuPass);
    let powerDrawData = null;

    if (powermeter === "tasmota") {
      powerDrawData = showPowerDraw
        ? await fetchData(tasmotaApiUrl, tasmotaUser, tasmotaPass)
        : null;
    } else if (powermeter === "shelly") {
      powerDrawData = showPowerDraw
        ? await fetchData(shellyApiUrl, shellyUser, shellyPass)
        : null;
    }

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

run();
