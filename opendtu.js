// Change this URL!
const apiUrl = "http://127.0.0.1/api/livedata/status";

// Define color thresholds for power value
const redThreshold = 220; // Basic load
const yellowThreshold = 260; // Threshold where there's enough production to add more consumers
const greenThreshold = 400; // Threshold where we feed in

// Fetch data from the API
async function fetchData() {
  let request = new Request(apiUrl);
  try {
    let response = await request.loadJSON();
    return response;
  } catch (error) {
    console.error(`Could not fetch data: ${error}`);
    return null;
  }
}
// Create widget
async function createWidget(data) {
  let widget = new ListWidget();

  // Define gradient background color
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
  ).toFixed(2); // Convert Wh to kWh
  let yieldTotalData = parseFloat(
    data.inverters[0].AC["0"].YieldTotal.v
  ).toFixed(2);

  widget.addSpacer(2); // Add some space between title and data

  let powerLabel = widget.addText(`Power: `);
  powerLabel.textColor = Color.white();
  powerLabel.font = Font.systemFont(8);

  let powerText = widget.addText(`${powerData.toFixed(2)} W`);
  powerText.font = Font.systemFont(14);

  // Adjust color based on power value
  if (powerData < redThreshold) {
    powerText.textColor = Color.red();
  } else if (powerData >= redThreshold && powerData < yellowThreshold) {
    powerText.textColor = Color.yellow();
  } else {
    powerText.textColor = Color.green();
  }

  widget.addSpacer(1); // Add some space between data

  let yieldDayLabel = widget.addText(`Yield Day: `);
  yieldDayLabel.textColor = Color.white();
  yieldDayLabel.font = Font.systemFont(8);

  let yieldDayText = widget.addText(`${yieldDayData} kWh`);
  yieldDayText.textColor = Color.white();
  yieldDayText.font = Font.systemFont(14);

  widget.addSpacer(1); // Add some space between data

  let yieldTotalLabel = widget.addText(`Yield Total: `);
  yieldTotalLabel.textColor = Color.white();
  yieldTotalLabel.font = Font.systemFont(8);

  let yieldTotalText = widget.addText(`${yieldTotalData} kWh`);
  yieldTotalText.textColor = Color.white();
  yieldTotalText.font = Font.systemFont(14);

  // Add last updated timestamp
  widget.addSpacer(); // Add some space before the timestamp
  let timeStampStack = widget.addStack();
  timeStampStack.layoutVertically();
  timeStampStack.addSpacer();
  let dateText = timeStampStack.addDate(new Date());
  dateText.textColor = Color.white();
  dateText.applyRelativeStyle();
  dateText.font = Font.systemFont(8); // set font size on the date text
  timeStampStack.addText(" ago").font = Font.systemFont(8); // set font size on the "ago" text
  timeStampStack.textOpacity = 0.5;

  return widget;
}

// Load data
let data = await fetchData();

// Create widget
let widget = await createWidget(data);

// Check where the script is running
if (config.runsInWidget) {
  // Runs inside a widget so add it to the homescreen
  Script.setWidget(widget);
} else {
  // Show the medium widget
  widget.presentMedium();
}

Script.complete();
