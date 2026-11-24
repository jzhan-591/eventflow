import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Run the production TypeScript module on the project's supported Node versions.
const source = await readFile(new URL("../app/participant-csv.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2017 },
});
const { parseParticipantCsv, serializeParticipantCsv } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("ordinary exports retain their format, quoting, Unicode, and status", () => {
  const output = serializeParticipantCsv([
    { name: 'García, "Sam"', checked_in: true },
    { name: "Jo-Anne O'Neil", checked_in: false },
  ]);

  assert.equal(output, 'Name,Status\r\n"García, ""Sam""",Checked In\r\n"Jo-Anne O\'Neil",Not Checked In\r\n');
  assert.deepEqual(parseParticipantCsv(output), [
    { name: 'García, "Sam"', checkedIn: true },
    { name: "Jo-Anne O'Neil", checkedIn: false },
  ]);
});

test("formula starters, invisible characters, and reserved prefixes round-trip as safe text", () => {
  const names = [
    "=1+1", "+Alex", "-Alex", "@Alex", "＝Alex", "＋Alex", "－Alex", "＠Alex",
    "  =Alex", "'=Alex", "\tAlex", "\rAlex", "\nAlex", "\u001fAlex", "\u007fAlex",
    "\u200b=Alex", "\u0085@Alex", '="A",B\r\nC', "Alex\nRivera",
    " Alex ", "EventFlow text: genuine name",
  ];
  const participants = names.map((name, index) => ({ name, checked_in: index % 2 === 0 }));
  const output = serializeParticipantCsv([...participants, { name: "Normal name", checked_in: false }]);
  const lines = output.trimEnd().split("\r\n");

  assert.equal(lines[0], "Name,Status");
  assert.equal(lines[1], "EventFlow Spreadsheet Encoding v1,Metadata");
  assert.equal(lines.length, names.length + 3);
  for (const line of lines.slice(2, -1)) {
    assert.match(line, /^"EventFlow text: [A-Za-z0-9_-]+",(Checked In|Not Checked In)$/);
  }
  assert.equal(lines.at(-1), '"Normal name",Not Checked In');
  assert.deepEqual(parseParticipantCsv(output), [
    ...participants.map(({ name, checked_in }) => ({ name, checkedIn: checked_in })),
    { name: "Normal name", checkedIn: false },
  ]);
});

test("legacy CSV, including prefix-like names and quoted newlines, remains readable", () => {
  const csv = '\uFEFFStatus,Name\nChecked In,"EventFlow text: PTErMQ"\nNot Checked In,"Person\nTwo"\n';
  assert.deepEqual(parseParticipantCsv(csv), [
    { name: "EventFlow text: PTErMQ", checkedIn: true },
    { name: "Person\nTwo", checkedIn: false },
  ]);
});

test("marked files reject malformed encodings and invalid participant statuses", () => {
  const head = "Name,Status\nEventFlow Spreadsheet Encoding v1,Metadata\n";
  for (const payload of ["", "***", "_w", Buffer.from("Normal name").toString("base64url")]) {
    assert.throws(
      () => parseParticipantCsv(`${head}"EventFlow text: ${payload}",Checked In\n`),
      /invalid EventFlow-encoded name/,
    );
  }
  assert.throws(() => parseParticipantCsv(`${head}Test,Maybe\n`), /must have a status/);
  assert.throws(
    () => parseParticipantCsv("Name,Status\nFirst,Checked In\nEventFlow Spreadsheet Encoding v1,Metadata\n"),
    /must have a status/,
  );
});
