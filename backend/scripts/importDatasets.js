const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const sax = require('sax');
const mongoose = require('mongoose');
require('dotenv').config();
const Utility = require('../models/Utility');
const { getMongoUri } = require('../lib/config');

const KML_DATASETS = [
  { file: '0f28c5fb-8043-45b2-ba46-ce9e8f18e2fa.kml', utilityType: 'sewerage', datasetName: 'BWSSB Sewer Lines' },
  { file: '4f999482-f969-484e-9209-64e54fba9055.kml', utilityType: 'water', datasetName: 'BWSSB Water Lines' },
  { file: '5521d121-2da1-49a6-8e74-6e5cfca372e9.kml', utilityType: 'sewerage', datasetName: 'BWSSB Sewer Lines' },
  { file: 'a57f5572-ab3d-4527-bc14-88462156fa6b.kml', utilityType: 'sewerage', datasetName: 'BWSSB Sewer Lines' },
  { file: 'f6c32921-8975-44d3-9b55-2174396e0991.kml', utilityType: 'water', datasetName: 'BWSSB Water Lines' }
];
const SUBSTATION_FILE = '3c779061-159d-40ee-bc07-92691d4eec70.csv';
const BATCH_SIZE = 500;

function findDatasetsDirectory() {
  const candidates = [
    path.resolve(__dirname, '..', 'Datasets'),
    path.resolve(__dirname, '..', '..', 'Datasets')
  ];
  const requiredFiles = [...KML_DATASETS.map(dataset => dataset.file), SUBSTATION_FILE];
  const directory = candidates.find(candidate =>
    requiredFiles.every(file => fs.existsSync(path.join(candidate, file)))
  );

  if (!directory) {
    throw new Error('Could not find all six dataset files in backend/Datasets or the project Datasets folder.');
  }
  return directory;
}

function localName(name) {
  return name.split(':').pop().toLowerCase();
}

function readAttribute(tag, name) {
  const key = Object.keys(tag.attributes).find(item =>
    localName(item) === name.toLowerCase()
  );
  return key ? tag.attributes[key] : '';
}

