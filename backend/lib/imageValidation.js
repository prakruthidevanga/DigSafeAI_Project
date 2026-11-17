const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'webp';
  return null;
}

function validateImageFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) return 'An image file is required.';
  if (file.size > MAX_IMAGE_SIZE_BYTES) return 'Image must be 5 MB or smaller.';
  const expectedFormat = SUPPORTED_IMAGE_TYPES.get(file.mimetype);
  if (!expectedFormat) return 'Supported image formats are JPEG, PNG, and WebP.';
  if (detectImageFormat(file.buffer) !== expectedFormat) {
    return 'The uploaded image content does not match its declared file type.';
  }
  return null;
}

module.exports = {
  MAX_IMAGE_SIZE_BYTES,
  detectImageFormat,
  validateImageFile,
};
