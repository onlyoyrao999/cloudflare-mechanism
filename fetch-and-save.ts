import fs from 'fs';
import path from 'path';

async function fetchAndSave() {
  try {
    const url = 'https://macaujc.ddcdn.cloudns.org/';
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const text = await res.text();
    const lines = text.split('\n');
    const records: { period: string; numbers: number[] }[] = [];
    const seenPeriods = new Set<string>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Format is "2026165: [11,47,09,49,02,01,03]" or similar
      const match = trimmed.match(/^(\d+):\s*\[(.*?)\]/);
      if (match) {
        const period = match[1];
        if (seenPeriods.has(period)) continue;
        seenPeriods.add(period);
        
        const numsStr = match[2];
        const numbers = numsStr.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n));
        if (numbers.length > 0) {
          records.push({ period, numbers });
        }
      }
    }

    console.log(`Successfully parsed ${records.length} records.`);

    // Sort records in descending order of period (most recent first)
    records.sort((a, b) => b.period.localeCompare(a.period));

    const dir = path.resolve('src/data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(dir, 'history.json'),
      JSON.stringify(records, null, 2),
      'utf-8'
    );
    console.log('Saved history to src/data/history.json');
  } catch (err: any) {
    console.error('Fetch and Save failed:', err.message);
  }
}

fetchAndSave();
