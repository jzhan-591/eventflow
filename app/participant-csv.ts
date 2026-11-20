type ImportedParticipant = {
  name: string;
  checkedIn: boolean;
};

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

  return rows.map((row, index) => {
    const record = index + 1;
    if (row.length !== 2) {
      throw new Error(`Participant record ${record} must have exactly two fields: Name and Status.`);
    }

    const name = row[nameColumn].trim();
    const status = row[statusColumn].trim();
    if (!name) {
      throw new Error(`Participant record ${record} is missing a name.`);
    }
    if (status !== "Checked In" && status !== "Not Checked In") {
      throw new Error(`Participant record ${record} must have a status of Checked In or Not Checked In.`);
    }

    return { name, checkedIn: status === "Checked In" };
  });
}
