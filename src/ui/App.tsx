import { EditorView } from "@codemirror/view";
import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { RotateCcw, StepBack, StepForward } from "lucide-react";
import { useMemo, useState } from "react";
import { assemblyExtensions } from "./asmLanguage";
import { BottomDrawer } from "./components/BottomDrawer";
import { ProgramSwitcher } from "./components/ProgramSwitcher";
import { RightDock } from "./components/RightDock";
import { StageBoard } from "./components/StageBoard";
import { Timeline } from "./components/Timeline";
import { ToolbarButton } from "./components/ToolbarButton";
import { usePrograms } from "./hooks/usePrograms";
import { useSimulationSession } from "./hooks/useSimulationSession";
import { useWorkbenchLayout } from "./hooks/useWorkbenchLayout";

export function App() {
  const programLibrary = usePrograms();
  const { programs, selectedProgram, statuses: programStatuses } = programLibrary;
  const session = useSimulationSession({
    programId: selectedProgram?.id ?? "",
    source: selectedProgram?.source ?? "",
  });
  const workbenchLayout = useWorkbenchLayout();
  const { dimensions, layout } = workbenchLayout;
  const [lintCount, setLintCount] = useState(0);
  const {
    activeEventSnapshot,
    assembled,
    invalidated,
    selectedCell,
    selectedEvents,
    selectedInstruction,
    selectedSnapshot,
    simulation,
    snapshots,
    timelineCells,
  } = session;

  const editorExtensions = useMemo(
    () => [...assemblyExtensions(setLintCount), EditorView.contentAttributes.of({ "aria-label": "Assembly source" })],
    [],
  );

  return (
    <Tooltip.Provider>
      <div className="app-shell">
        <header className="toolbar">
          <div className="brand">CPU Pipeline Playground</div>
          <ProgramSwitcher
            programs={programs}
            selectedProgram={selectedProgram}
            statuses={programStatuses}
            invalidated={invalidated}
            onSelect={programLibrary.actions.selectProgram}
            onCreate={programLibrary.actions.createNewProgram}
            onDuplicate={programLibrary.actions.duplicateSelectedProgram}
            onRename={programLibrary.actions.renameProgram}
            onDelete={programLibrary.actions.deleteProgram}
          />
          <div className="toolbar-spacer" />
          <ToolbarButton label="Reset" onClick={session.actions.reset} disabled={!assembled.ok}>
            <RotateCcw size={16} />
          </ToolbarButton>
          <ToolbarButton label="Back" onClick={session.actions.stepBack}>
            <StepBack size={16} />
          </ToolbarButton>
          <ToolbarButton label="Step" onClick={session.actions.step} disabled={!assembled.ok || invalidated || simulation.current.halted}>
            <StepForward size={16} />
          </ToolbarButton>
        </header>

        <main
          className="workbench"
          style={{
            gridTemplateColumns: `minmax(0, 1fr) ${layout.rightOpen ? layout.rightWidth : dimensions.rightRailWidth}px`,
          }}
        >
          <section
            className="center-pane"
            style={{
              gridTemplateRows: `minmax(0, 1fr) ${layout.bottomOpen ? layout.bottomHeight : dimensions.bottomRailHeight}px`,
            }}
          >
            <section className="pipeline-panel">
              <div className="pipeline-header">
                <span>Pipeline</span>
                <div className="pipeline-status">
                  <span className="mini-status">cycle {simulation.current.cycle}</span>
                  <span className={clsx("mini-status", !assembled.ok && "bad")}>
                    {assembled.ok ? `${assembled.instructions.length} instructions` : `${assembled.errors.length} assemble errors`}
                  </span>
                  {invalidated && <span className="mini-status warn">simulation invalidated</span>}
                </div>
              </div>
              <StageBoard snapshot={simulation.current} />
              <Timeline
                instructions={assembled.instructions}
                snapshots={snapshots}
                cells={timelineCells}
                currentCycle={simulation.current.cycle}
                selectedCell={selectedCell}
                onSelect={session.actions.selectCell}
              />
            </section>
            <BottomDrawer
              activeTab={layout.bottomTab}
              open={layout.bottomOpen}
              onTabChange={workbenchLayout.actions.selectBottomTab}
              onOpenChange={workbenchLayout.actions.setBottomOpen}
              onResizeStart={workbenchLayout.actions.startBottomResize}
              snapshot={activeEventSnapshot}
              selectedCell={selectedCell}
              invalidated={invalidated}
              lintCount={lintCount}
              source={selectedProgram.source}
              editorExtensions={editorExtensions}
              onSourceChange={(value) => programLibrary.actions.updateSelectedProgram({ source: value })}
            />
          </section>

          <aside className={clsx("right-pane", !layout.rightOpen && "collapsed")}>
            <RightDock
              activeTab={layout.rightTab}
              open={layout.rightOpen}
              onTabChange={workbenchLayout.actions.selectRightTab}
              onOpenChange={workbenchLayout.actions.setRightOpen}
              onResizeStart={workbenchLayout.actions.startRightResize}
              selectedInstruction={selectedInstruction}
              selectedSnapshot={selectedSnapshot}
              selectedEvents={selectedEvents}
              current={simulation.current}
            />
          </aside>
        </main>
      </div>
    </Tooltip.Provider>
  );
}
