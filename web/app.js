const button = document.querySelector('#toggle');
const status = document.querySelector('#status');

let device;
let ioPinService;
let isOn = false;
let busy = false;

function setStatus(message, type = '') {
  status.textContent = message;
  status.dataset.type = type;
}

function render() {
  button.disabled = busy;
  button.classList.toggle('on', isOn && ioPinService);
  button.setAttribute('aria-pressed', String(isOn));
  button.textContent = ioPinService ? `GPIO 0: ${isOn ? 'On' : 'Off'}` : 'Connect micro:bit';
}

async function connect() {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth needs Chrome or Edge over HTTPS.');
  }

  setStatus('Choose your micro:bit…');
  device = await microbit.requestMicrobit(navigator.bluetooth);
  if (!device) return;

  device.addEventListener('gattserverdisconnected', () => {
    ioPinService = undefined;
    isOn = false;
    setStatus('Disconnected');
    render();
  });

  const services = await microbit.getServices(device);
  ioPinService = services.ioPinService;
  if (!ioPinService) {
    throw new Error('This micro:bit does not expose the IO Pin Bluetooth service.');
  }

  setStatus(`Connected to ${device.name || 'micro:bit'}`, 'success');
}

async function toggle() {
  busy = true;
  render();

  try {
    if (!ioPinService) await connect();
    if (!ioPinService) return;

    const nextValue = isOn ? 0 : 1;
    await ioPinService.writePinData([{ pin: 0, value: nextValue }]);
    isOn = Boolean(nextValue);
    setStatus(`GPIO 0 is ${isOn ? 'on (3 V)' : 'off (0 V)'}.`, 'success');
  } catch (error) {
    const message = error?.name === 'NotFoundError'
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
