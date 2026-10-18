import yauzl from 'yauzl';

// Read every entry of a zip buffer back into a Map of name -> Buffer.
// With { withMeta: true }, each value is { data, compressionMethod } instead.
export function unzip(buffer, { withMeta = false } = {}) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      const files = new Map();
      zip.on('entry', (entry) => {
        zip.openReadStream(entry, (err, stream) => {
          if (err) return reject(err);
          const chunks = [];
          stream.on('data', (c) => chunks.push(c));
          stream.on('end', () => {
            const data = Buffer.concat(chunks);
            files.set(entry.fileName, withMeta ? { data, compressionMethod: entry.compressionMethod } : data);
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(files));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}
