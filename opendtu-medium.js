const dtuApiUrl = "http://change-me/api/livedata/status"; // API endpoint for OpenDTU
const dtuUser = "changeme"; // replace with actual username for dtuApiUrl
const dtuPass = "changeme"; // replace with actual password for dtuApiUrl

const tasmotaApiUrl = "http://change-me/cm?cmnd=status%208"; // API endpoint for Tasmota
const tasmotaUser = "changeme"; // replace with actual username for tasmotaApiUrl
const tasmotaPass = "changeme"; // replace with actual password for tasmotaApiUrl

const showPowerDraw = 0;
const powerDrawThreshold = 0;

const redThreshold = 220;
const yellowThreshold = 260;
const greenThreshold = 400;

async function fetchData(apiUrl, username, password) {
  let request = new Request(apiUrl);
  t;
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

async function createWidget(data, powerDrawData) {
  let widget = new ListWidget();

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
    parseFloat(data.inverters[0].AC["0"].YieldDay.v) / 1000
  ).toFixed(2);
  let yieldTotalData = parseFloat(
    data.inverters[0].AC["0"].YieldTotal.v
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

  let yieldDayText = leftStack.addText(`${yieldDayData} kWh  `);
  yieldDayText.textColor = Color.white();
  yieldDayText.font = Font.systemFont(13);

  let rightStack = gridStack.addStack();
  rightStack.layoutVertically();

  if (showPowerDraw) {
    let powerDrawDataValue = powerDrawData.StatusSNS[""]["current"];

    let powerDrawLabel = rightStack.addText(`Power Draw: `);
    powerDrawLabel.textColor = Color.white();
    powerDrawLabel.font = Font.systemFont(8);
    let powerDrawText = rightStack.addText(`${powerDrawDataValue} W`);
    powerDrawText.font = Font.systemFont(13);

    if (powerDrawDataValue > powerDrawThreshold) {
      powerDrawText.textColor = Color.yellow();
    } else {
      powerDrawText.textColor = Color.green();
    }
  }

  const dcOutputs = data.inverters[0].DC;
  for (let key in dcOutputs) {
    let dcName = dcOutputs[key].name.u;
    let dcPower = parseFloat(dcOutputs[key].Power.v);

    let dcLabel = rightStack.addText(`${dcName}: `);
    dcLabel.textColor = Color.white();
    dcLabel.font = Font.systemFont(8);

    let dcText = rightStack.addText(`${dcPower.toFixed(2)} W`);
    dcText.font = Font.systemFont(13);
    dcText.textColor = Color.white();
  }

  let yieldTotalLabel = leftStack.addText(`Yield Total: `);
  yieldTotalLabel.textColor = Color.white();
  yieldTotalLabel.font = Font.systemFont(8);

  let yieldTotalText = leftStack.addText(`${yieldTotalData} kWh`);
  yieldTotalText.textColor = Color.white();
  yieldTotalText.font = Font.systemFont(13);

  widget.addSpacer();
  let timeStampStack = widget.addStack();
  timeStampStack.layoutVertically();
  timeStampStack.addSpacer();
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
    let data = await fetchData(dtuApiUrl, dtuUser, dtuPass);
    let powerDrawData = showPowerDraw
      ? await fetchData(tasmotaApiUrl, tasmotaUser, tasmotaPass)
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
      widget.presentMedium();
    }
  }
}

run();
