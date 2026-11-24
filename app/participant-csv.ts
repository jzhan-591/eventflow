export type ImportedParticipant = {
  name: string;
  checkedIn: boolean;
};

const encodedNamePrefix = "EventFlow text: ";
const encodingMarker = ["EventFlow Spreadsheet Encoding v1", "Metadata"] as const;

function needsSpreadsheetEncoding(name: string) {
  return name !== name.trim() ||
    name.startsWith(encodedNamePrefix) ||
    /^[\s']*[=+\-@＝＋－＠]/u.test(name) ||
    /[\p{Cc}\p{Cf}]/u.test(name);
}

function decodeParticipantName(field: string, record: number) {
  const payload = field.slice(encodedNamePrefix.length);
  const name = Buffer.from(payload, "base64url").toString("utf8");
  if (!payload || Buffer.from(name, "utf8").toString("base64url") !== payload ||
      !needsSpreadsheetEncoding(name)) {
    throw new Error(`Participant record ${record} has an invalid EventFlow-encoded name.`);
  }
  return name;
}

export function serializeParticipantCsv(participants: { name: string; checked_in: boolean }[]) {
  const header = ["Name,Status"];
  if (participants.some(({ name }) => needsSpreadsheetEncoding(name))) {
    header.push(encodingMarker.join(","));
  }

  const rows = participants.map(({ name, checked_in }) => {
    const spreadsheetName = needsSpreadsheetEncoding(name)
      ? encodedNamePrefix + Buffer.from(name, "utf8").toString("base64url")
      : name;
    // Quoted fields preserve commas, quotes, and line breaks.
    const csvName = `"${spreadsheetName.replace(/"/g, '""')}"`;
    return `${csvName},${checked_in ? "Checked In" : "Not Checked In"}`;
  });
  return [...header, ...rows].join("\r\n") + "\r\n";
}

function readCsvRows(text: string) {
  const csv = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let fieldState: "unquoted" | "quoted" | "closed" = "unquoted";
  let rowStart = 0;

  for (let index = 0; index <= csv.length; index++) {
    const character = csv[index];

    // Inside quotes, commas and line breaks are part of the field.
    if (fieldState === "quoted") {
      if (character === undefined) {
        throw new Error("The CSV contains a quoted field with no closing quote.");
      }
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') {
        fieldState = "closed";
      } else {
        field += character;
      }
      continue;
    }

    if (character === ",") {
      row.push(field);
      field = "";
      fieldState = "unquoted";
    } else if (character === "\r" || character === "\n" || character === undefined) {
      if (csv.slice(rowStart, index).trim()) {
        rows.push([...row, field]);
      }
      if (character === "\r" && csv[index + 1] === "\n") {
        index++;
      }
      rowStart = index + 1;
      row = [];
      field = "";
      fieldState = "unquoted";
    } else if (character === '"' && fieldState === "unquoted" && field === "") {
      fieldState = "quoted";
    } else if (character === '"' || fieldState === "closed") {
      throw new Error("The CSV contains an invalid quote. Put double quotes around fields that contain commas, quotes, or line breaks.");
    } else {
      field += character;
    }
  }

  return rows;
}

export function parseParticipantCsv(text: string): ImportedParticipant[] {
  const [header, ...rows] = readCsvRows(text);
  const columns = header?.map((column) => column.trim());
  const nameColumn = columns?.indexOf("Name") ?? -1;
  const statusColumn = columns?.indexOf("Status") ?? -1;

  if (columns?.length !== 2 || nameColumn === -1 || statusColumn === -1) {
    throw new Error("The CSV must have two columns with the headers Name and Status.");
  }

  // The marker cannot be mistaken for a valid legacy participant row.
  const marker = rows[0];
  const spreadsheetEncoded = marker?.length === 2 &&
    marker[nameColumn] === encodingMarker[0] && marker[statusColumn] === encodingMarker[1];
  if (spreadsheetEncoded) rows.shift();

  return rows.map((row, index) => {
    const record = index + 1;
    if (row.length !== 2) {
      throw new Error(`Participant record ${record} must have exactly two fields: Name and Status.`);
    }

    const field = row[nameColumn];
    const name = spreadsheetEncoded && field.startsWith(encodedNamePrefix)
      ? decodeParticipantName(field, record)
      : field.trim();
    const status = row[statusColumn].trim();
    if (!name.trim()) {
      throw new Error(`Participant record ${record} is missing a name.`);
    }
    if (status !== "Checked In" && status !== "Not Checked In") {
      throw new Error(`Participant record ${record} must have a status of Checked In or Not Checked In.`);
    }

    return { name, checkedIn: status === "Checked In" };
  });
}
