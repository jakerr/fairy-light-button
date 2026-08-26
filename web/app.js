const connectButton = document.querySelector('#connect');
const toggleControl = document.querySelector('#toggle-control');
const toggle = document.querySelector('#toggle');
const status = document.querySelector('#status');
const debugToggle = document.querySelector('#debug-toggle');
const debugPanel = document.querySelector('#debug-panel');
const debugOutput = document.querySelector('#debug-output');

const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

let device;
let uartTx;
let uartRx;
let isOn;
let busy = false;
let receivedText = '';
let stateRequest;
let autoReconnectFinished = false;

function log(message) {
  const time = new Date().toLocaleTimeString();
  debugOutput.textContent += `[${time}] ${message}\n`;
  debugPanel.scrollTop = debugPanel.scrollHeight;
}

function logError(label, error) {
  const name = error?.name ? `${error.name}: ` : '';
  log(`${label}: ${name}${error?.message || String(error)}`);
}

function characteristicProperties(characteristic) {
  const { read, write, writeWithoutResponse, notify, indicate } = characteristic.properties;
  return JSON.stringify({ read, write, writeWithoutResponse, notify, indicate });
}

function setStatus(message, type = '') {
  status.textContent = message;
  status.dataset.type = type;
}

function render() {
  connectButton.disabled = busy;
  connectButton.hidden = Boolean(uartRx) || !autoReconnectFinished;
  toggleControl.hidden = !uartRx;
  toggle.disabled = busy || isOn === undefined;
  toggle.checked = Boolean(isOn);
}

function disconnect() {
  log('GATT disconnected');
  uartTx = undefined;
  uartRx = undefined;
  isOn = undefined;
  receivedText = '';
  if (stateRequest) stateRequest.reject(new Error('Disconnected'));
  stateRequest = undefined;
  setStatus('Disconnected');
  render();
}

function receiveUart(event) {
  const text = new TextDecoder().decode(event.target.value);
  log(`UART received: ${JSON.stringify(text)}`);
  receivedText += text;
  const lines = receivedText.split('\n');
  receivedText = lines.pop();

  for (const line of lines) {
    const state = line.trim();
    if (state !== '0' && state !== '1') continue;
    isOn = state === '1';
    if (stateRequest) {
      stateRequest.resolve();
      stateRequest = undefined;
    }
    render();
  }
}

async function send(command) {
  const value = new TextEncoder().encode(`${command}\n`);
  log(`UART send: ${JSON.stringify(`${command}\n`)}`);
  if (uartRx.properties.write && uartRx.writeValueWithResponse) {
    log('UART write mode: with response');
    await uartRx.writeValueWithResponse(value);
  } else if (uartRx.properties.writeWithoutResponse && uartRx.writeValueWithoutResponse) {
    log('UART write mode: without response');
    await uartRx.writeValueWithoutResponse(value);
  } else {
    log('UART write mode: browser default');
    await uartRx.writeValue(value);
  }
}

async function readState() {
  const requestOnce = () => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (stateRequest?.reject === reject) stateRequest = undefined;
      log('State request timed out');
      reject(new Error('Timed out while reading the light state.'));
    }, 1500);

    stateRequest = {
      resolve: () => {
        clearTimeout(timeout);
        resolve();
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    };
    send('?').catch((error) => {
      clearTimeout(timeout);
      stateRequest = undefined;
      reject(error);
    });
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      log(`State request ${attempt + 1} of 3`);
      await requestOnce();
      log(`State received: ${isOn ? 'on' : 'off'}`);
      return;
    } catch (error) {
      logError(`State request ${attempt + 1} failed`, error);
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}

async function connectDevice(selectedDevice) {
  device = selectedDevice;
  log(`Using device: ${device.name || '(unnamed)'}`);
  device.addEventListener('gattserverdisconnected', disconnect, { once: true });
  const gatt = device.gatt;
  if (!gatt) throw new Error('Could not connect to your lights.');
  if (!gatt.connected) {
    log('Connecting to GATT server');
    await gatt.connect();
  }
  log('GATT connected');

  log('Finding UART service');
  const uartService = await gatt.getPrimaryService(UART_SERVICE_UUID);
  log('UART service found');
  uartTx = await uartService.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
  uartRx = await uartService.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
  log(`UART receive properties: ${characteristicProperties(uartTx)}`);
  log(`UART send properties: ${characteristicProperties(uartRx)}`);
  uartTx.addEventListener('characteristicvaluechanged', receiveUart);
  log('Starting UART notifications');
  await uartTx.startNotifications();
  log('UART notifications started');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await readState();
  setStatus('');
}

