const button = document.querySelector('#toggle');
const status = document.querySelector('#status');

let device;
let pinDataCharacteristic;
let isOn = false;
let busy = false;

const IO_PIN_SERVICE_UUID = 'e95d127b-251d-470a-a062-fa1922dfa9a8';
const PIN_DATA_CHARACTERISTIC_UUID = 'e95d8d00-251d-470a-a062-fa1922dfa9a8';

function setStatus(message, type = '') {
  status.textContent = message;
  status.dataset.type = type;
}

function render() {
  button.disabled = busy;
  button.classList.toggle('on', isOn && pinDataCharacteristic);
  button.setAttribute('aria-pressed', String(isOn));
  button.textContent = pinDataCharacteristic ? `GPIO 0: ${isOn ? 'On' : 'Off'}` : 'Connect micro:bit';
}

async function connect() {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth needs Chrome or Edge over HTTPS.');
  }

  setStatus('Choose your micro:bit…');
  device = await microbit.requestMicrobit(navigator.bluetooth);
  if (!device) return;

  device.addEventListener('gattserverdisconnected', () => {
    pinDataCharacteristic = undefined;
    isOn = false;
    setStatus('Disconnected');
    render();
  });

  const gatt = device.gatt;
  if (!gatt) throw new Error('Bluetooth GATT is unavailable.');
  if (!gatt.connected) await gatt.connect();

  const ioPinService = await gatt.getPrimaryService(IO_PIN_SERVICE_UUID);
  pinDataCharacteristic = await ioPinService.getCharacteristic(PIN_DATA_CHARACTERISTIC_UUID);

  setStatus(`Connected to ${device.name || 'micro:bit'}`, 'success');
}

async function toggle() {
  busy = true;
  render();

  try {
    if (!pinDataCharacteristic) await connect();
    if (!pinDataCharacteristic) return;

    const nextValue = isOn ? 0 : 1;
    const value = new Uint8Array([0, nextValue]);
    if (pinDataCharacteristic.writeValueWithResponse) {
      await pinDataCharacteristic.writeValueWithResponse(value);
    } else {
      await pinDataCharacteristic.writeValue(value);
    }
    isOn = Boolean(nextValue);
    setStatus(`GPIO 0 is ${isOn ? 'on (3 V)' : 'off (0 V)'}.`, 'success');
  } catch (error) {
    const message = error?.name === 'NotFoundError' && !device
      ? 'No micro:bit was selected.'
      : error?.message || 'Could not connect to the micro:bit.';
    setStatus(message, 'error');
  } finally {
    busy = false;
    render();
  }
}

button.disabled = false;
render();
button.addEventListener('click', toggle);
