const button = document.querySelector('#toggle');
const status = document.querySelector('#status');

const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
const UART_RX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

let device;
let uartTx;
let uartRx;
let isOn;
let busy = false;
let receivedText = '';
let stateRequest;

function setStatus(message, type = '') {
  status.textContent = message;
  status.dataset.type = type;
}

function render() {
  button.disabled = busy;
  button.classList.toggle('on', Boolean(isOn) && uartRx);
  button.setAttribute('aria-pressed', String(Boolean(isOn)));
  button.textContent = uartRx ? (isOn === undefined ? 'Check lights' : (isOn ? 'Off' : 'On')) : 'Connect';
}

function disconnect() {
  uartTx = undefined;
  uartRx = undefined;
  isOn = undefined;
  receivedText = '';
  if (stateRequest) stateRequest.reject(new Error('Disconnected'));
  stateRequest = undefined;
  setStatus('Not connected');
  render();
}

function receiveUart(event) {
  receivedText += new TextDecoder().decode(event.target.value);
  const lines = receivedText.split('\n');
  receivedText = lines.pop();

  for (const line of lines) {
    if (line !== '0' && line !== '1') continue;
    isOn = line === '1';
    if (stateRequest) {
      stateRequest.resolve();
      stateRequest = undefined;
    }
    render();
  }
}

async function send(command) {
  const value = new TextEncoder().encode(`${command}\n`);
  if (uartRx.properties.write && uartRx.writeValueWithResponse) {
    await uartRx.writeValueWithResponse(value);
  } else if (uartRx.properties.writeWithoutResponse && uartRx.writeValueWithoutResponse) {
    await uartRx.writeValueWithoutResponse(value);
  } else {
    await uartRx.writeValue(value);
  }
}

async function readState() {
  const requestOnce = () => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (stateRequest?.reject === reject) stateRequest = undefined;
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
      await requestOnce();
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
}

async function connect() {
  if (!navigator.bluetooth) {
    throw new Error('This browser cannot connect to your lights.');
  }

  setStatus('Choose your lights…');
  device = await microbit.requestMicrobit(navigator.bluetooth);
  if (!device) return;

  device.addEventListener('gattserverdisconnected', disconnect, { once: true });
  const gatt = device.gatt;
  if (!gatt) throw new Error('Could not connect to your lights.');
  if (!gatt.connected) await gatt.connect();

  const uartService = await gatt.getPrimaryService(UART_SERVICE_UUID);
  uartTx = await uartService.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
  uartRx = await uartService.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
  uartTx.addEventListener('characteristicvaluechanged', receiveUart);
  await uartTx.startNotifications();
  await new Promise((resolve) => setTimeout(resolve, 300));
  await readState();
  setStatus('Connected', 'success');
}

async function toggle() {
  busy = true;
  render();

  try {
    if (!uartRx) {
      await connect();
      return;
    }

    if (isOn === undefined) {
      await readState();
      setStatus('Connected', 'success');
      return;
    }

    await send(isOn ? '0' : '1');
    isOn = !isOn;
    setStatus(isOn ? 'On' : 'Off', 'success');
  } catch {
    setStatus(device ? 'Could not check your lights.' : 'No lights were selected.', 'error');
  } finally {
    busy = false;
    render();
  }
}

button.disabled = false;
render();
button.addEventListener('click', toggle);
