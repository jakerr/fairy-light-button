const button = document.querySelector('#toggle');
const status = document.querySelector('#status');

let device;
let pinDataCharacteristic;
let isOn;
let busy = false;

const IO_PIN_SERVICE_UUID = 'e95d127b-251d-470a-a062-fa1922dfa9a8';
const PIN_DATA_CHARACTERISTIC_UUID = 'e95d8d00-251d-470a-a062-fa1922dfa9a8';

function setStatus(message, type = '') {
  status.textContent = message;
  status.dataset.type = type;
}

function render() {
  button.disabled = busy;
  button.classList.toggle('on', Boolean(isOn) && pinDataCharacteristic);
  button.setAttribute('aria-pressed', String(Boolean(isOn)));
  button.textContent = pinDataCharacteristic ? (isOn ? 'Off' : 'On') : 'Connect';
}

async function connect() {
  if (!navigator.bluetooth) {
    throw new Error('This browser cannot connect to your lights.');
  }

  setStatus('Choose your lights…');
  device = await microbit.requestMicrobit(navigator.bluetooth);
  if (!device) return;

  device.addEventListener('gattserverdisconnected', () => {
    pinDataCharacteristic = undefined;
    isOn = undefined;
    setStatus('Not connected');
    render();
  });

  const gatt = device.gatt;
  if (!gatt) throw new Error('Could not connect to your lights.');
  if (!gatt.connected) await gatt.connect();

  const ioPinService = await gatt.getPrimaryService(IO_PIN_SERVICE_UUID);
  pinDataCharacteristic = await ioPinService.getCharacteristic(PIN_DATA_CHARACTERISTIC_UUID);
  const pinData = await pinDataCharacteristic.readValue();
  const pinZero = Array.from({ length: pinData.byteLength / 2 }, (_, index) => ({
    pin: pinData.getUint8(index * 2),
    value: pinData.getUint8(index * 2 + 1)
  })).find(({ pin }) => pin === 0);

  if (!pinZero) throw new Error('Could not read the light state.');
  isOn = Boolean(pinZero.value);

  setStatus('Connected', 'success');
}

async function toggle() {
  busy = true;
  render();

  try {
    if (!pinDataCharacteristic) {
      await connect();
      return;
    }

    const nextValue = isOn ? 0 : 1;
    const value = new Uint8Array([0, nextValue]);
    if (pinDataCharacteristic.writeValueWithResponse) {
      await pinDataCharacteristic.writeValueWithResponse(value);
    } else {
      await pinDataCharacteristic.writeValue(value);
    }
    isOn = Boolean(nextValue);
    setStatus(isOn ? 'On' : 'Off', 'success');
  } catch (error) {
    const message = error?.name === 'NotFoundError' && !device
      ? 'No lights were selected.'
      : 'Could not connect to your lights.';
    setStatus(message, 'error');
  } finally {
    busy = false;
    render();
  }
}

button.disabled = false;
render();
button.addEventListener('click', toggle);
