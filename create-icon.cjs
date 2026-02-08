const fs = require('fs');
const path = require('path');

// Create a simple 1024x1024 PNG icon (blue square with A)
// This is a minimal valid PNG file
const createSimplePNG = () => {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk (image header)
  const width = 1024;
  const height = 1024;
  const bitDepth = 8;
  const colorType = 6; // RGBA
  const compression = 0;
  const filter = 0;
  const interlace = 0;

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(bitDepth, 8);
  ihdrData.writeUInt8(colorType, 9);
  ihdrData.writeUInt8(compression, 10);
  ihdrData.writeUInt8(filter, 11);
  ihdrData.writeUInt8(interlace, 12);

  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk (image data) - simple blue gradient
  const pixels = [];
  for (let y = 0; y < height; y++) {
    // Filter type (none)
    pixels.push(0);

    for (let x = 0; x < width; x++) {
      // Blue gradient with white "A" in center
      const brightness = Math.floor((y / height) * 50);
      const inA = x > 400 && x < 624 && y > 350 && y < 674;

      if (inA) {
        pixels.push(255, 255, 255, 255); // White A
      } else {
        pixels.push(59, 130, 246, 255); // Blue (#3b82f6)
      }
    }
  }

  const zlib = require('zlib');
  const idatData = zlib.deflateSync(Buffer.from(pixels));
  const idat = createChunk('IDAT', idatData);

  // IEND chunk (end of file)
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
};

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = calculateCRC(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function calculateCRC(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc >>>= 1;
      }
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate the icon
console.log('Creating app-icon.png...');
try {
  const png = createSimplePNG();
  fs.writeFileSync('app-icon.png', png);
  console.log('✓ Created app-icon.png (1024x1024)');
} catch (error) {
  console.error('Error creating icon:', error.message);
  process.exit(1);
}