async function connect() {
  if (!navigator.bluetooth) {
    throw new Error('This browser cannot connect to your lights.');
  }

  setStatus('Choose your lights…');
  log('Opening device chooser');
  const selectedDevice = await microbit.requestMicrobit(navigator.bluetooth);
  if (!selectedDevice) {
    log('No device selected');
    setStatus('');
    return;
  }

  await connectDevice(selectedDevice);
}

async function waitForAdvertisement(knownDevice) {
  if (typeof knownDevice.watchAdvertisements !== 'function') {
    throw new Error('Advertisement watching is unavailable in this browser.');
  }

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      knownDevice.removeEventListener('advertisementreceived', onAdvertisement);
      reject(new Error('Timed out waiting for the micro:bit advertisement.'));
    }, 10000);
    const onAdvertisement = (event) => {
      clearTimeout(timeout);
      knownDevice.removeEventListener('advertisementreceived', onAdvertisement);
      log(`Advertisement received${event.rssi === undefined ? '' : ` (RSSI ${event.rssi})`}`);
      resolve();
    };

    knownDevice.addEventListener('advertisementreceived', onAdvertisement);
    knownDevice.watchAdvertisements()
      .then(() => log('Watching for the micro:bit advertisement'))
      .catch((error) => {
        clearTimeout(timeout);
        knownDevice.removeEventListener('advertisementreceived', onAdvertisement);
        reject(error);
      });
  });
}

async function autoReconnect() {
  if (!navigator.bluetooth || typeof navigator.bluetooth.getDevices !== 'function') {
    log('Remembered-device access is unavailable in this browser');
    autoReconnectFinished = true;
    render();
    return;
  }

  busy = true;
  render();
  try {
    log('Looking for a previously selected device');
    const devices = await navigator.bluetooth.getDevices();
    const knownDevice = devices.find((candidate) => candidate.name?.startsWith('BBC micro:bit'));
    if (!knownDevice) {
      log('No previously selected micro:bit found');
      return;
    }

    try {
      log('Attempting direct remembered-device connection');
      await connectDevice(knownDevice);
      log('Background connection complete without advertisement');
      return;
    } catch (error) {
      logError('Direct remembered-device connection failed', error);
    }

    log(`Waiting to rediscover ${knownDevice.name || 'micro:bit'}`);
    await waitForAdvertisement(knownDevice);
    log('Connecting after advertisement');
    await connectDevice(knownDevice);
    log('Background connection complete');
  } catch (error) {
    logError('Background connection failed', error);
  } finally {
    autoReconnectFinished = true;
    busy = false;
    render();
  }
}

async function connectFromButton() {
  busy = true;
  render();

  try {
    log('Connect button pressed');
    await connect();
  } catch (error) {
    logError('Operation failed', error);
    setStatus(device ? 'Could not check your lights.' : 'No lights were selected.', 'error');
  } finally {
    busy = false;
    render();
  }
}

async function changeLights() {
  const nextState = toggle.checked;
  busy = true;
  render();

  try {
    log(`Changing lights from ${isOn ? 'on' : 'off'} to ${nextState ? 'on' : 'off'}`);
    await send(nextState ? '1' : '0');
    isOn = nextState;
    setStatus('');
  } catch (error) {
    logError('Operation failed', error);
    setStatus(device ? 'Could not check your lights.' : 'No lights were selected.', 'error');
  } finally {
    busy = false;
    render();
  }
}

render();
connectButton.addEventListener('click', connectFromButton);
toggle.addEventListener('change', changeLights);
debugToggle.addEventListener('click', () => {
  const isOpen = debugPanel.hidden;
  debugPanel.hidden = !isOpen;
  debugToggle.setAttribute('aria-expanded', String(isOpen));
  debugToggle.setAttribute('aria-label', isOpen ? 'Hide debug log' : 'Show debug log');
  log(`Debug log ${isOpen ? 'opened' : 'hidden'}`);
});
log('Page ready');
autoReconnect();
