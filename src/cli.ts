import { readFileSync } from "node:fs";
import {
  assemble,
  createSimulation,
  formatPipelineOccupancyTable,
  formatRetireLog,
  stepSimulation,
  toHex32,
} from "./core";

const [filePath, cycleArg] = process.argv.slice(2);
const maxCycles = cycleArg === undefined ? 20 : Number.parseInt(cycleArg, 10);

if (!filePath || Number.isNaN(maxCycles) || maxCycles < 1) {
  console.error("Usage: npm run cli -- <program.asm> [cycles]");
  process.exit(1);
}

const source = readFileSync(filePath, "utf8");
const assembled = assemble(source);

if (!assembled.ok) {
  for (const error of assembled.errors) {
    console.error(`${filePath}:${error.line}:${error.column} ${error.message}`);
  }
  process.exit(1);
}

let simulation = createSimulation(assembled.executionImage);
for (let index = 0; index < maxCycles && !simulation.current.halted; index += 1) {
  simulation = stepSimulation(simulation);
  const snapshot = simulation.current;
  const stages = Object.entries(snapshot.stages)
    .map(([stage, slot]) => `${stage}:${slot ? slot.text : "."}`)
    .join(" | ");
  console.log(`cycle ${snapshot.cycle} pc=${toHex32(snapshot.pc)} ${stages}`);
  for (const event of snapshot.events) {
    console.log(`  [${event.kind}] ${event.message}`);
  }
}

const retireLog = formatRetireLog(simulation.current);
const occupancyTable = formatPipelineOccupancyTable(simulation.current);

if (retireLog.length > 0) {
  console.log("retire log:");
  console.log(retireLog);
}

if (occupancyTable.length > 0) {
  console.log("pipeline occupancy:");
  console.log(occupancyTable);
}
