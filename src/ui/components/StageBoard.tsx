import type { CycleSnapshot, StageName } from "../../core";

const STAGES: StageName[] = ["IF", "ID", "EX", "MEM", "WB"];

export function StageBoard({ snapshot }: { snapshot: CycleSnapshot }) {
  return (
    <section className="stage-board">
      {STAGES.map((stage) => {
        const slot = snapshot.stages[stage];
        return (
          <div className="stage-tile" key={stage}>
            <div className="stage-name">{stage}</div>
            <div className="stage-inst">{slot?.instruction.text ?? "."}</div>
          </div>
        );
      })}
    </section>
  );
}
