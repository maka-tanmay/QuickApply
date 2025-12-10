// Create simple PNG icons without external dependencies
const fs = require('fs');

// Minimal valid PNG for a colored square
// This creates a simple 1-color PNG
function createPNG(size, color = [79, 70, 229]) { // #4F46E5
  const r = color[0];
  const g = color[1];
  const b = color[2];
  
  // PNG signature
  const png = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  ]);
  
  // For a simple approach, create a minimal valid PNG
  // Using a very basic structure
  const width = size;
  const height = size;
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdrData);
  
  // IDAT chunk - simple uncompressed RGB data
  const pixelData = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixelData[i * 3] = r;
    pixelData[i * 3 + 1] = g;
    pixelData[i * 3 + 2] = b;
  }
  
  // Add filter bytes (0 = no filter for each scanline)
  const scanlineLength = width * 3;
  const filteredData = Buffer.alloc(height * (scanlineLength + 1));
  for (let y = 0; y < height; y++) {
    filteredData[y * (scanlineLength + 1)] = 0; // filter byte
    pixelData.copy(filteredData, y * (scanlineLength + 1) + 1, y * scanlineLength, (y + 1) * scanlineLength);
  }
  
  // For simplicity, use zlib compression (but we'll create a minimal version)
  // Actually, let's use a simpler approach - create a valid minimal PNG
  
  // Create a base64-encoded minimal PNG and decode it
  // This is a 1x1 blue pixel PNG
  const minimalPNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  
  // Scale it up by creating multiple copies (simple but works)
  // Actually, let's create a proper minimal PNG using a library-free approach
  return createMinimalColoredPNG(size, r, g, b);
}

function createMinimalColoredPNG(size, r, g, b) {
  // Create a minimal valid PNG structure
  const chunks = [];
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // no filter
  ihdr[12] = 0; // no interlace
  chunks.push(createChunk('IHDR', ihdr));
  
  // IDAT - create simple image data
  // For each pixel: R, G, B, A (255 for alpha)
  const rowSize = size * 4 + 1; // +1 for filter byte per row
  const imageData = Buffer.alloc(size * rowSize);
  
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowSize;
    imageData[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const pixelStart = rowStart + 1 + x * 4;
      imageData[pixelStart] = r;
      imageData[pixelStart + 1] = g;
      imageData[pixelStart + 2] = b;
      imageData[pixelStart + 3] = 255; // alpha
    }
  }
  
  // Compress with zlib (simplified - use stored blocks)
  const compressed = deflateSimple(imageData);
  chunks.push(createChunk('IDAT', compressed));
  
  // IEND
  chunks.push(createChunk('IEND', Buffer.alloc(0)));
  
  // Combine
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  return Buffer.concat([pngSignature, ...chunks]);
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const crc = calculateCRC(Buffer.concat([typeBuf, data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function calculateCRC(data) {
  const crcTable = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }
  
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function deflateSimple(data) {
  // Minimal deflate: stored blocks (no compression for simplicity)
  // This creates a valid but uncompressed deflate stream
  const result = Buffer.alloc(data.length + 5);
  result[0] = 0x78; // CMF: CM=8, CINFO=7
  result[1] = 0x9C; // FLG: FCHECK
  result[2] = 0x01; // First block: BFINAL=1, BTYPE=00 (no compression)
  
  const len = data.length;
  result[3] = len & 0xFF; // LEN (little-endian)
  result[4] = (len >> 8) & 0xFF;
  result[5] = (~len) & 0xFF; // NLEN (one's complement)
  result[6] = ((~len) >> 8) & 0xFF;
  
  data.copy(result, 7);
  
  // Adler-32 checksum (simplified)
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  const adler = (b << 16) | a;
  const adlerBuf = Buffer.alloc(4);
  adlerBuf.writeUInt32BE(adler, 0);
  
  return Buffer.concat([result, adlerBuf]);
}

// Create icons
const sizes = [16, 48, 128];
sizes.forEach(size => {
  const png = createMinimalColoredPNG(size, 79, 70, 229); // #4F46E5 purple
  fs.writeFileSync(`icons/icon${size}.png`, png);
  console.log(`✓ Created icon${size}.png (${size}x${size})`);
});

console.log('\n✅ All icons created successfully!');
console.log('You can now load the extension in Chrome.');

