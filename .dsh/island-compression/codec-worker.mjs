import { encodePayload, decodePayload } from './browser.mjs';
self.onmessage = async ({ data }) => {
  const { requestId, operation, layout, payload, nativeCompression = false } = data ?? {};
  try {
    if (operation !== 'encode' && operation !== 'decode') throw new Error('Unsupported codec operation');
    const value = operation === 'encode' ? await encodePayload(layout, { nativeCompression }) : await decodePayload(payload);
    self.postMessage({ requestId, value });
  } catch (error) {
    self.postMessage({ requestId, error: error.message });
  }
};
