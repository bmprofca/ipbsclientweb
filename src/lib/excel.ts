function splitCsvLine(line: string, delimiter: string) {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function looksLikePhone(value: string) {
  return /^[+\d][\d\s().-]{5,}$/.test(value.trim());
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter).map((h) => h.replace(/"/g, ""));
  if (headers.length === 1 && looksLikePhone(headers[0])) {
    return lines.map((line) => {
      const phone = splitCsvLine(line, delimiter)[0] || line;
      return { phone, name: phone };
    });
  }
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line, delimiter);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      row[h || `col${i + 1}`] = cols[i] || "";
    });
    if (!row.phone && cols[0] && looksLikePhone(String(cols[0])) && !looksLikePhone(headers[0])) {
      row.phone = cols[0];
      if (!row.name) row.name = cols[0];
    }
    return row;
  });
}

export async function parseContactSheet(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    const rows = parseCsv(await file.text());
    if (!rows.length) throw new Error("The file has no data rows.");
    return rows;
  }
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!rows.length) throw new Error("The first sheet is empty.");
  return rows;
}
