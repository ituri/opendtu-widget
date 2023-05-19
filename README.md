# OpenDTU widget

This is a simple widget for Scriptable that displays current data from your OpenDTU.

![](screenshot.jpg)

## Setup

To set up the widget, follow these steps:

1. Load the opendtu.js file into Scriptable.
2. Update the `apiUrl` variable with the IP address or URL of your DTU.
3. _Optional_: If desired, you may customize the thresholds section as well to configure how the Power value is colored.

## Accessing the widget from the Internet

It is strongly recommended **not** to completely expose your OpenDTU to the internet due to security reasons. However, if you still want to access it remotely, you can use a reverse proxy such as Nginx Proxy Manager. By configuring the reverse proxy to only expose the `/api/livedata/status` endpoint, you can limit the exposure of your OpenDTU. Since this endpoint only provides read-only access and does not expose any private data, it should be relatively safe. However, please note that I do not take any responsibility for any issues that may arise from this configuration.

For instructions on how to forward the API endpoint using Nginx Proxy Manager, refer to [this](https://github.com/NginxProxyManager/nginx-proxy-manager/issues/104#issuecomment-490720849) hint.