function parseCoordinates(text, file, placemarkNumber) {
  const coordinates = [];
  for (const tuple of text.trim().split(/\s+/).filter(Boolean)) {
    const values = tuple.split(',');
    if (values.length < 2 || !values[0].trim() || !values[1].trim()) {
      throw new Error(`Invalid coordinate in ${file}, Placemark ${placemarkNumber}: ${tuple}`);
    }
    const longitude = Number(values[0]);
    const latitude = Number(values[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
      || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      throw new Error(`Invalid coordinate in ${file}, Placemark ${placemarkNumber}: ${tuple}`);
    }
    coordinates.push([longitude, latitude]);
  }
  return coordinates;
}

function numericAttribute(attributes, name) {
  const value = getAttribute(attributes, name);
  if (value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function getAttribute(attributes, name) {
  const key = Object.keys(attributes).find(item => item.toLowerCase() === name.toLowerCase());
  return key ? attributes[key] : undefined;
}

function makeKmlRecord(dataset, file, placemark, placemarkNumber, stats) {
  const lines = placemark.lines.filter(line => {
    const distinctPositions = new Set(line.map(position => JSON.stringify(position)));
    if (line.length < 2 || distinctPositions.size < 2) {
      if (stats) stats.degenerateLineStrings += 1;
      return false;
    }
    return true;
  });
  if (lines.length === 0) return null;

  const geometry = lines.length === 1
    ? { type: 'LineString', coordinates: lines[0] }
    : { type: 'MultiLineString', coordinates: lines };
  const attributes = placemark.attributes;
  const recordId = getAttribute(attributes, 'OBJECTID')
    || getAttribute(attributes, 'KGISSewerlineID')
    || getAttribute(attributes, 'PipeID')
    || `placemark-${placemarkNumber}`;
  const record = {
    utilityType: dataset.utilityType,
    source: 'BWSSB',
    geometry,
    datasetName: dataset.datasetName,
    sourceFile: file,
    recordId: String(recordId),
    dataSource: 'OpenCity / BWSSB',
    attributes
  };

  if (placemark.name) record.name = placemark.name;
  const pipeId = getAttribute(attributes, 'PipeID');
  const diameter = numericAttribute(attributes, 'Diameter');
  const materialId = getAttribute(attributes, 'MaterialID');
  const length = numericAttribute(attributes, 'Length');
  const status = getAttribute(attributes, 'Status');
  const workConditionId = getAttribute(attributes, 'WorkConditionID');
  if (pipeId !== undefined) record.pipeId = String(pipeId);
  if (diameter !== undefined) record.diameter = diameter;
  if (materialId !== undefined) record.materialId = String(materialId);
  if (length !== undefined) record.length = length;
  if (status !== undefined) record.status = status;
  if (workConditionId !== undefined) record.workConditionId = String(workConditionId);
  return record;
}

async function* readKmlRecords(filePath, dataset, stats) {
  const file = path.basename(filePath);
  const parser = sax.parser(true, { trim: false, normalize: false });
  const records = [];
  let placemark = null;
  let currentLine = null;
  let currentDataName = '';
  let capture = null;
  let placemarkNumber = 0;
  let parseError = null;

  parser.onerror = error => {
    parseError = error;
    parser.resume();
  };
  parser.onopentag = tag => {
    const name = localName(tag.name);
    if (name === 'placemark') {
      placemark = { name: '', lines: [], attributes: {} };
    } else if (placemark && name === 'linestring') {
      currentLine = [];
      placemark.lines.push(currentLine);
    } else if (placemark && name === 'data') {
      currentDataName = readAttribute(tag, 'name');
    } else if (placemark && name === 'coordinates' && currentLine) {
      capture = { type: 'coordinates', value: '' };
    } else if (placemark && name === 'simpledata') {
      capture = { type: 'attribute', name: readAttribute(tag, 'name'), value: '' };
    } else if (placemark && name === 'value' && currentDataName) {
      capture = { type: 'attribute', name: currentDataName, value: '' };
    } else if (placemark && name === 'name') {
      capture = { type: 'name', value: '' };
    }
  };
  const addText = text => {
    if (capture) capture.value += text;
  };
  parser.ontext = addText;
  parser.oncdata = addText;
  parser.onclosetag = tagName => {
    const name = localName(tagName);
    if (placemark && name === 'coordinates' && capture && capture.type === 'coordinates') {
      currentLine.push(...parseCoordinates(capture.value, file, placemarkNumber + 1));
      capture = null;
    } else if (placemark && (name === 'value' || name === 'simpledata')
      && capture && capture.type === 'attribute') {
      if (capture.name) placemark.attributes[capture.name] = capture.value.trim();
      capture = null;
    } else if (placemark && name === 'name' && capture && capture.type === 'name') {
      placemark.name = capture.value.trim();
      capture = null;
    }

    if (name === 'data') currentDataName = '';
    if (name === 'linestring') currentLine = null;
    if (name === 'placemark') {
      placemarkNumber += 1;
      const record = makeKmlRecord(dataset, file, placemark, placemarkNumber, stats);
      if (stats) {
        stats.placemarks += 1;
        if (!record) stats.skipped += 1;
      }
      if (record) records.push(record);
      placemark = null;
      currentLine = null;
      capture = null;
    }
  };

  for await (const chunk of fs.createReadStream(filePath, { encoding: 'utf8' })) {
    parser.write(chunk);
    if (parseError) throw parseError;
    while (records.length) yield records.shift();
  }
  parser.close();
  if (parseError) throw parseError;
  while (records.length) yield records.shift();
}

function parseCsv(contents) {
  const rows = [];
  let row = [];
  let field = '';
  let insideQuotes = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];
    if (character === '"') {
      if (insideQuotes && contents[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === ',' && !insideQuotes) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !insideQuotes) {
      if (character === '\r' && contents[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (insideQuotes) throw new Error('The substation CSV contains an unclosed quoted field.');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readSubstationRecords(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('The substation CSV has no data rows.');
  const headers = rows[0].map(header => header.trim());
  const valueFrom = (row, header) => {
    const index = headers.indexOf(header);
    return index < 0 ? '' : (row[index] || '').trim();
  };

  return rows.slice(1).map((row, index) => {
    const recordId = valueFrom(row, '_id') || valueFrom(row, 'Sl. No') || `csv-row-${index + 1}`;
    const record = {
      utilityType: 'electrical_substation',
      source: 'BESCOM',
      datasetName: 'Bengaluru Electrical Substations',
      sourceFile: path.basename(filePath),
      recordId: String(recordId),
      dataSource: 'BESCOM substation CSV',
      attributes: Object.fromEntries(headers.map((header, columnIndex) => [header, (row[columnIndex] || '').trim()]))
    };
    const fields = [
      ['name', 'Name of Sub-Station'],
      ['zone', 'Zone'],
      ['district', 'District'],
      ['taluk', 'Taluk'],
      ['voltageClass', 'Voltage Class (in kV)'],
      ['dateOfCommission', 'Date of commission']
    ];
    for (const [fieldName, header] of fields) {
      const value = valueFrom(row, header);
      if (value) record[fieldName] = value;
    }
    return record;
  });
}

async function scanKml(filePath, dataset, onRecord = async () => {}) {
  const stats = { placemarks: 0, records: 0, coordinates: 0, skipped: 0, degenerateLineStrings: 0 };
  for await (const record of readKmlRecords(filePath, dataset, stats)) {
    stats.records += 1;
    const lines = record.geometry.type === 'LineString'
      ? [record.geometry.coordinates]
      : record.geometry.coordinates;
    stats.coordinates += lines.reduce((total, line) => total + line.length, 0);
    await onRecord(record);
  }
  return stats;
}

async function confirmClear() {
  console.warn('WARNING: --clear-utilities will permanently delete every Utility document, including existing demo records.');
  if (!process.stdin.isTTY) {
    throw new Error('Run --clear-utilities in an interactive terminal and type DELETE to confirm.');
  }
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question('Type DELETE to continue: ');
  prompt.close();
  if (answer !== 'DELETE') throw new Error('Deletion cancelled.');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const clearUtilities = args.includes('--clear-utilities');
  const unknownArgs = args.filter(argument => !['--dry-run', '--clear-utilities'].includes(argument));
  if (unknownArgs.length || (dryRun && clearUtilities)) {
    throw new Error('Usage: npm run import:datasets [-- --dry-run | -- --clear-utilities]');
  }

  const datasetsDirectory = findDatasetsDirectory();
  console.log(`Dataset folder: ${datasetsDirectory}`);

  const kmlStats = [];
  for (const dataset of KML_DATASETS) {
    const stats = await scanKml(path.join(datasetsDirectory, dataset.file), dataset);
    kmlStats.push({ ...stats, file: dataset.file });
    console.log(`${dataset.file}: ${stats.placemarks} Placemarks; ${stats.records} line records; ${stats.degenerateLineStrings} degenerate LineStrings skipped; ${stats.skipped} Placemarks skipped with no valid LineString; ${stats.coordinates} valid coordinate pairs`);
  }

  const csvPath = path.join(datasetsDirectory, SUBSTATION_FILE);
  const substations = readSubstationRecords(csvPath);
  console.log(`${SUBSTATION_FILE}: ${substations.length} substation records; no coordinates or geometry will be created`);
  const total = kmlStats.reduce((sum, stats) => sum + stats.records, 0) + substations.length;
  console.log(`Validation complete: ${total} records would be imported or updated.`);

  if (dryRun) return;
  if (clearUtilities) await confirmClear();

  await mongoose.connect(getMongoUri());
  try {
    if (clearUtilities) {
      const deleted = await Utility.deleteMany({});
      console.log(`Deleted ${deleted.deletedCount} Utility records after confirmation.`);
    }

    let imported = 0;
    let batch = [];
    const writeBatch = async () => {
      if (batch.length === 0) return;
      await Utility.bulkWrite(batch, { ordered: false });
      imported += batch.length;
      batch = [];
    };
    for (const dataset of KML_DATASETS) {
      for await (const record of readKmlRecords(path.join(datasetsDirectory, dataset.file), dataset)) {
        batch.push({
          updateOne: {
            filter: { sourceFile: record.sourceFile, recordId: record.recordId },
            update: { $set: record },
            upsert: true
          }
        });
        if (batch.length >= BATCH_SIZE) await writeBatch();
      }
      await writeBatch();
    }

    for (const record of substations) {
      batch.push({
        updateOne: {
          filter: { sourceFile: record.sourceFile, recordId: record.recordId },
          update: { $set: record },
          upsert: true
        }
      });
      if (batch.length >= BATCH_SIZE) await writeBatch();
    }
    await writeBatch();
    console.log(`Imported or updated ${imported} source records.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(`Dataset import failed: ${error.message}`);
  process.exitCode = 1;
});